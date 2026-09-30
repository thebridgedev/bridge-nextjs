/**
 * @jest-environment jsdom
 *
 * TBP-763 — seat limits on the built-in team page. Seats are a gauge Bridge
 * counts from membership (the quota snapshot says `source: 'membership'`), and
 * Bridge's invite API does not refuse at the limit, so with `seatsMetric` the
 * page stops at the plan's cap itself and re-reads the count after a change.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useBridge } from '@nebulr-group/bridge-auth-core';

import { TeamUserList } from './TeamUserList';
import { TeamAddUserDialog } from './TeamAddUserDialog';
import { inviteSeatError, seatsAtLimitMessage, seatsLeftOf } from './seats';
import { getBridgeAuth, initBridge, _resetBridgeInstance } from '../../../core/bridge-instance';
import type { BridgeConfig } from '../../../shared/types/config';

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;
const g = globalThis as unknown as Record<string, unknown>;

const seats = (used: number, limit: number, extra: Record<string, unknown> = {}) => ({
  metric: 'seats',
  used,
  limit,
  remaining: limit - used,
  policy: 'hard' as const,
  kind: 'gauge' as const,
  source: 'membership' as const,
  warningLevel: null,
  ...extra,
});

describe('inviteSeatError', () => {
  it('fits → null; unknown remaining → null (no guessing)', () => {
    expect(inviteSeatError(2, 2)).toBeNull();
    expect(inviteSeatError(5, null)).toBeNull();
    expect(inviteSeatError(5, undefined)).toBeNull();
  });
  it('no seat left, and more addresses than seats', () => {
    expect(inviteSeatError(1, 0)).toBe('All seats on your plan are taken. Upgrade your plan to invite more people.');
    expect(inviteSeatError(3, 1)).toBe(
      'Your plan has 1 seat left, and this invites 3. Invite fewer people or upgrade your plan.',
    );
  });
});

describe('seatsLeftOf / seatsAtLimitMessage', () => {
  const snap = (x: Record<string, unknown>) => ({ ...seats(5, 5), percent_used: 1, label: 'seats', ...x }) as never;
  it('a metered quota bills extra seats instead of refusing them', () => {
    expect(seatsLeftOf(snap({ policy: 'metered' }))).toBeNull();
    expect(seatsLeftOf(undefined)).toBeNull();
    expect(seatsLeftOf(snap({}))).toBe(0);
  });
  it('says pending invites count when Bridge counts from membership', () => {
    expect(seatsAtLimitMessage(snap({}))).toBe('All 5 seats on your plan are taken (pending invites count).');
    expect(seatsAtLimitMessage(snap({ source: undefined }))).toBe('All 5 seats on your plan are taken.');
  });
});

describe('the team page with seatsMetric', () => {
  let container: HTMLElement;
  let root: Root | null = null;
  const spies: Array<{ mockRestore(): void }> = [];

  const realError = console.error;
  const realWarn = console.warn;
  beforeAll(() => {
    g.IS_REACT_ACT_ENVIRONMENT = true;
    // getAppConfig has no network here; keep the run readable.
    console.error = () => {};
    console.warn = () => {};
    // jsdom has no modal <dialog>.
    const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void };
    proto.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  afterAll(() => {
    console.error = realError;
    console.warn = realWarn;
  });

  beforeEach(() => {
    _resetBridgeInstance();
    initBridge({ appId: 'tbp-763', apiBaseUrl: 'http://127.0.0.1:1' } as unknown as BridgeConfig);
    useBridge().quotas.__resetForTests();
    const team = getBridgeAuth().team;
    spies.push(
      jest.spyOn(team, 'listUsers').mockResolvedValue({ users: [] } as never),
      jest.spyOn(team, 'listUserRoles').mockResolvedValue([] as never),
    );
  });

  afterEach(async () => {
    const current = root;
    root = null;
    if (current) await act(async () => current.unmount());
    container?.remove();
    for (const s of spies.splice(0)) s.mockRestore();
    useBridge().quotas.__resetForTests();
    _resetBridgeInstance();
  });

  async function mount(element: React.ReactElement): Promise<void> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(element);
    });
  }
  const addButton = () =>
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Add Member') as HTMLButtonElement;

  it('at the limit, Add Member is disabled and the page says why', async () => {
    useBridge().quotas.applyInitialSnapshot('seats', seats(5, 5));
    await mount(<TeamUserList seatsMetric="seats" />);
    expect(addButton().disabled).toBe(true);
    expect(container.querySelector('[data-bridge-seats-at-limit]')?.textContent).toBe(
      'All 5 seats on your plan are taken (pending invites count).',
    );
  });

  it('a live seat update that frees a seat re-enables Add Member', async () => {
    useBridge().quotas.applyInitialSnapshot('seats', seats(5, 5));
    await mount(<TeamUserList seatsMetric="seats" />);
    await act(async () => {
      useBridge().quotas.applyInitialSnapshot('seats', seats(4, 5));
    });
    expect(addButton().disabled).toBe(false);
    expect(container.querySelector('[data-bridge-seats-at-limit]')).toBeNull();
  });

  it('without seatsMetric nothing changes: no cap, no quota read', async () => {
    useBridge().quotas.applyInitialSnapshot('seats', seats(5, 5));
    await mount(<TeamUserList />);
    expect(addButton().disabled).toBe(false);
    expect(container.querySelector('[data-bridge-seats-at-limit]')).toBeNull();
  });

  it('an invite of more addresses than seats left is refused before it is sent', async () => {
    const createUsers = jest.spyOn(getBridgeAuth().team, 'createUsers').mockResolvedValue([] as never);
    spies.push(createUsers);
    await mount(<TeamAddUserDialog open seatsLeft={1} />);
    const textarea = container.querySelector('textarea')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'a@x.test, b@x.test');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Add Members')!;
    await act(async () => {
      submit.click();
    });
    expect(createUsers).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Your plan has 1 seat left, and this invites 2.');
  });

  it('after an invite the seat count is re-read', async () => {
    const reconcile = jest.spyOn(useBridge().quotas, 'reconcileAfterReport').mockImplementation(() => {});
    const createUsers = jest
      .spyOn(getBridgeAuth().team, 'createUsers')
      .mockResolvedValue([{ id: 'u2', email: 'b@x.test', enabled: true }] as never);
    spies.push(reconcile, createUsers);
    useBridge().quotas.applyInitialSnapshot('seats', seats(3, 5));
    await mount(<TeamUserList seatsMetric="seats" />);
    await act(async () => {
      addButton().click();
    });
    const textarea = container.querySelector('textarea')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'b@x.test');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Add Members')!;
    await act(async () => {
      submit.click();
    });
    expect(createUsers).toHaveBeenCalledWith(['b@x.test']);
    expect(reconcile).toHaveBeenCalledWith('seats', 0);
  });
});
