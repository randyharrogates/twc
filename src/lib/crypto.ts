/**
 * Web Crypto AES-GCM helpers for at-rest encryption of string secrets
 * (currently: BYO-key API keys in `settings.apiKeys`).
 *
 * Ciphertext is encoded as a single self-describing tagged string:
 *     enc.v1.<iv_base64>.<ct_base64>
 *
 * Pure module — no DOM / React / localStorage / Zustand imports. Consumers
 * hand in a `CryptoKey` (the vault owns the derived key in session memory).
 * Uses the same PBKDF2-SHA256 + AES-GCM parameters as a prior project,
 * with the JSON-payload signature narrowed to strings for TWC's single use case.
 */

export const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = 'SHA-256';
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const ENCRYPTED_PREFIX = 'enc.v1.';

export type EncryptedString = `enc.v1.${string}`;

export function generateSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_BYTES)));
}

export function generateIv(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encodeUtf8(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptString(
  key: CryptoKey,
  plaintext: string,
): Promise<EncryptedString> {
  const iv = generateIv();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodeUtf8(plaintext),
  );
  return `${ENCRYPTED_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(
    new Uint8Array(ciphertext),
  )}` as EncryptedString;
}

export async function decryptString(
  key: CryptoKey,
  encoded: string,
): Promise<string> {
  if (!isEncrypted(encoded)) {
    throw new Error('decryptString: value is not an enc.v1 tagged string');
  }
  const rest = encoded.slice(ENCRYPTED_PREFIX.length);
  const dotIndex = rest.indexOf('.');
  if (dotIndex <= 0 || dotIndex === rest.length - 1) {
    throw new Error('decryptString: malformed enc.v1 payload');
  }
  const iv = base64ToBytes(rest.slice(0, dotIndex));
  const ciphertext = base64ToBytes(rest.slice(dotIndex + 1));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

export function isEncrypted(value: string): value is EncryptedString {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  const view = new TextEncoder().encode(value);
  const copy = new Uint8Array(new ArrayBuffer(view.byteLength));
  copy.set(view);
  return copy;
}
