import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Encrypts the card `tokenKey` at rest with AES-256-GCM. The 32-byte key is
 * derived from TOKEN_ENCRYPTION_KEY via SHA-256, so any passphrase works.
 *
 * Format: `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>`. If no encryption key is
 * configured, values are returned/stored as-is (dev), and decrypt transparently
 * passes through any value lacking the `v1:` prefix — so switching encryption on
 * or off never bricks existing rows.
 */

const PREFIX = 'v1:';

function key32(): Buffer | null {
  if (!env.tokenEncryptionKey) return null;
  return crypto.createHash('sha256').update(env.tokenEncryptionKey).digest();
}

export function encryptToken(plain: string): string {
  const key = key32();
  if (!key) return plain; // encryption disabled
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // plaintext / legacy
  const key = key32();
  if (!key) return stored; // cannot decrypt without the key
  const [, ivB64, tagB64, ctB64] = stored.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
