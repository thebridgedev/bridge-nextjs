/**
 * TBP-742 — level 0 of plan limits: a `402 QUOTA_EXCEEDED` from the app's own
 * backend becomes an upgrade request with no code on the page. New on this
 * branch: on origin/main bridge-nextjs had no `bridgeFetch`, no refusal parser
 * and no 402 observer, so a refused request was a silent failure.
 */
import {
  __resetQuotaRefusalForTests,
  getQuotaRefusal,
  observeQuotaRefusal,
  onBridgeQuotaExceeded,
  parseQuotaRefusal,
  safeFixPath,
  watchesQuotaOrigin,
} from './quota-refusal';
import { __resetFeatureUpgradeForTests, getFeatureUpgrade } from './feature-upgrade';
import { bridgeFetch, installQuotaRefusalObserver } from './bridge-fetch';
import { _resetBridgeInstance, getBridgeAuth, initBridge } from './bridge-instance';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const QUOTA_BODY = { statusCode: 402, code: 'QUOTA_EXCEEDED', metric: 'tickets', used: 10, limit: 10, fix: '/subscription' };

beforeEach(() => {
  __resetQuotaRefusalForTests();
  __resetFeatureUpgradeForTests();
});

describe('parseQuotaRefusal', () => {
  it('reads the bridge-nestjs body and keeps only a same-app fix path', () => {
    expect(parseQuotaRefusal(QUOTA_BODY, '/api/tickets')).toEqual({
      metric: 'tickets',
      used: 10,
      limit: 10,
      fix: '/subscription',
      message: null,
      url: '/api/tickets',
    });
    expect(parseQuotaRefusal({ ...QUOTA_BODY, fix: 'https://evil.example' })?.fix).toBeNull();
    expect(parseQuotaRefusal({ code: 'PAYMENT_REQUIRED' })).toBeNull();
    expect(parseQuotaRefusal({ code: 'QUOTA_EXCEEDED', metric: '' })).toBeNull();
  });

  it('safeFixPath refuses anything that leaves the app', () => {
    expect(safeFixPath('//evil.example')).toBeNull();
    expect(safeFixPath('/\\evil')).toBeNull();
    expect(safeFixPath('javascript:alert(1)')).toBeNull();
    expect(safeFixPath('/billing?x=1')).toBe('/billing?x=1');
  });
});

describe('observeQuotaRefusal', () => {
  it('announces a quota 402 once, to the dialog and every listener, without consuming the body', async () => {
    const heard: string[] = [];
    onBridgeQuotaExceeded((r) => heard.push(r.metric));
    const res = json(402, QUOTA_BODY);
    await observeQuotaRefusal(res, '/api/tickets');
    await observeQuotaRefusal(res, '/api/tickets');
    expect(getQuotaRefusal()?.metric).toBe('tickets');
    expect(heard).toEqual(['tickets']);
    await expect(res.json()).resolves.toMatchObject({ metric: 'tickets' });
  });

  it('a 402 FEATURE_NOT_IN_PLAN opens the feature variant', async () => {
    await observeQuotaRefusal(json(402, { code: 'FEATURE_NOT_IN_PLAN', flag: 'sso', feature: 'sso' }));
    expect(getQuotaRefusal()).toBeNull();
    expect(getFeatureUpgrade()).toEqual({ flag: 'sso', feature: 'sso', fix: null });
  });

  it('ignores anything that is not a 402 quota body', async () => {
    await observeQuotaRefusal(json(403, QUOTA_BODY));
    await observeQuotaRefusal(json(402, { error: 'card declined' }));
    await observeQuotaRefusal(new Response('not json', { status: 402 }));
    expect(getQuotaRefusal()).toBeNull();
  });
});

describe('watchesQuotaOrigin', () => {
  it("the page's origin, Bridge's API and listed origins only", () => {
    const o = { pageOrigin: 'https://app.example.com', apiBaseUrl: 'https://api.thebridge.dev', apiOrigins: ['https://api.example.com'] };
    expect(watchesQuotaOrigin('/api/x', o)).toBe(true);
    expect(watchesQuotaOrigin('https://api.thebridge.dev/usage', o)).toBe(true);
    expect(watchesQuotaOrigin('https://api.example.com/tickets', o)).toBe(true);
    expect(watchesQuotaOrigin('https://api.stripe.com/v1', o)).toBe(false);
  });
});

