import { NextRequest } from 'next/server';

/**
 * TBP-629, the other half: the callback route has to CONSUME the cookie the
 * middleware wrote, or hosted-mode deep links are stashed and then forgotten —
 * which looks identical to the bug being fixed.
 */

const mockHandleCallbackServer = jest.fn().mockResolvedValue(undefined);

jest.mock('./utils/init-services', () => ({
  initServices: jest.fn().mockImplementation(async () => ({
    authService: { handleCallbackServer: mockHandleCallbackServer },
  })),
}));

jest.mock('./utils/get-config', () => ({
  getConfig: jest.fn().mockReturnValue({ debug: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createBridgeCallbackRoute } = require('./callback-route');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RETURN_TO_COOKIE } = require('./utils/return-to');

function callbackRequest(query: string, cookie?: string): NextRequest {
  const req = new NextRequest(`http://localhost:3000/auth/callback${query}`);
  if (cookie !== undefined) req.cookies.set(RETURN_TO_COOKIE, cookie);
  return req;
}

beforeEach(() => mockHandleCallbackServer.mockClear());

describe('createBridgeCallbackRoute — stashed return target', () => {
  it('lands on the stashed deep link instead of the default route', async () => {
    const res = await createBridgeCallbackRoute({ redirectPath: '/dashboard' })(
      callbackRequest('?code=abc', '/incident/42?tab=files'),
    );
    expect(res.headers.get('location')).toBe('http://localhost:3000/incident/42?tab=files');
  });

  it('clears the cookie so it cannot hijack the next login', async () => {
    const res = await createBridgeCallbackRoute({ redirectPath: '/dashboard' })(
      callbackRequest('?code=abc', '/incident/42'),
    );
    // One-shot by design.
    expect(res.cookies.get(RETURN_TO_COOKIE)?.value).toBe('');
  });

  it('clears the cookie even when the value is not used', async () => {
    const res = await createBridgeCallbackRoute({ redirectPath: '/dashboard' })(
      callbackRequest('?code=abc&payment=success', '/incident/42'),
    );
    expect(res.cookies.get(RETURN_TO_COOKIE)?.value).toBe('');
  });

  it('falls back to redirectPath when nothing was stashed', async () => {
    const res = await createBridgeCallbackRoute({ redirectPath: '/dashboard' })(
      callbackRequest('?code=abc'),
    );
    // The pre-TBP-629 behaviour, unchanged for apps with no deep linking.
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
  });

  it('lets a preserved param win over the stashed target', async () => {
    // `payment` signals a just-completed checkout whose landing page the billing
    // flow owns — a deliberate destination, not a remembered one.
    const res = await createBridgeCallbackRoute({ redirectPath: '/dashboard' })(
      callbackRequest('?code=abc&payment=success', '/incident/42'),
    );
    expect(res.headers.get('location')).toBe(
      'http://localhost:3000/dashboard?payment=success',
    );
  });

  it('refuses a tampered cookie rather than redirecting off-origin', async () => {
    // Same-origin and written by us, so this is belt-and-braces — but it is the
    // difference between "a cookie was tampered with" being a routing oddity and
    // being an open redirect.
    const res = await createBridgeCallbackRoute({ redirectPath: '/dashboard' })(
      callbackRequest('?code=abc', 'https://evil.test/x'),
    );
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
  });
});
