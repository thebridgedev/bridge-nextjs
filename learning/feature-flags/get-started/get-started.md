# Get started

Bridge bootstraps flags automatically when you mount `<BridgeProvider>` — no flag-specific init call. Mount it once in your root layout:

```tsx
// app/layout.tsx
import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BridgeProvider>{children}</BridgeProvider>
      </body>
    </html>
  );
}
```

The provider wires the client rule cache, live updates, and telemetry. Configuration comes from the same BridgeAuth config the provider already uses — only `appId` is required for flags-only apps. Set it (and, optionally, the API base URL) via env:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BRIDGE_APP_ID` | Your Bridge app id — the workspace flags evaluate against. |
| `NEXT_PUBLIC_BRIDGE_API_BASE_URL` | Bridge API root (defaults to `https://api.thebridge.dev`). |

Server-side evaluation (`<ServerFeatureFlag>`, middleware, route handlers) reads the same env vars — no separate setup.

## Read your first flag

In a Client Component:

```tsx
'use client';
import { useFlag } from '@nebulr-group/bridge-nextjs/client';

export function Banner() {
  const { value } = useFlag('show_banner', false);
  return value ? <div className="banner">New stuff!</div> : null;
}
```

Create the `show_banner` flag in Control Center, flip it on, and the component re-renders live — no refresh, no redeploy.

Next: [How flags work](/feature-flags/how-it-works/).
