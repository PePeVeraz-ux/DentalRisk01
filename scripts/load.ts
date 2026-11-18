import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import argon2 from 'argon2';
import { DateTime } from 'luxon';
import { database, migrate } from '../apps/api/src/db.js';
import { buildApp } from '../apps/api/src/app.js';
import { digest, id, token } from '../apps/api/src/domain.js';

const seconds = Number(process.env.LOAD_SECONDS ?? 1800);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 3600)
  throw new Error('LOAD_SECONDS debe estar entre 5 y 3600.');
const stationCount = Number(process.env.LOAD_STATIONS ?? 4);
if (!Number.isInteger(stationCount) || stationCount < 1 || stationCount > 10)
  throw new Error('LOAD_STATIONS debe estar entre 1 y 10.');
// An isolated compatible database is used unless a dedicated empty PostgreSQL test URL is explicitly supplied.
if (process.env.NODE_ENV === 'production') throw new Error('Carga sintética prohibida en producción');
const db = process.env.TEST_DATABASE_URL
  ? await database({ url: process.env.TEST_DATABASE_URL })
  : await database({ memory: true });
if (
  process.env.TEST_DATABASE_URL &&
  (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' LIMIT 1"))
    .rows.length
)
  throw new Error('TEST_DATABASE_URL debe apuntar a una base vacía aislada.');
await migrate(db);
let logicalNow = new Date('2026-10-21T17:00:00Z');
const admin = id(),
  service = id(),
  patient = id(),
  shift = id(),
  stations = Array.from({ length: stationCount }, () => id()),
  dentists = Array.from({ length: stationCount }, () => id()),
  cards = Array.from({ length: stationCount }, () => id()),
  credentials = Array.from({ length: stationCount }, () => token());
const password = token(),
  hash = await argon2.hash(password);
await db.transaction(async (tx) => {
  await tx.query(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'LOAD Admin','load@example.test',$2,'ADMIN')",
    [admin, hash],
  );
  await tx.query(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'LOAD Recepción','reception-load@example.test',$2,'RECEPTION')",
    [id(), hash],
  );
  await tx.query("INSERT INTO services(id,name,price_cents) VALUES($1,'LOAD Servicio',10000)", [service]);
  await tx.query("INSERT INTO patients(id,name,reference) VALUES($1,'LOAD Paciente','LOAD')", [patient]);
  await tx.query(
    "INSERT INTO shifts(id,name,weekday,start_time,end_time) VALUES($1,'LOAD Turno',3,'00:00','23:59')",
    [shift],
  );
  await tx.query("INSERT INTO calendar_days(id,shift_id,day,operated) VALUES($1,$2,'2026-10-21',true)", [
    id(),
    shift,
  ]);
  for (let i = 0; i < stationCount; i++) {
    await tx.query('INSERT INTO dentists(id,name) VALUES($1,$2)', [dentists[i], `LOAD Dentista ${i}`]);
    await tx.query('INSERT INTO stations(id,name,token_hash) VALUES($1,$2,$3)', [
      stations[i],
      `LOAD Estación ${i}`,
      digest(credentials[i]),
    ]);
    await tx.query('INSERT INTO cards(id,uid) VALUES($1,$2)', [cards[i], `LOAD-${i}`]);
  }
  await tx.query(
    `INSERT INTO attentions(id,patient_id,dentist_id,service_id,station_id,shift_id,card_id,price_cents,status,started_at,ended_at,released_at)
    SELECT 'history-'||n,$1,$2,$3,$4,$5,$6,10000,'COMPLETED',timestamptz '2026-10-01T10:00:00Z'+n*interval '1 minute',timestamptz '2026-10-01T10:00:30Z'+n*interval '1 minute',timestamptz '2026-10-10T10:00:00Z' FROM generate_series(1,10000) n`,
    [patient, dentists[0], service, stations[0], shift, cards[0]],
  );
});
const app = await buildApp({ db, clock: () => logicalNow });
const origin = 'http://localhost:3000';
const sessions: { cookie: string; csrf: string }[] = [];
for (let i = 0; i < 10; i++) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    remoteAddress: `127.0.0.${i + 1}`,
    headers: { origin },
    payload: { email: i < 2 ? 'reception-load@example.test' : 'load@example.test', password },
  });
  if (r.statusCode !== 200) throw new Error(r.body);
  sessions.push({ cookie: String(r.headers['set-cookie']).split(';')[0], csrf: r.json().csrf });
}
const measurements: { kind: string; ms: number; status: number }[] = [];
const errors: string[] = [];
let stopping = false;
async function call(kind: string, url: string, payload?: any, stationIndex?: number, sessionIndex = 0) {
  const s = sessions[sessionIndex];
  const started = performance.now();
  const r = await app.inject({
    method: payload === undefined ? 'GET' : 'POST',
    url: '/api/v1' + url,
    headers:
      stationIndex === undefined
        ? { origin, cookie: s.cookie, 'x-csrf-token': s.csrf }
        : { authorization: `Bearer ${credentials[stationIndex]}` },
    payload,
  });
  measurements.push({ kind, ms: performance.now() - started, status: r.statusCode });
  if (r.statusCode !== 200) errors.push(`${kind}:${r.statusCode}:${r.body.slice(0, 140)}`);
  return r;
}
const started = performance.now();
console.log(
  `Carga iniciada: ${seconds}s, 10 sesiones, ${stationCount} estaciones, 10,000 registros históricos. Motor: ${process.env.TEST_DATABASE_URL ? 'PostgreSQL' : 'PGlite de pruebas'}.`,
);
const progress = setInterval(
  () =>
    console.log(
      `Carga en curso: ${Math.round((performance.now() - started) / 1000)}s; solicitudes ${measurements.length}; errores ${errors.length}; detalle ${errors.slice(0, 3).join(' / ')}`,
    ),
  60000,
);
try {
  const workers = Array.from({ length: 10 }, (_, i) =>
    (async () => {
      while (!stopping) {
        await call(
          i < 2 ? 'reception' : 'executive',
          i < 2 ? '/attentions?limit=50' : '/reports/executive?from=2026-10-01&to=2026-10-21',
          undefined,
          undefined,
          i,
        );
        await delay(4000);
      }
    })(),
  );
  const readers = Array.from({ length: stationCount }, (_, i) =>
    (async () => {
      while (!stopping) {
        const attention = await call(
          'bind',
          '/attentions',
          {
            patient_id: patient,
            dentist_id: dentists[i],
            service_id: service,
            station_id: stations[i],
            shift_id: shift,
            card_id: cards[i],
          },
          undefined,
          i % 2,
        );
        if (attention.statusCode !== 200) {
          await delay(3000);
          continue;
        }
        logicalNow = new Date(logicalNow.getTime() + 3000);
        const eventId = id();
        const payload = { station_id: stations[i], event_id: eventId, uid: `LOAD-${i}` };
        const enter = await call('rfid', '/rfid/events', payload, i);
        if (enter.json().code !== 'CHECK_IN') errors.push('Entrada no aceptada');
        const retry = await call('retry', '/rfid/events', payload, i);
        if (
          retry.json().attention_id !== enter.json().attention_id ||
          retry.json().code !== enter.json().code ||
          retry.json().at !== enter.json().at
        )
          errors.push('Reintento distinto');
        await delay(3000);
        logicalNow = new Date(logicalNow.getTime() + 3000);
        const exit = await call(
          'rfid',
          '/rfid/events',
          { station_id: stations[i], event_id: id(), uid: `LOAD-${i}` },
          i,
        );
        if (exit.json().code !== 'CHECK_OUT') errors.push('Salida no aceptada');
        await call('release', `/attentions/${attention.json().id}/release`, {}, undefined, i % 2);
        await delay(1000);
      }
    })(),
  );
  await delay(seconds * 1000);
  stopping = true;
  await Promise.all([...workers, ...readers]);
  const rfid = measurements
    .filter((m) => m.kind === 'rfid')
    .map((m) => m.ms)
    .sort((a, b) => a - b);
  const integrity = (
    await db.query(
      "SELECT count(*)::int count,sum(price_cents)::text revenue FROM attentions WHERE status='COMPLETED'",
    )
  ).rows[0];
  const output = {
    generated_at: new Date().toISOString(),
    requested_seconds: seconds,
    elapsed_seconds: (performance.now() - started) / 1000,
    motor: process.env.TEST_DATABASE_URL ? 'PostgreSQL' : 'PGlite',
    physical_hardware: false,
    historical_records: 10000,
    web_sessions: 10,
    application_version: '1.0.0',
    roles: { reception: 2, owner: 8 },
    read_endpoints: ['attentions', 'reports/executive'],
    stations: stationCount,
    requests: measurements.length,
    errors,
    rfid_requests: rfid.length,
    max_rfid_ms: Math.max(...rfid),
    p95_rfid_ms: rfid[Math.floor(rfid.length * 0.95)],
    integrity,
    passed: errors.length === 0 && rfid.length > 0 && rfid.every((n) => n < 2000),
  };
  await mkdir('docs/evidencias', { recursive: true });
  await writeFile(`docs/evidencias/carga-${seconds}s.json`, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
  if (!output.passed) process.exitCode = 1;
} finally {
  stopping = true;
  clearInterval(progress);
  await app.close();
  await db.close();
}
