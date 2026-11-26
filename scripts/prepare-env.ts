import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve('.env');
const examplePath = resolve('.env.example');

if (!existsSync(envPath)) {
  if (!existsSync(examplePath)) throw new Error('No existe .env.example.');
  writeFileSync(envPath, readFileSync(examplePath, 'utf8'), { flag: 'wx' });
}

let content = readFileSync(envPath, 'utf8');
const configured = new Set(
  content
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
    .filter((name): name is string => Boolean(name)),
);
const generated: Record<string, string> = {
  POSTGRES_OWNER_PASSWORD: randomBytes(24).toString('base64url'),
  APP_DB_PASSWORD: randomBytes(24).toString('base64url'),
  BACKUP_DB_PASSWORD: randomBytes(24).toString('base64url'),
  AGENT_DB_PASSWORD: randomBytes(24).toString('base64url'),
  AGENT_SECRET_KEY: randomBytes(32).toString('hex'),
  MINIO_ACCESS_KEY: `dentalrisk_${randomBytes(8).toString('hex')}`,
  MINIO_SECRET_KEY: randomBytes(24).toString('base64url'),
};

const missing = Object.entries(generated).filter(([name]) => !configured.has(name));
if (missing.length) {
  content = content.replace(/\s*$/, '\n');
  content += '\n# Credenciales internas generadas para el Compose unificado.\n';
  content += missing.map(([name, value]) => `${name}=${value}`).join('\n') + '\n';
  writeFileSync(envPath, content, 'utf8');
  console.log(`Se agregaron ${missing.length} variables internas a .env.`);
} else {
  console.log('El .env ya contiene todas las credenciales internas.');
}

for (const required of ['ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
  if (!configured.has(required))
    console.warn(`Falta ${required}; configúrala antes del primer arranque.`);
}
