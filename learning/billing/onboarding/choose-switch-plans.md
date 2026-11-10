# Choose & switch plans

This is the self-service billing page most apps need: one place where a user picks their first plan, upgrades, downgrades, or switches billing interval. `<PlanSelector>` is the whole thing in one component. Unlike [`<BridgePaywall>`](/billing/onboarding/require-plan/), which *forces* a choice before the app loads, this is the always-available page a user visits when they choose to.

If your app has the billing catch-all from [Add billing to your app](/billing/setup/add-billing-to-your-app/), this page already exists at `/subscription`: the current plan with its renewal date and card, `<PlanSelector>`, and "Manage billing". A completed checkout lands back on `/subscription` with a confirmation banner, and so does a cancelled one (without the banner).

To build the page yourself, drop `<PlanSelector>` onto it. It loads the plans and the status of the current workspace (called a *tenant* in the API) automatically, renders plan cards, and handles free plan selection, Stripe Checkout, and plan changes.

```tsx
// app/subscription/page.tsx
'use client';
import { PlanSelector } from '@nebulr-group/bridge-nextjs/client';

export default function SubscriptionPage() {
  return <PlanSelector successUrl="/subscription" cancelUrl="/subscription" />;
}
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `heading` | `string` | (none) | A heading above the plans, beside the Monthly/Yearly switch |
| `successUrl` | `string` | `billing.successRoute`, else `'/subscription'` | Where to land after a successful payment or a Free pick; relative paths are resolved against the current origin. Render `<BridgeCheckoutNotice />` there to confirm it |
| `cancelUrl` | `string` | the current page | Where to land if the user cancels checkout; relative paths are resolved against the current origin |
| `defaultInterval` | `'month' \| 'year' \| 'week' \| 'day'` | `'year'` | The interval selected first when the plans offer more than one |
| `onSelect` | `({ plan, price }) => void` | (none) | Called after a free plan is selected or a plan change completes. On a Free pick, passing it takes over what happens next: no navigation and no banner |
| `planCard` | `(ctx: { plan, prices, isCurrent, interval, onPick }) => ReactNode` | (none) | Override the default plan card layout |
| `emptyState` | `ReactNode` | (none) | Override the "plans could not be loaded" message and its Try again button |
| `loadingState` | `ReactNode` | (none) | Override the loading spinner |

All standard `HTMLAttributes<HTMLDivElement>` props (`className`, `style`, `data-*`, etc.) are forwarded to the root element.

**Custom plan card:**

The default plan cards follow your `--bridge-*` tokens (see [Theming](/theming/)): each card has a large price, its features with check marks, and a button that says "Choose", "Upgrade to" or "Switch to", and the current plan is marked in your primary colour. If you want a different card altogether, pass a **`planCard` render prop** and render the cards yourself. You get the plan data and a ready-made pick handler, and Bridge still owns the free-select / checkout / change branching. You only write markup; you never touch the SDK. Here's an example:

```tsx
'use client';
import { PlanSelector, type Plan, type PriceOfferSdk } from '@nebulr-group/bridge-nextjs/client';

export default function SubscriptionPage() {
  return (
    <PlanSelector
      successUrl="/subscription"
      cancelUrl="/subscription"
      planCard={({ plan, prices, isCurrent, onPick }) => (
        <div className={`plan-card${isCurrent ? ' current' : ''}`}>
          <h2>{plan.name}</h2>
          {plan.trial && (
            <span className="badge">Free {plan.trialDays}-day trial</span>
          )}
          {prices.map((price) => (
            <button
              key={price.recurrenceInterval + price.currency}
              disabled={isCurrent}
              onClick={() => onPick(price)}
            >
              {price.amount === 0 ? 'Free' : `${price.amount} ${price.currency.toUpperCase()} / ${price.recurrenceInterval}`}
            </button>
          ))}
        </div>
      )}
    />
  );
}
```

The render prop is called once per plan and receives one object with five fields:

| Field | Type | What it's for |
|-----------|------|---------------|
| `plan` | `Plan` | The plan to render: `key`, `name`, `description`, `trial`, `trialDays`, etc. |
| `prices` | `PriceOfferSdk[]` | The plan's price offers (`amount`, `currency`, `recurrenceInterval`); one button per price is the usual layout |
| `isCurrent` | `boolean` | `true` when this is the workspace's current plan; use it to highlight the card and disable its buttons |
| `interval` | `'month' \| 'year' \| …` | The interval selected in the Monthly/Yearly switch |
| `onPick` | `(price: PriceOfferSdk) => void` | The pick handler; call it with the chosen price when the user clicks |

All you have to wire is calling **`onPick(price)`**; the component figures out whether that's a free selection, a paid checkout, or a plan change. Under the hood, `onPick(price)` branches on the price and the workspace's payment state:

- `price.amount === 0` (and no metered cost) → calls `selectFreePlan`, refreshes the store, then lands on `successUrl` with the confirmation banner
- paid + `paymentsEnabled` → asks "Change plan?" first; on confirm calls `changePlan`, refreshes the store and says "You're now on …" in place
- paid + no payment method yet → calls `startCheckout`, launches Stripe Checkout, which returns to `successUrl`

> **Tip:** Keep your render prop purely presentational. Don't call `selectFreePlan`, `changePlan`, or `startCheckout` yourself: `onPick` already routes to the right one, and calling `onSelect` on the `<PlanSelector>` is how you react after a free selection or plan change completes.

**Data attributes for CSS styling:**

| Attribute | Values | When set |
|-----------|--------|----------|
| `data-bridge-plan-selector` | (no value) | Always present on root |
| `data-loading` | `"true"` / `"false"` | Loading + in-flight pick state |
| `data-state` | `"idle"` `"select-plan"` `"active"` `"trial"` `"payment-failed"` `"setup-payments"` | Current status |
| `data-bridge-plan-card` | (no value) | On each plan card |
| `data-current` | `"true"` / `"false"` | Whether this card is the current plan |
| `data-trial` | `"true"` / `"false"` | Whether this plan has a trial |
