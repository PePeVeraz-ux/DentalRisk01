import { database, migrate } from '../apps/api/src/db.js';
import { id } from '../apps/api/src/domain.js';
import { DateTime } from 'luxon';
if (process.env.NODE_ENV === 'production') throw new Error('Datos de demostración prohibidos en producción.');
const db = await database();
try {
  await migrate(db);
  await db.transaction(async (tx) => {
    if ((await tx.query('SELECT id FROM services LIMIT 1')).rows.length)
      throw new Error('La demostración requiere catálogos vacíos.');
    for (let i = 1; i <= 15; i++)
      await tx.query('INSERT INTO services(id,name,price_cents) VALUES($1,$2,$3)', [
        id(),
        `DEMO Servicio ${i}`,
        i * 10000,
      ]);
    const dentists = [id(), id()],
      stations = [id(), id()];
    for (let i = 0; i < 2; i++) {
      await tx.query('INSERT INTO dentists(id,name,specialty) VALUES($1,$2,$3)', [
        dentists[i],
        `DEMO Especialista ${i + 1}`,
        'Demostración',
      ]);
      await tx.query('INSERT INTO stations(id,name) VALUES($1,$2)', [
        stations[i],
        `DEMO Consultorio ${i + 1}`,
      ]);
    }
    for (let i = 1; i <= 50; i++)
      await tx.query('INSERT INTO cards(id,uid) VALUES($1,$2)', [id(), `DEMO-${String(i).padStart(4, '0')}`]);
    for (let i = 1; i <= 10; i++)
      await tx.query('INSERT INTO patients(id,name,reference) VALUES($1,$2,$3)', [
        id(),
        `DEMO Paciente ${i}`,
        `DEMO-P${i}`,
      ]);
    const local = DateTime.now().setZone(process.env.CLINIC_TIMEZONE ?? 'America/Tijuana');
    for (let weekday = 0; weekday < 7; weekday++) {
      const shift = id();
      await tx.query('INSERT INTO shifts(id,name,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5)', [
        shift,
        `DEMO Turno ${weekday}`,
        weekday,
        '00:00',
        '23:59',
      ]);
      for (let n = 0; n < 14; n++) {
        const day = local.plus({ days: n });
        if (day.weekday % 7 === weekday)
          await tx.query('INSERT INTO calendar_days(id,shift_id,day,operated) VALUES($1,$2,$3,true)', [
            id(),
            shift,
            day.toISODate(),
          ]);
      }
    }
  });
  console.log(
    'Datos sintéticos DEMO creados: 15 servicios, 50 tarjetas, 10 pacientes y turnos de prueba. No son datos clínicos.',
  );
} finally {
  await db.close();
}
