import { beforeEach, describe, expect, it } from 'vitest';
import { isEncrypted } from '../lib/crypto';
import { keyVault, VaultLockedError, type VaultMeta } from '../lib/keyVault';

const PASSPHRASE = 'correct horse battery staple';

describe('keyVault', () => {
  beforeEach(() => {
    keyVault.resetForTesting();
  });

  it('reports uninitialized when no meta is supplied', () => {
    expect(keyVault.isUnlocked()).toBe(false);
    expect(keyVault.status(null)).toBe('uninitialized');
  });

  it('setup returns meta and leaves the vault unlocked', async () => {
    const { meta } = await keyVault.setup(PASSPHRASE);
    expect(meta.iterations).toBe(600_000);
    expect(typeof meta.salt).toBe('string');
    expect(meta.probe.startsWith('enc.v1.')).toBe(true);
    expect(keyVault.isUnlocked()).toBe(true);
    expect(keyVault.status(meta)).toBe('unlocked');
  });

  it('encrypts and decrypts a plaintext key while unlocked', async () => {
    await keyVault.setup(PASSPHRASE);
    const encoded = await keyVault.encryptKey('sk-ant-abc');
    expect(isEncrypted(encoded)).toBe(true);
    expect(await keyVault.decryptKey(encoded)).toBe('sk-ant-abc');
  });

  it('returns plaintext unchanged from decryptKey when input is not encrypted', async () => {
    await keyVault.setup(PASSPHRASE);
    expect(await keyVault.decryptKey('sk-plaintext')).toBe('sk-plaintext');
  });

  it('lock() clears the in-memory key', async () => {
    const { meta } = await keyVault.setup(PASSPHRASE);
    const encoded = await keyVault.encryptKey('sk-abc');
    keyVault.lock();
    expect(keyVault.isUnlocked()).toBe(false);
    expect(keyVault.status(meta)).toBe('locked');
    await expect(keyVault.decryptKey(encoded)).rejects.toBeInstanceOf(
      VaultLockedError,
    );
    await expect(keyVault.encryptKey('sk-xyz')).rejects.toBeInstanceOf(
      VaultLockedError,
    );
  });

  it('unlock() with the correct passphrase restores encrypt/decrypt', async () => {
    const { meta } = await keyVault.setup(PASSPHRASE);
    const encoded = await keyVault.encryptKey('sk-secret');
    keyVault.lock();
    await keyVault.unlock(PASSPHRASE, meta);
    expect(keyVault.isUnlocked()).toBe(true);
    expect(await keyVault.decryptKey(encoded)).toBe('sk-secret');
  });

  it('unlock() with the wrong passphrase throws and leaves the vault locked', async () => {
    const { meta } = await keyVault.setup(PASSPHRASE);
    keyVault.lock();
    await expect(keyVault.unlock('nope', meta)).rejects.toThrow(
      /passphrase is incorrect/i,
    );
    expect(keyVault.isUnlocked()).toBe(false);
  });

  it('unlock() on a tampered probe throws', async () => {
    const { meta } = await keyVault.setup(PASSPHRASE);
    keyVault.lock();
    const tampered: VaultMeta = {
      ...meta,
      probe: meta.probe
        .slice(0, meta.probe.length - 2)
        .concat('AA') as VaultMeta['probe'],
    };
    await expect(keyVault.unlock(PASSPHRASE, tampered)).rejects.toThrow(
      /passphrase is incorrect/i,
    );
    expect(keyVault.isUnlocked()).toBe(false);
  });

  it('rejects empty passphrases at setup and unlock', async () => {
    await expect(keyVault.setup('')).rejects.toThrow(/empty/);
    const { meta } = await keyVault.setup(PASSPHRASE);
    keyVault.lock();
    await expect(keyVault.unlock('', meta)).rejects.toThrow(/empty/);
  });

  it('wipe() clears the in-memory key', async () => {
    await keyVault.setup(PASSPHRASE);
    keyVault.wipe();
    expect(keyVault.isUnlocked()).toBe(false);
    expect(keyVault.status(null)).toBe('uninitialized');
  });

  it('subscribers are notified on state transitions', async () => {
    let count = 0;
    const unsub = keyVault.subscribe(() => {
      count += 1;
    });
    const { meta } = await keyVault.setup(PASSPHRASE);
    keyVault.lock();
    await keyVault.unlock(PASSPHRASE, meta);
    keyVault.wipe();
    unsub();
    expect(count).toBe(4);
  });
});
