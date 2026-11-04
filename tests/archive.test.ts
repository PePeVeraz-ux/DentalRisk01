import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptArchive, decryptArchive } from '../apps/api/src/archive.js';

test('respaldos autenticados: recuperación, nonce independiente y ausencia de texto plano', () => {
  const key = randomBytes(32).toString('hex'),
    raw = Buffer.from('DATOS DE PRUEBA: registro clínico sintético');
  const first = encryptArchive(raw, key),
    second = encryptArchive(raw, key);
  assert.notDeepEqual(first, second);
  assert.equal(first.includes(raw), false);
  assert.deepEqual(decryptArchive(first, key), raw);
});
test('restauración rechaza manipulación, clave incorrecta, encabezado inválido y truncamiento', () => {
  const key = randomBytes(32).toString('hex'),
    payload = encryptArchive(Buffer.from('contenido'), key);
  const modified = Buffer.from(payload);
  modified[modified.length - 1] ^= 1;
  assert.throws(() => decryptArchive(modified, key));
  assert.throws(() => decryptArchive(payload, randomBytes(32).toString('hex')));
  assert.throws(() => decryptArchive(Buffer.from('BAD'), key), /Formato/);
  assert.throws(() => decryptArchive(payload.subarray(0, 20), key), /Formato/);
  assert.throws(() => encryptArchive(Buffer.from('dato'), 'clave débil'), /64/);
});
