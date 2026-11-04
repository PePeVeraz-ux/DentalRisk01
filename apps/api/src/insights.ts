import { DateTime } from 'luxon';
import type { Sql } from './db.js';
import { report, reportRange, zone } from './domain.js';

export async function executive(db: Sql, filter: any, user: any) {
  if (user.role === 'DENTIST') filter = { ...filter, dentist_id: user.dentist_id };
  const { start, end } = reportRange(filter.from, filter.to);
  const days = Math.round(end.diff(start, 'days').days);
  const priorFilter = {
    ...filter,
    from: start.minus({ days }).toISODate(),
    to: start.minus({ days: 1 }).toISODate(),
  };
  const current = await report(db, filter, user);
  const previous = await report(db, priorFilter, user);
  const comparison = Object.fromEntries(
    ['patients', 'attentions', 'revenue_cents', 'average_minutes', 'patients_per_shift', 'idle_minutes'].map(
      (key) => {
        const value = (current.summary as any)[key],
          baseline = (previous.summary as any)[key];
        return [
          key,
          {
            current: value,
            previous: baseline,
            difference: value === null || baseline === null ? null : value - baseline,
            percent:
              value === null || baseline === null || baseline === 0
                ? null
                : ((value - baseline) / baseline) * 100,
          },
        ];
      },
    ),
  );
  const trend = Array.from({ length: days }, (_, i) => {
    const day = start.plus({ days: i }).toISODate()!;
    return (
      current.daily.find((entry) => entry.day === day) ?? {
        day,
        revenue_cents: 0,
        attentions: 0,
        patients: 0,
      }
    );
  });
  const dentists = (await db.query('SELECT id,name,specialty,active FROM dentists ORDER BY name')).rows
    .filter(
      (d) =>
        (!filter.dentist_id || d.id === filter.dentist_id) &&
        (user.role !== 'DENTIST' || d.id === user.dentist_id),
    )
    .map((d) => {
      const groups = current.groups.filter((g) => g.dentist_id === d.id);
      const rank = current.ranking.find((r) => r.dentist_id === d.id);
      const attentions = groups.reduce((n, g) => n + g.attentions, 0);
      return {
        id: d.id,
        dentist: d.name,
        specialty: d.specialty,
        active: d.active,
        patients: rank?.patients ?? 0,
        attentions,
        rank: rank?.rank ?? null,
        revenue_cents: groups.reduce((n, g) => n + g.revenue_cents, 0),
        average_minutes: attentions
          ? groups.reduce((n, g) => n + g.average_minutes * g.attentions, 0) / attentions
          : null,
      };
    });
  const services = new Map<string, any>();
  for (const group of current.groups) {
    const value = services.get(group.service_id) ?? {
      service_id: group.service_id,
      service: group.service,
      attentions: 0,
      revenue_cents: 0,
      minutes: 0,
    };
    value.attentions += group.attentions;
    value.revenue_cents += group.revenue_cents;
    value.minutes += group.average_minutes * group.attentions;
    services.set(group.service_id, value);
  }
  return {
    ...current,
    comparison,
    previous_period: { from: priorFilter.from, to: priorFilter.to },
    trend,
    dentists,
    services: [...services.values()].map(({ minutes, ...s }) => ({
      ...s,
      average_minutes: minutes / s.attentions,
    })),
    interpretation:
      'Valor de servicios completados, no cobros ni utilidad. Comparación con el periodo inmediatamente anterior de igual número de días; confirme calendarios comparables. La duración depende del servicio.',
  };
}

export async function operationalOverview(db: Sql, day: string, user: any) {
  const { start, end } = reportRange(day, day);
  const values: any[] = [start.toJSDate(), end.toJSDate()];
  const dentist = user.role === 'DENTIST' ? ' AND dentist_id=$3' : '';
  if (user.role === 'DENTIST') values.push(user.dentist_id);
  const appointments = (
    await db.query(
      `SELECT status,count(*) n FROM appointments WHERE starts_at >= $1 AND starts_at < $2${dentist} GROUP BY status`,
      values,
    )
  ).rows;
  const queue = (
    await db.query(
      `SELECT status,count(*) n FROM attentions WHERE (created_at >= $1 AND created_at < $2 OR status IN ('PENDING','IN_PROGRESS'))${dentist} GROUP BY status`,
      values,
    )
  ).rows;
  return {
    day,
    timezone: zone(),
    appointments: Object.fromEntries(appointments.map((r) => [r.status, Number(r.n)])),
    attentions: Object.fromEntries(queue.map((r) => [r.status, Number(r.n)])),
    available_cards:
      user.role === 'DENTIST'
        ? null
        : Number((await db.query("SELECT count(*) n FROM cards WHERE status='AVAILABLE'")).rows[0].n),
  };
}

export async function setupStatus(db: Sql, now: Date) {
  const today = DateTime.fromJSDate(now, { zone: zone() }).toISODate();
  const queries: [string, string, any[]?][] = [
    ['services', 'SELECT count(*) n FROM services WHERE active=true'],
    ['dentists', 'SELECT count(*) n FROM dentists WHERE active=true'],
    ['stations', 'SELECT count(*) n FROM stations WHERE active=true AND token_hash IS NOT NULL'],
    ['cards', "SELECT count(*) n FROM cards WHERE status IN ('AVAILABLE','ASSIGNED')"],
    ['reception', "SELECT count(*) n FROM users WHERE role='RECEPTION' AND active=true"],
    [
      'dentist_accounts',
      "SELECT count(*) n FROM users u JOIN dentists d ON d.id=u.dentist_id WHERE u.role='DENTIST' AND u.active=true AND d.active=true",
    ],
    ['calendar', 'SELECT count(*) n FROM calendar_days WHERE day >= $1 AND operated=true', [today]],
  ];
  const counts: Record<string, number> = {};
  for (const [key, query, values] of queries) counts[key] = Number((await db.query(query, values)).rows[0].n);
  const checks = [
    { key: 'services', label: 'Servicios y precios', minimum: 15, page: 'settings' },
    { key: 'dentists', label: 'Dentistas activos', minimum: 1, page: 'settings' },
    { key: 'stations', label: 'Estaciones con credencial', minimum: 1, page: 'settings' },
    { key: 'cards', label: 'Inventario de tarjetas habilitadas', minimum: 50, page: 'settings' },
    { key: 'reception', label: 'Cuenta de recepción', minimum: 1, page: 'security' },
    { key: 'dentist_accounts', label: 'Cuenta de dentista vinculada', minimum: 1, page: 'security' },
    { key: 'calendar', label: 'Calendario operativo vigente', minimum: 1, page: 'settings' },
  ].map((c) => ({ ...c, count: counts[c.key], ready: counts[c.key] >= c.minimum }));
  return {
    checks,
    configured: checks.every((c) => c.ready),
    note: 'La configuración registrada no acredita validación de precios, calendario, hardware, respaldo ni aceptación clínica.',
  };
}
