import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { database, migrate, type Sql } from '../apps/api/src/db.js';
import { id, report } from '../apps/api/src/domain.js';

test('analítica SQL concilia una referencia independiente con filtros, cierres, descansos y cambio horario', async () => {
  const db = process.env.ANALYTICS_TEST_DATABASE_URL
    ? await database({ url: process.env.ANALYTICS_TEST_DATABASE_URL })
    : await database({ memory: true });
  await migrate(db);
  const timezone = 'America/Tijuana',
    dentists = [id(), id(), id()],
    services = [id(), id()],
    stations = [id(), id()],
    patients = Array.from({ length: 7 }, id),
    cards = [id(), id()];
  const days = ['2026-10-31', '2026-11-01', '2026-11-02'];
  const calendars = days.map((day, i) => ({ day, shift_id: id(), operated: i !== 2 }));
  const rows: any[] = [];
  try {
    await db.transaction(async (tx) => {
      for (const [i, uid] of dentists.entries())
        await tx.query('INSERT INTO dentists(id,name) VALUES($1,$2)', [uid, `Especialista ${i}`]);
      for (const [i, uid] of services.entries())
        await tx.query('INSERT INTO services(id,name,price_cents) VALUES($1,$2,1)', [uid, `Servicio ${i}`]);
      for (const [i, uid] of stations.entries())
        await tx.query('INSERT INTO stations(id,name) VALUES($1,$2)', [uid, `Estación ${i}`]);
      for (const [i, uid] of patients.entries())
        await tx.query('INSERT INTO patients(id,name,reference) VALUES($1,$2,$3)', [
          uid,
          'Paciente privado',
          String(i),
        ]);
      for (const [i, uid] of cards.entries())
        await tx.query('INSERT INTO cards(id,uid) VALUES($1,$2)', [uid, `HIST-${i}`]);
      for (const c of calendars) {
        await tx.query(
          "INSERT INTO shifts(id,name,weekday,start_time,end_time) VALUES($1,'Jornada',$2,'00:00','23:59')",
          [c.shift_id, DateTime.fromISO(c.day).weekday % 7],
        );
        await tx.query('INSERT INTO calendar_days(id,shift_id,day,operated,breaks) VALUES($1,$2,$3,$4,$5)', [
          id(),
          c.shift_id,
          c.day,
          c.operated,
          JSON.stringify([{ start: '12:00', end: '13:00' }]),
        ]);
        for (let i = 0; i < 80; i++) {
          const start = DateTime.fromISO(c.day, { zone: timezone }).plus({ minutes: 20 + i * 11 });
          const row = {
            id: id(),
            patient_id: patients[i % 7],
            dentist_id: dentists[i % 3],
            service_id: services[i % 2],
            station_id: stations[i % 2],
            shift_id: c.shift_id,
            price_cents: 9999 + i,
            status: i % 9 === 0 ? 'CANCELLED' : i % 13 === 0 ? 'INCIDENT' : 'COMPLETED',
            started_at: start.toMillis(),
            ended_at: start.plus({ seconds: 300 + i * 2 }).toMillis(),
          };
          rows.push(row);
          await tx.query(
            'INSERT INTO attentions(id,patient_id,dentist_id,service_id,station_id,shift_id,card_id,price_cents,status,started_at,ended_at,released_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)',
            [
              row.id,
              row.patient_id,
              row.dentist_id,
              row.service_id,
              row.station_id,
              row.shift_id,
              cards[i % 2],
              row.price_cents,
              row.status,
              new Date(row.started_at),
              new Date(row.ended_at),
            ],
          );
        }
      }
    });
    const cases: [Record<string, string>, any][] = [
      [{ from: days[0], to: days[2] }, { role: 'ADMIN' }],
      [{ from: days[1], to: days[1] }, { role: 'ADMIN' }],
      [{ from: days[0], to: days[2], service_id: services[0] }, { role: 'ADMIN' }],
      [{ from: days[0], to: days[2], dentist_id: dentists[1] }, { role: 'ADMIN' }],
      [{ from: days[0], to: days[2], station_id: stations[1], service_id: services[1] }, { role: 'ADMIN' }],
      [{ from: days[0], to: days[2], shift_id: calendars[0].shift_id }, { role: 'ADMIN' }],
      [
        { from: days[0], to: days[2], dentist_id: dentists[2] },
        { role: 'DENTIST', dentist_id: dentists[0] },
      ],
      [{ from: days[2], to: days[2] }, { role: 'ADMIN' }],
      [{ from: '2026-11-03', to: '2026-11-03' }, { role: 'ADMIN' }],
    ];
    const close = (actual: number, expected: number) =>
      assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
    for (const [requested, user] of cases) {
      const filter: Record<string, string> =
        user.role === 'DENTIST' ? { ...requested, dentist_id: user.dentist_id } : requested;
      const start = DateTime.fromISO(filter.from, { zone: timezone }).toMillis(),
        end = DateTime.fromISO(filter.to, { zone: timezone }).plus({ days: 1 }).toMillis();
      const matches = (r: any) =>
        ['dentist_id', 'service_id', 'station_id', 'shift_id'].every(
          (key) => !filter[key] || filter[key] === r[key],
        );
      const completed = rows.filter((r) => r.status === 'COMPLETED');
      const selected = completed.filter((r) => r.ended_at >= start && r.ended_at < end && matches(r));
      let returnedRows = 0;
      const reader: Sql = {
        query: async (sql, values) => {
          const r = await db.query(sql, values);
          returnedRows += r.rows.length;
          return r;
        },
      };
      const result = await report(reader, requested, user);
      assert.equal(result.summary.attentions, selected.length);
      assert.equal(result.summary.patients, new Set(selected.map((r) => r.patient_id)).size);
      assert.equal(
        result.summary.revenue_cents,
        selected.reduce((n, r) => n + r.price_cents, 0),
      );
      close(
        result.summary.average_minutes,
        selected.length
          ? selected.reduce((n, r) => n + (r.ended_at - r.started_at) / 60000, 0) / selected.length
          : 0,
      );
      const calendar = calendars.filter(
        (c) =>
          c.operated &&
          c.day >= filter.from &&
          c.day <= filter.to &&
          (!filter.shift_id || c.shift_id === filter.shift_id),
      );
      const observations = completed.filter((r) => r.started_at >= start && r.started_at < end);
      const dayOf = (r: any) => DateTime.fromMillis(r.started_at, { zone: timezone }).toISODate();
      const patientsInShifts = calendar.reduce(
        (n, c) =>
          n +
          new Set(
            observations
              .filter((r) => r.shift_id === c.shift_id && dayOf(r) === c.day && matches(r))
              .map((r) => r.patient_id),
          ).size,
        0,
      );
      assert.equal(result.summary.operated_shifts, calendar.length);
      if (calendar.length) close(result.summary.patients_per_shift!, patientsInShifts / calendar.length);
      else assert.equal(result.summary.patients_per_shift, null);
      let idle = 0;
      for (const station of stations) {
        const ordered = observations
          .filter((r) => r.station_id === station)
          .sort((a, b) => a.started_at - b.started_at);
        for (let i = 1; i < ordered.length; i++) {
          const a = ordered[i - 1],
            b = ordered[i];
          if (!selected.includes(b) || a.shift_id !== b.shift_id || dayOf(a) !== dayOf(b)) continue;
          const c = calendar.find((c) => c.shift_id === b.shift_id && c.day === dayOf(b));
          if (!c) continue;
          const lower = Math.max(
            a.ended_at,
            DateTime.fromISO(`${c.day}T00:00`, { zone: timezone }).toMillis(),
          );
          const upper = Math.min(
            b.started_at,
            DateTime.fromISO(`${c.day}T23:59`, { zone: timezone }).toMillis(),
          );
          if (upper <= lower) continue;
          const pause = Math.max(
            0,
            Math.min(upper, DateTime.fromISO(`${c.day}T13:00`, { zone: timezone }).toMillis()) -
              Math.max(lower, DateTime.fromISO(`${c.day}T12:00`, { zone: timezone }).toMillis()),
          );
          idle += (upper - lower - pause) / 60000;
        }
      }
      close(result.summary.idle_minutes, idle);
      assert.equal(
        result.groups.reduce((n, g) => n + g.revenue_cents, 0),
        result.summary.revenue_cents,
      );
      assert.equal(
        result.daily.reduce((n, d) => n + d.attentions, 0),
        selected.length,
      );
      for (const g of result.groups) {
        const subset = selected.filter((r) => r.dentist_id === g.dentist_id && r.service_id === g.service_id);
        assert.equal(g.patients, new Set(subset.map((r) => r.patient_id)).size);
        assert.equal(g.attentions, subset.length);
      }
      assert.ok(returnedRows < 100, 'La consulta debe devolver agregados, no descargar el historial clínico');
      assert.ok(!JSON.stringify(result).includes('Paciente privado'));
    }
  } finally {
    await db.close();
  }
});
