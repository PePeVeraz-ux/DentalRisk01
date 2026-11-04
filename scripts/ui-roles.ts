import { chromium, type Page, type BrowserContext } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer as httpsServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { DateTime } from 'luxon';
import { database, migrate } from '../apps/api/src/db.js';
import { buildApp } from '../apps/api/src/app.js';
import { id, digest } from '../apps/api/src/domain.js';

// Entire fixture stays in memory; no clinical database or credentials are used.
const webPort = Number(process.env.UI_TEST_PORT ?? 3311),
  apiPort = webPort + 1000;
const productionMode = process.argv.includes('--production');
if (productionMode) Reflect.set(process.env, 'NODE_ENV', 'production');
const nextPort = productionMode ? webPort + 1 : webPort;
const base = `${productionMode ? 'https' : 'http'}://127.0.0.1:${webPort}`;
const tls = productionMode
  ? {
      key: await readFile(process.env.UI_TLS_KEY ?? '.local/test-tls/key.pem'),
      cert: await readFile(process.env.UI_TLS_CERT ?? '.local/test-tls/cert.pem'),
    }
  : null;
const db = await database({ memory: true });
await migrate(db);
const password = randomBytes(24).toString('base64url');
const stationToken = randomBytes(32).toString('hex');
const uid = {
  admin: id(),
  dentist: id(),
  other: id(),
  service: id(),
  station: id(),
  shift: id(),
  card: id(),
};
const hash = await argon2.hash(password, { type: argon2.argon2id });
const now = DateTime.now().setZone('America/Tijuana'),
  day = now.toISODate()!;
