/**
 * @jest-environment jsdom
 *
 * TBP-631 — the description-suppression contract.
 *
 * Regression: `heading={null}` suppressed the heading but NOT the
 * `<p class="bridge-step-desc">` description, which lived in each component's
 * own markup outside AuthFormWrapper's heading guard. A host app that wrote its
 * own page title and subtitle got Bridge's description printed underneath — the
 * same sentence twice, in two voices (live in NorthWhistle on /auth/magic-link
 * and /auth/forgot-password).
 *
 * TBP-631 shipped in bridge-nextjs 0.6.0 with no tests at all in this package.
 * The code was right; nothing defended it. This file is that defence, modelled
 * on bridge-svelte's auth-form-description.test.ts.
 *
 * The five things being pinned down, per component:
 *   1. a `description` prop exists and defaults to today's catalogue copy
 *   2. `null` / `''` renders NO description element — not an empty <p> holding
 *      vertical space, which is the exact failure mode TBP-631 had to avoid
 *   3. a string replaces the default
 *   4. `heading` and `description` are INDEPENDENT, in both directions
 *   5. passing neither prop is non-breaking
 *
 * Suppression is asserted on the ABSENCE of the `bridge-step-desc` class, never
 * on missing text: `<p class="bridge-step-desc"></p>` contains no text and
 * still occupies the space the ticket was filed about.
 *
 * The deliberate shape throughout the components is
 * `description !== undefined ? description : t(key)` — `undefined` keeps the
 * default, `null` suppresses. It cannot collapse to `??`, so several cases here
 * pass `null` and `''` separately to hold that distinction in place.
 *
 * HARNESS — no @testing-library/react in this package, so this uses
 * createRoot + React's `act` directly, the same way selector-i18n.test.tsx
 * does. Views behind private state (MagicLink post-send, MfaSetup's verify and
 * backup steps, PasskeyRequestSetupLink's 'sent' view, PasskeySetup's success,
 * SignupForm's success) are reached by driving the REAL interaction against a
 * stubbed API, not by seeding state — so the markup asserted below is produced
 * by the shipped components and the shipped wrapper.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { en } from '@nebulr-group/bridge-auth-core';

import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { MagicLink } from './MagicLink';
import { ForgotPassword } from './ForgotPassword';
import { MfaSetup } from './MfaSetup';
import { MfaChallenge } from './MfaChallenge';
import { PasskeyRequestSetupLink } from './PasskeyRequestSetupLink';
import { PasskeySetup } from './PasskeySetup';
import { SignupForm } from './SignupForm';
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
const realError = console.error;
beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  // ensureAppConfig() reaches for an unreachable apiBaseUrl by design here.
  console.warn = () => {};
  console.error = () => {};
});
afterAll(() => {
  console.warn = realWarn;
  console.error = realError;
});

let container: HTMLElement;
let root: Root | null = null;

function boot(): void {
  _resetBridgeInstance();
  initBridge({
    appId: 'tbp-631',
    apiBaseUrl: 'http://127.0.0.1:1',
  } as unknown as BridgeConfig);
}

/** Stub one or more methods on the BridgeAuth singleton. */
function stubApi(methods: Record<string, unknown>): void {
  Object.assign(getBridgeAuth() as never as Record<string, unknown>, methods);
}

async function mount(element: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
}