describe('bridgeFetch', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    _resetBridgeInstance();
  });

  it('behaves like fetch before Bridge starts, and still opens the dialog on a quota 402', async () => {
    const calls: Array<[unknown, RequestInit | undefined]> = [];
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      calls.push([input, init]);
      return json(402, QUOTA_BODY);
    }) as typeof fetch;
    const res = await bridgeFetch('https://app.example.com/api/tickets', { method: 'POST' });
    expect(res.status).toBe(402);
    expect(calls).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(getQuotaRefusal()?.url).toBe('https://app.example.com/api/tickets');
  });

  it('sends the access token, and on a 401 refreshes once and retries', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    initBridge({ appId: 'app-1', apiBaseUrl: 'http://127.0.0.1:1' });
    const auth = getBridgeAuth();
    let token = 'old';
    jest.spyOn(auth, 'getTokens').mockImplementation(() => ({ accessToken: token, refreshToken: 'r', idToken: 'i' }));
    jest.spyOn(auth, 'refreshTokens').mockImplementation(async () => {
      token = 'new';
      return { accessToken: 'new', refreshToken: 'r', idToken: 'i' };
    });
    const seen: string[] = [];
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const h = new Headers(init?.headers).get('Authorization') ?? '';
      seen.push(h);
      return h === 'Bearer new' ? json(200, { ok: true }) : json(401, {});
    }) as typeof fetch;
    const res = await bridgeFetch('https://app.example.com/api/me');
    expect(res.status).toBe(200);
    expect(seen).toEqual(['Bearer old', 'Bearer new']);
  });
});

describe('installQuotaRefusalObserver', () => {
  const g = globalThis as unknown as { window?: unknown; location?: unknown };
  const realFetch = globalThis.fetch;
  afterEach(() => {
    delete g.window;
    delete g.location;
    globalThis.fetch = realFetch;
  });

  it('a plain same-origin fetch that answers 402 opens the dialog; the response is untouched', async () => {
    const win = { fetch: (async () => json(402, QUOTA_BODY)) as typeof fetch };
    g.window = win;
    g.location = { href: 'https://app.example.com/tickets' };
    const uninstall = installQuotaRefusalObserver();
    const res = await (win.fetch as typeof fetch)('/api/tickets', { method: 'POST' });
    expect(res.status).toBe(402);
    await new Promise((r) => setTimeout(r, 0));
    expect(getQuotaRefusal()?.metric).toBe('tickets');
    await expect(res.json()).resolves.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    uninstall();
  });

  it('a 402 from a third-party origin is not the app’s plan limit', async () => {
    const win = { fetch: (async () => json(402, QUOTA_BODY)) as typeof fetch };
    g.window = win;
    g.location = { href: 'https://app.example.com/' };
    const uninstall = installQuotaRefusalObserver();
    await (win.fetch as typeof fetch)('https://api.stripe.com/v1/charges');
    await new Promise((r) => setTimeout(r, 0));
    expect(getQuotaRefusal()).toBeNull();
    uninstall();
  });
});

describe('bridge.usage — browser-side counting (the action never reaches your server)', () => {
  afterEach(() => _resetBridgeInstance());

  it('report() counts a counter and set() a gauge, through auth-core', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    initBridge({ appId: 'app-1', apiBaseUrl: 'http://127.0.0.1:1' });
    const usage = { report: jest.fn(), set: jest.fn().mockResolvedValue(undefined), getQueueStatus: jest.fn() };
    jest.spyOn(getBridgeAuth(), 'usage', 'get').mockReturnValue(usage as never);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { bridge } = require('./bridge');
    bridge.usage.report('exports');
    await bridge.usage.set('projects', 3);
    expect(usage.report).toHaveBeenCalledWith('exports', undefined, undefined);
    expect(usage.set).toHaveBeenCalledWith('projects', 3);
  });
});
