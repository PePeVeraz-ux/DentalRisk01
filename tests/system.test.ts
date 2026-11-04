import { test } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { DateTime } from 'luxon';
import { database, migrate } from '../apps/api/src/db.js';
import { buildApp } from '../apps/api/src/app.js';
import { bind, digest, id, report, scan } from '../apps/api/src/domain.js';
import { weeklyJob } from '../apps/api/src/weekly.js';

test('DentalRisk: integración transaccional, seguridad y reportes', async (t) => {
  const db = process.env.SYSTEM_TEST_DATABASE_URL
    ? await database({ url: process.env.SYSTEM_TEST_DATABASE_URL })
    : await database({ memory: true });
  await migrate(db);
  await migrate(db);
  let now = new Date('2026-10-21T17:00:00Z');
  const clock = () => now;
  const app = await buildApp({ db, clock });
  const admin = id(),
    reception = id(),
    dentistUser = id(),
    support = id(),
    dentist = id(),
    otherDentist = id(),
    station = id(),
    station2 = id(),
    patient = id(),
    patient2 = id(),
    shift = id();
  const services = Array.from({ length: 15 }, () => id()),
    cards = Array.from({ length: 50 }, () => id());
  const password = 'Test-only-long-password!';
  const hash = await argon2.hash(password);
  await db.transaction(async (tx) => {
    for (const [uid, name] of [
      [dentist, 'Dentista A'],
      [otherDentist, 'Dentista B'],
    ])
      await tx.query('INSERT INTO dentists(id,name) VALUES($1,$2)', [uid, name]);
    for (const [uid, email, role, ref] of [
      [admin, 'admin@example.test', 'ADMIN', null],
      [reception, 'reception@example.test', 'RECEPTION', null],
      [dentistUser, 'dentist@example.test', 'DENTIST', otherDentist],
      [support, 'support@example.test', 'SUPPORT', null],
    ])
      await tx.query(
        'INSERT INTO users(id,name,email,password_hash,role,dentist_id) VALUES($1,$2,$3,$4,$5,$6)',
        [uid, role, email, hash, role, ref],
      );
    for (const [uid, name] of [
      [station, 'Estación A'],
      [station2, 'Estación B'],
    ])
      await tx.query('INSERT INTO stations(id,name,token_hash) VALUES($1,$2,$3)', [
        uid,
        name,
        digest('station-test-secret'),
      ]);
    for (const [uid, name] of [
      [patient, 'Paciente A'],
      [patient2, 'Paciente B'],
    ])
      await tx.query('INSERT INTO patients(id,name,reference) VALUES($1,$2,$3)', [uid, name, uid]);
    for (let i = 0; i < 15; i++)
      await tx.query('INSERT INTO services(id,name,price_cents) VALUES($1,$2,$3)', [
        services[i],
        `Servicio ${i}`,
        10000 + i * 100,
      ]);
    for (let i = 0; i < 50; i++)
      await tx.query('INSERT INTO cards(id,uid) VALUES($1,$2)', [cards[i], `TEST-${i}`]);
    await tx.query('INSERT INTO shifts(id,name,weekday,start_time,end_time) VALUES($1,$2,3,$3,$4)', [
      shift,
      'Miércoles',
      '08:00',
      '20:00',
    ]);
    await tx.query('INSERT INTO calendar_days(id,shift_id,day,operated,breaks) VALUES($1,$2,$3,true,$4)', [
      id(),
      shift,
      '2026-10-21',
      JSON.stringify([{ start: '13:00', end: '14:00' }]),
    ]);
  });
  const origin = 'http://localhost:3000';
  let loginSequence = 10;
  const login = async (email: string, operationAccess = false) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      remoteAddress: `127.0.0.${++loginSequence}`,
      headers: { origin },
      payload: { email, password },
    });
    assert.equal(r.statusCode, 200, r.body);
    const auth = { cookie: String(r.headers['set-cookie']).split(';')[0], csrf: r.json().csrf };
    if (email === 'admin@example.test' && operationAccess) {
      const access = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions/operation-access',
        headers: { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf },
        payload: { password, reason: 'Ensayo autorizado de recepción' },
      });
      assert.equal(access.statusCode, 200, access.body);
    }
    return auth;
  };
  let auth = await login('admin@example.test');
  const operationAuth = await login('reception@example.test');
  const request = (method: any, url: string, payload?: any, as = auth) =>
    app.inject({
      method,
      url: '/api/v1' + url,
      headers: (() => {
        const operator =
          as === auth &&
          method !== 'GET' &&
          (/^\/(patients|appointments)(\/|$)/.test(url) ||
            (url.startsWith('/attentions') && !url.endsWith('/correct')) ||
            url === '/rfid/simulate')
            ? operationAuth
            : as;
        return { origin, cookie: operator.cookie, 'x-csrf-token': operator.csrf };
      })(),
      payload,
    });
  const base = {
    patient_id: patient,
    dentist_id: dentist,
    service_id: services[0],
    station_id: station,
    shift_id: shift,
    card_id: cards[0],
  };
  let firstAttention = '';
  try {
    await t.test(
      'dueño consulta indicadores y requiere acceso excepcional temporal para operar recepción',
      async () => {
        const owner = await login('admin@example.test', false);
        assert.equal(
          (await request('POST', '/patients', { name: 'Prohibido', reference: 'NO' }, owner)).statusCode,
          403,
        );
        assert.equal(
          (await request('GET', '/reports/executive?from=2026-10-21&to=2026-10-21', undefined, owner))
            .statusCode,
          200,
        );
        assert.equal(
          (
            await request(
              'POST',
              '/sessions/operation-access',
              { password: 'incorrecta', reason: 'Cobertura temporal de recepción' },
              owner,
            )
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await request(
              'POST',
              '/sessions/operation-access',
              { password, reason: 'Cobertura temporal de recepción' },
              owner,
            )
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await request(
              'POST',
              '/patients',
              { name: 'Operación autorizada', reference: 'EXCEPTION' },
              owner,
            )
          ).statusCode,
          200,
        );
        const otherSession = await login('admin@example.test', false);
        assert.equal(
          (await request('POST', '/patients', { name: 'Otra sesión', reference: 'OTHER' }, otherSession))
            .statusCode,
          403,
        );
        assert.equal((await request('POST', '/sessions/operation-revoke', {}, owner)).statusCode, 200);
        assert.equal(
          (await request('POST', '/patients', { name: 'Revocado', reference: 'REVOKED' }, owner)).statusCode,
          403,
        );
        assert.equal(
          (
            await request(
              'POST',
              '/sessions/operation-access',
              { password, reason: 'Comprobar vencimiento automático' },
              owner,
            )
          ).statusCode,
          200,
        );
        const saved = now;
        now = new Date(now.getTime() + 31 * 60000);
        assert.equal(
          (await request('POST', '/patients', { name: 'Vencido', reference: 'EXPIRED' }, owner)).statusCode,
          403,
        );
        now = saved;
        const audit = (await request('GET', '/audit', undefined, owner)).json().items;
        assert.ok(audit.some((a: any) => a.action === 'auth.operation.granted' && a.detail.reason));
        assert.ok(audit.some((a: any) => a.action === 'auth.operation.revoked'));
      },
    );
    await t.test('acceso local por alias conserva restricciones de origen y CSRF', async () => {
      for (const alias of ['http://127.0.0.1:3000', 'http://[::1]:3000']) {
        const login = await app.inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { origin: alias },
          payload: { email: 'admin@example.test', password },
        });
        assert.equal(login.statusCode, 200, login.body);
        const cookie = String(login.headers['set-cookie']).split(';')[0];
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/sessions/logout',
              headers: { origin: alias, cookie },
              payload: {},
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/sessions/logout',
              headers: { origin: alias, cookie, 'x-csrf-token': login.json().csrf },
              payload: {},
            })
          ).statusCode,
          200,
        );
      }
      for (const rejected of [
        'http://127.0.0.1:3001',
        'https://localhost:3000',
        'http://localhost.evil.test:3000',
        'null',
      ]) {
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: '/api/v1/sessions',
              headers: { origin: rejected },
              payload: { email: 'admin@example.test', password },
            })
          ).statusCode,
          403,
        );
      }
      const configured = await buildApp({ db, clock, origin: 'http://clinic.example.test:3000' });
      try {
        assert.equal(
          (
            await configured.inject({
              method: 'POST',
              url: '/api/v1/sessions',
              headers: { origin },
              payload: { email: 'admin@example.test', password },
            })
          ).statusCode,
          403,
        );
      } finally {
        await configured.close();
      }
    });
    await t.test('sesión, origen, CSRF, validación estricta y permisos', async () => {
      assert.equal((await app.inject({ method: 'GET', url: '/api/v1/patients' })).statusCode, 401);
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/services',
            headers: { origin: 'https://malicious.test', cookie: auth.cookie },
            payload: { name: 'X', price_cents: 1 },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/services',
            headers: { origin, cookie: auth.cookie, 'x-csrf-token': '😀'.repeat(32) },
            payload: { name: 'X', price_cents: 1 },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/services',
            headers: { origin, cookie: auth.cookie },
            payload: { name: 'X', price_cents: 1 },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (await request('POST', '/services', { name: 'X', price_cents: 1, admin: true })).statusCode,
        400,
      );
      const limited = await login('reception@example.test');
      assert.equal((await request('GET', '/users', undefined, limited)).statusCode, 403);
      const tech = await login('support@example.test');
      assert.equal((await request('GET', '/patients', undefined, tech)).statusCode, 403);
      assert.equal((await request('GET', '/diagnostics', undefined, tech)).statusCode, 200);
    });
    await t.test('catálogos y contrato no exponen secretos', async () => {
      assert.equal((await request('GET', '/services')).json().items.length, 15);
      assert.equal((await request('GET', '/cards')).json().items.length, 50);
      assert.equal((await request('GET', '/stations')).body.includes('token_hash'), false);
      const contract = await request('GET', '/openapi');
      assert.equal(contract.statusCode, 200);
      assert.ok(contract.json().paths['/api/v1/attentions']);
    });
    await t.test('vinculación concurrente asigna una sola tarjeta', async () => {
      const results = await Promise.all([
        request('POST', '/attentions', base),
        request('POST', '/attentions', base),
      ]);
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
      firstAttention = results.find((r) => r.statusCode === 200)!.json().id;
      assert.equal((await db.query('SELECT * FROM assignments WHERE released_at IS NULL')).rows.length, 1);
    });
    await t.test('entrada idempotente, relectura y estación incorrecta', async () => {
      const event = id();
      const r = await scan(db, station, { event_id: event, uid: 'TEST-0' }, clock);
      assert.equal(r.code, 'CHECK_IN');
      assert.deepEqual(await scan(db, station, { event_id: event, uid: 'TEST-0' }, clock), r);
      assert.equal((await scan(db, station, { event_id: id(), uid: 'TEST-0' }, clock)).code, 'DEBOUNCED');
      assert.equal(
        (await scan(db, station2, { event_id: id(), uid: 'TEST-0' }, clock)).code,
        'WRONG_STATION',
      );
      await assert.rejects(() => scan(db, station2, { event_id: event, uid: 'TEST-0' }, clock));
    });
    await t.test('salida concurrente, duración y tercer escaneo sin doble ingreso', async () => {
      now = new Date(now.getTime() + 600_000);
      const results = await Promise.all([
        scan(db, station, { event_id: id(), uid: 'TEST-0' }, clock),
        scan(db, station, { event_id: id(), uid: 'TEST-0' }, clock),
      ]);
      assert.equal(results.filter((r) => r.code === 'CHECK_OUT').length, 1);
      const a = (await db.query('SELECT * FROM attentions WHERE id=$1', [firstAttention])).rows[0];
      assert.equal(new Date(a.ended_at).getTime() - new Date(a.started_at).getTime(), 600000);
      assert.equal(
        (await scan(db, station, { event_id: id(), uid: 'TEST-0' }, clock)).code,
        'ALREADY_CLOSED',
      );
      const r = await report(db, { from: '2026-10-21', to: '2026-10-21' }, { role: 'ADMIN' });
      assert.equal(r.summary.revenue_cents, 10000);
      assert.equal(r.summary.average_minutes, 10);
    });
    await t.test('aislamiento del dentista y exclusión del soporte', async () => {
      const clinician = await login('dentist@example.test');
      assert.equal((await request('GET', '/attentions', undefined, clinician)).json().items.length, 0);
      assert.equal(
        (
          await request(
            'GET',
            `/reports?from=2026-10-21&to=2026-10-21&dentist_id=${dentist}`,
            undefined,
            clinician,
          )
        ).json().summary.attentions,
        0,
      );
      assert.equal(
        (await request('POST', `/attentions/${firstAttention}/release`, {}, clinician)).statusCode,
        403,
      );
    });
    await t.test('precio histórico y liberación', async () => {
      await request('PATCH', `/services/${services[0]}`, { price_cents: 999999 });
      assert.equal(
        (await report(db, { from: '2026-10-21', to: '2026-10-21' }, { role: 'ADMIN' })).summary.revenue_cents,
        10000,
      );
      assert.equal((await request('POST', `/attentions/${firstAttention}/release`, {})).statusCode, 200);
      assert.equal(
        (await db.query('SELECT status FROM cards WHERE id=$1', [cards[0]])).rows[0].status,
        'AVAILABLE',
      );
      assert.equal((await request('PATCH', `/shifts/${shift}`, { start_time: '09:00' })).statusCode, 409);
    });
    await t.test('15 servicios completan flujo con costo y duración verificables', async () => {
      for (let i = 1; i < 15; i++) {
        const a = await bind(db, admin, { ...base, card_id: cards[i], service_id: services[i] });
        now = new Date(now.getTime() + 60000);
        assert.equal((await scan(db, station, { event_id: id(), uid: `TEST-${i}` }, clock)).code, 'CHECK_IN');
        now = new Date(now.getTime() + 60000);
        assert.equal(
          (await scan(db, station, { event_id: id(), uid: `TEST-${i}` }, clock)).duration_seconds,
          60,
        );
        assert.equal((await request('POST', `/attentions/${a.id}/release`, {})).statusCode, 200);
      }
      const r = await report(db, { from: '2026-10-21', to: '2026-10-21' }, { role: 'ADMIN' });
      assert.equal(r.summary.attentions, 15);
      assert.equal(r.summary.patients, 1);
      assert.equal(r.summary.revenue_cents, 160500);
      assert.equal(r.groups.length, 15);
    });
    await t.test('pérdida y reasignación mantienen folio; cierre excepcional excluido', async () => {
      const a = await bind(db, admin, { ...base, card_id: cards[20] });
      await scan(db, station, { event_id: id(), uid: 'TEST-20' }, clock);
      let r = await request('POST', `/attentions/${a.id}/incident`, {
        reason: 'Tarjeta extraviada',
        replacement_card_id: cards[21],
      });
      assert.equal(r.statusCode, 200, r.body);
      assert.equal(r.json().id, a.id);
      assert.equal((await scan(db, station, { event_id: id(), uid: 'TEST-20' }, clock)).accepted, false);
      now = new Date(now.getTime() + 10000);
      assert.equal((await scan(db, station, { event_id: id(), uid: 'TEST-21' }, clock)).code, 'CHECK_OUT');
      await request('POST', `/attentions/${a.id}/release`, {});
      const b = await bind(db, admin, { ...base, card_id: cards[22] });
      r = await request('POST', `/attentions/${b.id}/incident`, { reason: 'Tarjeta dañada' });
      assert.equal(r.statusCode, 200);
      assert.equal(
        (await db.query('SELECT status FROM cards WHERE id=$1', [cards[22]])).rows[0].status,
        'BLOCKED',
      );
      assert.equal(
        (await report(db, { from: '2026-10-21', to: '2026-10-21' }, { role: 'ADMIN' })).summary.attentions,
        16,
      );
    });
    await t.test('corrección conserva antes/después y recalcula sin borrar historial', async () => {
      const r = await request('POST', `/attentions/${firstAttention}/correct`, {
        reason: 'Validación administrativa',
        started_at: '2026-10-21T17:00:00Z',
        ended_at: '2026-10-21T17:05:00Z',
        service_id: services[0],
        dentist_id: dentist,
      });
      assert.equal(r.statusCode, 200, r.body);
      assert.equal(
        (
          await db.query("SELECT * FROM incidents WHERE attention_id=$1 AND kind='CORRECTION'", [
            firstAttention,
          ])
        ).rows.length,
        1,
      );
      assert.equal(
        Number(
          (await db.query('SELECT price_cents FROM attentions WHERE id=$1', [firstAttention])).rows[0]
            .price_cents,
        ),
        10000,
      );
    });
    await t.test('citas: superposición concurrente, reprogramación y cancelación', async () => {
      const a = {
        patient_id: patient,
        dentist_id: dentist,
        service_id: services[0],
        starts_at: '2026-10-22T17:00:00Z',
        ends_at: '2026-10-22T18:00:00Z',
      };
      const results = await Promise.all([
        request('POST', '/appointments', a),
        request('POST', '/appointments', a),
      ]);
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
      const ap = results.find((r) => r.statusCode === 200)!.json();
      assert.equal(
        (
          await request('PATCH', `/appointments/${ap.id}`, {
            ...a,
            starts_at: '2026-10-22T19:00:00Z',
            ends_at: '2026-10-22T20:00:00Z',
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await request('POST', `/appointments/${ap.id}/cancel`, { reason: 'Cambio solicitado por paciente' }))
          .statusCode,
        200,
      );
    });
    await t.test('calendario y tiempos muertos excluyen descansos y cierres', async () => {
      const a = await bind(db, admin, { ...base, card_id: cards[30] });
      now = new Date('2026-10-21T19:50:00Z');
      await scan(db, station, { event_id: id(), uid: 'TEST-30' }, clock);
      now = new Date('2026-10-21T20:00:00Z');
      await scan(db, station, { event_id: id(), uid: 'TEST-30' }, clock);
      await request('POST', `/attentions/${a.id}/release`, {});
      const b = await bind(db, admin, { ...base, card_id: cards[31] });
      now = new Date('2026-10-21T21:10:00Z');
      await scan(db, station, { event_id: id(), uid: 'TEST-31' }, clock);
      now = new Date('2026-10-21T21:20:00Z');
      await scan(db, station, { event_id: id(), uid: 'TEST-31' }, clock);
      await request('POST', `/attentions/${b.id}/release`, {});
      const r = await report(
        db,
        { from: '2026-10-21', to: '2026-10-21', service_id: services[0] },
        { role: 'ADMIN' },
      );
      assert.ok(r.summary.idle_minutes >= 10);
      assert.ok(r.summary.idle_minutes < 180);
      assert.equal(
        (
          await request('POST', '/calendar', {
            shift_id: shift,
            day: '2026-10-22',
            operated: true,
            breaks: [],
          })
        ).statusCode,
        400,
      );
    });
    await t.test('panel ejecutivo concilia periodos, dentistas, servicios y días sin actividad', async () => {
      const response = await request('GET', '/reports/executive?from=2026-10-21&to=2026-10-21');
      assert.equal(response.statusCode, 200, response.body);
      const r = response.json();
      const independent = (
        await db.query(
          "SELECT count(*) n,count(DISTINCT patient_id) patients,coalesce(sum(price_cents),0) cents FROM attentions WHERE status='COMPLETED' AND (ended_at AT TIME ZONE 'America/Tijuana')::date='2026-10-21'",
        )
      ).rows[0];
      assert.equal(r.summary.attentions, Number(independent.n));
      assert.equal(r.summary.patients, Number(independent.patients));
      assert.equal(r.summary.revenue_cents, Number(independent.cents));
      assert.equal(
        r.dentists.reduce((n: number, d: any) => n + d.revenue_cents, 0),
        Number(independent.cents),
      );
      assert.equal(
        r.services.reduce((n: number, s: any) => n + s.attentions, 0),
        Number(independent.n),
      );
      assert.equal(r.trend[0].attentions, Number(independent.n));
      assert.deepEqual(r.previous_period, { from: '2026-10-20', to: '2026-10-20' });
      assert.equal(r.comparison.attentions.percent, null);
      const empty = (await request('GET', '/reports/executive?from=2026-10-22&to=2026-10-22')).json();
      assert.equal(empty.summary.attentions, 0);
      assert.equal(empty.trend.length, 1);
      assert.equal(empty.trend[0].revenue_cents, 0);
      assert.equal(empty.comparison.attentions.previous, Number(independent.n));
      assert.equal(empty.comparison.attentions.percent, -100);
      const clinician = await login('dentist@example.test');
      const scoped = (
        await request(
          'GET',
          `/reports/executive?from=2026-10-21&to=2026-10-21&dentist_id=${dentist}`,
          undefined,
          clinician,
        )
      ).json();
      assert.ok(scoped.dentists.every((d: any) => d.id === otherDentist));
      assert.equal(scoped.dentists.length, 1);
      assert.ok(scoped.groups.every((g: any) => g.dentist_id === otherDentist));
      assert.equal(scoped.filters.dentist_id, otherDentist);
      const reception = await login('reception@example.test');
      assert.equal(
        (await request('GET', '/reports/executive?from=2026-10-21&to=2026-10-21', undefined, reception))
          .statusCode,
        403,
      );
      assert.equal((await request('GET', '/setup', undefined, reception)).statusCode, 403);
      assert.equal(
        (await request('GET', '/reports/executive?from=2026-10-22&to=2026-10-21')).statusCode,
        400,
      );
      assert.equal(
        (await request('GET', '/reports/executive?from=2026-02-30&to=2026-03-01')).statusCode,
        400,
      );
      const dst = (await request('GET', '/reports/executive?from=2026-03-08&to=2026-03-09')).json();
      assert.equal(dst.trend.length, 2);
      assert.deepEqual(dst.previous_period, { from: '2026-03-06', to: '2026-03-07' });
    });
    await t.test('agenda por fecha y estado, resumen y configuración respetan el rol', async () => {
      const r = await request('GET', '/attentions?day=2026-10-21&status=COMPLETED&limit=500');
      assert.equal(r.statusCode, 200, r.body);
      assert.ok(r.json().items.every((a: any) => a.status === 'COMPLETED'));
      assert.equal((await request('GET', '/appointments?status=IN_PROGRESS')).statusCode, 400);
      assert.equal((await request('GET', '/operations/overview?day=2026-02-30')).statusCode, 400);
      const overview = await request('GET', '/operations/overview?day=2026-10-21');
      assert.equal(overview.statusCode, 200, overview.body);
      assert.equal(overview.json().timezone, 'America/Tijuana');
      const clinician = await login('dentist@example.test');
      const own = (await request('GET', '/operations/overview?day=2026-10-21', undefined, clinician)).json();
      assert.equal(own.available_cards, null);
      const support = await login('support@example.test');
      assert.equal(
        (await request('GET', '/operations/overview?day=2026-10-21', undefined, support)).statusCode,
        403,
      );
      const setup = await request('GET', '/setup');
      assert.equal(setup.statusCode, 200, setup.body);
      assert.ok(setup.json().checks.some((c: any) => c.key === 'services' && c.ready));
    });
    await t.test('exportaciones son archivos válidos con mismos totales', async () => {
      const expected = await report(db, { from: '2026-10-21', to: '2026-10-21' }, { role: 'ADMIN' });
      for (const format of ['csv', 'pdf', 'xlsx']) {
        const r = await request('GET', `/reports/export?from=2026-10-21&to=2026-10-21&format=${format}`);
        assert.equal(r.statusCode, 200, r.body.slice(0, 100));
        if (format === 'csv') assert.ok(r.body.includes((expected.summary.revenue_cents / 100).toFixed(2)));
        if (format === 'pdf') assert.equal(r.rawPayload.subarray(0, 4).toString(), '%PDF');
        if (format === 'xlsx') assert.equal(r.rawPayload.subarray(0, 2).toString(), 'PK');
      }
    });
    await t.test('trabajo semanal idempotente y mes sin base no inventa variación', async () => {
      await weeklyJob(db, new Date('2026-10-26T18:00:00Z'));
      await weeklyJob(db, new Date('2026-10-26T18:00:00Z'));
      assert.equal((await db.query('SELECT * FROM weekly_reports')).rows.length, 1);
      assert.equal(
        (await request('GET', '/reports/productivity?month=2026-10')).json().variation_percent,
        null,
      );
    });
    await t.test('credencial de estación revocable e independiente de sesión', async () => {
      const credential = (await request('POST', `/stations/${station}/credential`, { revoke: false })).json()
        .token;
      let r = await app.inject({
        method: 'POST',
        url: '/api/v1/rfid/events',
        headers: { authorization: `Bearer ${credential}` },
        payload: { event_id: id(), uid: 'TEST-49', station_id: station },
      });
      assert.equal(r.statusCode, 200);
      await request('POST', `/stations/${station}/credential`, { revoke: true });
      r = await app.inject({
        method: 'POST',
        url: '/api/v1/rfid/events',
        headers: { authorization: `Bearer ${credential}` },
        payload: { event_id: id(), uid: 'TEST-49', station_id: station },
      });
      assert.equal(r.statusCode, 401);
    });
    await t.test('desactivación y cierre de sesión revocan acceso', async () => {
      const clinician = await login('dentist@example.test');
      assert.equal((await request('PATCH', `/users/${dentistUser}`, { active: false })).statusCode, 200);
      assert.equal((await request('GET', '/sessions/me', undefined, clinician)).statusCode, 401);
      assert.equal((await request('POST', '/sessions/logout', {})).statusCode, 200);
      assert.equal((await request('GET', '/sessions/me')).statusCode, 401);
    });
    await t.test('búsqueda y paginación no permiten leer recursos ajenos', async () => {
      auth = await login('admin@example.test');
      const result = await request('GET', '/attentions?limit=1&offset=1&q=Paciente');
      assert.equal(result.statusCode, 200);
      assert.equal(result.json().items.length, 1);
      assert.ok(result.json().total > 1);
      assert.equal((await request('GET', '/patients?q=Paciente%20A')).json().items.length, 1);
      assert.equal((await request('GET', '/patients?q=%25')).json().items.length, 0);
      assert.equal((await request('GET', '/attentions?limit=501')).statusCode, 400);
      assert.equal((await request('GET', '/patients?q=%27%20OR%201%3D1--')).json().items.length, 0);
    });
    await t.test('cambio de contraseña requiere la actual y revoca todas las sesiones', async () => {
      const as = await login('reception@example.test');
      assert.equal(
        (
          await request(
            'POST',
            '/sessions/password',
            { current_password: 'incorrecta', new_password: 'New-test-only-password!' },
            as,
          )
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await request(
            'POST',
            '/sessions/password',
            { current_password: password, new_password: 'New-test-only-password!' },
            as,
          )
        ).statusCode,
        200,
      );
      assert.equal((await request('GET', '/sessions/me', undefined, as)).statusCode, 401);
    });
    await t.test('cierre después de medianoche conserva el turno de entrada', async () => {
      const late = id();
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO shifts(id,name,weekday,start_time,end_time) VALUES($1,'Turno nocturno',6,'19:00','23:59')",
          [late],
        );
        await tx.query(
          "INSERT INTO calendar_days(id,shift_id,day,operated) VALUES($1,$2,'2026-10-31',true)",
          [id(), late],
        );
        await tx.query(
          "INSERT INTO attentions(id,patient_id,dentist_id,service_id,station_id,shift_id,card_id,price_cents,status,started_at,ended_at,released_at) VALUES($1,$2,$3,$4,$5,$6,$7,10000,'COMPLETED','2026-11-01T06:50:00Z','2026-11-01T07:10:00Z','2026-11-01T07:15:00Z')",
          [id(), patient, dentist, services[0], station, late, cards[0]],
        );
      });
      const prior = await report(db, { from: '2026-10-31', to: '2026-10-31' }, { role: 'ADMIN' });
      assert.equal(prior.summary.revenue_cents, 0);
      assert.equal(prior.summary.patients_per_shift, 1);
      const next = await report(db, { from: '2026-11-01', to: '2026-11-01' }, { role: 'ADMIN' });
      assert.equal(next.summary.revenue_cents, 10000);
      assert.equal(next.summary.patients_per_shift, null);
    });
    await t.test('reinicio recupera semanas faltantes sin duplicar las existentes', async () => {
      await weeklyJob(db, new Date('2026-11-16T18:00:00Z'));
      assert.equal((await db.query('SELECT * FROM weekly_reports')).rows.length, 4);
      await weeklyJob(db, new Date('2026-11-16T18:00:00Z'));
      assert.equal((await db.query('SELECT * FROM weekly_reports')).rows.length, 4);
    });
    await t.test('intentos repetidos bloquean temporalmente la cuenta consultada', async () => {
      const realtime = await buildApp({ db });
      try {
        for (let n = 0; n < 5; n++)
          assert.equal(
            (
              await realtime.inject({
                method: 'POST',
                url: '/api/v1/sessions',
                remoteAddress: '127.0.0.91',
                headers: { origin },
                payload: { email: 'unknown@example.test', password: 'incorrecta' },
              })
            ).statusCode,
            401,
          );
        assert.equal(
          (
            await realtime.inject({
              method: 'POST',
              url: '/api/v1/sessions',
              remoteAddress: '127.0.0.91',
              headers: { origin },
              payload: { email: 'unknown@example.test', password: 'incorrecta' },
            })
          ).statusCode,
          429,
        );
      } finally {
        await realtime.close();
      }
    });
    await t.test('producción exige origen HTTPS, cookie segura y simulador bloqueado', async () => {
      const prior = process.env.NODE_ENV;
      Reflect.set(process.env, 'NODE_ENV', 'production');
      let secure: Awaited<ReturnType<typeof buildApp>> | undefined;
      try {
        await assert.rejects(() => buildApp({ db, origin: 'http://localhost:3000' }), /HTTPS/);
        secure = await buildApp({ db, clock, origin: 'https://clinic.example.test' });
        for (const rejected of [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'https://clinic.example.test:3001',
        ]) {
          assert.equal(
            (
              await secure.inject({
                method: 'POST',
                url: '/api/v1/sessions',
                headers: { origin: rejected },
                payload: { email: 'admin@example.test', password },
              })
            ).statusCode,
            403,
          );
        }
        const login = await secure.inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { origin: 'https://clinic.example.test' },
          payload: { email: 'admin@example.test', password },
        });
        assert.equal(login.statusCode, 200, login.body);
        const setCookie = String(login.headers['set-cookie']);
        assert.match(setCookie, /^__Host-dr_session=/);
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /Secure/);
        assert.match(setCookie, /SameSite=Strict/i);
        const simulator = await secure.inject({
          method: 'POST',
          url: '/api/v1/rfid/simulate',
          headers: {
            origin: 'https://clinic.example.test',
            cookie: setCookie.split(';')[0],
            'x-csrf-token': login.json().csrf,
          },
          payload: { event_id: id(), station_id: station, uid: 'TEST-49' },
        });
        assert.equal(simulator.statusCode, 403);
      } finally {
        await secure?.close();
        if (prior === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
        else Reflect.set(process.env, 'NODE_ENV', prior);
      }
    });
    await t.test('zona horaria tiene días de 23 y 25 horas sin alterar aritmética UTC', () => {
      const spring = DateTime.fromISO('2026-03-08', { zone: 'America/Tijuana' });
      assert.equal(spring.plus({ days: 1 }).diff(spring, 'hours').hours, 23);
      const fall = DateTime.fromISO('2026-11-01', { zone: 'America/Tijuana' });
      assert.equal(fall.plus({ days: 1 }).diff(fall, 'hours').hours, 25);
    });
  } finally {
    await app.close();
    await db.close();
  }
});
