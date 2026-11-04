import { spawn } from 'node:child_process';
import { encryptArchive } from '../apps/api/src/archive.js';
import { mkdir, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { database } from '../apps/api/src/db.js';
import { audit } from '../apps/api/src/domain.js';
import { fileURLToPath } from 'node:url';
export async function runProcess(command: string, args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((res, rej) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [],
      errors: Buffer[] = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => errors.push(d));
    child.on('error', rej);
    child.on('close', (code) =>
      code === 0
        ? res(Buffer.concat(chunks))
        : rej(
            new Error(
              `${command} terminó con código ${code}; revise conectividad y configuración de PostgreSQL`,
            ),
          ),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
export async function backup() {
  const url = process.env.DATABASE_URL,
    dir = process.env.BACKUP_DIR,
    key = process.env.BACKUP_KEY;
  if (!url || !dir || !key || !/^[a-f0-9]{64}$/i.test(key))
    throw new Error('Se requieren PostgreSQL, BACKUP_DIR y BACKUP_KEY de 64 caracteres hexadecimales.');
  const target = resolve(dir),
    workspace = resolve('.');
  if (target === workspace || target.startsWith(workspace + '\\') || target.startsWith(workspace + '/'))
    throw new Error('El respaldo debe estar fuera de la carpeta de la aplicación.');
  const db = await database();
  try {
    // PostgreSQL clients read credentials from environment, not command arguments.
    const connection = new URL(url);
    process.env.PGHOST = connection.hostname;
    process.env.PGPORT = connection.port || '5432';
    process.env.PGUSER = decodeURIComponent(connection.username);
    process.env.PGPASSWORD = decodeURIComponent(connection.password);
    process.env.PGDATABASE = connection.pathname.slice(1);
    const raw = await runProcess('pg_dump', ['--format=custom', '--no-owner', '--no-acl']);
    const payload = encryptArchive(raw, key);
    await mkdir(target, { recursive: true });
    const name = `dentalrisk-${new Date().toISOString().replaceAll(':', '-')}.drb`;
    await writeFile(join(target, name), payload, { flag: 'wx', mode: 0o600 });
    const days = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
    if (!Number.isInteger(days) || days < 1) throw new Error('Retención inválida');
    for (const file of await readdir(target)) {
      if (!/^dentalrisk-[\dTZ.\-]+\.drb$/.test(file)) continue;
      const path = join(target, file);
      if ((await stat(path)).mtimeMs < Date.now() - days * 86400000) await unlink(path);
    }
    await db.transaction((tx) => audit(tx, null, 'backup.success', null, { file: name }));
    console.log('Respaldo cifrado creado. Mantenga la clave fuera del destino de respaldo.');
  } catch (e) {
    await db.transaction((tx) => audit(tx, null, 'backup.failure', null));
    throw e;
  } finally {
    await db.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await backup();
