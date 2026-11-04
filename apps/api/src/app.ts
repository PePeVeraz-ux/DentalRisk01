import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import argon2 from 'argon2';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { executive, operationalOverview, setupStatus } from './insights.js';
import { DateTime } from 'luxon';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { Database } from './db.js';
import {
  audit,
  bind,
  digest,
  Fault,
  id,
  incident,
  one,
  publicUser,
  release,
  report,
  reportRange,
  requireThat,
  scan,
  token,
  zone,
  type Clock,
} from './domain.js';

const key = z.string().uuid();
const text = z.string().trim().min(1).max(150);
const reason = z.string().trim().min(5).max(1000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const datetime = z.string().datetime({ offset: true });
const price = z.number().int().min(0).max(1000000000);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const roles = ['ADMIN', 'RECEPTION', 'DENTIST', 'SUPPORT'] as const;
type Role = (typeof roles)[number];
export interface AppOptions {
  db: Database;
  clock?: Clock;
  origin?: string;
  logging?: boolean;
}

export async function buildApp({
  db,
  clock = () => new Date(),
  origin = process.env.APP_ORIGIN ?? 'http://localhost:3000',
  logging = false,
}: AppOptions) {
  const production = process.env.NODE_ENV === 'production';
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin || !['http:', 'https:'].includes(parsedOrigin.protocol))
    throw new Error('APP_ORIGIN debe ser un origen HTTP/HTTPS sin ruta ni credenciales');
  if (!DateTime.now().setZone(zone()).isValid) throw new Error('CLINIC_TIMEZONE no es válida');
  const sessionHours = Number(process.env.SESSION_HOURS ?? 8),
    debounce = Number(process.env.RFID_DEBOUNCE_MS ?? 2000);
  if (!Number.isInteger(sessionHours) || sessionHours < 1 || sessionHours > 24)
    throw new Error('SESSION_HOURS debe estar entre 1 y 24');
  if (!Number.isInteger(debounce) || debounce < 0 || debounce > 30000)
    throw new Error('RFID_DEBOUNCE_MS debe estar entre 0 y 30000');
  if (production && !origin.startsWith('https://'))
    throw new Error('APP_ORIGIN debe usar HTTPS en producción');
  const trustedOrigins = new Set([origin]);
  // En desarrollo, las direcciones de loopback representan el mismo servidor local.
  // Se conserva el protocolo y puerto configurados; producción exige el origen exacto.
  const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
  if (!production && loopbackHosts.includes(parsedOrigin.hostname)) {
    for (const hostname of loopbackHosts) {
      const alias = new URL(origin);
      alias.hostname = hostname;
      trustedOrigins.add(alias.origin);
    }
  }
  const app = Fastify({
    logger: logging
      ? {
          redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          serializers: { req: (r) => ({ method: r.method, url: r.url.split('?')[0] }) },
        }
      : false,
    bodyLimit: 65536,
    trustProxy: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const cookieName = production ? '__Host-dr_session' : 'dr_session';
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.cookies[cookieName] ? digest(req.cookies[cookieName]) : req.ip),
  });
  await app.register(swagger, {
    openapi: {
      info: { title: 'DentalRisk API', version: '1.0.0' },
      servers: [{ url: origin }],
      components: {
        securitySchemes: {
          session: { type: 'apiKey', in: 'cookie', name: cookieName },
          station: { type: 'http', scheme: 'bearer' },
        },
      },
    },
  });
  const users = new WeakMap<FastifyRequest, any>();
  app.setErrorHandler((error, req, reply) => {
    const e = error as any;
    if (e instanceof z.ZodError)
      return reply.code(400).send({
        error: 'Datos inválidos',
        fields: e.issues.map((i: any) => ({ path: i.path.join('.'), message: i.message })),
      });
    const code = e.statusCode ?? (['23505', '23503', '23514'].includes(e.code) ? 409 : 500);
    if (code >= 500) req.log.error({ code: e.code }, 'Error interno');
    return reply.code(code).send({
      error:
        code >= 500
          ? 'Error interno; no se confirmó la operación'
          : e.validation
            ? 'Datos inválidos'
            : code === 409 && !(e instanceof Fault)
              ? 'Conflicto de datos o referencias'
              : e.message,
    });
  });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const supplied = req.headers.origin;
    const trusted = typeof supplied === 'string' && trustedOrigins.has(supplied);
    if (supplied && !trusted) throw new Fault(403, 'Origen no autorizado');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.url.startsWith('/api/v1/rfid/events')) {
      requireThat(trusted, 'Se requiere un origen autorizado', 403);
    }
  });
  async function authorize(req: FastifyRequest, allowed: readonly string[]) {
    const raw = req.cookies[cookieName];
    requireThat(raw, 'Sesión requerida', 401);
    const session = (
      await db.query(
        `SELECT s.csrf,s.expires_at,s.operation_until,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.active=true`,
        [digest(raw), clock()],
      )
    ).rows[0];
    requireThat(session, 'Sesión vencida o revocada', 401);
    requireThat(allowed.includes(session.role), 'Permiso insuficiente', 403);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.headers['x-csrf-token'];
      requireThat(
        typeof csrf === 'string' &&
          /^[a-f0-9]{64}$/.test(csrf) &&
          timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf)),
        'Token CSRF inválido',
        403,
      );
    }
    users.set(req, session);
    return session;
  }
  type Handler = (req: FastifyRequest, reply: FastifyReply, user: any) => Promise<any>;
  function route(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    allowed: readonly string[],
    body: z.ZodType | undefined,
    handler: Handler,
  ) {
    const operational =
      method !== 'GET' &&
      (/^\/api\/v1\/(patients|appointments)(\/|$)/.test(url) ||
        (url.startsWith('/api/v1/attentions') && !url.endsWith('/correct')) ||
        url === '/api/v1/rfid/simulate');
    const schema: any = {
      tags: [url.split('/')[3]],
      security: [{ session: [] }],
      description: `Roles permitidos: ${allowed.join(', ')}. Las mutaciones requieren Origin autorizado y x-csrf-token de la sesión.${operational ? ' ADMIN requiere acceso operativo excepcional vigente, activado con contraseña y motivo.' : ''}`,
      ...(body ? { body: z.toJSONSchema(body, { target: 'draft-7' }) } : {}),
    };
    if (url.includes('/:id'))
      schema.params = {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
        additionalProperties: false,
      };
    if (method === 'GET') {
      const paginated = [
        'services',
        'dentists',
        'stations',
        'patients',
        'cards',
        'shifts',
        'attentions',
        'appointments',
      ].some((name) => url === `/api/v1/${name}`);
      if (paginated)
        schema.querystring = {
          type: 'object',
          additionalProperties: false,
          properties: {
            limit: { type: 'string', pattern: '^\\d+$', description: 'Máximo 500' },
            offset: { type: 'string', pattern: '^\\d+$' },
            q: { type: 'string', maxLength: 100 },
            ...(['appointments', 'attentions'].some((name) => url === `/api/v1/${name}`)
              ? {
                  day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                  status: {
                    type: 'string',
                    enum: url.endsWith('/appointments')
                      ? ['SCHEDULED', 'CANCELLED', 'ATTENDED']
                      : ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'INCIDENT'],
                  },
                }
              : {}),
          },
        };
      if (['/api/v1/reports', '/api/v1/reports/export', '/api/v1/reports/executive'].includes(url))
        schema.querystring = {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to', ...(url.endsWith('/export') ? ['format'] : [])],
          properties: {
            from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            dentist_id: { type: 'string', format: 'uuid' },
            service_id: { type: 'string', format: 'uuid' },
            station_id: { type: 'string', format: 'uuid' },
            shift_id: { type: 'string', format: 'uuid' },
            ...(url.endsWith('/export') ? { format: { type: 'string', enum: ['csv', 'pdf', 'xlsx'] } } : {}),
          },
        };
      if (url === '/api/v1/reports/productivity')
        schema.querystring = {
          type: 'object',
          additionalProperties: false,
          properties: { month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' } },
          required: ['month'],
        };
      if (url === '/api/v1/operations/overview')
        schema.querystring = {
          type: 'object',
          additionalProperties: false,
          required: ['day'],
          properties: { day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
        };
    }
    app.route({
      method,
      url,
      schema,
      preHandler: async (req) => {
        const user = await authorize(req, allowed);
        if (operational && user.role === 'ADMIN') {
          requireThat(
            user.operation_until && new Date(user.operation_until) > clock(),
            'Active el acceso excepcional a recepción desde Mi cuenta, o utilice una cuenta de Recepción',
            403,
          );
        }
      },
      handler: async (req, reply) => {
        if (body) body.parse(req.body);
        return handler(req, reply, users.get(req));
      },
    });
  }
  app.get('/api/v1/health', async () => ({ status: 'ok', service: 'DentalRisk' }));
  app.post(
    '/api/v1/sessions',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => req.ip },
      },
      schema: {
        body: z.toJSONSchema(
          z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }).strict(),
          { target: 'draft-7' },
        ),
      },
    },
    async (req, reply) => {
      const { email, password } = req.body as any;
      const emailKey = email.toLowerCase();
      const attemptKey = digest(`${req.ip}:${emailKey}`);
      const attempt = (await db.query('SELECT * FROM login_attempts WHERE key=$1', [attemptKey])).rows[0];
      requireThat(
        !attempt?.blocked_until || new Date(attempt.blocked_until) <= clock(),
        'Acceso temporalmente bloqueado',
        429,
      );
      const user = (await db.query('SELECT * FROM users WHERE email=$1', [emailKey])).rows[0];
      const valid = user
        ? await argon2.verify(user.password_hash, password)
        : await argon2.hash(password).then(() => false);
      if (!user?.active || !valid) {
        await db.transaction(async (tx) => {
          await tx.query(
            `INSERT INTO login_attempts(key,failures,blocked_until) VALUES($1,1,NULL) ON CONFLICT(key) DO UPDATE SET
          failures=CASE WHEN login_attempts.updated_at<now()-interval '15 minutes' THEN 1 ELSE login_attempts.failures+1 END,
          blocked_until=CASE WHEN login_attempts.updated_at>=now()-interval '15 minutes' AND login_attempts.failures>=4 THEN now()+interval '15 minutes' ELSE NULL END,updated_at=now()`,
            [attemptKey],
          );
          await audit(tx, null, 'auth.failed', null);
        });
        throw new Fault(401, 'Credenciales inválidas');
      }
      const raw = token(),
        csrf = token();
      await db.transaction(async (tx) => {
        await tx.query('DELETE FROM login_attempts WHERE key=$1', [attemptKey]);
        await tx.query('DELETE FROM sessions WHERE expires_at <= $1', [clock()]);
        await tx.query('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,$4)', [
          digest(raw),
          user.id,
          csrf,
          new Date(clock().getTime() + Number(process.env.SESSION_HOURS ?? 8) * 3600000),
        ]);
        await audit(tx, user.id, 'auth.login', user.id);
      });
      reply.setCookie(cookieName, raw, {
        path: '/',
        httpOnly: true,
        secure: production,
        sameSite: 'strict',
        maxAge: Number(process.env.SESSION_HOURS ?? 8) * 3600,
      });
      return {
        user: publicUser(user),
        csrf,
        environment: production ? 'production' : 'development',
        timezone: zone(),
        operation_until: null,
      };
    },
  );
  route('GET', '/api/v1/sessions/me', roles, undefined, async (_r, _p, u) => ({
    user: publicUser(u),
    csrf: u.csrf,
    environment: production ? 'production' : 'development',
    operation_until: u.operation_until && new Date(u.operation_until) > clock() ? u.operation_until : null,
    timezone: zone(),
  }));
  route(
    'POST',
    '/api/v1/sessions/operation-access',
    ['ADMIN'],
    z.object({ password: z.string().min(1).max(128), reason }).strict(),
    async (req, _p, u) => {
      const b = req.body as { password: string; reason: string };
      const attempts = await db.query(
        'SELECT count(*) n FROM audit WHERE actor_id=$1 AND action=$2 AND created_at>$3',
        [u.id, 'auth.operation.denied', new Date(clock().getTime() - 15 * 60000)],
      );
      requireThat(Number(attempts.rows[0].n) < 5, 'Demasiados intentos; espere quince minutos', 429);
      const current = await one(db, 'users', u.id);
      if (!(await argon2.verify(current.password_hash, b.password))) {
        await audit(db, u.id, 'auth.operation.denied', u.id);
        throw new Fault(403, 'Contraseña actual incorrecta');
      }
      const until = new Date(Math.min(clock().getTime() + 30 * 60000, new Date(u.expires_at).getTime()));
      await db.transaction(async (tx) => {
        await tx.query('UPDATE sessions SET operation_until=$2 WHERE token_hash=$1', [
          digest(req.cookies[cookieName]!),
          until,
        ]);
        await audit(tx, u.id, 'auth.operation.granted', u.id, {
          reason: b.reason,
          until: until.toISOString(),
        });
      });
      return { operation_until: until.toISOString() };
    },
  );
  route('POST', '/api/v1/sessions/operation-revoke', ['ADMIN'], z.object({}).strict(), async (req, _p, u) => {
    await db.transaction(async (tx) => {
      await tx.query('UPDATE sessions SET operation_until=NULL WHERE token_hash=$1', [
        digest(req.cookies[cookieName]!),
      ]);
      await audit(tx, u.id, 'auth.operation.revoked', u.id);
    });
    return { operation_until: null };
  });
  route('POST', '/api/v1/sessions/logout', roles, z.object({}).strict(), async (req, reply, u) => {
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM sessions WHERE token_hash=$1', [digest(req.cookies[cookieName]!)]);
      await audit(tx, u.id, 'auth.logout', u.id);
    });
    reply.clearCookie(cookieName, { path: '/', secure: production, httpOnly: true, sameSite: 'strict' });
    return { ok: true };
  });
  route('GET', '/api/v1/openapi', ['ADMIN'], undefined, async () => app.swagger());
  route(
    'POST',
    '/api/v1/sessions/password',
    roles,
    z
      .object({ current_password: z.string().min(1).max(256), new_password: z.string().min(12).max(128) })
      .strict(),
    async (req, reply, u) => {
      const b = req.body as { current_password: string; new_password: string };
      requireThat(b.current_password !== b.new_password, 'La contraseña nueva debe ser diferente', 400);
      const hashed = await argon2.hash(b.new_password, { type: argon2.argon2id });
      await db.transaction(async (tx) => {
        const current = await one(tx, 'users', u.id);
        requireThat(
          await argon2.verify(current.password_hash, b.current_password),
          'Contraseña actual incorrecta',
          403,
        );
        await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1', [u.id, hashed]);
        await tx.query('DELETE FROM sessions WHERE user_id=$1', [u.id]);
        await audit(tx, u.id, 'auth.password.changed', u.id);
      });
      reply.clearCookie(cookieName, { path: '/', secure: production, httpOnly: true, sameSite: 'strict' });
      return { ok: true, reauthenticate: true };
    },
  );

  route('GET', '/api/v1/users', ['ADMIN'], undefined, async () => ({
    items: (await db.query('SELECT id,name,email,role,dentist_id,active FROM users ORDER BY name')).rows,
  }));
  route(
    'POST',
    '/api/v1/users',
    ['ADMIN'],
    z
      .object({
        name: text,
        email: z.string().email().max(254),
        password: z.string().min(12).max(128),
        role: z.enum(roles),
        dentist_id: key.nullable().optional(),
      })
      .strict(),
    async (req, _p, u) => {
      const b = req.body as any;
      requireThat(b.role !== 'DENTIST' || b.dentist_id, 'El dentista requiere una referencia', 400);
      const password_hash = await argon2.hash(b.password, { type: argon2.argon2id });
      return db.transaction(async (tx) => {
        const uid = id();
        await tx.query(
          'INSERT INTO users(id,name,email,password_hash,role,dentist_id) VALUES($1,$2,$3,$4,$5,$6)',
          [uid, b.name, b.email.toLowerCase(), password_hash, b.role, b.dentist_id ?? null],
        );
        await audit(tx, u.id, 'user.create', uid);
        return publicUser(await one(tx, 'users', uid));
      });
    },
  );
  route(
    'PATCH',
    '/api/v1/users/:id',
    ['ADMIN'],
    z
      .object({
        active: z.boolean().optional(),
        role: z.enum(roles).optional(),
        dentist_id: key.nullable().optional(),
        password: z.string().min(12).max(128).optional(),
      })
      .strict()
      .refine((b) => Object.keys(b).length > 0),
    async (req, _p, u) => {
      const uid = (req.params as any).id,
        b = req.body as any;
      requireThat(uid !== u.id, 'No puede modificar su propia cuenta por esta operación');
      const hashed = b.password ? await argon2.hash(b.password, { type: argon2.argon2id }) : undefined;
      return db.transaction(async (tx) => {
        const before = await one(tx, 'users', uid);
        const after = { ...before, ...b };
        const actor = await one(tx, 'users', u.id);
        requireThat(actor.active && actor.role === 'ADMIN', 'Su permiso administrativo fue revocado', 403);
        if (before.role === 'ADMIN' && before.active && !(after.role === 'ADMIN' && after.active)) {
          const remaining = Number(
            (await tx.query("SELECT count(*) n FROM users WHERE active=true AND role='ADMIN'")).rows[0].n,
          );
          requireThat(remaining > 1, 'Debe permanecer al menos una cuenta de administración activa');
        }
        requireThat(after.role !== 'DENTIST' || after.dentist_id, 'Falta referencia del dentista', 400);
        await tx.query('UPDATE users SET active=$2,role=$3,dentist_id=$4,password_hash=$5 WHERE id=$1', [
          uid,
          after.active,
          after.role,
          after.dentist_id,
          hashed ?? before.password_hash,
        ]);
        await tx.query('DELETE FROM sessions WHERE user_id=$1', [uid]);
        await audit(tx, u.id, 'user.update', uid, { active: after.active, role: after.role });
        return { ok: true };
      });
    },
  );

  const catalogs: Record<
    string,
    { schema: z.ZodObject<any>; fields: string[]; read: Role[]; write: Role[] }
  > = {
    services: {
      schema: z.object({ name: text, price_cents: price, active: z.boolean().optional() }).strict(),
      fields: ['name', 'price_cents', 'active'],
      read: ['ADMIN', 'RECEPTION', 'DENTIST'],
      write: ['ADMIN'],
    },
    dentists: {
      schema: z
        .object({ name: text, specialty: z.string().max(150).optional(), active: z.boolean().optional() })
        .strict(),
      fields: ['name', 'specialty', 'active'],
      read: ['ADMIN', 'RECEPTION', 'DENTIST'],
      write: ['ADMIN'],
    },
    stations: {
      schema: z.object({ name: text, active: z.boolean().optional() }).strict(),
      fields: ['name', 'active'],
      read: ['ADMIN', 'RECEPTION', 'DENTIST', 'SUPPORT'],
      write: ['ADMIN'],
    },
    patients: {
      schema: z.object({ name: text, reference: text, active: z.boolean().optional() }).strict(),
      fields: ['name', 'reference', 'active'],
      read: ['ADMIN', 'RECEPTION'],
      write: ['ADMIN', 'RECEPTION'],
    },
    cards: {
      schema: z.object({ uid: z.string().regex(/^[A-Za-z0-9:-]{4,64}$/) }).strict(),
      fields: ['uid'],
      read: ['ADMIN', 'RECEPTION'],
      write: ['ADMIN', 'RECEPTION'],
    },
    shifts: {
      schema: z
        .object({
          name: text,
          weekday: z.number().int().min(0).max(6),
          start_time: time,
          end_time: time,
          active: z.boolean().optional(),
        })
        .strict(),
      fields: ['name', 'weekday', 'start_time', 'end_time', 'active'],
      read: ['ADMIN', 'RECEPTION', 'DENTIST'],
      write: ['ADMIN'],
    },
  };
  for (const [name, config] of Object.entries(catalogs)) {
    route('GET', `/api/v1/${name}/:id`, config.read, undefined, async (req) => {
      const row = await one(db, name, (req.params as any).id);
      delete row.token_hash;
      return row;
    });
    route('GET', `/api/v1/${name}`, config.read, undefined, async (req) => {
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(500).default(200),
          offset: z.coerce.number().int().min(0).default(0),
          q: z.string().trim().max(100).default(''),
        })
        .strict()
        .parse(req.query);
      const columns = name === 'stations' ? 'id,name,active' : '*';
      const searchColumn = name === 'cards' ? 'uid' : 'name';
      const searchValue = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%';
      const predicate = query.q
        ? `WHERE (${searchColumn} ILIKE $3${name === 'patients' ? ' OR reference ILIKE $3' : ''})`
        : '';
      const values: any[] = [query.limit, query.offset, ...(query.q ? [searchValue] : [])];
      return {
        items: (
          await db.query(`SELECT ${columns} FROM ${name} ${predicate} ORDER BY id LIMIT $1 OFFSET $2`, values)
        ).rows,
        total: Number(
          (
            await db.query(
              `SELECT count(*) n FROM ${name} ${query.q ? `WHERE (${searchColumn} ILIKE $1${name === 'patients' ? ' OR reference ILIKE $1' : ''})` : ''}`,
              query.q ? [searchValue] : [],
            )
          ).rows[0].n,
        ),
      };
    });
    route('POST', `/api/v1/${name}`, config.write, config.schema, async (req, _p, u) => {
      const b = req.body as any;
      if (name === 'shifts')
        requireThat(b.end_time > b.start_time, 'El turno debe terminar después de iniciar', 400);
      const cols = config.fields.filter((f) => b[f] !== undefined);
      const uid = id();
      return db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO ${name}(id,${cols.join(',')}) VALUES($1,${cols.map((_, i) => `$${i + 2}`).join(',')})`,
          [uid, ...cols.map((c) => b[c])],
        );
        await audit(tx, u.id, `${name}.create`, uid);
        const row = await one(tx, name, uid);
        delete row.token_hash;
        return row;
      });
    });
    if (name !== 'cards')
      route(
        'PATCH',
        `/api/v1/${name}/:id`,
        config.write,
        config.schema.partial().strict(),
        async (req, _p, u) => {
          const b = req.body as any,
            uid = (req.params as any).id;
          requireThat(Object.keys(b).length > 0, 'No hay cambios', 400);
          return db.transaction(async (tx) => {
            const before = await one(tx, name, uid);
            const after = { ...before, ...b };
            if (name === 'shifts') {
              requireThat(after.end_time > after.start_time, 'Turno inválido', 400);
              if (['weekday', 'start_time', 'end_time'].some((k) => b[k] !== undefined))
                requireThat(
                  !(await tx.query('SELECT id FROM attentions WHERE shift_id=$1 LIMIT 1', [uid])).rows.length,
                  'Un turno con historial conserva su horario: cree un turno nuevo',
                );
            }
            const cols = config.fields.filter((f) => b[f] !== undefined);
            await tx.query(
              `UPDATE ${name} SET ${cols.map((f, i) => `${f}=$${i + 2}`).join(',')} WHERE id=$1`,
              [uid, ...cols.map((c) => b[c])],
            );
            await audit(tx, u.id, `${name}.update`, uid, { fields: cols });
            return { ok: true };
          });
        },
      );
  }
  route(
    'POST',
    '/api/v1/cards/:id/rehabilitate',
    ['ADMIN'],
    z.object({ reason }).strict(),
    async (req, _p, u) =>
      db.transaction(async (tx) => {
        const card = await one(tx, 'cards', (req.params as any).id);
        requireThat(card.status === 'BLOCKED', 'Tarjeta no bloqueada');
        requireThat(
          !(await tx.query('SELECT id FROM attentions WHERE card_id=$1 AND released_at IS NULL', [card.id]))
            .rows.length,
          'La tarjeta sigue asignada',
        );
        await tx.query("UPDATE cards SET status='AVAILABLE' WHERE id=$1", [card.id]);
        await audit(tx, u.id, 'card.rehabilitate', card.id, { reason: (req.body as any).reason });
        return { ok: true };
      }),
  );
  route(
    'POST',
    '/api/v1/stations/:id/credential',
    ['ADMIN'],
    z.object({ revoke: z.boolean().default(false) }).strict(),
    async (req, _p, u) =>
      db.transaction(async (tx) => {
        const station = await one(tx, 'stations', (req.params as any).id);
        const credential = (req.body as any).revoke ? null : token();
        await tx.query('UPDATE stations SET token_hash=$2 WHERE id=$1', [
          station.id,
          credential ? digest(credential) : null,
        ]);
        await audit(tx, u.id, 'station.credential', station.id);
        return { token: credential };
      }),
  );
  route('GET', '/api/v1/calendar', ['ADMIN', 'RECEPTION', 'DENTIST'], undefined, async () => ({
    items: (await db.query('SELECT * FROM calendar_days ORDER BY day DESC LIMIT 500')).rows,
  }));
  route(
    'POST',
    '/api/v1/calendar',
    ['ADMIN'],
    z
      .object({
        shift_id: key,
        day: date,
        operated: z.boolean(),
        breaks: z.array(z.object({ start: time, end: time }).strict()).max(10),
      })
      .strict(),
    async (req, _p, u) =>
      db.transaction(async (tx) => {
        const b = req.body as any,
          shift = await one(tx, 'shifts', b.shift_id);
        const local = DateTime.fromISO(b.day, { zone: zone() });
        requireThat(
          local.isValid && local.weekday % 7 === shift.weekday,
          'La fecha no coincide con el día del turno',
          400,
        );
        let previous = shift.start_time;
        for (const pause of [...b.breaks].sort((a: any, b: any) => a.start.localeCompare(b.start))) {
          requireThat(
            pause.start >= previous && pause.end > pause.start && pause.end <= shift.end_time,
            'Descansos fuera de turno o superpuestos',
            400,
          );
          previous = pause.end;
        }
        await tx.query(
          `INSERT INTO calendar_days(id,shift_id,day,operated,breaks) VALUES($1,$2,$3,$4,$5) ON CONFLICT(shift_id,day) DO UPDATE SET operated=excluded.operated,breaks=excluded.breaks`,
          [id(), b.shift_id, b.day, b.operated, JSON.stringify(b.breaks)],
        );
        await audit(tx, u.id, 'calendar.configure', b.shift_id, { day: b.day });
        return { ok: true };
      }),
  );

  const appointmentSchema = z
    .object({ patient_id: key, dentist_id: key, service_id: key, starts_at: datetime, ends_at: datetime })
    .strict();
  async function clinicalList(req: FastifyRequest, u: any, table: 'appointments' | 'attentions') {
    const f = z
      .object({
        limit: z.coerce.number().int().min(1).max(500).default(500),
        offset: z.coerce.number().int().min(0).default(0),
        q: z.string().trim().max(100).default(''),
        day: date.optional(),
        status: z.string().optional(),
      })
      .strict()
      .parse(req.query);
    const values: any[] = [],
      conditions: string[] = [];
    if (f.day) {
      const { start, end } = reportRange(f.day, f.day);
      values.push(start.toJSDate(), end.toJSDate());
      const field = table === 'appointments' ? 'starts_at' : 'created_at';
      conditions.push(`a.${field} >= $1 AND a.${field} < $2`);
    }
    if (f.status) {
      const statuses =
        table === 'appointments'
          ? ['SCHEDULED', 'CANCELLED', 'ATTENDED']
          : ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'INCIDENT'];
      requireThat(statuses.includes(f.status), 'Estado inválido', 400);
      values.push(f.status);
      conditions.push(`a.status=$${values.length}`);
    }
    if (u.role === 'DENTIST') {
      values.push(u.dentist_id);
      conditions.push(`a.dentist_id=$${values.length}`);
    }
    if (f.q) {
      values.push('%' + f.q.replace(/[\\%_]/g, '\\$&') + '%');
      const p = `$${values.length}`;
      conditions.push(
        `(p.name ILIKE ${p} OR p.reference ILIKE ${p} OR s.name ILIKE ${p} OR d.name ILIKE ${p})`,
      );
    }
    const joins =
      `FROM ${table} a JOIN patients p ON p.id=a.patient_id JOIN dentists d ON d.id=a.dentist_id JOIN services s ON s.id=a.service_id` +
      (table === 'attentions'
        ? ' JOIN cards c ON c.id=a.card_id JOIN stations st ON st.id=a.station_id'
        : '');
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const total = Number((await db.query(`SELECT count(*) n ${joins}${where}`, values)).rows[0].n);
    const columns =
      'a.*,p.name patient,d.name dentist,s.name service' +
      (table === 'attentions' ? ',c.uid,st.name station' : '');
    values.push(f.limit, f.offset);
    const items = (
      await db.query(
        `SELECT ${columns} ${joins}${where} ORDER BY a.${table === 'attentions' ? 'created_at' : 'starts_at'} ${table === 'appointments' ? 'ASC' : 'DESC'},a.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      )
    ).rows;
    return { items, total, limit: f.limit, offset: f.offset };
  }
  route('GET', '/api/v1/appointments', ['ADMIN', 'RECEPTION', 'DENTIST'], undefined, async (req, _p, u) =>
    clinicalList(req, u, 'appointments'),
  );
  const saveAppointment = async (req: FastifyRequest, u: any, update: boolean) =>
    db.transaction(async (tx) => {
      const b = req.body as any,
        uid = update ? (req.params as any).id : id();
      if (update) {
        const old = await one(tx, 'appointments', uid);
        requireThat(old.status === 'SCHEDULED', 'Cita cerrada');
        requireThat(
          !(
            await tx.query(
              "SELECT id FROM attentions WHERE appointment_id=$1 AND status IN ('PENDING','IN_PROGRESS')",
              [uid],
            )
          ).rows.length,
          'La cita tiene una atención activa',
        );
      }
      for (const [table, k] of [
        ['patients', 'patient_id'],
        ['dentists', 'dentist_id'],
        ['services', 'service_id'],
      ])
        requireThat((await one(tx, table, b[k])).active, 'Registro inactivo');
      requireThat(new Date(b.ends_at) > new Date(b.starts_at), 'Periodo inválido', 400);
      const overlap = (
        await tx.query(
          "SELECT id FROM appointments WHERE dentist_id=$1 AND status='SCHEDULED' AND starts_at<$3 AND ends_at>$2 AND id<>$4",
          [b.dentist_id, b.starts_at, b.ends_at, uid],
        )
      ).rows.length;
      requireThat(!overlap, 'Conflicto de horario con otra cita');
      if (update)
        await tx.query(
          'UPDATE appointments SET patient_id=$2,dentist_id=$3,service_id=$4,starts_at=$5,ends_at=$6 WHERE id=$1',
          [uid, b.patient_id, b.dentist_id, b.service_id, b.starts_at, b.ends_at],
        );
      else
        await tx.query(
          'INSERT INTO appointments(id,patient_id,dentist_id,service_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6)',
          [uid, b.patient_id, b.dentist_id, b.service_id, b.starts_at, b.ends_at],
        );
      await audit(tx, u.id, update ? 'appointment.reschedule' : 'appointment.create', uid);
      return one(tx, 'appointments', uid);
    });
  route('POST', '/api/v1/appointments', ['ADMIN', 'RECEPTION'], appointmentSchema, async (req, _p, u) =>
    saveAppointment(req, u, false),
  );
  route('PATCH', '/api/v1/appointments/:id', ['ADMIN', 'RECEPTION'], appointmentSchema, async (req, _p, u) =>
    saveAppointment(req, u, true),
  );
  route(
    'POST',
    '/api/v1/appointments/:id/cancel',
    ['ADMIN', 'RECEPTION'],
    z.object({ reason }).strict(),
    async (req, _p, u) =>
      db.transaction(async (tx) => {
        const a = await one(tx, 'appointments', (req.params as any).id);
        requireThat(a.status === 'SCHEDULED', 'Cita cerrada');
        requireThat(
          !(
            await tx.query(
              "SELECT id FROM attentions WHERE appointment_id=$1 AND status IN ('PENDING','IN_PROGRESS')",
              [a.id],
            )
          ).rows.length,
          'Cierre primero la atención activa',
        );
        await tx.query("UPDATE appointments SET status='CANCELLED' WHERE id=$1", [a.id]);
        await audit(tx, u.id, 'appointment.cancel', a.id, { reason: (req.body as any).reason });
        return { ok: true };
      }),
  );

  route('GET', '/api/v1/attentions', ['ADMIN', 'RECEPTION', 'DENTIST'], undefined, async (req, _p, u) =>
    clinicalList(req, u, 'attentions'),
  );
  route(
    'POST',
    '/api/v1/attentions',
    ['ADMIN', 'RECEPTION'],
    z
      .object({
        patient_id: key,
        service_id: key,
        dentist_id: key,
        station_id: key,
        shift_id: key,
        card_id: key,
        appointment_id: key.optional(),
      })
      .strict(),
    async (req, _p, u) => bind(db, u.id, req.body),
  );
  route(
    'POST',
    '/api/v1/attentions/:id/release',
    ['ADMIN', 'RECEPTION'],
    z.object({}).strict(),
    async (req, _p, u) => release(db, u.id, (req.params as any).id),
  );
  route(
    'POST',
    '/api/v1/attentions/:id/incident',
    ['ADMIN', 'RECEPTION'],
    z.object({ reason, replacement_card_id: key.optional() }).strict(),
    async (req, _p, u) => incident(db, u.id, (req.params as any).id, req.body),
  );
  route(
    'POST',
    '/api/v1/attentions/:id/cancel',
    ['ADMIN', 'RECEPTION'],
    z.object({ reason }).strict(),
    async (req, _p, u) =>
      db.transaction(async (tx) => {
        const a = await one(tx, 'attentions', (req.params as any).id);
        requireThat(a.status === 'PENDING', 'Solo se puede cancelar antes de la entrada');
        await tx.query("UPDATE attentions SET status='CANCELLED' WHERE id=$1", [a.id]);
        await audit(tx, u.id, 'attention.cancel', a.id, { reason: (req.body as any).reason });
        return { ok: true };
      }),
  );
  route(
    'POST',
    '/api/v1/attentions/:id/correct',
    ['ADMIN'],
    z.object({ reason, started_at: datetime, ended_at: datetime, service_id: key, dentist_id: key }).strict(),
    async (req, _p, u) =>
      db.transaction(async (tx) => {
        const b = req.body as any,
          before = await one(tx, 'attentions', (req.params as any).id);
        requireThat(before.status === 'COMPLETED', 'La corrección requiere atención completada');
        requireThat(new Date(b.ended_at) >= new Date(b.started_at), 'Fin anterior al inicio', 400);
        const service = await one(tx, 'services', b.service_id);
        const dentist = await one(tx, 'dentists', b.dentist_id);
        requireThat(b.service_id === before.service_id || service.active, 'Servicio inactivo');
        requireThat(b.dentist_id === before.dentist_id || dentist.active, 'Dentista inactivo');
        const overlap = (
          await tx.query(
            "SELECT id FROM attentions WHERE id<>$1 AND status IN ('COMPLETED','IN_PROGRESS') AND (station_id=$2 OR dentist_id=$3) AND started_at<$5 AND (ended_at IS NULL OR ended_at>$4) LIMIT 1",
            [before.id, before.station_id, b.dentist_id, b.started_at, b.ended_at],
          )
        ).rows.length;
        requireThat(!overlap, 'La corrección solapa otra atención del dentista o estación');
        await tx.query(
          'UPDATE attentions SET started_at=$2,ended_at=$3,service_id=$4,dentist_id=$5,price_cents=$6 WHERE id=$1',
          [
            before.id,
            b.started_at,
            b.ended_at,
            b.service_id,
            b.dentist_id,
            b.service_id === before.service_id ? before.price_cents : service.price_cents,
          ],
        );
        const after = await one(tx, 'attentions', before.id);
        await tx.query(
          'INSERT INTO incidents(id,attention_id,actor_id,kind,reason,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [id(), before.id, u.id, 'CORRECTION', b.reason, JSON.stringify(before), JSON.stringify(after)],
        );
        await audit(tx, u.id, 'attention.correct', before.id, { reason: b.reason });
        return after;
      }),
  );
  route('GET', '/api/v1/incidents', ['ADMIN', 'RECEPTION'], undefined, async () => ({
    items: (
      await db.query(
        'SELECT id,attention_id,kind,reason,created_at FROM incidents ORDER BY created_at DESC LIMIT 200',
      )
    ).rows,
  }));
  const eventSchema = z
    .object({ event_id: key, uid: z.string().regex(/^[A-Za-z0-9:-]{4,64}$/), station_id: key })
    .strict();
  app.post(
    '/api/v1/rfid/events',
    { schema: { body: z.toJSONSchema(eventSchema, { target: 'draft-7' }), security: [{ station: [] }] } },
    async (req) => {
      const b = eventSchema.parse(req.body);
      const station = await one(db, 'stations', b.station_id);
      const bearer = req.headers.authorization?.replace(/^Bearer /, '');
      requireThat(
        bearer && station.token_hash && digest(bearer) === station.token_hash && station.active,
        'Credencial de estación inválida',
        401,
      );
      return scan(db, b.station_id, b, clock);
    },
  );
  route('POST', '/api/v1/rfid/simulate', ['ADMIN', 'RECEPTION'], eventSchema, async (req, _p, u) => {
    requireThat(!production, 'El simulador está deshabilitado en producción', 403);
    const b = req.body as any;
    const result = await scan(db, b.station_id, b, clock);
    await db.transaction((tx) => audit(tx, u.id, 'simulator.scan', result.attention_id ?? null));
    return { ...result, simulated: true };
  });
  const filterSchema = z
    .object({
      from: date,
      to: date,
      dentist_id: key.optional(),
      service_id: key.optional(),
      station_id: key.optional(),
      shift_id: key.optional(),
    })
    .strict();
  route('GET', '/api/v1/reports', ['ADMIN', 'DENTIST'], undefined, async (req, _p, u) =>
    report(db, filterSchema.parse(req.query), u),
  );
  route('GET', '/api/v1/reports/executive', ['ADMIN', 'DENTIST'], undefined, async (req, _p, u) =>
    db.transaction(async (tx) => {
      await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return executive(tx, filterSchema.parse(req.query), u);
    }, false),
  );
  route(
    'GET',
    '/api/v1/operations/overview',
    ['ADMIN', 'RECEPTION', 'DENTIST'],
    undefined,
    async (req, _p, u) => {
      const f = z.object({ day: date }).strict().parse(req.query);
      return operationalOverview(db, f.day, u);
    },
  );
  route('GET', '/api/v1/setup', ['ADMIN'], undefined, async () => setupStatus(db, clock()));
  route('GET', '/api/v1/reports/productivity', ['ADMIN', 'DENTIST'], undefined, async (req, _p, u) => {
    const f = z
      .object({ month: z.string().regex(/^\d{4}-\d{2}$/) })
      .strict()
      .parse(req.query);
    const current = DateTime.fromISO(`${f.month}-01`, { zone: zone() });
    requireThat(current.isValid, 'Mes inválido', 400);
    const prior = current.minus({ months: 1 });
    const a = await report(db, { from: current.toISODate(), to: current.endOf('month').toISODate() }, u),
      b = await report(db, { from: prior.toISODate(), to: prior.endOf('month').toISODate() }, u);
    const base = b.summary.patients_per_shift,
      value = a.summary.patients_per_shift;
    return {
      month: f.month,
      current: value,
      baseline: base,
      variation_percent: base && value !== null ? ((value - base) / base) * 100 : null,
      explanation: base
        ? 'Comparación con el mes anterior; confirmar periodos operativos completos y comparables'
        : 'No calculable: faltan turnos operados o la línea base es cero',
    };
  });
  route('GET', '/api/v1/reports/export', ['ADMIN', 'DENTIST'], undefined, async (req, reply, u) => {
    const { format, ...f } = filterSchema.extend({ format: z.enum(['csv', 'pdf', 'xlsx']) }).parse(req.query);
    const r = await report(db, f, u);
    const rows = [
      [
        'Dentista',
        'Servicio',
        'Atenciones',
        'Pacientes distintos',
        'Promedio minutos',
        'Valor servicios MXN',
      ],
      ...r.groups.map((g) => [
        g.dentist,
        g.service,
        g.attentions,
        g.patients,
        g.average_minutes.toFixed(2),
        (g.revenue_cents / 100).toFixed(2),
      ]),
    ];
    const metadata = [
      ['DentalRisk - valor de servicios completados'],
      ['Periodo', r.from, r.to],
      ['Zona horaria', r.timezone],
      ['Generado', r.generated_at],
      ['Filtros', JSON.stringify(r.filters)],
      ['Total MXN', (r.summary.revenue_cents / 100).toFixed(2)],
      [],
    ];
    reply.header('Content-Disposition', `attachment; filename="dentalrisk-${f.from}-${f.to}.${format}"`);
    if (format === 'csv') {
      const cell = (v: any) => {
        let s = String(v ?? '');
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replaceAll('"', '""') + '"';
      };
      return reply
        .type('text/csv; charset=utf-8')
        .send('\uFEFF' + [...metadata, ...rows].map((row) => row.map(cell).join(',')).join('\r\n'));
    }
    if (format === 'xlsx') {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Productividad');
      [...metadata, ...rows].forEach((row) => sheet.addRow(row));
      sheet.columns.forEach((c) => (c.width = 24));
      sheet.getRow(8).font = { bold: true };
      const buffer = await book.xlsx.writeBuffer();
      return reply
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .send(Buffer.from(buffer));
    }
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    doc.fontSize(18).text('DentalRisk · Productividad');
    doc.fontSize(9);
    metadata.slice(1).forEach((row) => doc.text(row.join('  ')));
    doc.moveDown();
    for (const row of rows) {
      if (doc.y > 730) doc.addPage();
      doc.text(row.join(' | '), { width: 510 });
      doc.moveDown(0.4);
    }
    doc.end();
    return reply.type('application/pdf').send(await done);
  });
  route('GET', '/api/v1/audit', ['ADMIN', 'SUPPORT'], undefined, async (_r, _p, u) => ({
    items: (
      await db.query(
        u.role === 'ADMIN'
          ? "SELECT a.id,a.actor_id,coalesce(u.name,'Componente del sistema') actor,a.action,a.entity_id,a.detail,a.created_at FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 200"
          : 'SELECT id,action,created_at FROM audit ORDER BY created_at DESC LIMIT 200',
      )
    ).rows,
  }));
  route('GET', '/api/v1/diagnostics', ['ADMIN', 'SUPPORT'], undefined, async () => {
    await db.query('SELECT 1');
    return {
      database: 'ok',
      mode: production ? 'production' : 'development',
      physical_reader_validated: false,
      timezone: zone(),
    };
  });
  return app;
}
