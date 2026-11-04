import { readFile } from 'node:fs/promises';
import { decryptArchive } from '../apps/api/src/archive.js';
import { runProcess } from './backup.js';
if (process.env.NODE_ENV === 'production')
  throw new Error(
    'Restauración directa en producción bloqueada: restaure en una base aislada y concilie antes del cambio.',
  );
const path = process.argv[2],
  key = process.env.BACKUP_KEY,
  target = process.env.RESTORE_DATABASE_URL;
if (!path || !key || !/^[a-f0-9]{64}$/i.test(key) || !target)
  throw new Error('Uso: npm run restore -- archivo.drb; configure RESTORE_DATABASE_URL y BACKUP_KEY.');
const connection = new URL(target);
if (
  target === process.env.DATABASE_URL ||
  connection.pathname === new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/dentalrisk').pathname
)
  throw new Error('El destino debe ser una base de recuperación distinta.');
process.env.PGHOST = connection.hostname;
process.env.PGPORT = connection.port || '5432';
process.env.PGUSER = decodeURIComponent(connection.username);
process.env.PGPASSWORD = decodeURIComponent(connection.password);
process.env.PGDATABASE = connection.pathname.slice(1);
const content = await readFile(path);
const raw = decryptArchive(content, key);
// No --clean: an occupied destination fails rather than silently destroying newer data.
await runProcess(
  'pg_restore',
  ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', process.env.PGDATABASE],
  raw,
);
console.log(
  'Restauración aislada concluida. Verifique conteos, relaciones y reportes antes de cualquier sustitución de producción.',
);
