/**
 * Session-scoped vault for the PBKDF2-derived AES-GCM key that encrypts
 * `settings.apiKeys.<provider>` at rest.
 *
 * The CryptoKey lives only in this module's private memory; it is never
 * persisted to Zustand state nor to localStorage. The store holds the
 * *meta* (salt, iterations, encrypted probe) so `unlock(passphrase)` can
 * verify a candidate passphrase without comparing to real key material.
 *
 * Ported from /Users/randychan/git/Leeseidon/src/lib/storage/passphrase_service.ts
 * and narrowed to TWC's single use case (string secrets, not JSON rows).
 */

import {
  bytesToBase64,
  base64ToBytes,
  decryptString,
  deriveKey,
  encryptString,
  generateSalt,
  isEncrypted,
  PBKDF2_ITERATIONS,
  type EncryptedString,
} from './crypto';
import { VaultLockedError } from './llm/errors';

const PROBE_PLAINTEXT = 'twc-vault-probe-v1';

export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked';

export interface VaultMeta {
  salt: string;
  iterations: number;
  probe: EncryptedString;
}

export interface SetupResult {
  meta: VaultMeta;
}

class KeyVault {
  private key: CryptoKey | null = null;
  private listeners = new Set<() => void>();

  isUnlocked(): boolean {
    return this.key !== null;
  }

  status(meta: VaultMeta | null | undefined): VaultStatus {
    if (meta == null) return 'uninitialized';
    return this.key === null ? 'locked' : 'unlocked';
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  async setup(passphrase: string): Promise<SetupResult> {
    if (passphrase.length === 0) {
      throw new Error('Passphrase cannot be empty.');
    }
    const saltBytes = generateSalt();
    const key = await deriveKey(passphrase, saltBytes, PBKDF2_ITERATIONS);
    const probe = await encryptString(key, PROBE_PLAINTEXT);
    this.key = key;
    this.emit();
    return {
      meta: {
        salt: bytesToBase64(saltBytes),
        iterations: PBKDF2_ITERATIONS,
        probe,
      },
    };
  }

  async unlock(passphrase: string, meta: VaultMeta): Promise<void> {
    if (passphrase.length === 0) {
      throw new Error('Passphrase cannot be empty.');
    }
    const saltBytes = base64ToBytes(meta.salt);
    const candidate = await deriveKey(passphrase, saltBytes, meta.iterations);
    let plaintext: string;
    try {
      plaintext = await decryptString(candidate, meta.probe);
    } catch {
      throw new Error('Passphrase is incorrect.');
    }
    if (plaintext !== PROBE_PLAINTEXT) {
      throw new Error('Passphrase is incorrect.');
    }
    this.key = candidate;
    this.emit();
  }

  lock(): void {
    if (this.key === null) return;
    this.key = null;
    this.emit();
  }

  wipe(): void {
    this.key = null;
    this.emit();
  }

  async encryptKey(plaintext: string): Promise<EncryptedString> {
    if (this.key === null) throw new VaultLockedError();
    return encryptString(this.key, plaintext);
  }

  async decryptKey(stored: string): Promise<string> {
    if (!isEncrypted(stored)) return stored;
    if (this.key === null) throw new VaultLockedError();
    return decryptString(this.key, stored);
  }

  resetForTesting(): void {
    this.key = null;
    this.listeners.clear();
  }
}

export const keyVault = new KeyVault();
export { VaultLockedError };
