'use client';

// TBP-178 — dev passes per-call attributes to flag evaluation.
//
// Ported from bridge-svelte's /flag-context-demo. Exercises the path:
//   bridge.flag('enterprise-feature', false, { attributes: { plan: 'X' } })
//     → SDK merges per-call attrs with provider attrs (dev wins on collision)
//     → rule evaluator runs against merged context
//     → returns matched branch's returnValue or rule.otherwiseValue
//
// The component reaches for the raw BridgeFlags instance via
// `getBridgeFlagsInstance()` because that's the API surface that takes the
// per-call attributes argument (mirrors the svelte demo). On mount it upserts a
// local test flag (state 'on-with-rule', rule: plan == 'enterprise' → true).
//
// Playwright testids (match dev-supplied-attributes.spec.ts):
//   [data-testid="cache-ready"]  — "ready" once the flag is seeded
//   [data-testid="cache-error"]  — present (count > 0) only on a seeding error
//   [data-testid="eval-enterprise" | "eval-pro" | "eval-free"] — plan buttons
//   [data-testid="last-plan"]    — the last plan evaluated
//   [data-testid="flag-result"]  — JSON-stringified boolean result

import { useEffect, useState } from 'react';
import {
  getBridgeFlagsInstance,
  type CachedFlag,
} from '@nebulr-group/bridge-nextjs/client';
import '../page.css';

const TEST_FLAG_KEY = 'enterprise-feature';

const TEST_FLAG: CachedFlag = {
  key: TEST_FLAG_KEY,
  state: 'on-with-rule',
  valueType: 'boolean',
  offValue: false,
  onValue: true,
  rule: {
    branches: [
      {
        conditions: [
          { attribute: 'plan', operator: 'eq', values: ['enterprise'] },
        ],
        returnValue: true,
      },
    ],
    otherwiseValue: false,
    rolloutPct: 100,
  },
};

export default function FlagContextDemo() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPlan, setLastPlan] = useState<string | null>(null);
  const [result, setResult] = useState<boolean | null>(null);

  // Seed the test flag into the SDK cache on mount. Poll briefly for the global
  // instance to be registered by createBridgeFlags() (mounted by BridgeProvider).
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const seed = (): void => {
      if (cancelled) return;
      const bridge = getBridgeFlagsInstance();
      if (!bridge) {
        attempts += 1;
        if (attempts > 50) {
          setError('BridgeFlags instance not available — is <BridgeProvider> mounted?');
          return;
        }
        setTimeout(seed, 50);
        return;
      }
      try {
        bridge.upsert(TEST_FLAG);
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to seed test flag');
      }
    };

    seed();
    return () => {
      cancelled = true;
    };
  }, []);

  const evaluate = (plan: 'enterprise' | 'pro' | 'free'): void => {
    const bridge = getBridgeFlagsInstance();
    if (!bridge) {
      setError('BridgeFlags instance not available');
      return;
    }
    const r = bridge.flag<boolean>(TEST_FLAG_KEY, false, { attributes: { plan } });
    setLastPlan(plan);
    setResult(r.value);
  };

  return (
    <div className="page-container">
      <div className="container">
        <div className="content">
          <div className="hero">
            <h1 className="heading-xl">Flag context demo (dev-supplied attributes)</h1>
            <p className="text-lead">
              Passes a per-call <code>plan</code> attribute to{' '}
              <code>bridge.flag()</code>. The flag&apos;s rule matches{' '}
              <code>plan == &quot;enterprise&quot;</code>.
            </p>
          </div>

          {/* Seeding status — consumed by Playwright. */}
          <p data-testid="cache-ready">{ready ? 'ready' : 'seeding'}</p>
          {error && <p data-testid="cache-error">{error}</p>}

          <div className="feature-examples">
            <div className="feature-example">
              <div className="card">
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <button data-testid="eval-enterprise" onClick={() => evaluate('enterprise')}>
                    plan = enterprise
                  </button>
                  <button data-testid="eval-pro" onClick={() => evaluate('pro')}>
                    plan = pro
                  </button>
                  <button data-testid="eval-free" onClick={() => evaluate('free')}>
                    plan = free
                  </button>
                </div>

                <p>
                  Last plan: <strong data-testid="last-plan">{lastPlan ?? ''}</strong>
                </p>
                <p>
                  Result:{' '}
                  <strong data-testid="flag-result">
                    {result === null ? '' : String(result)}
                  </strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
