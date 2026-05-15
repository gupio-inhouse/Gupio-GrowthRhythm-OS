import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && raw.length === 64) return Buffer.from(raw, 'hex');
  // Dev fallback — derive 32-byte key deterministically
  return scryptSync('gr-dev-encryption-key', 'growthrhythm-salt', 32);
}

const KEY = getKey();

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(value: string): string {
  const parts = value.split(':');
  if (parts.length !== 3) return value; // not encrypted
  const [ivHex, authTagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(cipherHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function encryptField(value?: string | null): string | null | undefined {
  if (!value) return value;
  return encrypt(value);
}

export function decryptField(value?: string | null): string | null | undefined {
  if (!value) return value;
  try { return decrypt(value); } catch { return value; }
}