await db.transaction(async (tx) => {
  await tx.query(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'QA Dueño','owner@example.test',$2,'ADMIN')",
    [uid.admin, hash],
  );
  for (const [key, name] of [
    [uid.dentist, 'QA Dentista A'],
    [uid.other, 'QA Dentista B'],
  ])
    await tx.query('INSERT INTO dentists(id,name,specialty) VALUES($1,$2,$3)', [key, name, 'Prueba aislada']);
  for (let i = 0; i < 15; i++)
    await tx.query('INSERT INTO services(id,name,price_cents) VALUES($1,$2,$3)', [
      i === 0 ? uid.service : id(),
      `QA Servicio ${i + 1}`,
      10000,
    ]);
  await tx.query("INSERT INTO stations(id,name,token_hash) VALUES($1,'QA Consultorio',$2)", [
    uid.station,
    digest(stationToken),
  ]);
  await tx.query("INSERT INTO cards(id,uid) VALUES($1,'QA-CARD')", [uid.card]);
  await tx.query(
    "INSERT INTO shifts(id,name,weekday,start_time,end_time) VALUES($1,'QA Turno',$2,'00:00','23:59')",
    [uid.shift, now.weekday % 7],
  );
  await tx.query('INSERT INTO calendar_days(id,shift_id,day,operated) VALUES($1,$2,$3,true)', [
    id(),
    uid.shift,
    day,
  ]);
  const patient = id(),
    card = id();
  await tx.query("INSERT INTO patients(id,name,reference) VALUES($1,'QA Paciente ajeno','QA-OTHER')", [
    patient,
  ]);
  await tx.query("INSERT INTO cards(id,uid) VALUES($1,'QA-HISTORY')", [card]);
  await tx.query(
    "INSERT INTO attentions(id,patient_id,dentist_id,service_id,station_id,shift_id,card_id,price_cents,status,started_at,ended_at,released_at) VALUES($1,$2,$3,$4,$5,$6,$7,20000,'COMPLETED',$8,$9,$9)",
    [
      id(),
      patient,
      uid.other,
      uid.service,
      uid.station,
      uid.shift,
      card,
      now.minus({ minutes: 30 }).toJSDate(),
      now.toJSDate(),
    ],
  );
});
const app = await buildApp({ db, origin: base });
const webEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: productionMode ? 'production' : 'development',
  API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
  NEXT_DIST_DIR: productionMode ? '.next-production-ui' : '.next-ui',
};
if (productionMode) {
  // Next compiles rewrite destinations into the build. Use the isolated API at build time too.
  console.log('Compilando interfaz de producción para el servidor de prueba aislado.');
  const built = spawnSync(
    process.execPath,
    [resolve('node_modules/next/dist/bin/next'), 'build', 'apps/web'],
    { env: webEnv, encoding: 'utf8', windowsHide: true },
  );
  if (built.status !== 0)
    throw new Error('Compilación de interfaz de prueba fallida: ' + built.stdout + built.stderr);
}
await app.listen({ host: '127.0.0.1', port: apiPort });
const web = spawn(
  process.execPath,
  [
    resolve('node_modules/next/dist/bin/next'),
    productionMode ? 'start' : 'dev',
    'apps/web',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(nextPort),
  ],
  {
    env: webEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
const tlsProxy = tls
  ? httpsServer(tls, (request, response) => {
      const upstream = httpRequest(
        {
          hostname: '127.0.0.1',
          port: nextPort,
          method: request.method,
          path: request.url,
          headers: request.headers,
        },
        (received) => {
          response.writeHead(received.statusCode ?? 502, received.headers);
          received.pipe(response);
        },
      );
      upstream.on('error', () => {
        response.writeHead(502);
        response.end('Servidor de prueba no disponible');
      });
      request.pipe(upstream);
    })
  : null;
if (tlsProxy)
  await new Promise<void>((done, fail) => {
    tlsProxy.once('error', fail);
    tlsProxy.listen(webPort, '127.0.0.1', done);
  });
let serverLog = '';
web.stdout.on('data', (chunk) => {
  serverLog = (serverLog + chunk).slice(-6000);
});
web.stderr.on('data', (chunk) => {
  serverLog = (serverLog + chunk).slice(-6000);
});
const contexts: BrowserContext[] = [];
const errors: string[] = [];
const checks: string[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let activePage: Page | undefined;
await mkdir('.local/screenshots', { recursive: true });
async function screenshot(page: Page, role: string) {
  await page.screenshot({
    path: `.local/screenshots/${productionMode ? 'produccion-' : ''}${role}-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    `Desbordamiento móvil: ${role}`,
  );
  await page.screenshot({
    path: `.local/screenshots/${productionMode ? 'produccion-' : ''}${role}-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function login(email: string) {
  const context = await browser!.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'America/New_York',
    // Only the isolated TLS test accepts its ephemeral certificate. No trust store is changed.
    ignoreHTTPSErrors: productionMode,
  });
  contexts.push(context);
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  if (contexts.length === 1) await screenshot(page, 'acceso');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^Iniciar sesión/ }).click();
  await page.locator('.sidebar').waitFor();
  return page;
}
async function navigate(page: Page, label: string) {
  await page.locator('nav').getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(250);
}
try {
  const deadline = Date.now() + 60000;
  let started = false;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${nextPort}`, { signal: AbortSignal.timeout(2000) })).ok) {
        started = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  if (!started) throw new Error('Servidor web de prueba no disponible: ' + serverLog);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : process.env.CI
        ? {}
        : { channel: 'chrome' }),
  });
  const owner = await login('owner@example.test');
  if (productionMode) {
    const cookies = await owner.context().cookies();
    const session = cookies.find((c) => c.name === '__Host-dr_session');
    assert.ok(session?.secure && session.httpOnly && session.sameSite === 'Strict');
    const csp = (await owner.request.get(base)).headers()['content-security-policy'];
    assert.ok(csp.includes("'nonce-") && !csp.includes("'unsafe-eval'"));
    checks.push('bundle optimizado sobre HTTPS, cookie __Host Secure/HttpOnly/SameSite y CSP con nonce');
  }
  await owner.getByRole('heading', { name: 'Panel ejecutivo', exact: true }).waitFor();
  assert.equal(await owner.locator('nav').getByRole('button', { name: 'Recepción', exact: true }).count(), 0);
  assert.equal(await owner.locator('nav').getByRole('button', { name: 'Agenda', exact: true }).count(), 0);
  await owner.getByRole('heading', { name: 'Desempeño por dentista' }).waitFor();
  await owner.getByRole('heading', { name: 'Pacientes por día' }).waitFor();
  assert.equal(await owner.locator('.executive-kpis .kpi').count(), 3);
  await owner.reload();
  await owner.getByRole('heading', { name: 'Desempeño por dentista' }).waitFor();
  assert.ok(owner.url().endsWith('/direccion'));
  checks.push('dueño: panel ejecutivo, ruta persistente y operación oculta');
  console.log('Panel ejecutivo y navegación del dueño verificados.');
  await navigate(owner, 'Usuarios y seguridad');
  const create = owner.locator('form').filter({ hasText: 'Crear cuenta individual' });
  for (const [role, email] of [
    ['RECEPTION', 'reception@example.test'],
    ['DENTIST', 'dentist@example.test'],
    ['SUPPORT', 'support@example.test'],
  ]) {
    await create.getByLabel('Nombre', { exact: true }).fill('QA ' + role);
    await create.getByLabel('Correo', { exact: true }).fill(email);
    await create.getByLabel('Contraseña (mín. 12 caracteres)', { exact: true }).fill(password);
    await create.getByLabel('Rol', { exact: true }).selectOption(role);
    if (role === 'DENTIST')
      await create.getByLabel('Dentista (para rol Dentista)', { exact: true }).selectOption(uid.dentist);
    await create.getByRole('button', { name: 'Guardar' }).click();
    await owner.getByRole('row').filter({ hasText: email }).waitFor();
  }
  checks.push('alta de cuentas por rol desde la interfaz');
  const reception = await login('reception@example.test');
  await reception.getByRole('heading', { name: 'Recepción', exact: true }).waitFor();
  assert.equal(
    await reception.locator('nav').getByRole('button', { name: 'Panel ejecutivo', exact: true }).count(),
    0,
  );
  const patientForm = reception.locator('form').filter({ hasText: 'Datos mínimos de identificación' });
  await patientForm.getByLabel('Nombre', { exact: true }).fill('QA Paciente propio');
  await delay(4500);
  assert.equal(await patientForm.getByLabel('Nombre', { exact: true }).inputValue(), 'QA Paciente propio');
  await patientForm.getByLabel('Folio de paciente', { exact: true }).fill('QA-OWN');
  await patientForm.getByRole('button', { name: 'Guardar' }).click();
  await reception.getByRole('row').filter({ hasText: 'QA-OWN' }).waitFor();
  await navigate(reception, 'Agenda');
  const appointment = reception.locator('form').filter({ hasText: 'Nueva cita' });
  await appointment.getByLabel('Paciente', { exact: true }).selectOption({ label: 'QA Paciente propio' });
  await appointment.getByLabel('Servicio', { exact: true }).selectOption(uid.service);
  await appointment.getByLabel('Dentista', { exact: true }).selectOption(uid.dentist);
  const appointmentTime = now.plus({ minutes: 10 }).startOf('minute');
  await appointment
    .getByLabel('Inicio', { exact: true })
    .fill(appointmentTime.toFormat("yyyy-MM-dd'T'HH:mm"));
  await appointment
    .getByLabel('Fin', { exact: true })
    .fill(appointmentTime.plus({ minutes: 30 }).toFormat("yyyy-MM-dd'T'HH:mm"));
  await appointment.getByRole('button', { name: 'Guardar' }).click();
  await reception.getByLabel('Fecha de cita').fill(appointmentTime.toISODate()!);
  const appointmentRow = reception.getByRole('row').filter({ hasText: 'QA Paciente propio' });
  await appointmentRow.waitFor();
  await screenshot(reception, 'agenda');
  const created = (await (await reception.request.get(base + '/api/v1/appointments')).json()).items[0];
  assert.equal(
    DateTime.fromISO(created.starts_at).toMillis(),
    appointmentTime.toMillis(),
    'Conversión de horario de clínica independiente del navegador',
  );
  await appointmentRow.getByRole('button', { name: 'Vincular tarjeta' }).click();
  const bind = reception.locator('form').filter({ hasText: 'Vincular tarjeta a la cita' });
  await bind.getByLabel('Estación', { exact: true }).selectOption(uid.station);
  await bind.getByLabel('Turno', { exact: true }).selectOption(uid.shift);
  await bind.getByLabel('Tarjeta disponible', { exact: true }).selectOption(uid.card);
  await screenshot(reception, 'vinculacion');
  await bind.getByRole('button', { name: 'Confirmar vinculación' }).click();
  const attentionRow = reception.getByRole('row').filter({ hasText: 'QA Paciente propio' });
  await attentionRow.getByText('Pendiente', { exact: true }).waitFor();
  const simulator = reception
    .locator('section')
    .filter({ has: reception.getByRole('heading', { name: 'Simulador de lector RFID' }) });
  if (!productionMode) {
    await simulator.getByLabel('Estación', { exact: true }).selectOption(uid.station);
    await simulator.getByLabel('Tarjeta', { exact: true }).selectOption({ label: 'QA-CARD' });
  } else assert.equal(await simulator.count(), 0);
  const scan = async () => {
    if (!productionMode) await simulator.getByRole('button', { name: 'Simular escaneo' }).click();
    else {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/rfid/events',
        headers: { authorization: `Bearer ${stationToken}` },
        payload: { event_id: id(), station_id: uid.station, uid: 'QA-CARD' },
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().accepted, true);
    }
  };
  await scan();
  await attentionRow.getByText('En atención', { exact: true }).waitFor();
  if (!productionMode) await reception.getByText('Entrada confirmada', { exact: true }).waitFor();
  await delay(2300);
  await scan();
  await attentionRow.getByText('Completada', { exact: true }).waitFor();
  if (!productionMode) await reception.getByText('Salida confirmada', { exact: true }).waitFor();
  await attentionRow.getByRole('button', { name: 'Liberar', exact: true }).click();
  const release = reception.getByRole('region', { name: 'Liberar tarjeta devuelta' });
  await release.getByRole('button', { name: 'Confirmar liberación' }).click();
  assert.equal(await release.count(), 1, 'La devolución física debe confirmarse antes de liberar');
  await release.getByLabel('Tarjeta recibida y utilizable').check();
  await release.getByRole('button', { name: 'Confirmar liberación' }).click();
  await attentionRow.getByRole('button', { name: 'Liberar', exact: true }).waitFor({ state: 'detached' });
  await screenshot(reception, 'recepcion');
  await navigate(reception, 'Recepción');
  await screenshot(reception, 'jornada');
  await reception.goto(base + '/seguridad');
  await reception.getByRole('heading', { name: 'Recepción', exact: true }).waitFor();
  assert.equal((await reception.request.get(base + '/api/v1/users')).status(), 403);
  checks.push(
    'recepción: paciente, cita, horario clínico, vinculación, entrada/salida y liberación',
    'restricción de rutas y API de administración',
  );
  console.log('Flujo de recepción y RFID simulado verificado.');
  const dentist = await login('dentist@example.test');
  await dentist.locator('h1').filter({ hasText: 'Mi productividad' }).waitFor();
  await dentist.getByRole('heading', { name: 'Mi productividad por servicio' }).waitFor();
  const own = await (
    await dentist.request.get(
      base + `/api/v1/reports/executive?from=${day}&to=${day}&dentist_id=${uid.other}`,
    )
  ).json();
  assert.equal(own.summary.revenue_cents, 10000);
  assert.equal(own.dentists.length, 1);
  assert.equal(own.dentists[0].id, uid.dentist);
  await navigate(dentist, 'Atenciones');
  assert.equal(await dentist.getByRole('row').filter({ hasText: 'QA Paciente ajeno' }).count(), 0);
  await dentist.getByRole('row').filter({ hasText: 'QA Paciente propio' }).waitFor();
  await navigate(dentist, 'Mi productividad');
  await screenshot(dentist, 'dentista');
  checks.push('dentista: indicadores y atenciones propios, incluso con filtro ajeno');
  const support = await login('support@example.test');
  await support.getByRole('heading', { name: 'Estado del sistema' }).waitFor();
  assert.equal((await support.request.get(base + '/api/v1/patients')).status(), 403);
  assert.equal(
    await support.locator('nav').getByRole('button', { name: 'Recepción', exact: true }).count(),
    0,
  );
  await screenshot(support, 'soporte');
  checks.push('soporte: diagnóstico sin pacientes');
  await navigate(owner, 'Mi cuenta');
  const exception = owner.locator('form').filter({ hasText: 'Autorizar acceso temporal' });
  await exception.getByLabel('Contraseña para autorizar').fill(password);
  await exception
    .getByLabel('Motivo del acceso (mínimo 5 caracteres)')
    .fill('Cobertura de recepción en prueba aislada');
  await exception.getByRole('button', { name: 'Guardar' }).click();
  await owner.locator('nav').getByRole('button', { name: 'Recepción', exact: true }).waitFor();
  await owner.getByRole('button', { name: 'Finalizar acceso', exact: true }).click();
  await owner
    .locator('nav')
    .getByRole('button', { name: 'Recepción', exact: true })
    .waitFor({ state: 'detached' });
  const session = await (await owner.request.get(base + '/api/v1/sessions/me')).json();
  const denied = await owner.request.post(base + '/api/v1/patients', {
    headers: { origin: base, 'x-csrf-token': session.csrf },
    data: { name: 'No permitido', reference: 'NO' },
  });
  assert.equal(denied.status(), 403);
  checks.push('dueño: activación y revocación de acceso excepcional sin permisos residuales');
  await navigate(owner, 'Panel ejecutivo');
  await owner.getByRole('heading', { name: 'Desempeño por dentista' }).waitFor();
  for (const format of ['csv', 'pdf', 'xlsx'])
    assert.equal(
      (
        await owner.request.get(base + `/api/v1/reports/export?from=${day}&to=${day}&format=${format}`)
      ).status(),
      200,
    );
  await screenshot(owner, 'direccion');
  await navigate(owner, 'Configuración');
  await owner.getByRole('heading', { name: 'Configuración de la clínica' }).waitFor();
  await screenshot(owner, 'configuracion');
  await navigate(owner, 'Reportes');
  await owner.getByRole('heading', { name: 'Productividad por servicio', exact: true }).waitFor();
  const downloaded = owner.waitForEvent('download');
  await owner.getByRole('button', { name: 'CSV ↓', exact: true }).click();
  assert.ok((await downloaded).suggestedFilename().endsWith('.csv'));
  await owner.route('**/api/v1/reports/export?**', route => route.fulfill({ status: 503, body: 'No disponible' }));
  await owner.getByRole('button', { name: 'PDF ↓', exact: true }).click();
  await owner.getByRole('alert').filter({ hasText: 'No se pudo generar el archivo' }).waitFor();
  await owner.unroute('**/api/v1/reports/export?**');
  checks.push('wireframes: tres KPIs, gráfico de pacientes, devolución física obligatoria, confirmaciones RFID y estados de exportación');
  await screenshot(owner, 'reportes');
  await navigate(owner, 'Panel ejecutivo');
  const outage = (route: any) => route.abort('connectionfailed');
  await owner.route('**/api/v1/**', outage);
  await owner.getByRole('alert').filter({ hasText: 'No se pudo actualizar' }).waitFor({ timeout: 12000 });
  await owner.unroute('**/api/v1/**', outage);
  await owner.waitForFunction(
    () => !document.body.textContent?.includes('No se pudo actualizar'),
    undefined,
    { timeout: 12000 },
  );
  checks.push(
    'exportaciones CSV/PDF/XLSX',
    'desconexión visible y recuperación',
    'cuatro perfiles en escritorio y móvil sin desbordamiento',
  );
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.getByRole('button', { name: 'Cerrar sesión en móvil', exact: true }).click();
  await owner.getByRole('heading', { name: 'Accede a tu clínica' }).waitFor();
  assert.deepEqual(errors, []);
  checks.push('cierre de sesión móvil', 'sin errores JavaScript');
  await mkdir('docs/evidencias', { recursive: true });
  await writeFile(
    `docs/evidencias/${productionMode ? 'interfaz-produccion' : 'interfaz'}.json`,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        passed: true,
        isolated_database: true,
        desktop: '1440x1000',
        mobile: '390x844',
        browser_timezone: 'America/New_York',
        clinic_timezone: 'America/Tijuana',
        checks,
        physical_hardware: false,
        production_bundle: productionMode,
        tls: productionMode,
        ephemeral_test_certificate: productionMode,
        production_server_validated: false,
      },
      null,
      2,
    ),
  );
  console.log('Interfaz de los cuatro perfiles aprobada. Datos de prueba aislados.');
} catch (error) {
  if (activePage) {
    await activePage.screenshot({ path: '.local/screenshots/failure.png', fullPage: true }).catch(() => {});
    await writeFile(
      '.local/ui-failure.txt',
      await activePage
        .locator('body')
        .innerText()
        .catch(() => 'Sin página'),
    );
  }
  throw error;
} finally {
  await Promise.allSettled(contexts.map((c) => c.close()));
  await browser?.close();
  if (tlsProxy) await new Promise<void>((done) => tlsProxy.close(() => done()));
  if (web.pid && process.platform === 'win32')
    spawnSync('taskkill', ['/PID', String(web.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else web.kill('SIGTERM');
  await app.close();
  await db.close();
}
