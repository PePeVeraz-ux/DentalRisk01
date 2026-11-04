import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { aggregateReport, type ReportResult } from './analytics.js';
import type { Database, Sql } from './db.js';

export const id = () => randomUUID();
export const token = () => randomBytes(32).toString('hex');
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export class Fault extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireThat(value: unknown, message: string, status = 409): asserts value {
  if (!value) throw new Fault(status, message);
}
export async function one(tx: Sql, table: string, key: string) {
  const row = (await tx.query(`SELECT * FROM ${table} WHERE id=$1`, [key])).rows[0];
  requireThat(row, 'Registro no encontrado', 404);
  return row;
}
export async function audit(
  tx: Sql,
  actor: string | null,
  action: string,
  entity: string | null,
  detail: any = {},
) {
  await tx.query('INSERT INTO audit(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)', [
    id(),
    actor,
    action,
    entity,
    JSON.stringify(detail),
  ]);
}
export type Clock = () => Date;
export const zone = () => process.env.CLINIC_TIMEZONE || 'America/Tijuana';
export const publicUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  dentist_id: u.dentist_id,
});

export async function bind(db: Database, actor: string, input: any) {
  return db.transaction(async (tx) => {
    const card = await one(tx, 'cards', input.card_id);
    requireThat(card.status === 'AVAILABLE', 'La tarjeta no está disponible');
    const service = await one(tx, 'services', input.service_id);
    for (const table of ['patients', 'dentists', 'stations', 'shifts']) {
      const key = (
        {
          patients: 'patient_id',
          dentists: 'dentist_id',
          stations: 'station_id',
          shifts: 'shift_id',
        } as Record<string, string>
      )[table];
      requireThat((await one(tx, table, input[key])).active, 'Registro inactivo');
    }
    requireThat(service.active, 'Servicio inactivo');
    if (input.appointment_id) {
      const ap = await one(tx, 'appointments', input.appointment_id);
      requireThat(
        ap.status === 'SCHEDULED' &&
          ap.patient_id === input.patient_id &&
          ap.dentist_id === input.dentist_id &&
          ap.service_id === input.service_id,
        'La cita no corresponde a esta atención',
      );
    }
    const attentionId = id();
    await tx.query(
      `INSERT INTO attentions(id,patient_id,dentist_id,service_id,station_id,shift_id,appointment_id,card_id,price_cents)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        attentionId,
        input.patient_id,
        input.dentist_id,
        input.service_id,
        input.station_id,
        input.shift_id,
        input.appointment_id ?? null,
        input.card_id,
        service.price_cents,
      ],
    );
    await tx.query('INSERT INTO assignments(id,attention_id,card_id) VALUES($1,$2,$3)', [
      id(),
      attentionId,
      card.id,
    ]);
    await tx.query("UPDATE cards SET status='ASSIGNED' WHERE id=$1", [card.id]);
    await audit(tx, actor, 'attention.bind', attentionId);
    return one(tx, 'attentions', attentionId);
  });
}

export async function scan(
  db: Database,
  stationId: string,
  input: { event_id: string; uid: string },
  clock: Clock = () => new Date(),
) {
  return db.transaction(async (tx) => {
    const prior = (await tx.query('SELECT * FROM rfid_events WHERE id=$1', [input.event_id])).rows[0];
    if (prior) {
      requireThat(
        prior.station_id === stationId && prior.uid === input.uid,
        'El ID del evento ya pertenece a otra lectura',
      );
      return prior.response;
    }
    requireThat((await one(tx, 'stations', stationId)).active, 'Estación inactiva', 403);
    const now = clock();
    const card = (await tx.query('SELECT * FROM cards WHERE uid=$1', [input.uid])).rows[0];
    let result: any;
    const a = card
      ? (await tx.query('SELECT * FROM attentions WHERE card_id=$1 AND released_at IS NULL', [card.id]))
          .rows[0]
      : null;
    if (!card || card.status !== 'ASSIGNED' || !a)
      result = {
        accepted: false,
        code: 'CARD_UNAVAILABLE',
        message: 'Tarjeta desconocida, bloqueada o sin asignación',
      };
    else if (a.station_id !== stationId)
      result = { accepted: false, code: 'WRONG_STATION', message: 'La tarjeta corresponde a otra estación' };
    else if (a.status === 'COMPLETED' || a.status === 'INCIDENT' || a.status === 'CANCELLED')
      result = {
        accepted: false,
        code: 'ALREADY_CLOSED',
        message: 'Atención cerrada; liberar tarjeta en recepción',
      };
    else {
      const last = (
        await tx.query(
          `SELECT occurred_at FROM rfid_events WHERE uid=$1 AND station_id=$2 AND response->>'accepted'='true' ORDER BY occurred_at DESC LIMIT 1`,
          [input.uid, stationId],
        )
      ).rows[0];
      const elapsed = last ? now.getTime() - new Date(last.occurred_at).getTime() : Infinity;
      if (elapsed < Number(process.env.RFID_DEBOUNCE_MS ?? 2000))
        result = { accepted: false, code: 'DEBOUNCED', message: 'Relectura ignorada' };
      else if (a.status === 'PENDING') {
        const local = DateTime.fromJSDate(now).setZone(zone());
        const shift = await one(tx, 'shifts', a.shift_id);
        const day = local.toISODate();
        const calendar = (
          await tx.query('SELECT * FROM calendar_days WHERE shift_id=$1 AND day=$2', [a.shift_id, day])
        ).rows[0];
        const start = DateTime.fromISO(`${day}T${shift.start_time}`, { zone: zone() });
        const end = DateTime.fromISO(`${day}T${shift.end_time}`, { zone: zone() });
        const inBreak = calendar?.breaks?.some(
          (b: any) =>
            local >= DateTime.fromISO(`${day}T${b.start}`, { zone: zone() }) &&
            local < DateTime.fromISO(`${day}T${b.end}`, { zone: zone() }),
        );
        requireThat(
          calendar?.operated && local >= start && local < end && !inBreak,
          'Configure un turno operado vigente antes de iniciar',
        );
        const busy = (
          await tx.query(
            "SELECT id FROM attentions WHERE status='IN_PROGRESS' AND (station_id=$1 OR dentist_id=$2)",
            [stationId, a.dentist_id],
          )
        ).rows.length;
        requireThat(!busy, 'Estación o dentista ocupado');
        await tx.query("UPDATE attentions SET status='IN_PROGRESS',started_at=$2 WHERE id=$1", [a.id, now]);
        result = {
          accepted: true,
          code: 'CHECK_IN',
          attention_id: a.id,
          at: now.toISOString(),
          message: 'Atención iniciada',
        };
      } else {
        requireThat(now.getTime() >= new Date(a.started_at).getTime(), 'Reloj inválido');
        await tx.query("UPDATE attentions SET status='COMPLETED',ended_at=$2 WHERE id=$1", [a.id, now]);
        if (a.appointment_id)
          await tx.query("UPDATE appointments SET status='ATTENDED' WHERE id=$1", [a.appointment_id]);
        result = {
          accepted: true,
          code: 'CHECK_OUT',
          attention_id: a.id,
          at: now.toISOString(),
          duration_seconds: (now.getTime() - new Date(a.started_at).getTime()) / 1000,
          message: 'Atención completada',
        };
      }
    }
    await tx.query('INSERT INTO rfid_events(id,station_id,uid,occurred_at,response) VALUES($1,$2,$3,$4,$5)', [
      input.event_id,
      stationId,
      input.uid,
      now,
      JSON.stringify(result),
    ]);
    await audit(tx, null, `rfid.${result.code}`, a?.id ?? null, {
      station_id: stationId,
      event_id: input.event_id,
    });
    return result;
  });
}

export async function release(db: Database, actor: string, attentionId: string) {
  return db.transaction(async (tx) => {
    const a = await one(tx, 'attentions', attentionId);
    requireThat(
      ['COMPLETED', 'CANCELLED', 'INCIDENT'].includes(a.status),
      'No se puede liberar una atención abierta',
    );
    requireThat(!a.released_at, 'La tarjeta ya fue liberada');
    await tx.query('UPDATE attentions SET released_at=now() WHERE id=$1', [a.id]);
    await tx.query('UPDATE assignments SET released_at=now() WHERE attention_id=$1 AND released_at IS NULL', [
      a.id,
    ]);
    await tx.query("UPDATE cards SET status='AVAILABLE' WHERE id=$1 AND status='ASSIGNED'", [a.card_id]);
    await audit(tx, actor, 'attention.release', a.id);
    return { ok: true };
  });
}

export async function incident(db: Database, actor: string, attentionId: string, input: any) {
  return db.transaction(async (tx) => {
    const before = await one(tx, 'attentions', attentionId);
    requireThat(!before.released_at, 'Atención ya liberada');
    requireThat(['PENDING', 'IN_PROGRESS'].includes(before.status), 'La atención ya está cerrada');
    await tx.query("UPDATE cards SET status='BLOCKED' WHERE id=$1", [before.card_id]);
    await tx.query('UPDATE assignments SET released_at=now() WHERE attention_id=$1 AND released_at IS NULL', [
      before.id,
    ]);
    if (input.replacement_card_id) {
      const card = await one(tx, 'cards', input.replacement_card_id);
      requireThat(card.status === 'AVAILABLE', 'La tarjeta de reemplazo no está disponible');
      await tx.query('UPDATE attentions SET card_id=$2 WHERE id=$1', [before.id, card.id]);
      await tx.query("UPDATE cards SET status='ASSIGNED' WHERE id=$1", [card.id]);
      await tx.query('INSERT INTO assignments(id,attention_id,card_id) VALUES($1,$2,$3)', [
        id(),
        before.id,
        card.id,
      ]);
    } else {
      await tx.query("UPDATE attentions SET status='INCIDENT',released_at=now() WHERE id=$1", [before.id]);
    }
    const after = await one(tx, 'attentions', before.id);
    await tx.query(
      'INSERT INTO incidents(id,attention_id,actor_id,kind,reason,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id(), before.id, actor, 'CARD', input.reason, JSON.stringify(before), JSON.stringify(after)],
    );
    await audit(tx, actor, 'attention.incident', before.id, { reason: input.reason });
    return after;
  });
}

export function reportRange(from: string, to: string) {
  const start = DateTime.fromISO(from, { zone: zone() }).startOf('day');
  const end = DateTime.fromISO(to, { zone: zone() }).plus({ days: 1 }).startOf('day');
  requireThat(
    start.isValid && end.isValid && end > start && end.diff(start, 'days').days <= 366,
    'Periodo inválido (máximo 366 días)',
    400,
  );
  return { start, end };
}
export async function report(db: Sql, filter: any, user: any): Promise<ReportResult> {
  if ('transaction' in db && typeof db.transaction === 'function') {
    return (db as Database).transaction(async (tx) => {
      await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return report(tx, filter, user);
    }, false);
  }
  if (user.role === 'DENTIST') filter = { ...filter, dentist_id: user.dentist_id };
  const { start, end } = reportRange(filter.from, filter.to);
  return aggregateReport(db, filter, start.toJSDate(), end.toJSDate(), zone());
}
