import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  decryptString,
  deriveKey,
  encryptString,
  generateIv,
  generateSalt,
  isEncrypted,
  PBKDF2_ITERATIONS,
} from '../lib/crypto';

const PASSPHRASE = 'correct horse battery staple';

describe('generateSalt', () => {
  it('returns 16 random bytes', () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.byteLength).toBe(16);
  });

  it('produces different salts across calls', () => {
    expect(generateSalt()).not.toEqual(generateSalt());
  });
});

describe('generateIv', () => {
  it('returns 12 random bytes (AES-GCM nonce length)', () => {
    expect(generateIv().byteLength).toBe(12);
  });

  it('produces different IVs across calls', () => {
    expect(generateIv()).not.toEqual(generateIv());
  });
});

describe('deriveKey', () => {
  it('uses 600_000 PBKDF2 iterations by default', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it('returns an AES-GCM CryptoKey', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    expect(key.type).toBe('secret');
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it('produces identical keys for identical passphrase+salt', async () => {
    const salt = generateSalt();
    const k1 = await deriveKey(PASSPHRASE, salt);
    const k2 = await deriveKey(PASSPHRASE, salt);
    const payload = await encryptString(k1, 'sk-ant-abc');
    expect(await decryptString(k2, payload)).toBe('sk-ant-abc');
  });

  it('produces different keys for different salts', async () => {
    const payload = await encryptString(
      await deriveKey(PASSPHRASE, generateSalt()),
      'plain',
    );
    const otherKey = await deriveKey(PASSPHRASE, generateSalt());
    await expect(decryptString(otherKey, payload)).rejects.toThrow();
  });
});

describe('encryptString + decryptString', () => {
  it('round-trips an API-key-shaped string', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const encoded = await encryptString(key, 'sk-ant-api03-xyz');
    expect(isEncrypted(encoded)).toBe(true);
    expect(encoded.startsWith('enc.v1.')).toBe(true);
    expect(await decryptString(key, encoded)).toBe('sk-ant-api03-xyz');
  });

  it('produces different ciphertexts for the same plaintext (fresh IV)', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const a = await encryptString(key, 'hello');
    const b = await encryptString(key, 'hello');
    expect(a).not.toBe(b);
  });

  it('fails to decrypt when ciphertext is tampered', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    const encoded = await encryptString(key, 'secret');
    const dot = encoded.lastIndexOf('.');
    const tampered = encoded.slice(0, dot + 1) + 'AA' + encoded.slice(dot + 3);
    await expect(decryptString(key, tampered)).rejects.toThrow();
  });

  it('fails to decrypt with a wrong passphrase', async () => {
    const salt = generateSalt();
    const good = await deriveKey(PASSPHRASE, salt);
    const bad = await deriveKey('wrong passphrase', salt);
    const encoded = await encryptString(good, 'secret');
    await expect(decryptString(bad, encoded)).rejects.toThrow();
  });

  it('rejects decryption of a non-enc.v1 string', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    await expect(decryptString(key, 'sk-ant-plain')).rejects.toThrow(
      /not an enc\.v1/,
    );
  });

  it('rejects a malformed enc.v1 payload missing the ciphertext segment', async () => {
    const key = await deriveKey(PASSPHRASE, generateSalt());
    await expect(decryptString(key, 'enc.v1.abc')).rejects.toThrow(/malformed/);
  });
});

describe('isEncrypted', () => {
  it.each([
    ['sk-ant-api03-plain', false],
    ['sk-abc', false],
    ['', false],
    ['enc.v1.iv.ct', true],
  ] as const)('treats %j as encrypted=%s', (value, expected) => {
    expect(isEncrypted(value)).toBe(expected);
  });
});

describe('base64 helpers', () => {
  it('round-trip bytes through base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const round = base64ToBytes(bytesToBase64(bytes));
    expect(Array.from(round)).toEqual(Array.from(bytes));
  });
});
