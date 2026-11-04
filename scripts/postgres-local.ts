import EmbeddedPostgres from 'embedded-postgres';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';

// Persistent native PostgreSQL for this Windows workstation, bound to loopback.
const root = resolve('.local/postgres');
const configPath = resolve('.local/postgres-local.json');
const ctl = resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
const action = process.argv[2] ?? 'start';
if (!['start', 'stop', 'status'].includes(action)) throw new Error('Use start, stop o status');
await mkdir('.local', { recursive: true });
let config: { password: string; port: number };
try {
  config = JSON.parse(await readFile(configPath, 'utf8'));
} catch (error: any) {
  if (error.code !== 'ENOENT' || action !== 'start') throw error;
  config = { password: randomBytes(32).toString('hex'), port: 5432 };
  await writeFile(configPath, JSON.stringify(config), { flag: 'wx', mode: 0o600 });
}
const run = (args: string[]) =>
  spawnSync(ctl, ['-D', root, ...args], { windowsHide: true, stdio: 'ignore', timeout: 75000 });
if (action !== 'start') {
  const result = run(action === 'stop' ? ['stop', '-m', 'fast', '-w'] : ['status']);
  console.log(`PostgreSQL ${action}: código ${result.status}`);
  process.exitCode = result.status ?? 1;
} else {
  try {
    await access(resolve(root, 'PG_VERSION'));
  } catch {
    const cluster = new EmbeddedPostgres({
      databaseDir: root,
      port: config.port,
      user: 'dentalrisk_local_admin',
      password: config.password,
      persistent: true,
      authMethod: 'scram-sha-256',
      createPostgresUser: false,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
    });
    await cluster.initialise();
  }
  if (run(['status']).status !== 0) {
    const result = run([
      '-l',
      resolve('.local/postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${config.port}`,
      'start',
      '-w',
    ]);
    if (result.status !== 0) throw new Error('No se pudo iniciar PostgreSQL; consulte .local/postgres.log');
  }
  const pool = new Pool({
    host: '127.0.0.1',
    port: config.port,
    user: 'dentalrisk_local_admin',
    password: config.password,
    database: 'postgres',
  });
  try {
    console.log((await pool.query('SELECT version()')).rows[0].version);
  } finally {
    await pool.end();
  }
}
