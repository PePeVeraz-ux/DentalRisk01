// PostgreSQL setup preserves existing users and clinical data.
import { database, migrate } from '../apps/api/src/db.js';
const db = await database();
try {
  await migrate(db);
  console.log('Esquema PostgreSQL preparado. Se conservan los datos existentes.');
  if (!(await db.query('SELECT id FROM users LIMIT 1')).rows.length)
    console.log('Ejecute npm run bootstrap para crear la cuenta inicial.');
} finally {
  await db.close();
}
