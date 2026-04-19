import { describe, expect, it } from 'vitest';
import { detectImageMimeFromBytes, isDeclaredImageMime, bytesToBase64 } from '../lib/image';

describe('detectImageMimeFromBytes', () => {
  it('detects JPEG from the FFD8FF magic', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(detectImageMimeFromBytes(bytes)).toBe('image/jpeg');
  });

  it('detects PNG from the 89 50 4E 47 magic', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageMimeFromBytes(bytes)).toBe('image/png');
  });

  it('detects WebP from the RIFF....WEBP container', () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // file size
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(detectImageMimeFromBytes(bytes)).toBe('image/webp');
  });

  it('rejects an SVG (text-ish, not a real image from our POV)', () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(detectImageMimeFromBytes(bytes)).toBeNull();
  });

  it('rejects a PDF masquerading as a jpeg extension', () => {
    const bytes = new TextEncoder().encode('%PDF-1.4');
    expect(detectImageMimeFromBytes(bytes)).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(detectImageMimeFromBytes(new Uint8Array([]))).toBeNull();
  });
});

describe('isDeclaredImageMime', () => {
  it('narrows supported mime types', () => {
    expect(isDeclaredImageMime('image/jpeg')).toBe(true);
    expect(isDeclaredImageMime('image/png')).toBe(true);
    expect(isDeclaredImageMime('image/webp')).toBe(true);
    expect(isDeclaredImageMime('image/svg+xml')).toBe(false);
  });
});

describe('bytesToBase64', () => {
  it('encodes small byte sequences', () => {
    expect(bytesToBase64(new Uint8Array([1, 2, 3, 4]))).toBe(btoa(String.fromCharCode(1, 2, 3, 4)));
  });

  it('handles large buffers without stack overflow', () => {
    const bytes = new Uint8Array(100_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const encoded = bytesToBase64(bytes);
    expect(encoded.length).toBeGreaterThan(0);
    expect(atob(encoded).length).toBe(bytes.length);
  });
});
