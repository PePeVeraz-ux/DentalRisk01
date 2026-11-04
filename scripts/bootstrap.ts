import argon2 from 'argon2';
import { database, migrate } from '../apps/api/src/db.js';
import { audit, id } from '../apps/api/src/domain.js';
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
  password = process.env.ADMIN_PASSWORD;
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password || password.length < 12)
  throw new Error('Configure ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres) en el entorno.');
const db = await database();
try {
  await migrate(db);
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  await db.transaction(async (tx) => {
    if ((await tx.query('SELECT id FROM users LIMIT 1')).rows.length)
      throw new Error('Ya existen usuarios: no se modificó ninguna credencial.');
    const uid = id();
    await tx.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'ADMIN')", [
      uid,
      'Administración',
      email,
      hash,
    ]);
    await audit(tx, uid, 'system.bootstrap', uid);
  });
  console.log(
    'Cuenta inicial creada. Elimine ADMIN_PASSWORD del archivo de entorno y guárdela en un gestor de contraseñas.',
  );
} finally {
  await db.close();
}
