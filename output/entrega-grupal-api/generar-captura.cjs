const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const agent = path.join(root, 'Agente IA');
const python = path.join(agent, '.venv', 'Scripts', 'python.exe');
const source = `import json; from main import create_app; print(json.dumps(create_app().openapi(), ensure_ascii=False))`;
const schema = JSON.parse(execFileSync(python, ['-c', source], {
  cwd: agent,
  encoding: 'utf8',
  env: {
    ...process.env,
    ENVIRONMENT: 'test',
    PYTHONIOENCODING: 'utf-8',
    DATABASE_URL: 'sqlite:///:memory:',
    SECRET_KEY: 'documentation-preview-key-32bytes-minimum',
    MINIO_ACCESS_KEY: 'preview',
    MINIO_SECRET_KEY: 'preview-secret',
    CLINICAL_CONNECTOR_ENABLED: 'false',
  },
}));

const escape = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[ch]);

const groups = [
  { tag: 'Agente ESP', title: 'Agente ESP', subtitle: 'Conexión, usuarios y fotografía' },
  { tag: 'Registros clínicos', title: 'Registros clínicos', subtitle: 'Consultas autorizadas y agregados' },
];
const operationRows = (tag) => Object.entries(schema.paths)
  .flatMap(([url, methods]) => Object.entries(methods).map(([method, op]) => ({ url, method, op })))
  .filter(({ op }) => (op.tags || []).includes(tag));

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>DentalRisk Agente IA · OpenAPI</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f7f9fc; color: #142c46; font: 16px/1.45 Arial, sans-serif; }
  .top { height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 0 56px; background: #10283f; color: white; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 700; }
  .mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: #2864ec; color: white; font-weight: 800; }
  .right { color: #c5d8f0; font-size: 13px; letter-spacing: .04em; }
  main { max-width: 1240px; margin: 34px auto 0; padding: 0 18px 42px; }
  .eyebrow { color: #2864ec; text-transform: uppercase; font-size: 12px; font-weight: 800; letter-spacing: .15em; }
  h1 { margin: 9px 0 4px; font-size: 34px; line-height: 1.14; }
  .version { display: inline-block; margin-left: 10px; padding: 4px 9px; border-radius: 4px; color: #43617e; background: #e5edf7; vertical-align: middle; font-size: 14px; font-weight: 600; }
  .lede { margin: 6px 0 20px; color: #4d657e; font-size: 15px; }
  .meta { display: flex; justify-content: space-between; align-items: center; padding: 13px 18px; background: #fff; border: 1px solid #dbe5f0; border-radius: 8px; color: #50657b; font-size: 13px; }
  .meta strong { color: #203e5e; }
  .tag { margin-top: 25px; }
  .group-title { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid #d4deeb; margin: 0 0 10px; padding-bottom: 6px; }
  h2 { font-size: 21px; margin: 0; }
  .subtitle { color: #6b7d90; font-size: 13px; }
  .row { display: flex; align-items: center; gap: 16px; height: 48px; padding: 0 13px; margin: 6px 0; border: 1px solid #cfe0f2; border-radius: 6px; background: #f2f7fc; }
  .row.post { border-color: #b7e0cd; background: #f0f9f5; }
  .method { flex: none; width: 72px; border-radius: 4px; padding: 4px 0; background: #2b73c5; color: white; text-align: center; font-size: 13px; font-weight: 700; }
  .post .method { background: #2f9a6b; }
  .path { color: #153653; font: 14px/1.2 Consolas, monospace; font-weight: 700; }
  .summary { margin-left: auto; color: #50667e; font-size: 13px; }
  .foot { margin-top: 24px; color: #6b7d90; font-size: 12px; }
</style></head><body>
<header class="top"><div class="brand"><span class="mark">D</span>DentalRisk <span style="font-weight:400;color:#a7c3e2">/ API del agente</span></div><div class="right">DOCUMENTACIÓN DE ENDPOINTS</div></header>
<main>
  <div class="eyebrow">Contrato OpenAPI</div>
  <h1>${escape(schema.info.title)}<span class="version">v${escape(schema.info.version)}</span></h1>
  <p class="lede">${escape(schema.info.description)}</p>
  <div class="meta"><span><strong>Fuente:</strong> esquema OpenAPI generado por FastAPI desde el código actual</span><span><strong>${Object.keys(schema.paths).length}</strong> rutas documentadas</span></div>
  ${groups.map((group) => `<section class="tag"><div class="group-title"><h2>${escape(group.title)}</h2><span class="subtitle">${escape(group.subtitle)}</span></div>
    ${operationRows(group.tag).map(({ method, url, op }) => `<div class="row ${method === 'post' ? 'post' : ''}"><span class="method">${escape(method.toUpperCase())}</span><span class="path">${escape(url)}</span><span class="summary">${escape(op.summary || '')}</span></div>`).join('')}
  </section>`).join('')}
  <div class="foot">Vista de lectura generada para la documentación del proyecto. Los controles interactivos de Swagger están disponibles en la ruta /docs al iniciar la API.</div>
</main></body></html>`;

writeFileSync(path.join(__dirname, 'api-openapi-preview.html'), html, 'utf8');
writeFileSync(path.join(__dirname, 'openapi-agent-snapshot.json'), JSON.stringify(schema, null, 2), 'utf8');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto('file:///' + path.join(__dirname, 'api-openapi-preview.html').replace(/\\/g, '/'));
  await page.screenshot({ path: path.join(__dirname, 'api-openapi-preview.png'), fullPage: true });
  await browser.close();
  console.log(JSON.stringify({ title: schema.info.title, version: schema.info.version,
    paths: Object.keys(schema.paths).length, screenshot: path.join(__dirname, 'api-openapi-preview.png') }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
