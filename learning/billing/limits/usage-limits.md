# Show usage limits in your app

Where an [entitlement](/billing/limits/lock-features/) is a yes/no switch, a **quota** is a metered allowance that a workspace (called a *tenant* in the API) can run down and hit: 10,000 AI calls a month, 20 seats. Quotas are **defined on the plan**; see [Define your plans](/billing/setup/define-plans/) for setting them. This page covers showing quota state in your app and reacting as usage climbs. To submit the usage that fills these quotas, see [Report usage](/billing/limits/report-usage/).

`<BridgeQuotaBanner>` warns users as they approach a metric's cap so a hard stop never comes as a surprise, and it nudges them to upgrade. It's a live usage-cap banner for one metric: it renders nothing while usage is below 80% of the plan's quota (or when the plan has no quota for that metric), shows a warning at 80–94%, critical at 95%+, and over-cap copy when the limit is exceeded. It updates live on `quota.updated` pushes.

```tsx
'use client';
import { BridgeQuotaBanner } from '@nebulr-group/bridge-nextjs/client';

export function AiQuotaBanner() {
  return <BridgeQuotaBanner metric="ai_completions" />;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `metric` | `string` | required | Metric key to watch |
| `label` | `string` | metric key | Humanized display label |
| `className` | `string` | `''` | Class applied to the root element |
| `onActionClick` | `(snap) => void` | (none) | Override the default Upgrade CTA handler |
| `actionHref` | `string` | `billing.manageRoute` config → `/subscription` | Upgrade CTA destination for this instance; `onActionClick` takes precedence |

By default the Upgrade CTA navigates to `billing.manageRoute` from the `<BridgeProvider>` config, which defaults to `/subscription` — the page `app/subscription/[[...bridge]]/page.tsx` serves.

## Three ways to handle a limit

Pick the lowest level that does the job. Level 0 is on without code.

| Level | What the page writes | What the user sees |
|---|---|---|
| **0 — nothing** | a button calling your API with `bridgeFetch()` | Your backend refuses at the cap (`402 QUOTA_EXCEEDED`, bridge-nestjs `@RequireQuota`), and `<BridgeProvider>` opens an **upgrade dialog** naming the metric, linking to the subscription page. A member who cannot manage billing is told to ask the workspace owner |
| **1 — one component** | `<QuotaGate metric="tickets">…</QuotaGate>` around the button; `<FeatureFlag flagKey="analytics" defaultValue={false} upgrade>` around a paid feature | The button is disabled at a known hard cap with an upgrade line beside it; a feature off because of the plan shows "Upgrade to use this", which opens the dialog when clicked |
| **2 — your own UI** | `useQuota('tickets')` | Whatever you build from the live numbers |

```tsx
'use client';
import { bridgeFetch, FeatureFlag, QuotaGate, useQuota } from '@nebulr-group/bridge-nextjs/client';

export function Tickets() {
  const tickets = useQuota('tickets');
  const create = () => bridgeFetch('/api/tickets', { method: 'POST' }); // level 0

  return (
    <>
      {/* level 1 */}
      <QuotaGate metric="tickets">
        <button onClick={create}>New ticket</button>
      </QuotaGate>

      {/* the flag's rule: bridge:billing.entitlement.analytics eq true */}
      <FeatureFlag flagKey="analytics" defaultValue={false} upgrade>
        <a href="/analytics">Analytics</a>
      </FeatureFlag>

      {/* level 2 */}
      {tickets.loading ? 'Loading…' : tickets.unlimited ? 'Unlimited tickets' : `${tickets.used} of ${tickets.limit} tickets`}
    </>
  );
}
```

- "Not loaded yet" is never "zero" and never "not allowed": `useQuota` numbers stay `null` while `loading`, and `<QuotaGate>` stays enabled while loading, for a metered quota, and when the plan has no quota on the metric.
- No upgrade dialog opens by itself: it opens on a `402` your backend sends, or when someone clicks an upgrade prompt.
- A plain `fetch` to your own origin that answers `402 QUOTA_EXCEEDED` opens the dialog too; a backend on another origin called with plain `fetch` is listed in `billing: { apiOrigins: [...] }`. `billing: { upgradeDialog: false }` turns the dialog off (render your own from `useUpgradeRequest()`); `billing: { upgradeDialog: MyDialog }` replaces it (pass that from a Client Component).

## Reading quota state yourself

`useQuota(metric)` (level 2 above) is the supported read. The lower-level snapshot is still available:

```ts
import { useBridgeBilling } from '@nebulr-group/bridge-nextjs/client';

const q = useBridgeBilling().quota('ai_completions');
// undefined while loading (first call triggers a fetch), then:
// q?.used, q?.limit, q?.remaining, q?.warningLevel ('approaching' | 'critical' | null)
```

> **Note:** `useBridgeBilling` is the underlying `@nebulr-group/bridge-auth-core` factory, re-exported under an alias. Prefer `useQuota`, which re-renders on every push and keeps "loading" apart from "no quota on this plan".
