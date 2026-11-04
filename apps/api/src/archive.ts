import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function archiveKey(hex: string) {
  if (!/^[a-f0-9]{64}$/i.test(hex))
    throw new Error('La clave de respaldo debe contener 64 caracteres hexadecimales');
  return Buffer.from(hex, 'hex');
}
export function encryptArchive(raw: Buffer, hex: string): Buffer {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', archiveKey(hex), iv);
  const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
  return Buffer.concat([Buffer.from('DRB1'), iv, cipher.getAuthTag(), encrypted]);
}
export function decryptArchive(payload: Buffer, hex: string): Buffer {
  if (payload.length < 32 || payload.subarray(0, 4).toString() !== 'DRB1')
    throw new Error('Formato de respaldo inválido');
  const decipher = createDecipheriv('aes-256-gcm', archiveKey(hex), payload.subarray(4, 16));
  decipher.setAuthTag(payload.subarray(16, 32));
  return Buffer.concat([decipher.update(payload.subarray(32)), decipher.final()]);
}
