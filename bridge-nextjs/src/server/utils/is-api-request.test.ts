import { NextRequest } from 'next/server';
import { isApiRequest } from './is-api-request';

function req(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

describe('isApiRequest', () => {
  it('treats /api/* paths as API requests', () => {
    expect(isApiRequest(req('/api/users'))).toBe(true);
  });

  it('treats an accept: application/json (no html) request as API', () => {
    expect(isApiRequest(req('/users', { accept: 'application/json' }))).toBe(true);
  });

  it('treats a browser page navigation (accept text/html) as NOT API', () => {
    expect(
      isApiRequest(req('/dashboard', { accept: 'text/html,application/xhtml+xml,*/*' })),
    ).toBe(false);
  });

  it('treats a JSON content-type request as API', () => {
    expect(isApiRequest(req('/submit', { 'content-type': 'application/json' }))).toBe(true);
  });

  it('treats an x-requested-with fetch as API', () => {
    expect(isApiRequest(req('/data', { 'x-requested-with': 'XMLHttpRequest' }))).toBe(true);
  });

  it('treats a non-document sec-fetch-dest as API', () => {
    expect(isApiRequest(req('/data', { 'sec-fetch-dest': 'empty' }))).toBe(true);
  });

  it('treats a document sec-fetch-dest as NOT API', () => {
    expect(isApiRequest(req('/page', { 'sec-fetch-dest': 'document' }))).toBe(false);
  });
});
