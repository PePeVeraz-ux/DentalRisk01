import type { Sql } from './db.js';

export interface ReportResult {
  from: string;
  to: string;
  timezone: string;
  generated_at: string;
  filters: Record<string, string>;
  summary: {
    attentions: number;
    patients: number;
    revenue_cents: number;
    average_minutes: number;
    idle_minutes: number;
    operated_shifts: number;
    patients_per_shift: number | null;
  };
  ranking: { dentist_id: string; dentist: string; patients: number; attentions: number; rank: number }[];
  groups: {
    dentist_id: string;
    dentist: string;
    service_id: string;
    service: string;
    attentions: number;
    patients: number;
    average_minutes: number;
    revenue_cents: number;
  }[];
  daily: { day: string; attentions: number; patients: number; revenue_cents: number }[];
}

// Aggregate in PostgreSQL so frequent dashboards never transfer complete clinical histories to Node.
export async function aggregateReport(
  db: Sql,
  filter: Record<string, string>,
  start: Date,
  end: Date,
  timezone: string,
): Promise<ReportResult> {
  const values: unknown[] = [start, end, timezone];
  const positions: Record<string, string> = {};
  let scoped = '';
  for (const key of ['dentist_id', 'service_id', 'station_id', 'shift_id']) {
    if (!filter[key]) continue;
    values.push(filter[key]);
    positions[key] = `$${values.length}`;
    scoped += ` AND a.${key}=${positions[key]}`;
  }
  const eligible = `WITH eligible AS (
    SELECT a.patient_id,a.dentist_id,a.service_id,a.price_cents,
      extract(epoch FROM (a.ended_at-a.started_at))/60 duration,
      to_char(a.ended_at AT TIME ZONE $3,'YYYY-MM-DD') AS ended_day
    FROM attentions a WHERE a.status='COMPLETED' AND a.ended_at >= $1 AND a.ended_at < $2${scoped})`;
  const summary = (
    await db.query(
      `${eligible}
    SELECT count(*) attentions,count(DISTINCT patient_id) patients,coalesce(sum(price_cents),0)::text revenue_cents,
      coalesce(avg(duration),0)::float8 average_minutes FROM eligible`,
      values,
    )
  ).rows[0];
  const groups = (
    await db.query(
      `${eligible}
    SELECT a.dentist_id,d.name dentist,a.service_id,s.name service,count(*) attentions,
      count(DISTINCT a.patient_id) patients,sum(a.price_cents)::text revenue_cents,avg(a.duration)::float8 average_minutes
    FROM eligible a JOIN dentists d ON d.id=a.dentist_id JOIN services s ON s.id=a.service_id
    GROUP BY a.dentist_id,d.name,a.service_id,s.name ORDER BY d.name,s.name`,
      values,
    )
  ).rows;
  const ranking = (
    await db.query(
      `${eligible}
    SELECT a.dentist_id,d.name dentist,count(DISTINCT a.patient_id) patients,count(*) attentions,
      rank() OVER (ORDER BY count(DISTINCT a.patient_id) DESC) rank
    FROM eligible a JOIN dentists d ON d.id=a.dentist_id GROUP BY a.dentist_id,d.name
    ORDER BY patients DESC,d.name`,
      values,
    )
  ).rows;
  const daily = (
    await db.query(
      `${eligible}
    SELECT ended_day AS day,count(*) attentions,count(DISTINCT patient_id) patients,sum(price_cents)::text revenue_cents
    FROM eligible GROUP BY ended_day ORDER BY ended_day`,
      values,
    )
  ).rows;
  // LAG sees every observation before applying the requested service/dentist filter.
  // Filtering first would invent gaps across intervening consultations.
  const idle = (
    await db.query(
      `WITH observations AS (
      SELECT a.*,lag(a.ended_at) OVER w previous_end,lag(a.shift_id) OVER w previous_shift,
        lag((a.started_at AT TIME ZONE $3)::date) OVER w previous_day
      FROM attentions a WHERE a.status='COMPLETED' AND a.started_at >= $1 AND a.started_at < $2
      WINDOW w AS (PARTITION BY a.station_id ORDER BY a.started_at,a.id)
    ), bounds AS (
      SELECT c.day AS calendar_day,c.breaks,
        greatest(a.previous_end,(c.day+s.start_time) AT TIME ZONE $3) lower_bound,
        least(a.started_at,(c.day+s.end_time) AT TIME ZONE $3) upper_bound
      FROM observations a JOIN calendar_days c ON c.shift_id=a.shift_id AND c.day=(a.started_at AT TIME ZONE $3)::date
      JOIN shifts s ON s.id=c.shift_id
      WHERE c.operated=true AND a.previous_end IS NOT NULL AND a.previous_shift=a.shift_id AND a.previous_day=c.day
        AND a.ended_at >= $1 AND a.ended_at < $2${scoped}
    ) SELECT coalesce(sum(extract(epoch FROM (upper_bound-lower_bound)) - coalesce((
        SELECT sum(greatest(0,extract(epoch FROM (
          least(upper_bound,(calendar_day+(b->>'end')::time) AT TIME ZONE $3) -
          greatest(lower_bound,(calendar_day+(b->>'start')::time) AT TIME ZONE $3)))))
        FROM jsonb_array_elements(breaks) b),0)),0)::float8/60 idle_minutes
      FROM bounds WHERE upper_bound>lower_bound`,
      values,
    )
  ).rows[0];
  const shifts = (
    await db.query(
      `WITH patients AS (
      SELECT a.shift_id,(a.started_at AT TIME ZONE $3)::date AS shift_day,count(DISTINCT a.patient_id) patients
      FROM attentions a WHERE a.status='COMPLETED' AND a.started_at >= $1 AND a.started_at < $2${scoped}
      GROUP BY a.shift_id,(a.started_at AT TIME ZONE $3)::date
    ) SELECT count(*) operated_shifts,coalesce(sum(p.patients),0)::text patients_in_shifts
      FROM calendar_days c LEFT JOIN patients p ON p.shift_id=c.shift_id AND p.shift_day=c.day
      WHERE c.operated=true AND c.day >= ($1::timestamptz AT TIME ZONE $3)::date
        AND c.day < ($2::timestamptz AT TIME ZONE $3)::date${positions.shift_id ? ` AND c.shift_id=${positions.shift_id}` : ''}`,
      values,
    )
  ).rows[0];
  const operated = Number(shifts.operated_shifts);
  return {
    from: filter.from,
    to: filter.to,
    timezone,
    filters: filter,
    generated_at: new Date().toISOString(),
    summary: {
      attentions: Number(summary.attentions),
      patients: Number(summary.patients),
      revenue_cents: Number(summary.revenue_cents),
      average_minutes: Number(summary.average_minutes),
      idle_minutes: Number(idle.idle_minutes),
      operated_shifts: operated,
      patients_per_shift: operated ? Number(shifts.patients_in_shifts) / operated : null,
    },
    groups: groups.map((r) => ({
      ...r,
      attentions: Number(r.attentions),
      patients: Number(r.patients),
      revenue_cents: Number(r.revenue_cents),
      average_minutes: Number(r.average_minutes),
    })),
    ranking: ranking.map((r) => ({
      ...r,
      attentions: Number(r.attentions),
      patients: Number(r.patients),
      rank: Number(r.rank),
    })),
    daily: daily.map((r) => ({
      ...r,
      attentions: Number(r.attentions),
      patients: Number(r.patients),
      revenue_cents: Number(r.revenue_cents),
    })),
  };
}
