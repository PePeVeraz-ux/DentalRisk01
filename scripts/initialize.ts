import argon2 from 'argon2';
import { database, migrate } from '../apps/api/src/db.js';
import { audit, id } from '../apps/api/src/domain.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const db = await database();

try {
  await migrate(db);
  await db.query('GRANT DELETE ON login_attempts, sessions TO dentalrisk_app');
  const existing = await db.query('SELECT id FROM users LIMIT 1');
  if (existing.rows.length) {
    console.log('Esquema clínico actualizado; la cuenta existente se conservó.');
  } else {
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw new Error('ADMIN_EMAIL debe ser un correo válido.');
    if (!password || password.length < 12)
      throw new Error('ADMIN_PASSWORD debe contener al menos 12 caracteres.');

    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await db.transaction(async (tx) => {
      const userId = id();
      await tx.query(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'ADMIN')",
        [userId, 'Dirección de la clínica', email, hash],
      );
      await audit(tx, userId, 'system.bootstrap', userId);
    });
    console.log('Esquema preparado y cuenta inicial creada.');
  }
} finally {
  await db.close();
}
