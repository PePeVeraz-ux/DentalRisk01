import { database } from './db.js';
import { buildApp } from './app.js';
import { weeklyJob } from './weekly.js';
const db = await database();
const app = await buildApp({ db, logging: true });
const timer = setInterval(
  () => weeklyJob(db).catch(() => app.log.error('No se pudo generar el reporte semanal')),
  60_000,
);
timer.unref();
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 4000) });
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, async () => {
    clearInterval(timer);
    await app.close();
    await db.close();
    process.exit(0);
  });
