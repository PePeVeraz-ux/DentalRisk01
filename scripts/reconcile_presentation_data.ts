import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { database } from '../apps/api/src/db.js';
import { report } from '../apps/api/src/domain.js';

const db = await database();
try {
  const patientCount = Number(
    (await db.query("SELECT count(*)::int AS count FROM patients WHERE reference LIKE 'PAC-2026-%'"))
      .rows[0].count,
  );
  if (patientCount !== 500) throw new Error(`Se esperaban 500 pacientes de presentación; hay ${patientCount}`);

  const before = {
    created_at: new Date().toISOString(),
    attentions: (
      await db.query(
        "SELECT a.id,a.price_cents FROM attentions a JOIN patients p ON p.id=a.patient_id WHERE p.reference LIKE 'PAC-2026-%' ORDER BY a.id",
      )
    ).rows,
    weekly_reports: (
      await db.query('SELECT week_start::text AS week_start,payload FROM weekly_reports ORDER BY week_start')
    ).rows,
  };
  const backupDir = resolve('.local/backups');
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replaceAll('.', '');
  const backupPath = resolve(backupDir, `before-presentation-reconcile-${stamp}.json`);
  await writeFile(backupPath, JSON.stringify(before, null, 2), { flag: 'wx', mode: 0o600 });

  const result = await db.transaction(async (tx) => {
    const updated = await tx.query(
      "UPDATE attentions a SET price_cents=s.price_cents FROM services s,patients p WHERE a.service_id=s.id AND a.patient_id=p.id AND p.reference LIKE 'PAC-2026-%' RETURNING a.id",
    );
    const weeks = (await tx.query('SELECT week_start::text AS week_start FROM weekly_reports ORDER BY week_start'))
      .rows;
    for (const row of weeks) {
      const from = row.week_start;
      const to = new Date(Date.parse(from + 'T12:00:00Z') + 6 * 86400000).toISOString().slice(0, 10);
      const payload = await report(tx, { from, to }, { role: 'ADMIN' });
      await tx.query('UPDATE weekly_reports SET payload=$2,generated_at=now() WHERE week_start=$1', [
        from,
        JSON.stringify({ ...payload, dataset: 'presentacion' }),
      ]);
    }
    return { attentions_updated: updated.rows.length, weekly_reports_rebuilt: weeks.length };
  });

  const mismatches = Number(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM attentions a JOIN services s ON s.id=a.service_id JOIN patients p ON p.id=a.patient_id WHERE p.reference LIKE 'PAC-2026-%' AND a.price_cents<>s.price_cents",
      )
    ).rows[0].count,
  );
  const qaInReports = Number(
    (await db.query("SELECT count(*)::int AS count FROM weekly_reports WHERE payload::text ILIKE '%QA%'"))
      .rows[0].count,
  );
  if (result.attentions_updated !== 500 || mismatches !== 0 || qaInReports !== 0)
    throw new Error(`Conciliación incompleta: ${JSON.stringify({ ...result, mismatches, qaInReports })}`);
  console.log(JSON.stringify({ status: 'reconciled', backup: backupPath, ...result }, null, 2));
} finally {
  await db.close();
}
