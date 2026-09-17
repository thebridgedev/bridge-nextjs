/**
 * @jest-environment jsdom
 *
 * TenantSelector, WorkspaceSelector and SsoButton were missed by TBP-630's
 * original i18n sweep and again by the TBP-633 port, so they still rendered
 * English after everything around them had been translated. TenantSelector is
 * the one that stings: it renders MID-LOGIN on the multi-workspace path,
 * putting one English screen between a translated login form and a translated
 * app (TBP-634).
 *
 * Every error string below is produced by driving the REAL failure path — a
 * click on a stubbed API that rejects — not by seeding component state. A
 * component can hold the right key in its markup and still assign an English
 * literal in its catch block, and only the second is what a user in Swedish
 * actually hits.
 *
 * No @testing-library/react in this package, so this uses createRoot + React's
 * `act` directly, the same way strictmode-remount.test.tsx does.
 */
import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { en, sv } from '@nebulr-group/bridge-auth-core';

import { TenantSelector } from './TenantSelector';
import { WorkspaceSelector } from './WorkspaceSelector';
import { SsoButton } from './SsoButton';
import { LoginForm } from './LoginForm';
import {
  getBridgeAuth,
  initBridge,
  useBridgeStore,
  _resetBridgeInstance,
} from '../../../core/bridge-instance';
import type { BridgeConfig } from '../../../shared/types/config';

const act = (React as unknown as { act: (cb: () => Promise<void>) => Promise<void> }).act;

const g = globalThis as unknown as Record<string, unknown>;

const realWarn = console.warn;
beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  // The resolver warns once per unsupported locale by design (TBP-633); the
  // 'klingon' case below exercises that path deliberately.
  console.warn = () => {};
});
afterAll(() => {
  console.warn = realWarn;
});

let container: HTMLElement;
let root: Root | null = null;

function boot(locale?: string): void {
  _resetBridgeInstance();
  initBridge({ appId: 'tbp-634', apiBaseUrl: 'http://127.0.0.1:1', locale } as unknown as BridgeConfig);
}

async function mount(element: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
}

