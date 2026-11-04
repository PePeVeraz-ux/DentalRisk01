import { database, migrate } from '../apps/api/src/db.js';
const db = await database();
try {
  await migrate(db);
  console.log('Migraciones aplicadas.');
} finally {
  await db.close();
}
