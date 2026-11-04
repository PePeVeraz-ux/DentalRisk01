import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const station = process.env.STATION_ID,
  credential = process.env.STATION_TOKEN,
  url = process.env.STATION_API_URL;
if (!station || !credential || !url)
  throw new Error('Configure STATION_ID, STATION_TOKEN y STATION_API_URL (HTTPS en operación real).');
if (process.env.NODE_ENV === 'production' && !url.startsWith('https://'))
  throw new Error('La estación requiere HTTPS en producción.');
const file = resolve(process.env.STATION_PENDING_FILE ?? '.local/station-pending.json');
await mkdir(dirname(file), { recursive: true });
let pending: { event_id: string; uid: string; station_id: string } | null = null;
try {
  pending = JSON.parse(await readFile(file, 'utf8'));
} catch (e: any) {
  if (e.code !== 'ENOENT') throw e;
}
async function persist() {
  await writeFile(file + '.tmp', JSON.stringify(pending), { mode: 0o600 });
  await rename(file + '.tmp', file);
}
async function deliver() {
  if (!pending) return;
  const response = await fetch(url + '/api/v1/rfid/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
    body: JSON.stringify(pending),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(`Sin confirmación: HTTP ${response.status}. Revise configuración antes de reintentar.`);
  const result = await response.json();
  console.log(JSON.stringify({ accepted: result.accepted, code: result.code, message: result.message }));
  pending = null;
  await persist();
}
console.log(
  'Adaptador de entrada UID. Escriba un UID por línea; REINTENTAR reenvía el evento pendiente. No es un controlador USB validado.',
);
const line = createInterface({ input: process.stdin });
for await (const raw of line) {
  try {
    if (raw.trim() === 'REINTENTAR') {
      await deliver();
      continue;
    }
    if (pending) {
      console.log('Operación sin confirmar. Use REINTENTAR antes de aceptar una nueva tarjeta.');
      continue;
    }
    const uid = raw.trim();
    if (!/^[A-Za-z0-9:-]{4,64}$/.test(uid)) {
      console.log('UID inválido');
      continue;
    }
    pending = { event_id: randomUUID(), uid, station_id: station };
    await persist();
    await deliver();
  } catch (e) {
    console.log((e as Error).message);
  }
}
