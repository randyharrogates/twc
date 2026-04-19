import type { ImageMediaType } from './llm/types';

const MAGIC_JPEG = [0xff, 0xd8, 0xff];
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47];
const MAGIC_WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];

function bytesStartWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false;
  return true;
}

export function detectImageMimeFromBytes(bytes: Uint8Array): ImageMediaType | null {
  if (bytesStartWith(bytes, MAGIC_JPEG)) return 'image/jpeg';
  if (bytesStartWith(bytes, MAGIC_PNG)) return 'image/png';
  if (
    bytesStartWith(bytes, MAGIC_WEBP_RIFF) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function isDeclaredImageMime(mime: string): mime is ImageMediaType {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk) as number[]);
  }
  return btoa(binary);
}
