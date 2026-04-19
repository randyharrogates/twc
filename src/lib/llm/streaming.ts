export interface SseEvent {
  event?: string;
  data: string;
}

export async function* iterateSse(response: Response): AsyncIterable<SseEvent> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (done) {
        buffer += decoder.decode();
        for (const ev of drainEvents(buffer, true)) yield ev;
        return;
      }
      let terminator = findTerminator(buffer);
      while (terminator !== null) {
        const raw = buffer.slice(0, terminator.index);
        buffer = buffer.slice(terminator.index + terminator.length);
        const parsed = parseEvent(raw);
        if (parsed && parsed.data !== '[DONE]') yield parsed;
        terminator = findTerminator(buffer);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function* drainEvents(buffer: string, final: boolean): Generator<SseEvent> {
  let remaining = buffer;
  let terminator = findTerminator(remaining);
  while (terminator !== null) {
    const raw = remaining.slice(0, terminator.index);
    remaining = remaining.slice(terminator.index + terminator.length);
    const parsed = parseEvent(raw);
    if (parsed && parsed.data !== '[DONE]') yield parsed;
    terminator = findTerminator(remaining);
  }
  if (final && remaining.trim().length > 0) {
    const parsed = parseEvent(remaining);
    if (parsed && parsed.data !== '[DONE]') yield parsed;
  }
}

function findTerminator(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1 && crlf === -1) return null;
  if (lf === -1) return { index: crlf, length: 4 };
  if (crlf === -1) return { index: lf, length: 2 };
  return lf < crlf ? { index: lf, length: 2 } : { index: crlf, length: 4 };
}

function parseEvent(raw: string): SseEvent | null {
  const lines = raw.split(/\r?\n/);
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const rawValue = colon === -1 ? '' : line.slice(colon + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (event === undefined && dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

