import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const state = JSON.parse(await readFile('Agente IA/.local/esp/shared-verification-state.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:3000');
  await page.getByLabel('Correo electrónico').fill(state.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(state.password);
  await page.getByRole('button', { name: /^Iniciar sesión/ }).click();
  await page.locator('.sidebar').waitFor();
  await page.locator('nav').getByRole('button', { name: 'Atenciones', exact: true }).click();
  await page.getByRole('heading', { name: 'Atenciones', exact: true }).waitFor();
  await page.getByText('QA Consultorio 1').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Usuarios y seguridad' }).count(), 0);
  await mkdir('output/capturas', { recursive: true });
  const file = resolve('output/capturas/esp-cuenta-compartida.png');
  await page.screenshot({ path: file, fullPage: true });
  console.log(JSON.stringify({ status: 'passed', role: 'RECEPTION', file }));
} finally {
  await browser.close();
}
