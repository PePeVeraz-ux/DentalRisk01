import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import argon2 from 'argon2';
import { database, migrate } from '../apps/api/src/db.js';
import { buildApp } from '../apps/api/src/app.js';
import { digest, id, token } from '../apps/api/src/domain.js';

test('migración desde la demo conserva usuarios y sesiones sin otorgar acceso operativo', async () => {
  const db = await database({ memory: true });
  try {
    const sql = await readFile(new URL('../database/001_initial.sql', import.meta.url), 'utf8');
    for (const statement of sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.query(statement);
    await db.query(
      'CREATE TABLE schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    await db.query('INSERT INTO schema_migrations(version) VALUES(1)');
    const user = id(),
      raw = token(),
      csrf = token();
    await db.query(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Dueño previo','old@example.test','retained-hash','ADMIN')",
      [user],
    );
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [digest(raw), user, csrf],
    );
    await migrate(db);
    await migrate(db);
    const account = (await db.query('SELECT * FROM users WHERE id=$1', [user])).rows[0];
    assert.equal(account.password_hash, 'retained-hash');
    const session = (await db.query('SELECT * FROM sessions')).rows[0];
    assert.equal(session.csrf, csrf);
    assert.equal(session.operation_until, null);
    assert.equal((await db.query('SELECT version FROM schema_migrations')).rows.length, 4);
  } finally {
    await db.close();
  }
});

test('dos administradores no pueden revocarse simultáneamente y dejar la clínica sin dueño', async () => {
  const db = process.env.SECURITY_TEST_DATABASE_URL
    ? await database({ url: process.env.SECURITY_TEST_DATABASE_URL })
    : await database({ memory: true });
  await migrate(db);
  const app = await buildApp({ db, origin: 'http://localhost:3000' });
  try {
    const users = [id(), id()],
      password = token(),
      hash = await argon2.hash(password);
    for (let i = 0; i < 2; i++)
      await db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'ADMIN')", [
        users[i],
        `Owner ${i}`,
        `owner${i}@example.test`,
        hash,
      ]);
    const sessions = [];
    for (let i = 0; i < 2; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { origin: 'http://localhost:3000' },
        payload: { email: `owner${i}@example.test`, password },
      });
      assert.equal(r.statusCode, 200, r.body);
      sessions.push({ cookie: String(r.headers['set-cookie']).split(';')[0], csrf: r.json().csrf });
    }
    const responses = await Promise.all(
      sessions.map((s, i) =>
        app.inject({
          method: 'PATCH',
          url: `/api/v1/users/${users[1 - i]}`,
          headers: { origin: 'http://localhost:3000', cookie: s.cookie, 'x-csrf-token': s.csrf },
          payload: { role: 'RECEPTION' },
        }),
      ),
    );
    assert.equal(responses.filter((r) => r.statusCode === 200).length, 1);
    assert.ok(responses.some((r) => [401, 403, 409].includes(r.statusCode)));
    assert.equal(
      Number((await db.query("SELECT count(*) n FROM users WHERE active=true AND role='ADMIN'")).rows[0].n),
      1,
    );
  } finally {
    await app.close();
    await db.close();
  }
});
