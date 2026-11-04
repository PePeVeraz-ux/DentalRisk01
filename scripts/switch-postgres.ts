import { readFile, writeFile, cp, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { Pool } from 'pg';
import { database, migrate } from '../apps/api/src/db.js';

// Run with both applications stopped. The original databases remain untouched.
const stamp = Date.now();
const config = JSON.parse(await readFile('.local/postgres-local.json', 'utf8'));
const admin = new Pool({
  host: '127.0.0.1',
  port: config.port,
  user: 'dentalrisk_local_admin',
  password: config.password,
  database: 'postgres',
});
const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
try {
  for (const [envPath, name, driver] of [
    ['.env', 'dentalrisk', 'postgresql'],
    ['Agente IA/.env', 'dentalrisk_agent', 'postgresql+psycopg'],
  ]) {
    const original = await readFile(envPath, 'utf8');
    const env = parseEnv(original);
    if (env.DATABASE_URL?.startsWith('postgresql')) {
      console.log(`${name}: conexión PostgreSQL ya configurada; se conserva.`);
      continue;
    }
    // Refuse to overwrite an existing target, including a previous incomplete attempt.
    if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
      throw new Error(`La base ${name} ya existe. Revise antes de repetir la transferencia.`);
    const password = randomBytes(32).toString('hex');
    await admin.query(`CREATE ROLE ${quote(name)} LOGIN PASSWORD '${password}'`);
    await admin.query(`CREATE DATABASE ${quote(name)} OWNER ${quote(name)}`);
    const url = `postgresql://${name}:${password}@127.0.0.1:${config.port}/${name}`;
    if (name === 'dentalrisk') {
      const target = await database({ url });
      try {
        await migrate(target);
        const sourcePath = resolve(env.LOCAL_DATABASE || '.local/database');
        let exists = false;
        try {
          await access(sourcePath);
          exists = true;
        } catch {}
        if (exists) {
          const snapshot = resolve(`.local/pglite-before-postgres-${stamp}`);
          await cp(sourcePath, snapshot, { recursive: true, errorOnExist: true, force: false });
          const source = await database({ local: snapshot, url: '' });
          const counts: Record<string, number> = {};
          try {
            const tables = [
              'dentists',
              'users',
              'sessions',
              'login_attempts',
              'services',
              'stations',
              'patients',
              'cards',
              'shifts',
              'calendar_days',
              'appointments',
              'attentions',
              'assignments',
              'rfid_events',
              'incidents',
              'audit',
              'weekly_reports',
            ];
            await target.transaction(async (tx) => {
              for (const table of tables) {
                const rows = (
                  await source.query(`SELECT row_to_json(t)::text AS payload FROM ${quote(table)} t`)
                ).rows;
                for (const row of rows)
                  await tx.query(
                    `INSERT INTO ${quote(table)} SELECT * FROM json_populate_record(NULL::${quote(table)}, $1::json)`,
                    [row.payload],
                  );
                const actual = (await tx.query(`SELECT count(*)::int AS n FROM ${quote(table)}`)).rows[0].n;
                if (actual !== rows.length) throw new Error(`Conteo diferente: ${table}`);
                // Compare canonical JSON on the same server to avoid precision/timezone differences.
                for (const row of rows) {
                  const found = await tx.query(
                    `SELECT 1 FROM ${quote(table)} t WHERE to_jsonb(t) = to_jsonb(json_populate_record(NULL::${quote(table)}, $1::json))`,
                    [row.payload],
                  );
                  if (!found.rows.length) throw new Error(`Contenido diferente: ${table}`);
                }
                counts[table] = actual;
              }
            });
            await writeFile(
              'docs/evidencias/migracion-postgresql.json',
              JSON.stringify(
                { date: new Date().toISOString(), database: 'PostgreSQL', counts, contentVerified: true },
                null,
                2,
              ),
            );
          } finally {
            await source.close();
          }
        }
      } finally {
        await target.close();
      }
    } else {
      // Python transfer consumes this private staging URL, before .env is switched.
      await writeFile(
        'Agente IA/.local/postgres-target.txt',
        url.replace('postgresql:', 'postgresql+psycopg:'),
        { mode: 0o600 },
      );
      console.log('Agente IA: destino preparado; ejecutar scripts/switch_postgres.py.');
      continue;
    }
    await writeFile(`.local/environment-before-postgres-${name}-${stamp}.env`, original, {
      flag: 'wx',
      mode: 0o600,
    });
    const updated = /^DATABASE_URL=.*$/m.test(original)
      ? original.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${url.replace('postgresql:', driver + ':')}`)
      : original + `\nDATABASE_URL=${url}\n`;
    await writeFile(envPath, updated, { mode: 0o600 });
    console.log(`${name}: datos verificados y conexión actualizada.`);
  }
} finally {
  await admin.end();
}
