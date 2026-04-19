import type { ChatMessage, ContentBlock } from '../lib/llm/types';

const cache = new Map<string, string>();

export function putImage(messageId: string, base64: string): void {
  cache.set(messageId, base64);
}

export function getImage(messageId: string): string | undefined {
  return cache.get(messageId);
}

export function forgetImage(messageId: string): void {
  cache.delete(messageId);
}

export function clearImageCache(): void {
  cache.clear();
}

export function knownImageIds(): string[] {
  return Array.from(cache.keys());
}

export function rehydrateHistoryBlocks(history: ChatMessage[]): ChatMessage[] {
  return history.map((m) => ({
    ...m,
    blocks: m.blocks.map<ContentBlock>((b) => {
      if (b.type !== 'image') return b;
      const cached = cache.get(m.id);
      if (cached) return { ...b, base64: cached };
      return {
        type: 'text',
        text: '[image previously attached — original bytes were not retained after reload]',
      };
    }),
  }));
}
