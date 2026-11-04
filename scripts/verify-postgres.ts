import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { database } from '../apps/api/src/db.js';
import { audit } from '../apps/api/src/domain.js';
import { performance } from 'node:perf_hooks';

const suffix = randomBytes(5).toString('hex'),
  password = randomBytes(24).toString('hex');
const port = Number(process.env.PG_TEST_PORT ?? 55432);
const cluster = new EmbeddedPostgres({
  databaseDir: resolve('.local', `postgres-test-${suffix}`),
  port,
  user: 'dr_test',
  password,
  persistent: true,
  createPostgresUser: false,
  authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: (message) => console.log(String(message)),
  onError: (message) => console.error(String(message)),
});
const name = `dr_verify_${suffix}`,
  restored = `dr_restored_${suffix}`;
const url = (dbName: string, user = 'dr_test', secret = password) =>
  `postgresql://${user}:${secret}@127.0.0.1:${port}/${dbName}`;
async function execute(args: string[], env: Record<string, string | undefined> = {}) {
  await new Promise<void>((res, rej) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ...env },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', rej);
    child.on('exit', (code) =>
      code === 0 ? res() : rej(new Error(`Verificación terminó con código ${code}`)),
    );
  });
}
console.log('Preparando PostgreSQL 17 de prueba en directorio aislado.');
await cluster.initialise();
await cluster.start();
try {
  await cluster.createDatabase(name);
  await cluster.createDatabase(restored);
  const securityName = `dr_security_${suffix}`;
  await cluster.createDatabase(securityName);
  const analyticsName = `dr_analytics_${suffix}`;
  await cluster.createDatabase(analyticsName);
  await execute(
    [
      '--import',
      'tsx',
      '--test',
      'tests/system.test.ts',
      'tests/archive.test.ts',
      'tests/upgrade-security.test.ts',
      'tests/analytics.test.ts',
    ],
    {
      SYSTEM_TEST_DATABASE_URL: url(name),
      SECURITY_TEST_DATABASE_URL: url(securityName),
      ANALYTICS_TEST_DATABASE_URL: url(analyticsName),
    },
  );
  const owner = await database({ url: url(name) });
  const appPassword = randomBytes(24).toString('hex'),
    backupPassword = randomBytes(24).toString('hex');
  try {
    await owner.query(`CREATE ROLE dentalrisk_app LOGIN PASSWORD '${appPassword}'`);
    await owner.query(`CREATE ROLE dentalrisk_backup LOGIN PASSWORD '${backupPassword}'`);
    await owner.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await owner.query('GRANT USAGE ON SCHEMA public TO dentalrisk_app,dentalrisk_backup');
    const grants = await readFile('deploy/runtime-grants.sql', 'utf8');
    await owner.query(grants);
    const runtime = await database({ url: url(name, 'dentalrisk_app', appPassword) });
    try {
      await runtime.transaction((tx) => audit(tx, null, 'test.runtime.permissions', null));
      await assert.rejects(() => runtime.query("UPDATE audit SET action='tampered'"), /permission denied/i);
      await assert.rejects(() => runtime.query('DELETE FROM incidents'), /permission denied/i);
      await assert.rejects(() => runtime.query('CREATE TABLE unauthorized(id int)'), /permission denied/i);
      await assert.rejects(() => runtime.query('DELETE FROM schema_migrations'), /permission denied/i);
    } finally {
      await runtime.close();
    }
    const binaryRoot = resolve('node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin');
    // The published distribution layout is a documented platform binary package; resolve the executable location explicitly.
    const find = async (dir: string): Promise<string | undefined> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name === 'pg_dump.exe') return dir;
        if (entry.isDirectory()) {
          const result = await find(join(dir, entry.name));
          if (result) return result;
        }
      }
    };
    const bin =
      process.env.PG_CLIENT_BIN ??
      (process.platform === 'win32'
        ? await find(resolve('node_modules', '@embedded-postgres', 'windows-x64'))
        : undefined);
    if (process.platform === 'win32' && !bin) throw new Error(`No se encontró pg_dump en ${binaryRoot}`);
    const backupDir = join(tmpdir(), `dentalrisk-verification-${suffix}`),
      key = randomBytes(32).toString('hex');
    await mkdir(backupDir, { recursive: true });
    const pathEnv = bin ? bin + delimiter + (process.env.PATH ?? '') : process.env.PATH;
    const started = performance.now();
    await execute(['--import', 'tsx', 'scripts/backup.ts'], {
      DATABASE_URL: url(name, 'dentalrisk_backup', backupPassword),
      BACKUP_DIR: backupDir,
      BACKUP_KEY: key,
      PATH: pathEnv,
    });
    const file = (await readdir(backupDir)).find((s) => s.endsWith('.drb'));
    assert.ok(file);
    const backupPath = join(backupDir, file!);
    const encrypted = await readFile(backupPath);
    assert.equal(encrypted.subarray(0, 4).toString(), 'DRB1');
    assert.ok(!encrypted.includes(Buffer.from('Paciente A')));
    await execute(['--import', 'tsx', 'scripts/restore.ts', backupPath], {
      DATABASE_URL: url(name),
      RESTORE_DATABASE_URL: url(restored),
      BACKUP_KEY: key,
      PATH: pathEnv,
    });
    const recovery = await database({ url: url(restored) });
    try {
      for (const table of ['attentions', 'cards', 'patients', 'assignments', 'incidents', 'users']) {
        const original = (await owner.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
        assert.equal(
          (await recovery.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,
          original,
          `Conteo restaurado ${table}`,
        );
      }
    } finally {
      await recovery.close();
    }
    const evidence = {
      generated_at: new Date().toISOString(),
      passed: true,
      motor: 'PostgreSQL 17',
      system_suite_database: 'PostgreSQL',
      administrator_concurrency_database: 'PostgreSQL',
      migration_upgrade_database: 'PGlite',
      analytics_reference_database: 'PostgreSQL',
      physical_hardware: false,
      checks: [
        'suite de integración sobre PostgreSQL',
        'bloqueo concurrente real',
        'cuenta de ejecución restringida',
        'auditoría e incidencias no modificables',
        'pg_dump cifrado AES-256-GCM',
        'pg_restore en base aislada',
        'conteos conservados',
      ],
      backup_restore_seconds: (performance.now() - started) / 1000,
      production_rpo_rto_validated: false,
    };
    await mkdir('docs/evidencias', { recursive: true });
    await writeFile('docs/evidencias/postgresql.json', JSON.stringify(evidence, null, 2));
    console.log('PostgreSQL, permisos y recuperación aislada verificados.');
    if (process.env.PG_LOAD === 'true') {
      const loadDb = `dr_load_${suffix}`;
      await cluster.createDatabase(loadDb);
      await execute(['--import', 'tsx', 'scripts/load.ts'], {
        TEST_DATABASE_URL: url(loadDb),
        LOAD_SECONDS: process.env.LOAD_SECONDS ?? '1800',
      });
    }
  } finally {
    await owner.close();
  }
} finally {
  await cluster.stop();
}
