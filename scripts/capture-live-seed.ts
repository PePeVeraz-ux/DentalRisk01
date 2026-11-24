import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const credentials = JSON.parse(await readFile('.local/seed-coherent-credentials.json', 'utf8'));
const reception = credentials.find((item: any) => item.role === 'RECEPTION');
assert.ok(reception);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const active = (await pool.query("SELECT c.uid, s.name AS station, p.name AS patient FROM attentions a JOIN cards c ON c.id=a.card_id JOIN stations s ON s.id=a.station_id JOIN patients p ON p.id=a.patient_id WHERE a.status='IN_PROGRESS' ORDER BY a.created_at DESC LIMIT 1")).rows[0];
await pool.end();
assert.ok(active, 'No se encontró atención sintética en curso');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:3000');
  await page.getByLabel('Correo electrónico').fill(reception.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(reception.password);
  await page.getByRole('button', { name: /^Iniciar sesión/ }).click();
  await page.locator('.sidebar').waitFor();
  await page.locator('nav').getByRole('button', { name: 'Atenciones', exact: true }).click();
  await page.getByLabel('Buscar en registros').fill(active.patient);
  await page.getByRole('row').filter({ hasText: active.station }).filter({ hasText: 'En atención' }).first().waitFor();
  const simulator = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Simulador de lector RFID' }) });
  await simulator.getByLabel('Estación', { exact: true }).locator('option').nth(1).waitFor({ state: 'attached' });
  await simulator.getByLabel('Tarjeta', { exact: true }).locator('option').nth(1).waitFor({ state: 'attached' });
  const stationCount = await simulator.getByLabel('Estación', { exact: true }).locator('option').count() - 1;
  const cardCount = await simulator.getByLabel('Tarjeta', { exact: true }).locator('option').count() - 1;
  assert.equal(stationCount, 4, `Estaciones visibles: ${stationCount}`);
  assert.equal(cardCount, 50, `Tarjetas visibles: ${cardCount}`);
  await simulator.getByLabel('Estación', { exact: true }).selectOption({ label: active.station });
  await simulator.getByLabel('Tarjeta', { exact: true }).selectOption({ label: active.uid });
  await mkdir('output/capturas', { recursive: true });
  const file = resolve('output/capturas/tarjeta-estacion-en-uso-base-real.png');
  await page.screenshot({ path: file, fullPage: true });
  console.log(JSON.stringify({ file, card: active.uid, station: active.station, status: 'En atención', stationCount, cardCount }));
} finally {
  await browser.close();
}
