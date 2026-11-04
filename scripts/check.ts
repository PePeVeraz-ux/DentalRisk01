import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Ejecute npm run check.');
async function command(args: string[], echo = true) {
  return new Promise<{ code: number; stdout: string }>((res, rej) => {
    const child = spawn(process.execPath, [npm!, ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (echo) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', rej);
    child.on('exit', (code) => res({ code: code ?? 1, stdout }));
  });
}
const steps: Record<string, any> = {};
let count: number | null = null;
try {
  for (const step of ['typecheck', 'test', 'build', 'contracts']) {
    const start = performance.now(),
      result = await command(['run', step]);
    steps[step] = { passed: result.code === 0, seconds: (performance.now() - start) / 1000 };
    if (step === 'test') count = Number(result.stdout.match(/tests\s+(\d+)/)?.[1] ?? 0);
    if (result.code !== 0) throw new Error(`Verificación fallida: ${step}`);
  }
  const security = await command(['audit', '--json'], false);
  const audit = JSON.parse(security.stdout);
  steps.audit = { passed: security.code === 0, vulnerabilities: audit.metadata?.vulnerabilities ?? null };
  await mkdir('docs/evidencias', { recursive: true });
  await writeFile('docs/evidencias/dependencias.json', JSON.stringify(audit, null, 2));
  if (security.code !== 0) throw new Error('La auditoría de dependencias no pasó o no pudo completarse.');
  const hash = createHash('sha256');
  async function collect(dir: string) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (
        ['.next', '.next-dev', '.next-ui', '.next-production-ui', 'node_modules', 'next-env.d.ts'].includes(
          entry.name,
        )
      )
        continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (/\.(ts|tsx|css|sql|json)$/.test(entry.name)) {
        hash.update(path.replaceAll('\\', '/'));
        hash.update(await readFile(path));
      }
    }
  }
  for (const dir of ['apps', 'database', 'scripts', 'tests']) await collect(dir);
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json'])
    hash.update(await readFile(file));
  await writeFile(
    'docs/evidencias/verificacion.json',
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        passed: true,
        application_version: JSON.parse(await readFile('package.json', 'utf8')).version,
        tests: count,
        source_sha256: hash.digest('hex'),
        steps,
      },
      null,
      2,
    ),
  );
  console.log('Verificación final aprobada; evidencia en docs/evidencias/verificacion.json.');
} catch (error) {
  await mkdir('docs/evidencias', { recursive: true });
  await writeFile(
    'docs/evidencias/verificacion.json',
    JSON.stringify(
      { generated_at: new Date().toISOString(), passed: false, steps, error: (error as Error).message },
      null,
      2,
    ),
  );
  throw error;
}
