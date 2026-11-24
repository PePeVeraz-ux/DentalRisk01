import { Pool, type PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

export interface Sql {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
}
export interface Database extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>, lock?: boolean): Promise<T>;
  close(): Promise<void>;
}

export async function database(
  options: { memory?: boolean; url?: string; local?: string } = {},
): Promise<Database> {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!options.memory && url) {
    const pool = new Pool({ connectionString: url, max: 12 });
    return {
      query: (sql, values) => pool.query(sql, values),
      async transaction(fn, lock = true) {
        const client: PoolClient = await pool.connect();
        try {
          await client.query('BEGIN');
          if (lock) await client.query('SELECT id FROM operation_mutex WHERE id=1 FOR UPDATE');
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (!options.memory && (!options.local || process.env.NODE_ENV === 'production'))
    throw new Error('Configure DATABASE_URL para conectar DentalRisk a PostgreSQL.');
  const pg = new PGlite(
    options.memory ? undefined : (options.local ?? process.env.LOCAL_DATABASE ?? '.local/database'),
  );
  await pg.waitReady;
  return {
    query: async (sql, values) => pg.query(sql, values),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (sql, values) => tx.query(sql, values) })),
    close: () => pg.close(),
  };
}

export async function migrate(db: Database) {
  // Migration is explicit; the web server never modifies the schema at startup.
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const [version, file] of [
    [1, '001_initial.sql'],
    [2, '002_owner_workspace.sql'],
    [3, '003_analytics_indexes.sql'],
    [4, '004_account_defaults.sql'],
  ] as const) {
    if ((await db.query('SELECT version FROM schema_migrations WHERE version=$1', [version])).rows.length)
      continue;
    const sql = await readFile(new URL('../../../database/' + file, import.meta.url), 'utf8');
    await db.transaction(async (tx) => {
      // pg extended protocol rejects multi-statement prepared queries. No parameters or input here.
      for (const statement of sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
    }, false);
  }
}
