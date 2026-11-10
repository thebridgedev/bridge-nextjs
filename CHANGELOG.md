# Changelog

## [0.9.0] - 2026-11-10

### Changed

- **After checkout, people land back in the app.** A completed checkout or a Free plan pick now returns to the subscription page with a "You're on Pro now" banner, with no separate confirmation step. Set `billing.successRoute` to land on any page of your app, and put `<BridgeCheckoutNotice />` there for the same banner, or read `useCheckoutResult()` for a message of your own. The old confirmation page at `/subscription/success` still works for apps that point to it. Before, a Free pick left the person on the plan picker. (TBP-946)
- **A subscription page that fits your app.** Plan cards and the current-plan panel have their own surface built from your `--bridge-*` tokens, so they look right on any app background. Prices are shown large and formatted for their currency, buttons say "Choose", "Upgrade to" or "Switch to", the current plan is marked in your primary colour, each plan lists its features, plans are sorted cheapest first with a Monthly/Yearly switch when both are offered, and the current plan's renewal date and card are shown. Plan buttons no longer read "Select free plan" or "29 USD / month", so tests that match that text need updating. (TBP-946)
- **Bridge pages follow your app's text.** Every text size on the sign-in and subscription pages now scales from your page's body text size, alongside the font family and text colour they already inherited. At the usual 16px nothing changes; set `--bridge-font-size` to size Bridge text differently. (TBP-946)
- **Your CSS always wins.** Bridge's styles now live in a CSS cascade layer named `bridge`, so any normal CSS you write against a Bridge class or data attribute overrides it, whatever the load order or specificity, with no `!important`. CSS inside one of your own layers declared before `bridge`, including Tailwind utility classes on Bridge's elements, still ranks below it. Tailwind v4's reset can no longer strip Bridge's buttons. (TBP-946)
- **Check your global reset when you upgrade.** Because unlayered CSS now wins, a reset such as create-next-app's `* { padding: 0; margin: 0 }` and `a { color: inherit }`, or Tailwind v3's preflight, also wins over Bridge's buttons and inputs. Put such a reset inside `@layer base { ... }` and Bridge looks as before. (TBP-946)
- **Billing banners and the plan badge take your colours.** `<BridgeBillingNotice>`, `<BridgeQuotaBanner>`, the billing lockscreen and `<BridgeSubscriptionStatus>` now use the `--bridge-alert-*` and other tokens, as in the other Bridge packages, instead of fixed colours. (TBP-946)

### Added

- **Weight and shadow settings.** `--bridge-font-weight-heading`, `--bridge-font-weight-button`, `--bridge-font-weight-label` and `--bridge-button-shadow` let an app with heavy type or hard drop shadows carry that look onto the Bridge pages. `--bridge-card-bg` and `--bridge-card-shadow` tune the plan cards. Every default is the previous look. (TBP-946)
- **"Change plan?" before an instant switch.** A workspace that already pays now confirms a plan change in a dialog before it takes effect, and sees "You're now on Team" once it has. Before, one click switched the plan straight away. (TBP-946)
- **A retry when the plans don't load.** An empty plan list shows "The plans could not be loaded." with a Try again button, instead of "No plans available". (TBP-946)
- **`<PlanSelector>` options.** `heading` puts a title beside the Monthly/Yearly switch, `defaultInterval` picks the interval shown first, and `planCard` also receives the selected `interval`. (TBP-946)

## [0.8.2] - 2026-11-09

### Fixed

- **A plan limit closes as soon as it is reached.** After `bridge.usage.report()` uses up a hard limit, `<QuotaGate>` and `useQuota()` show it within a couple of seconds, without a reload. Before, the SDK queued one `bridge.flag_evaluations` count per flag on every render, ahead of the app's own report, so a busy page could hold that report back for many seconds and a Free workspace could go past its limit. The SDK now adds those counts up and sends them about once a second, with the same total. (TBP-942)

## [0.8.1] - 2026-11-04

### Fixed

- **A finished-looking sign-in page.** The show-password toggle on the sign-in and set-password pages is an eye icon instead of an emoji. "Sign in with Passkeys" and "Sign in with Magic Link" carry icons like the other sign-in buttons, and "Sign in with Magic Link" is a button, centred and no longer underlined. The sign-in pages now look the same as in the other Bridge packages.
- **Sign-in links match your app.** "Sign up", "Log in" and the other text links on the sign-in pages take the form's text colour and font, instead of the browser's default blue.

## [0.8.0] - 2026-09-30

### Added

- **The ten-line integration.** `createBridgeConfig()` reads your `NEXT_PUBLIC_BRIDGE_*` settings, one `app/auth/[...bridge]/page.tsx` serves every sign-in page and one `app/subscription/[...bridge]/page.tsx` serves the subscription pages and the paywall. To replace one of those pages with your own, create it. The separate provider wrapper and hand-written callback route are no longer needed.
- **Plan limit components and hooks.** Quota and entitlement components and hooks now match the other Bridge frameworks, and a request refused for a plan limit opens the upgrade dialog.
- **A feature that is off says why.** When a flag keeps something off, your app learns whether it is not on the plan (the upgrade dialog opens), not allowed for this person (they are told to ask an admin), or switched off (it is simply hidden).
- **Flag rules on the server.** A flag rule about a plan, role or privilege now gives the same answer on the server as in the browser, with no extra wiring.
- **Seat limits on the team page.** The built-in team page stops invitations once the workspace reaches its plan's seat limit.

### Changed

- **Breaking: new integration shape.** Options you pass explicitly now take precedence over environment settings, and the package requires `@nebulr-group/bridge-auth-core` 0.8.0. Move your sign-in and subscription pages to the two catch-all routes above and set up with `createBridgeConfig()`.

### Fixed

- **Hosted sign-in pages on staging.** An app pointed at a staging API now sends sign-in to that environment's hosted pages instead of production's.
- **Billing screens after checkout.** Returning from Stripe checkout shows the new plan straight away instead of "Subscription unavailable" until a reload, a paid checkout stays paid, and the billing pages ask for sign-in.
- **Live updates during a reconnect.** A change to a person's plan, role or access made while the live connection was reconnecting is no longer missed.

## [0.7.4] - 2026-09-26

### Fixed

- **Session snapshot on first connection.** After sign-in, the workspace name and id, the branding and the entitlements now appear immediately. Previously they stayed empty, so every entitlement check answered no and a paywall built on one would lock everyone out.
- **Live updates and browser usage reporting.** Live updates now connect, so plans, entitlements and usage counters refresh without a page reload, and usage reported from the browser is recorded. Previously the browser rejected these calls, so live updates never connected and browser-side usage reports were lost.
- **Documentation links.** Three pages in the guides linked to addresses with no page behind them; they now resolve.
