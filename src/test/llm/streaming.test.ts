import { describe, expect, it } from 'vitest';
import { iterateSse } from '../../lib/llm/streaming';

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
}

async function collect(response: Response): Promise<Array<{ event?: string; data: string }>> {
  const out: Array<{ event?: string; data: string }> = [];
  for await (const ev of iterateSse(response)) out.push(ev);
  return out;
}

describe('iterateSse', () => {
  it('yields events split by blank lines with event and data fields', async () => {
    const res = responseFromChunks([
      'event: message_start\ndata: {"a":1}\n\n',
      'event: message_delta\ndata: {"b":2}\n\n',
    ]);
    const events = await collect(res);
    expect(events).toEqual([
      { event: 'message_start', data: '{"a":1}' },
      { event: 'message_delta', data: '{"b":2}' },
    ]);
  });

  it('concatenates multiple data: lines for a single event with newline', async () => {
    const res = responseFromChunks(['data: line1\ndata: line2\n\n']);
    const events = await collect(res);
    expect(events).toEqual([{ event: undefined, data: 'line1\nline2' }]);
  });

  it('ignores the [DONE] sentinel', async () => {
    const res = responseFromChunks(['data: {"x":1}\n\n', 'data: [DONE]\n\n']);
    const events = await collect(res);
    expect(events).toEqual([{ event: undefined, data: '{"x":1}' }]);
  });

  it('handles an event split across chunks', async () => {
    const res = responseFromChunks(['event: msg\nda', 'ta: {"k":', '"v"}\n\n']);
    const events = await collect(res);
    expect(events).toEqual([{ event: 'msg', data: '{"k":"v"}' }]);
  });

  it('handles CRLF line endings', async () => {
    const res = responseFromChunks(['event: x\r\ndata: {"a":1}\r\n\r\n']);
    const events = await collect(res);
    expect(events).toEqual([{ event: 'x', data: '{"a":1}' }]);
  });
});
