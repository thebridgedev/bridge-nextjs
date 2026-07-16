# Let users manage their billing

Give users a "Manage billing" entry point to the **Stripe billing portal**, where they can update their payment method, view invoices, or cancel. Bridge exposes the portal as a REST endpoint: `GET /account/subscription/portal` returns a one-time `portalUrl` to redirect to.

There's no SDK wrapper for it yet, so call the endpoint directly with the signed-in user's access token. The example uses the default API base URL, `https://api.thebridge.dev`; if you set `apiBaseUrl` in your bridge config, call that base URL instead.

```tsx
'use client';
import { useBridgeTokens } from '@nebulr-group/bridge-nextjs/client';

export function ManageBillingButton() {
  const tokens = useBridgeTokens();

  async function openPortal() {
    const res = await fetch('https://api.thebridge.dev/account/subscription/portal', {
      headers: {
        Authorization: `Bearer ${tokens?.accessToken}`,
        'x-app-id': process.env.NEXT_PUBLIC_BRIDGE_APP_ID!,
      },
    });
    const { portalUrl } = await res.json();
    window.location.href = portalUrl;
  }

  return <button onClick={openPortal}>Manage billing</button>;
}
```

See [Subscriptions & Entitlements → Open the billing portal](/api-reference/subscriptions/#open-the-billing-portal) for the endpoint reference.

> **Recovering from a billing problem?** You don't need this button for that. When a workspace (called a *tenant* in the API) is past due, in dunning, or billing-locked, `<BridgeBillingNotice />` already renders a recovery CTA (it sends the user to your billing page, `/billing` by default). Use this "Manage billing" button for the healthy, everyday case. See [Warn about billing problems](/billing/status/billing-notices/).
