import { DateTime } from 'luxon';
import type { Database } from './db.js';
import { report, zone } from './domain.js';
let running = false;
export async function weeklyJob(db: Database, now = new Date()) {
  if (running) return;
  running = true;
  try {
    const lastWeek = DateTime.fromJSDate(now).setZone(zone()).startOf('week').minus({ weeks: 1 });
    const first = (
      await db.query('SELECT min(started_at) first_at FROM attentions WHERE started_at IS NOT NULL')
    ).rows[0].first_at;
    const firstWeek = first ? DateTime.fromJSDate(new Date(first)).setZone(zone()).startOf('week') : lastWeek;
    const existing = new Set(
      (await db.query('SELECT week_start::text week_start FROM weekly_reports')).rows.map(
        (r) => r.week_start,
      ),
    );
    for (
      let week = firstWeek < lastWeek ? firstWeek : lastWeek;
      week <= lastWeek;
      week = week.plus({ weeks: 1 })
    ) {
      const from = week.toISODate()!,
        to = week.endOf('week').toISODate()!;
      if (existing.has(from) && from !== lastWeek.toISODate()) continue;
      const result = await report(db, { from, to }, { role: 'ADMIN' });
      await db.transaction(async (tx) => {
        await tx.query(
          'INSERT INTO weekly_reports(week_start,payload) VALUES($1,$2) ON CONFLICT(week_start) DO UPDATE SET payload=excluded.payload,generated_at=now()',
          [from, JSON.stringify(result)],
        );
      });
    }
  } finally {
    running = false;
  }
}
