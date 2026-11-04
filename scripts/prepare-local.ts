import { access, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
try {
  await access('.env');
  console.log('Se conserva el archivo .env existente.');
} catch {
  await mkdir('.local', { recursive: true });
  const password = randomBytes(24).toString('base64url');
  await writeFile(
    '.env',
    `NODE_ENV=development\nHOST=127.0.0.1\nPORT=4000\nAPP_ORIGIN=http://localhost:3000\nDATABASE_URL=\nCLINIC_TIMEZONE=America/Tijuana\nRFID_DEBOUNCE_MS=2000\nSESSION_HOURS=8\nADMIN_EMAIL=admin@dentalrisk.local\nADMIN_PASSWORD=${password}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Configuración local creada con contraseña aleatoria. Consulte .env; no comparta ni publique ese archivo.',
  );
}
