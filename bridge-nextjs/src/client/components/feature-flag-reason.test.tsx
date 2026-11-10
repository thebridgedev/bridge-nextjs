/**
 * @jest-environment jsdom
 *
 * TBP-756 — `<FeatureFlag>`'s fallback learns WHY the feature is off, so an app
 * can offer an upgrade for `reason: 'plan'` and nothing for a permission.
 *
 * Rendered in the browser: since TBP-948 the server render shows the `loading`
 * slot (it cannot know the session), see startup-gates.test.tsx.
 */
import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { FlagEvalResult } from '@nebulr-group/bridge-auth-core';

let mockResult: FlagEvalResult<boolean> = { passed: false, value: false };

jest.mock('../../flags/registry', () => ({
  evaluateFlag: () => mockResult,
  subscribeToFlagChanges: () => () => {},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FeatureFlag } = require('./FeatureFlag');

/** The markup a browser render of `element` produces. */
function renderToStaticMarkup(element: React.ReactElement): string {
  const container = document.createElement('div');
  const root = createRoot(container);
  flushSync(() => root.render(element));
  const html = container.innerHTML;
  root.unmount();
  return html;
}

const render = () =>
  renderToStaticMarkup(
    <FeatureFlag
      flagKey="reports"
      defaultValue={false}
      fallback={(_v: boolean, off: { reason?: string; feature?: string }) =>
        off.reason === 'plan' ? <button>Upgrade for {off.feature}</button> : <span>off:{String(off.reason)}</span>
      }
    >
      <b>Reports</b>
    </FeatureFlag>,
  );

describe('<FeatureFlag> fallback reason (TBP-756)', () => {
  it('a feature off because of the plan tells the fallback, with the plan feature', () => {
    mockResult = { passed: false, value: false, reason: 'plan', feature: 'reports' };
    expect(render()).toBe('<button>Upgrade for reports</button>');
  });

  it('a feature off for a permission reason says so, and offers no upgrade', () => {
    mockResult = { passed: false, value: false, reason: 'permission' };
    expect(render()).toBe('<span>off:permission</span>');
  });

  it('a flag Bridge has not decided yet gives no reason', () => {
    mockResult = { passed: false, value: false };
    expect(render()).toBe('<span>off:undefined</span>');
  });

  it('a feature that is on renders the children', () => {
    mockResult = { passed: true, value: true };
    expect(render()).toBe('<b>Reports</b>');
  });

  it('a plain-node fallback still renders as before', () => {
    mockResult = { passed: false, value: false, reason: 'plan' };
    expect(
      renderToStaticMarkup(
        <FeatureFlag flagKey="reports" defaultValue={false} fallback={<i>nope</i>}>
          <b>Reports</b>
        </FeatureFlag>,
      ),
    ).toBe('<i>nope</i>');
  });
});
