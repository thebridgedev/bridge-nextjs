# Theming

`@nebulr-group/bridge-nextjs` ships unstyled structural CSS by default. You opt in via:

```tsx
import '@nebulr-group/bridge-nextjs/styles';
```

Add this once in `app/layout.tsx`.

## CSS variables (overridable)

```css
:root {
  --bridge-primary: #4f46e5;
  --bridge-primary-hover: #4338ca;
  --bridge-primary-fg: #ffffff;
  --bridge-border: #d1d5db;
  --bridge-border-radius: 6px;
  --bridge-input-focus: #4f46e5;
  --bridge-alert-error-bg: #fef2f2;
  --bridge-alert-error-fg: #991b1b;
  --bridge-alert-error-border: #fca5a5;
  --bridge-alert-success-bg: #f0fdf4;
  --bridge-alert-success-fg: #166534;
  --bridge-alert-success-border: #86efac;
}
```

Override any of these in your own CSS to match your brand.

## Headless usage (no styles)

Skip the styles import. Components render as plain HTML — use the `data-bridge-*` attributes for your own selectors:

| Attribute | Component |
|---|---|
| `data-bridge-alert` | `<Alert>` |
| `data-bridge-spinner` | `<Spinner>` |
| `data-bridge-auth-form` | `<AuthFormWrapper>` |
| `data-bridge-team-panel` | `<TeamManagementPanel>` |
| `data-bridge-team-users` | `<TeamUserList>` |
| `data-bridge-plan-selector` | `<PlanSelector>` |
| `data-bridge-plan-card` | each card in `<PlanSelector>` |
| `data-bridge-sso-button` | `<SsoButton>` |
| `data-bridge-sso-icon` | `<SsoProviderIcon>` |
| `data-bridge-passkey-login` | `<PasskeyLogin>` |
| `data-bridge-workspace-selector` | `<WorkspaceSelector>` |
| `data-bridge-api-tokens` | `<ApiTokenManagement>` |

State variants:

| Selector | Meaning |
|---|---|
| `[data-active="true"]` | active tab / workspace |
| `[data-loading="true"]` | request in flight |
| `[data-state="active"]` | active status |
| `[data-state="disabled"]` | disabled status |
| `[data-variant="error"]` | error variant |
| `[data-variant="info"]` | info variant |
| `[data-variant="success"]` | success variant |
| `[data-variant="danger"]` | danger variant |

## Tailwind / custom CSS

The default styles import is plain CSS — it doesn't conflict with Tailwind or your design system. Override via:
1. CSS variables (preferred for color/radius/border tweaks).
2. Targeting `data-bridge-*` selectors in your own CSS.
3. Passing `className`/`style` props (every exported component accepts them).
