import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { Client } from 'pg';

const project = process.argv[2];
if (!project || !/^[a-z0-9-]+$/.test(project))
  throw new Error('Indica un ID de proyecto Neon válido.');
const original = readFileSync('.env', 'utf8');
if (/^\s*CLOUD_\w+\s*=/m.test(original))
  throw new Error('Ya existen variables CLOUD_ en .env.');
const agentPassword = process.env.AGENT_DB_PASSWORD;
if (!agentPassword || agentPassword.length < 24)
  throw new Error('Configura AGENT_DB_PASSWORD antes de continuar.');

const owner = new URL(execFileSync('neon', [
  'connection-string', 'production', '--profile', 'dentalrisk',
  '--project-id', project, '--ssl', 'verify-full',
], { encoding: 'utf8', shell: process.platform === 'win32' }).trim());
if (owner.protocol !== 'postgresql:' || !owner.hostname.endsWith('.neon.tech'))
  throw new Error('La conexión debe apuntar a Neon.');
owner.search = '?sslmode=verify-full';
const appPassword = randomBytes(24).toString('base64url');
const db = new Client({ connectionString: owner.href });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query("CREATE ROLE dentalrisk_app LOGIN PASSWORD '" + appPassword + "'");
  await db.query('GRANT USAGE ON SCHEMA public TO dentalrisk_app');
  await db.query(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO dentalrisk_app',
  );
  const { rows } = await db.query<{ name: string }>(`
    SELECT format('%I.%I', schemaname, tablename) AS name FROM pg_tables
    WHERE schemaname = 'public' AND left(tablename, 6) <> 'agent_'
      AND tablename <> 'alembic_version'
  `);
  if (rows.length)
    await db.query('GRANT SELECT, INSERT, UPDATE ON ' + rows.map(({ name }) => name).join(', ') + ' TO dentalrisk_app');
  await db.query('COMMIT');
} finally {
  await db.end();
}

function url(role?: string, password?: string, python = false) {
  const result = new URL(owner);
  if (role && password) {
    result.username = role;
    result.password = encodeURIComponent(password);
  }
  if (!python) return result.href;
  result.searchParams.set('sslrootcert', '/usr/local/lib/python3.12/site-packages/botocore/cacert.pem');
  return result.href.replace(/^postgresql:/, 'postgresql+psycopg:');
}

appendFileSync('.env', [
  '',
  '# Conexiones privadas para compose.cloud.yaml',
  `CLOUD_OWNER_DATABASE_URL='${url()}'`,
  `CLOUD_APP_DATABASE_URL='${url('dentalrisk_app', appPassword)}'`,
  `CLOUD_AGENT_OWNER_DATABASE_URL='${url(undefined, undefined, true)}'`,
  `CLOUD_AGENT_DATABASE_URL='${url('dentalrisk_agent', agentPassword, true)}'`,
  '',
].join('\n'));
console.log('Rol de aplicación creado y conexiones agregadas a .env.');