/** Set a React-controlled input's value the way a user typing would. */
async function type(selector: string, value: string): Promise<void> {
  const input = container.querySelector(selector) as HTMLInputElement | null;
  if (!input) throw new Error(`No input matched ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(selector: string): Promise<void> {
  const form = container.querySelector(selector);
  if (!form) throw new Error(`No form matched ${selector}`);
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
}

async function click(selector: string): Promise<void> {
  const el = container.querySelector(selector);
  if (!el) throw new Error(`No element matched ${selector}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

/** Let an awaited handler settle and re-render. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  boot();
});

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  container?.remove();
  _resetBridgeInstance();
});

// ---------------------------------------------------------------------------
// Assertion helpers — read the rendered DOM, not the source.
// ---------------------------------------------------------------------------

const html = (): string => container.innerHTML;

/** Inner HTML of every `<p class="bridge-step-desc">`, in render order. */
function descriptionHtml(): string[] {
  return [...container.querySelectorAll('p.bridge-step-desc')].map((p) => p.innerHTML);
}

/** Visible text of every description paragraph, in render order. */
function descriptionText(): string[] {
  return [...container.querySelectorAll('p.bridge-step-desc')].map((p) =>
    (p.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

function headingText(): string[] {
  return [...container.querySelectorAll('h2.bridge-auth-heading')].map((h) =>
    (h.textContent ?? '').trim(),
  );
}

function successHeadingText(): string[] {
  return [...container.querySelectorAll('h2.bridge-success-heading')].map((h) =>
    (h.textContent ?? '').trim(),
  );
}

/**
 * The element must be GONE, not present-but-empty. Asserting on the class
 * substring rather than on absent text is the whole point: an empty
 * `<p class="bridge-step-desc"></p>` holds vertical space and still reads as
 * the bug.
 */
function expectNoDescriptionElement(): void {
  expect(html()).not.toContain('bridge-step-desc');
}

// Catalogue copy the components resolve to when nothing is passed. Read from
// `en` rather than retyped, so a copy edit does not fail these for the wrong
// reason — but the KEY is named explicitly, so a component silently switching
// to a different key does fail.
const MAGIC_LINK_DESC = en['magicLink.description'];
const FORGOT_DESC = en['forgot.description'];
const MFA_DESC = {
  phone: en['mfaSetup.phoneDescription'],
  verify: en['mfaSetup.verifyDescription'],
  backup: en['mfaSetup.backupDescription'],
} as const;
const PASSKEY_REQUEST_FORM_DESC = en['passkey.requestDescription'];
const PASSKEY_SETUP_DESC = en['passkey.setupClickPrompt'];

// ===========================================================================
// AuthFormWrapper — the guard itself
// ===========================================================================

describe('AuthFormWrapper description guard (TBP-631)', () => {
  const children = <form id="wrapper-children" />;

  it('renders heading and description together by default', async () => {
    await mount(
      <AuthFormWrapper heading="My heading" description="My description">
        {children}
      </AuthFormWrapper>,
    );
    expect(headingText()).toEqual(['My heading']);
    expect(descriptionText()).toEqual(['My description']);
  });

  it('heading={null} drops the heading and keeps the description', async () => {
    await mount(
      <AuthFormWrapper heading={null} description="My description">
        {children}
      </AuthFormWrapper>,
    );
    expect(html()).not.toContain('bridge-auth-heading');
    expect(descriptionText()).toEqual(['My description']);
  });

  it('description={null} drops the description element and keeps the heading', async () => {
    await mount(
      <AuthFormWrapper heading="My heading" description={null}>
        {children}
      </AuthFormWrapper>,
    );
    expectNoDescriptionElement();
    expect(headingText()).toEqual(['My heading']);
  });

  it("description='' is treated as suppression, same as null", async () => {
    await mount(
      <AuthFormWrapper heading="My heading" description="">
        {children}
      </AuthFormWrapper>,
    );
    expectNoDescriptionElement();
    expect(headingText()).toEqual(['My heading']);
  });

  it('suppressing both leaves the wrapper and its children intact', async () => {
    await mount(
      <AuthFormWrapper heading={null} description={null}>
        {children}
      </AuthFormWrapper>,
    );
    expect(html()).not.toContain('bridge-auth-heading');
    expectNoDescriptionElement();
    expect(container.querySelector('[data-bridge-auth-form]')).not.toBeNull();
    expect(container.querySelector('#wrapper-children')).not.toBeNull();
  });

  it('descriptionSlot carries markup and wins over the description string', async () => {
    await mount(
      <AuthFormWrapper
        heading="My heading"
        description="plain string that must lose"
        descriptionSlot={
          <p className="bridge-step-desc">
            Sent to <strong>a@b.com</strong>.
          </p>
        }
      >
        {children}
      </AuthFormWrapper>,
    );
    expect(descriptionHtml()).toEqual(['Sent to <strong>a@b.com</strong>.']);
    expect(html()).not.toContain('plain string that must lose');
  });
});

// ===========================================================================
// MagicLink
// ===========================================================================

describe('MagicLink description (TBP-631)', () => {
  it('renders the built-in heading and description when neither prop is passed', async () => {
    await mount(<MagicLink />);
    expect(headingText()).toEqual([en['magicLink.heading']]);
    expect(descriptionText()).toEqual([MAGIC_LINK_DESC]);
  });

  it('heading={null} removes the heading but leaves the description', async () => {
    await mount(<MagicLink heading={null} />);
    expect(html()).not.toContain('bridge-auth-heading');
    expect(descriptionText()).toEqual([MAGIC_LINK_DESC]);
  });

  it('description={null} removes the description element but leaves the heading and form', async () => {
    await mount(<MagicLink description={null} />);
    expectNoDescriptionElement();
    expect(headingText()).toEqual([en['magicLink.heading']]);
    expect(container.querySelector('#magic-email')).not.toBeNull();
  });

  it("description='' suppresses it too", async () => {
    await mount(<MagicLink description="" />);
    expectNoDescriptionElement();
    expect(headingText()).toEqual([en['magicLink.heading']]);
  });

  it('suppressing both leaves no heading, no description and no empty paragraph', async () => {
    await mount(<MagicLink heading={null} description={null} />);
    expect(html()).not.toContain('bridge-auth-heading');
    expectNoDescriptionElement();
    expect(container.querySelector('[data-bridge-auth-form]')).not.toBeNull();
    expect(container.querySelector('#magic-email')).not.toBeNull();
  });

  it('a string override replaces the built-in description, heading untouched', async () => {
    await mount(<MagicLink description="We will email you a link." />);
    expect(descriptionText()).toEqual(['We will email you a link.']);
    expect(html()).not.toContain(MAGIC_LINK_DESC);
    expect(headingText()).toEqual([en['magicLink.heading']]);
  });

  it('drops the description on the post-send view even when it was never overridden', async () => {
    stubApi({ sendMagicLink: () => Promise.resolve({ expiresIn: 600 }) });
    await mount(<MagicLink />);
    await type('#magic-email', 'user@example.com');
    await submit('form');

    expectNoDescriptionElement();
    expect(html()).not.toContain('bridge-auth-heading');
    expect(container.textContent).toContain('Check your email');
  });
});

// ===========================================================================
// ForgotPassword
// ===========================================================================

describe('ForgotPassword description (TBP-631)', () => {
  it('renders the built-in heading and description when neither prop is passed', async () => {
    await mount(<ForgotPassword />);
    expect(headingText()).toEqual([en['forgot.headingRequest']]);
    expect(descriptionText()).toEqual([FORGOT_DESC]);
  });

  it('heading={null} removes the heading but leaves the description', async () => {
    await mount(<ForgotPassword heading={null} />);
    expect(html()).not.toContain('bridge-auth-heading');
    expect(descriptionText()).toEqual([FORGOT_DESC]);
  });

  it('description={null} removes the description element but leaves the heading and form', async () => {
    await mount(<ForgotPassword description={null} />);
    expectNoDescriptionElement();
    expect(headingText()).toEqual([en['forgot.headingRequest']]);
    expect(container.querySelector('#reset-email')).not.toBeNull();
  });

  it("description='' suppresses it too", async () => {
    await mount(<ForgotPassword description="" />);
    expectNoDescriptionElement();
    expect(headingText()).toEqual([en['forgot.headingRequest']]);
  });

  it('suppressing both leaves no heading, no description and no empty paragraph', async () => {
    await mount(<ForgotPassword heading={null} description={null} />);
    expect(html()).not.toContain('bridge-auth-heading');
    expectNoDescriptionElement();
    expect(container.querySelector('[data-bridge-auth-form]')).not.toBeNull();
    expect(container.querySelector('#reset-email')).not.toBeNull();
  });

  it('a string override replaces the built-in description', async () => {
    await mount(<ForgotPassword description="Tell us your email." />);
    expect(descriptionText()).toEqual(['Tell us your email.']);
    expect(html()).not.toContain(FORGOT_DESC);
  });

  it('carries no description in set-password mode, and an override cannot force one in', async () => {
    await mount(<ForgotPassword token="reset-token" />);
    expectNoDescriptionElement();
    expect(headingText()).toEqual([en['forgot.headingSet']]);
    expect(container.querySelector('#newPassword')).not.toBeNull();

    const current = root;
    root = null;
    if (current) await act(async () => current.unmount());
    container.remove();

    await mount(
      <ForgotPassword token="reset-token" description="Should not appear on this step." />,
    );
    expectNoDescriptionElement();
    expect(html()).not.toContain('Should not appear on this step.');
    expect(headingText()).toEqual([en['forgot.headingSet']]);
  });

  it('drops the description once the reset email has been sent', async () => {
    stubApi({ sendResetPasswordLink: () => Promise.resolve(undefined) });
    await mount(<ForgotPassword />);
    await type('#reset-email', 'user@example.com');
    await submit('form');

    expectNoDescriptionElement();
    expect(html()).not.toContain('bridge-auth-heading');
    expect(container.textContent).toContain(en['forgot.emailSent']);
  });
});

// ===========================================================================
// MfaSetup — three step descriptions, one wrapper
// ===========================================================================

describe('MfaSetup description (TBP-631)', () => {
  const STEPS = ['phone', 'verify', 'backup'] as const;

  const ANCHOR: Record<(typeof STEPS)[number], string> = {
    phone: '#mfa-phone',
    verify: '#mfa-verify-code',
    backup: '.bridge-backup-code',
  };

  /** Mount MfaSetup with `props` and drive it to `step` through real clicks. */
  async function mountAtStep(
    step: (typeof STEPS)[number],
    props: Record<string, unknown> = {},
  ): Promise<void> {
    stubApi({
      setupMfa: () => Promise.resolve(undefined),
      confirmMfaSetup: () => Promise.resolve({ backupCode: 'BACKUP-1234' }),
    });
    await mount(<MfaSetup {...props} />);
    if (step === 'phone') return;

    await type('#mfa-phone', '+46700000000');
    await submit('form');
    if (step === 'verify') return;

    await type('#mfa-verify-code', '123456');
    await submit('form');
  }

  for (const step of STEPS) {
    describe(`step "${step}"`, () => {
      it("renders that step's own built-in description", async () => {
        await mountAtStep(step);
        expect(descriptionText()).toEqual([MFA_DESC[step]]);
        expect(headingText()).toEqual([en['mfaSetup.heading']]);
        expect(container.querySelector(ANCHOR[step])).not.toBeNull();
      });

      it('description={null} removes it while the step body still renders', async () => {
        await mountAtStep(step, { description: null });
        expectNoDescriptionElement();
        expect(headingText()).toEqual([en['mfaSetup.heading']]);
        expect(container.querySelector(ANCHOR[step])).not.toBeNull();
      });

      it("description='' suppresses it too", async () => {
        await mountAtStep(step, { description: '' });
        expectNoDescriptionElement();
        expect(headingText()).toEqual([en['mfaSetup.heading']]);
      });

      it('a single string override applies to this step', async () => {
        await mountAtStep(step, { description: 'One line for every step.' });
        expect(descriptionText()).toEqual(['One line for every step.']);
        expect(html()).not.toContain(MFA_DESC[step]);
        expect(container.querySelector(ANCHOR[step])).not.toBeNull();
      });

      it('heading={null} leaves this step description standing', async () => {
        await mountAtStep(step, { heading: null });
        expect(html()).not.toContain('bridge-auth-heading');
        expect(descriptionText()).toEqual([MFA_DESC[step]]);
      });
    });
  }

  it('advances the built-in description as the step changes', async () => {
    // The three descriptions share one wrapper, so the component — not the
    // wrapper — has to resolve the right one per step. Pin that it actually
    // moves rather than freezing on whichever it resolved first.
    await mountAtStep('phone');
    expect(descriptionText()).toEqual([MFA_DESC.phone]);

    await type('#mfa-phone', '+46700000000');
    await submit('form');
    expect(descriptionText()).toEqual([MFA_DESC.verify]);

    await type('#mfa-verify-code', '123456');
    await submit('form');
    expect(descriptionText()).toEqual([MFA_DESC.backup]);
  });
});

// ===========================================================================
// PasskeyRequestSetupLink — two views, two wrappers
// ===========================================================================

describe('PasskeyRequestSetupLink description (TBP-631)', () => {
  const EMAIL = 'user@example.com';

  async function mountView(
    view: 'form' | 'sent',
    props: Record<string, unknown> = {},
  ): Promise<void> {
    stubApi({ sendPasskeySetupLink: () => Promise.resolve(undefined) });
    await mount(<PasskeyRequestSetupLink initialEmail={EMAIL} {...props} />);
    if (view === 'sent') await submit('form');
  }

  describe("view 'form'", () => {
    it('renders the built-in description', async () => {
      await mountView('form');
      expect(descriptionText()).toEqual([PASSKEY_REQUEST_FORM_DESC]);
      expect(headingText()).toEqual([en['passkey.createHeading']]);
    });

    it('description={null} removes it while the form still renders', async () => {
      await mountView('form', { description: null });
      expectNoDescriptionElement();
      expect(headingText()).toEqual([en['passkey.createHeading']]);
      expect(container.querySelector('#passkey-request-email')).not.toBeNull();
    });

    it("description='' suppresses it too", async () => {
      await mountView('form', { description: '' });
      expectNoDescriptionElement();
      expect(headingText()).toEqual([en['passkey.createHeading']]);
    });

    it('a string override replaces the built-in description', async () => {
      await mountView('form', { description: 'We will email a link.' });
      expect(descriptionText()).toEqual(['We will email a link.']);
      expect(html()).not.toContain(PASSKEY_REQUEST_FORM_DESC);
    });

    it('heading={null} leaves the description standing', async () => {
      await mountView('form', { heading: null });
      expect(html()).not.toContain('bridge-auth-heading');
      expect(descriptionText()).toEqual([PASSKEY_REQUEST_FORM_DESC]);
    });
  });

  describe("view 'sent'", () => {
    const expected = en['passkey.sentDescription'].replace(
      '{email}',
      `<strong>${EMAIL}</strong>`,
    );

    it('renders the built-in description through the slot, keeping the <strong> email', async () => {
      await mountView('sent');
      expect(descriptionHtml()).toEqual([expected]);
      expect(headingText()).toEqual([en['passkey.sentHeading']]);
    });

    it('description={null} removes it while the heading and back link still render', async () => {
      await mountView('sent', { description: null });
      expectNoDescriptionElement();
      expect(headingText()).toEqual([en['passkey.sentHeading']]);
      expect(container.textContent).toContain(en['action.backToLogin']);
    });

    it("description='' suppresses it too", async () => {
      await mountView('sent', { description: '' });
      expectNoDescriptionElement();
      expect(headingText()).toEqual([en['passkey.sentHeading']]);
    });

    it('a string override replaces the slot, losing the <strong> emphasis', async () => {
      await mountView('sent', { description: 'Link sent. Check your inbox.' });
      expect(descriptionHtml()).toEqual(['Link sent. Check your inbox.']);
      expect(html()).not.toContain('<strong>');
      expect(headingText()).toEqual([en['passkey.sentHeading']]);
    });
  });
});

// ===========================================================================
// PasskeySetup
// ===========================================================================

describe('PasskeySetup description (TBP-631)', () => {
  const TOKEN = 'setup-token';

  it('renders the built-in heading and description when neither prop is passed', async () => {
    await mount(<PasskeySetup token={TOKEN} />);
    expect(headingText()).toEqual([en['passkey.setupHeading']]);
    expect(descriptionText()).toEqual([PASSKEY_SETUP_DESC]);
  });

  it('description={null} removes the paragraph but keeps the heading and the button', async () => {
    await mount(<PasskeySetup token={TOKEN} description={null} />);
    expectNoDescriptionElement();
    expect(headingText()).toEqual([en['passkey.setupHeading']]);
    expect(container.querySelector('button.bridge-btn-primary')).not.toBeNull();
  });

  it("description='' suppresses it too", async () => {
    await mount(<PasskeySetup token={TOKEN} description="" />);
    expectNoDescriptionElement();
    expect(headingText()).toEqual([en['passkey.setupHeading']]);
  });

  it('heading={null} removes the heading but leaves the description', async () => {
    await mount(<PasskeySetup token={TOKEN} heading={null} />);
    expect(html()).not.toContain('bridge-auth-heading');
    expect(descriptionText()).toEqual([PASSKEY_SETUP_DESC]);
  });

  it('a string override replaces the built-in description', async () => {
    await mount(<PasskeySetup token={TOKEN} description="Confirm on your device." />);
    expect(descriptionText()).toEqual(['Confirm on your device.']);
    expect(html()).not.toContain(PASSKEY_SETUP_DESC);
  });

  it('carries no description on the success view', async () => {
    stubApi({ registerPasskeyWithToken: () => Promise.resolve(undefined) });
    await mount(<PasskeySetup token={TOKEN} />);
    await click('button.bridge-btn-primary');

    expectNoDescriptionElement();
    expect(headingText()).toEqual([en['passkey.setupSuccessHeading']]);
  });
});

// ===========================================================================
// SignupForm — guarded in place, below the success heading (NOT lifted)
// ===========================================================================

describe('SignupForm description (TBP-631)', () => {
  const EMAIL = 'user@example.com';
  const expectedDefault = en['signup.successDescription'].replace(
    '{email}',
    `<strong>${EMAIL}</strong>`,
  );

  async function mountSuccess(props: Record<string, unknown> = {}): Promise<void> {
    stubApi({ signup: () => Promise.resolve(undefined) });
    await mount(<SignupForm loginHref="/login" {...props} />);
    await type('#signup-email', EMAIL);
    await submit('form');
  }

  it('the pre-submit form carries no description at all', async () => {
    await mount(<SignupForm loginHref="/login" />);
    expectNoDescriptionElement();
    expect(headingText()).toEqual([en['signup.heading']]);
    expect(container.querySelector('#signup-email')).not.toBeNull();
  });

  it('keeps the <strong> email in the default success description', async () => {
    await mountSuccess();
    expect(descriptionHtml()).toEqual([expectedDefault]);
    expect(successHeadingText()).toEqual([en['signup.successHeading']]);
  });

  it('renders the description below the success heading it belongs to, not above it', async () => {
    await mountSuccess();
    expect(html().indexOf('bridge-success-heading')).toBeGreaterThan(-1);
    expect(html().indexOf('bridge-step-desc')).toBeGreaterThan(
      html().indexOf('bridge-success-heading'),
    );
  });

  it('a string override replaces the default and loses the <strong> emphasis', async () => {
    await mountSuccess({ description: 'Check your inbox to finish signing up.' });
    expect(descriptionHtml()).toEqual(['Check your inbox to finish signing up.']);
    expect(html()).not.toContain('<strong>');
    expect(successHeadingText()).toEqual([en['signup.successHeading']]);
  });

  it('description={null} removes it while the success heading and footer still render', async () => {
    await mountSuccess({ description: null });
    expectNoDescriptionElement();
    expect(successHeadingText()).toEqual([en['signup.successHeading']]);
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it("description='' suppresses it too", async () => {
    await mountSuccess({ description: '' });
    expectNoDescriptionElement();
    expect(successHeadingText()).toEqual([en['signup.successHeading']]);
  });
});

// ===========================================================================
// The two components that render no description — out of scope for the prop,
// and pinned so the feature does not silently grow into them.
// ===========================================================================

describe('components that carry no description (TBP-631)', () => {
  it('LoginForm renders no bridge-step-desc', async () => {
    await mount(<LoginForm />);
    expectNoDescriptionElement();
  });

  it('MfaChallenge renders no bridge-step-desc', async () => {
    useBridgeStore.setState({ authState: 'mfa-required' } as never);
    await mount(<MfaChallenge />);
    expectNoDescriptionElement();
  });
});
