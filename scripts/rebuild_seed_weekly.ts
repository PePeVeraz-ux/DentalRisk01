import { database } from '../apps/api/src/db.js';
import { report } from '../apps/api/src/domain.js';

const db = await database();
try {
  const weeks = (await db.query(
    "SELECT week_start::text AS week_start FROM weekly_reports WHERE payload->>'synthetic'='true' ORDER BY week_start",
  )).rows;
  for (const [index, row] of weeks.entries()) {
    const from = row.week_start;
    const to = new Date(Date.parse(from + 'T12:00:00Z') + 6 * 86400000).toISOString().slice(0, 10);
    const result = await report(db, { from, to }, { role: 'ADMIN' });
    await db.query('UPDATE weekly_reports SET payload=$2 WHERE week_start=$1', [
      from,
      JSON.stringify({ ...result, synthetic: true }),
    ]);
    if ((index + 1) % 100 === 0) console.log(`${index + 1}/${weeks.length} semanas conciliadas`);
  }
  console.log(`Reportes semanales conciliados: ${weeks.length}`);
} finally {
  await db.close();
}
