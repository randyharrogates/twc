import { useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react';
import { Button } from '../ui/Button';
import { bytesToBase64, detectImageMimeFromBytes, isDeclaredImageMime } from '../../lib/image';
import {
  MAX_IMAGE_BYTES_POST_B64,
  MAX_RAW_FILE_BYTES,
} from '../../lib/llm/preflight';
import type { ContentBlock, ImageMediaType } from '../../lib/llm/types';

export interface PendingImage {
  base64: string;
  mediaType: ImageMediaType;
  previewUrl: string;
}

export type SendResult = { kind: 'sent' } | { kind: 'deferred' };

interface Props {
  disabled: boolean;
  disabledReason?: string;
  onSend: (blocks: ContentBlock[]) => Promise<SendResult>;
  providerLabel: string;
  cancelling?: boolean;
  onCancel?: () => void;
  onTogglePlanMode?: () => void;
  onSlashCommand?: (command: string) => { handled: boolean };
}

async function readFile(file: File): Promise<PendingImage | { error: string }> {
  if (file.size > MAX_RAW_FILE_BYTES) {
    return {
      error: `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB raw; limit is ~3.8 MB (5 MB after base64). Crop or re-save at lower quality.`,
    };
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const detected = detectImageMimeFromBytes(bytes);
  if (!detected) {
    return { error: `"${file.name}" is not a JPEG, PNG, or WebP image.` };
  }
  if (file.type && isDeclaredImageMime(file.type) && file.type !== detected) {
    return {
      error: `"${file.name}" is declared as ${file.type} but its bytes are ${detected}. Rejected as a safety check.`,
    };
  }
  const base64 = bytesToBase64(bytes);
  if (base64.length > MAX_IMAGE_BYTES_POST_B64) {
    return {
      error: `"${file.name}" is ${(base64.length / 1024 / 1024).toFixed(1)} MB after encoding; limit is 5 MB.`,
    };
  }
  return {
    base64,
    mediaType: detected,
    previewUrl: `data:${detected};base64,${base64}`,
  };
}

function placeholderFor(providerLabel: string, supportsSlash: boolean): string {
  const base = `Ask ${providerLabel} to parse a receipt…`;
  if (supportsSlash) {
    return `${base} (Enter to send · Shift+Tab for plan mode · /model or /plan)`;
  }
  return `${base} (Enter to send · Shift+Enter for newline)`;
}

export function Composer({
  disabled,
  disabledReason,
  onSend,
  providerLabel,
  cancelling,
  onCancel,
  onTogglePlanMode,
  onSlashCommand,
}: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<PendingImage[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    const accepted: PendingImage[] = [];
    for (const file of Array.from(files)) {
      const result = await readFile(file);
      if ('error' in result) {
        setUploadError(result.error);
        continue;
      }
      accepted.push(result);
    }
    if (accepted.length > 0) setImages((prev) => [...prev, ...accepted]);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      void handleFiles(files);
    }
  };

  const removeImage = (i: number) => setImages((prev) => prev.filter((_, j) => j !== i));

  const canSend = !sending && !disabled && (text.trim().length > 0 || images.length > 0);

  const send = async () => {
    if (!canSend) return;
    const trimmed = text.trim();
    if (trimmed.startsWith('/') && onSlashCommand && images.length === 0) {
      const result = onSlashCommand(trimmed);
      if (result.handled) {
        setText('');
        setUploadError(null);
        return;
      }
    }
    const blocks: ContentBlock[] = [];
    if (trimmed) blocks.push({ type: 'text', text: trimmed });
    for (const img of images) {
      blocks.push({ type: 'image', mediaType: img.mediaType, base64: img.base64 });
    }
    setSending(true);
    try {
      const result = await onSend(blocks);
      if (result.kind === 'sent') {
        setText('');
        setImages([]);
        setUploadError(null);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative">
              <img
                src={img.previewUrl}
                alt="Pending upload"
                className="h-20 w-20 rounded-lg border border-ink-300 object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label="Remove image"
                className="absolute -right-1 -top-1 rounded-full bg-ink-800/80 px-1.5 text-xs text-ink-0 hover:bg-red-500/80"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {uploadError && (
        <div className="rounded-md border border-red-400/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {uploadError}
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.shiftKey && e.key === 'Tab' && onTogglePlanMode) {
            e.preventDefault();
            onTogglePlanMode();
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
        rows={3}
        placeholder={placeholderFor(providerLabel, Boolean(onSlashCommand))}
        className="w-full resize-none rounded-md border border-ink-300 bg-ink-100/70 px-2.5 py-1.5 text-sm text-ink-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
        disabled={disabled || sending}
        aria-label="Chat message"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="cursor-pointer text-xs text-ink-600 hover:text-accent-400">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            capture="environment"
            onChange={onFileChange}
            className="sr-only"
          />
          + attach receipt
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {disabled && disabledReason && (
            <span className="text-xs text-amber-300">{disabledReason}</span>
          )}
          {cancelling ? (
            <Button variant="danger" onClick={() => onCancel?.()}>
              Cancel
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void send()} disabled={!canSend}>
              {sending ? 'Sending…' : 'Send'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
