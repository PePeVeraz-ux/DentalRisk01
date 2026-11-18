const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const agent = path.join(root, 'Agente IA');
const python = path.join(agent, '.venv', 'Scripts', 'python.exe');
const base = 'http://127.0.0.1:8765';
const env = {
  ...process.env,
  ENVIRONMENT: 'test',
  DATABASE_URL: 'sqlite:///:memory:',
  SECRET_KEY: 'documentation-preview-key-32bytes-minimum',
  MINIO_ACCESS_KEY: 'preview',
  MINIO_SECRET_KEY: 'preview-secret',
  CLINICAL_CONNECTOR_ENABLED: 'false',
};
const server = spawn(python, ['-m', 'uvicorn', 'main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8765'], {
  cwd: agent, env, stdio: 'ignore', windowsHide: true,
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(base + '/openapi.json');
      if (response.ok) {
        const schema = await response.json();
        if (schema.info.title === 'DentalRisk Agente IA' && Object.keys(schema.paths).length === 20) {
          ready = true;
          break;
        }
      }
    } catch (_) {}
    await delay(500);
  }
  if (!ready) throw new Error('La API local de prueba no respondió con el contrato esperado.');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(base + '/docs', { waitUntil: 'domcontentloaded' });
    await page.locator('.swagger-ui .info .title').waitFor({ timeout: 20000 });
    const title = await page.locator('.swagger-ui .info .title').innerText();
    const routes = await page.locator('.swagger-ui .opblock').count();
    if (!title.includes('DentalRisk Agente IA') || routes < 15) {
      throw new Error(`Swagger incompleto: ${title}; ${routes} operaciones`);
    }
    await page.screenshot({ path: path.join(__dirname, 'swagger-api-agente.png'), fullPage: true });
    await page.locator('.opblock-tag').filter({ hasText: 'Usuarios y seguridad' }).click();
    await page.screenshot({ path: path.join(__dirname, 'swagger-api-agente-resumen.png'), fullPage: false });
    console.log(JSON.stringify({ docs: base + '/docs', title, operations: routes,
      screenshot: path.join(__dirname, 'swagger-api-agente.png'),
      summaryScreenshot: path.join(__dirname, 'swagger-api-agente-resumen.png') }));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => { server.kill(); });
