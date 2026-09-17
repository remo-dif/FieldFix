import { describe, expect, it } from 'vitest';
import { readJsonResponse } from './api-response';

describe('readJsonResponse', () => {
  it('accepts JSON and JSON vendor media types', async () => {
    await expect(readJsonResponse<{ id: string }>(new Response('{"id":"ok"}', {
      headers: { 'content-type': 'application/problem+json' },
    }), 'Session API')).resolves.toEqual({ id: 'ok' });
  });

  it('rejects an HTML fallback with the endpoint name', async () => {
    await expect(readJsonResponse(new Response('<html></html>', {
      headers: { 'content-type': 'text/html' },
    }), 'Tasks API')).rejects.toThrow('Tasks API returned text/html instead of JSON');
  });

  it('rejects malformed JSON', async () => {
    await expect(readJsonResponse(new Response('{', {
      headers: { 'content-type': 'application/json' },
    }), 'Tasks API')).rejects.toThrow('Tasks API returned invalid JSON');
  });
});