async function click(selector: string): Promise<void> {
  const el = container.querySelector(selector);
  if (!el) throw new Error(`No element matched ${selector}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** Let a rejected promise inside a handler settle and re-render. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const text = (): string => container.textContent ?? '';

beforeEach(() => {
  useBridgeStore.setState({ tenantUsers: [], profile: null } as never);
});

afterEach(async () => {
  // Inside act(): unmount schedules a synchronous React update, and outside act
  // React 18 prints a warning for every test. It is noise, but noise that hides
  // the next real one.
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  _resetBridgeInstance();
});

const TENANT = {
  id: 'tu-1',
  fullName: 'Ada Lovelace',
  tenant: { id: 't-1', name: 'Acme', logo: null },
};

const WORKSPACE = {
  id: 'ws-1',
  fullName: 'Ada Lovelace',
  tenant: { id: 't-1', name: 'Acme', logo: null },
};

const CONNECTION = { id: 'google', type: 'google', name: 'Google' } as never;

// ---------------------------------------------------------------------------

describe('TenantSelector heading (TBP-634)', () => {
  it('renders the English heading when no locale is set', async () => {
    boot(undefined);
    await mount(<TenantSelector />);
    expect(text()).toContain(en['tenant.chooseHeading']);
  });

  it('renders the Swedish heading at locale sv', async () => {
    boot('sv');
    await mount(<TenantSelector />);
    expect(text()).toContain(sv['tenant.chooseHeading']);
    // Gone, not merely joined by the Swedish — a component rendering both
    // would satisfy a `toContain` on the Swedish alone.
    expect(text()).not.toContain(en['tenant.chooseHeading']);
  });

  it('lets a per-component override beat the locale', async () => {
    boot('sv');
    await mount(<TenantSelector messages={{ 'tenant.chooseHeading': 'Välj kund' }} />);
    expect(text()).toContain('Välj kund');
    expect(text()).not.toContain(sv['tenant.chooseHeading']);
  });

  it('never renders the raw key, in any locale', async () => {
    for (const locale of ['sv', 'de', 'klingon', undefined]) {
      boot(locale);
      await mount(<TenantSelector />);
      expect(text()).not.toContain('tenant.chooseHeading');
      const current = root;
      root = null;
      if (current) await act(async () => current.unmount());
      container.remove();
    }
  });
});

describe('TenantSelector select failure (TBP-634)', () => {
  it('shows the Swedish error when selectTenant rejects', async () => {
    boot('sv');
    useBridgeStore.setState({ tenantUsers: [TENANT] } as never);
    // Rejects with no message, so the component falls through to the
    // catalogue. An API error that DOES carry one is still shown verbatim —
    // that is server copy, not ours.
    (getBridgeAuth() as never as Record<string, unknown>).selectTenant = () =>
      Promise.reject(new Error(''));

    await mount(<TenantSelector />);
    await click('.bridge-tenant-item');
    await settle();

    expect(text()).toContain(sv['tenant.error.select']);
    expect(text()).not.toContain(en['tenant.error.select']);
  });

  it('shows the English error when no locale is set', async () => {
    boot(undefined);
    useBridgeStore.setState({ tenantUsers: [TENANT] } as never);
    (getBridgeAuth() as never as Record<string, unknown>).selectTenant = () =>
      Promise.reject(new Error(''));

    await mount(<TenantSelector />);
    await click('.bridge-tenant-item');
    await settle();

    expect(text()).toContain(en['tenant.error.select']);
  });
});

describe('WorkspaceSelector errors (TBP-634)', () => {
  it('shows the Swedish load error when getWorkspaces rejects', async () => {
    boot('sv');
    (getBridgeAuth() as never as Record<string, unknown>).getWorkspaces = () =>
      Promise.reject(new Error(''));

    await mount(<WorkspaceSelector />);
    await settle();

    expect(text()).toContain(sv['workspace.error.load']);
    expect(text()).not.toContain(en['workspace.error.load']);
  });

  it('shows the Swedish switch error when switchWorkspace rejects', async () => {
    boot('sv');
    const api = getBridgeAuth() as never as Record<string, unknown>;
    api.getWorkspaces = () => Promise.resolve([WORKSPACE]);
    api.switchWorkspace = () => Promise.reject(new Error(''));

    await mount(<WorkspaceSelector />);
    await settle();
    await click('[data-bridge-workspace-item]');
    await settle();

    expect(text()).toContain(sv['workspace.error.switch']);
    expect(text()).not.toContain(en['workspace.error.switch']);
  });

  it('shows the English load error when no locale is set', async () => {
    boot(undefined);
    (getBridgeAuth() as never as Record<string, unknown>).getWorkspaces = () =>
      Promise.reject(new Error(''));

    await mount(<WorkspaceSelector />);
    await settle();

    expect(text()).toContain(en['workspace.error.load']);
  });
});

describe('SsoButton label (TBP-634)', () => {
  it('interpolates the provider name into the localised label', async () => {
    boot('sv');
    await mount(<SsoButton connection={CONNECTION} />);
    expect(text()).toContain(sv['sso.continueWith'].replace('{provider}', 'Google'));
    expect(text()).not.toContain('{provider}');
    expect(text()).not.toContain(en['sso.continueWith'].replace('{provider}', 'Google'));
  });

  it('still lets the app supply its own label — that is voice, not mechanics', async () => {
    boot('sv');
    await mount(<SsoButton connection={CONNECTION} label="Logga in med jobbkontot" />);
    expect(text()).toContain('Logga in med jobbkontot');
    expect(text()).not.toContain(sv['sso.continueWith'].split('{')[0].trim());
  });

  it('falls back to English for an unsupported locale, never to the key', async () => {
    boot('klingon');
    await mount(<SsoButton connection={CONNECTION} />);
    expect(text()).toContain(en['sso.continueWith'].replace('{provider}', 'Google'));
    expect(text()).not.toContain('sso.continueWith');
  });
});

describe('SsoButton errors (TBP-634)', () => {
  async function capture(
    stub: () => Promise<unknown>,
  ): Promise<Error | null> {
    (getBridgeAuth() as never as Record<string, unknown>).startSsoLogin = stub;
    let reported: Error | null = null;
    await mount(
      <SsoButton connection={CONNECTION} onError={(e: Error) => (reported = e)} />,
    );
    await click('button');
    await settle();
    return reported;
  }

  it('reports the pop-up-blocked error in Swedish', async () => {
    boot('sv');
    const reported = await capture(() => Promise.reject(new Error('popup closed by user')));
    expect(reported?.message).toBe(sv['sso.error.popupBlocked']);
  });

  it('reports the generic SSO failure in Swedish', async () => {
    boot('sv');
    const reported = await capture(() =>
      Promise.resolve({ type: 'auth_error', error: '' }),
    );
    expect(reported?.message).toBe(sv['sso.error.login']);
  });

  it('still surfaces a server-supplied message verbatim', async () => {
    // The catalogue is the FALLBACK. A server that explains what went wrong
    // must not have its explanation replaced by a generic translated one.
    boot('sv');
    const reported = await capture(() =>
      Promise.reject(new Error('Connection is disabled for this tenant')),
    );
    expect(reported?.message).toBe('Connection is disabled for this tenant');
  });
});

// ===========================================================================
// LoginForm messages fan-out (TBP-634)
//
// SsoButton declared `messages?: MessageOverrides`, used it, and LoginForm
// simply never passed it — so a per-component override reached MfaChallenge,
// MfaSetup, TenantSelector and PasskeyLogin but died at the SSO buttons.
//
// The obvious fix is a test per child. That reproduces the exact blind spot
// that shipped the bug: the list is written by hand, so the child nobody
// thought of is the child nobody tests. This DERIVES the list instead — read
// LoginForm's own imports, keep the ones whose source declares a `messages`
// prop, and require every one of them to be driven. Adding a sixth
// messages-taking child to LoginForm fails this suite until it is wired up and
// given a driver, which is the failure that was missing.
//
// Each case asserts BEHAVIOUR, not source text: the child is rendered through
// a real LoginForm in the auth state that shows it, and the override has to
// come out the other end as visible copy.
// ===========================================================================

const SDK_AUTH_DIR = path.join(__dirname);

/** Component names LoginForm imports from its own directory. */
function loginFormChildImports(): string[] {
  const source = fs.readFileSync(path.join(SDK_AUTH_DIR, 'LoginForm.tsx'), 'utf8');
  const names = new Set<string>();
  // `import { Foo } from './Foo';` and `from './shared/Foo';`
  for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'(\.\/[^']+)'/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

/** Does `<dir>/<name>.tsx` declare a `messages` prop of its own? */
function declaresMessagesProp(name: string): boolean {
  for (const rel of [`${name}.tsx`, path.join('shared', `${name}.tsx`)]) {
    const full = path.join(SDK_AUTH_DIR, rel);
    if (!fs.existsSync(full)) continue;
    return /^\s*messages\?:\s*MessageOverrides;/m.test(fs.readFileSync(full, 'utf8'));
  }
  return false;
}

const MESSAGE_TAKING_CHILDREN = loginFormChildImports().filter(declaresMessagesProp).sort();

/**
 * How to make LoginForm render each child, and a key that child renders, so the
 * override can be observed as visible copy rather than inferred from markup.
 */
const FAN_OUT_DRIVERS: Record<
  string,
  {
    props?: Record<string, unknown>;
    state?: Record<string, unknown>;
    key: string;
    override: string;
    expect: string;
    /** The built-in copy the override must have displaced. */
    displaces: string;
  }
> = {
  MfaChallenge: {
    state: { authState: 'mfa-required' },
    key: 'mfa.challengeHeading',
    override: 'ÖVERRIDE tvåfaktor',
    expect: 'ÖVERRIDE tvåfaktor',
    displaces: sv['mfa.challengeHeading'],
  },
  MfaSetup: {
    state: { authState: 'mfa-setup-required' },
    key: 'mfaSetup.heading',
    override: 'ÖVERRIDE ställ in tvåfaktor',
    expect: 'ÖVERRIDE ställ in tvåfaktor',
    displaces: sv['mfaSetup.heading'],
  },
  TenantSelector: {
    state: { authState: 'tenant-selection', tenantUsers: [TENANT] },
    key: 'tenant.chooseHeading',
    override: 'ÖVERRIDE välj kund',
    expect: 'ÖVERRIDE välj kund',
    displaces: sv['tenant.chooseHeading'],
  },
  PasskeyLogin: {
    props: { showPasskeys: true },
    key: 'passkey.loginButton',
    override: 'ÖVERRIDE logga in med nyckel',
    expect: 'ÖVERRIDE logga in med nyckel',
    displaces: sv['passkey.loginButton'],
  },
  SsoButton: {
    // The one that was missed. Rendered only when LoginForm has connections
    // AND no `onSsoClick` — the app-supplied handler branch renders a plain
    // button instead, which is why the SsoButton path is easy to overlook.
    props: { ssoConnections: [CONNECTION] },
    key: 'sso.continueWith',
    override: 'ÖVERRIDE fortsätt via {provider}',
    expect: 'ÖVERRIDE fortsätt via Google',
    displaces: sv['sso.continueWith'].replace('{provider}', 'Google'),
  },
};

describe('LoginForm messages fan-out (TBP-634)', () => {
  it('derives a sane list of messages-taking children from LoginForm itself', () => {
    // Without this the derivation could silently resolve to [] — every
    // generated case would then pass by never running.
    expect(MESSAGE_TAKING_CHILDREN.length).toBeGreaterThanOrEqual(2);
    expect(MESSAGE_TAKING_CHILDREN).toContain('TenantSelector');
    expect(MESSAGE_TAKING_CHILDREN).toContain('SsoButton');
    // And children that take no `messages` must not have crept in, or the
    // filter is passing everything.
    expect(MESSAGE_TAKING_CHILDREN).not.toContain('SsoProviderIcon');
    expect(MESSAGE_TAKING_CHILDREN).not.toContain('Spinner');
  });

  it('has a driver for every messages-taking child it imports', () => {
    // A new child added to LoginForm lands here first. Wire a driver rather
    // than deleting the name — an untested fan-out is the whole bug.
    expect(MESSAGE_TAKING_CHILDREN.filter((c) => !FAN_OUT_DRIVERS[c])).toEqual([]);
  });

  for (const child of MESSAGE_TAKING_CHILDREN) {
    it(`fans messages down to ${child}`, async () => {
      const driver = FAN_OUT_DRIVERS[child];
      if (!driver) throw new Error(`No fan-out driver for ${child}`);

      boot('sv');
      if (driver.state) useBridgeStore.setState(driver.state as never);

      await mount(
        <LoginForm
          {...(driver.props ?? {})}
          messages={{ [driver.key]: driver.override } as never}
        />,
      );

      expect(text()).toContain(driver.expect);
      // Displaced, not merely accompanied — a child that ignored `messages`
      // and rendered the catalogue copy alongside would pass a `toContain`
      // on the override alone if the override happened to appear elsewhere.
      expect(text()).not.toContain(driver.displaces);
    });
  }
});
