import { env } from '../src/config/env';
import { encryptToken, decryptToken } from '../src/services/crypto/token';

describe('token encryption at rest', () => {
  const original = env.tokenEncryptionKey;
  afterEach(() => {
    env.tokenEncryptionKey = original;
  });

  it('passes through unchanged when no key is configured', () => {
    env.tokenEncryptionKey = '';
    expect(encryptToken('tok_abc')).toBe('tok_abc');
    expect(decryptToken('tok_abc')).toBe('tok_abc');
  });

  it('round-trips and never exposes plaintext when a key is set', () => {
    env.tokenEncryptionKey = 'unit-test-key';
    const enc = encryptToken('tok_secret_123');
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain('tok_secret_123');
    expect(decryptToken(enc)).toBe('tok_secret_123');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    env.tokenEncryptionKey = 'unit-test-key';
    expect(encryptToken('same')).not.toBe(encryptToken('same'));
  });

  it('decrypts legacy plaintext transparently', () => {
    env.tokenEncryptionKey = 'unit-test-key';
    expect(decryptToken('legacy-plain-token')).toBe('legacy-plain-token');
  });

  it('handles null/undefined safely', () => {
    expect(decryptToken(null)).toBeNull();
    expect(decryptToken(undefined)).toBeNull();
  });
});
