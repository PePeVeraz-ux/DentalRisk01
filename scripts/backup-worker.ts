import { setTimeout as delay } from 'node:timers/promises';
import { backup } from './backup.js';
let stopped = false;
const abort = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    stopped = true;
    abort.abort();
  });
while (!stopped) {
  try {
    await backup();
  } catch {
    console.error('Respaldo diario fallido; revisar conectividad, permisos y la auditoría.');
  }
  try {
    await delay(24 * 60 * 60 * 1000, undefined, { signal: abort.signal });
  } catch {
    /* Shutdown interrupts the daily wait. */
  }
}
