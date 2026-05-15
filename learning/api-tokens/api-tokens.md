# API Tokens

Long-lived JWT tokens for programmatic access to the Bridge API.

## In-app management

```tsx
'use client';
import { ApiTokenManagement } from '@nebulr-group/bridge-nextjs/client';

export default function DeveloperSettingsPage() {
  return <ApiTokenManagement />;
}
```

`<ApiTokenManagement>` provides:
- **List** existing tokens (name, privileges, created/expiry dates).
- **Create** a new token (with name, privilege picker, optional expiry).
- **Revoke** tokens.

When a token is created, it's shown **once** with a "copy to clipboard" button — the raw JWT is never retrievable again.

## Privileges

Privileges are loaded from `getBridgeAuth().apiTokens.listAvailablePrivileges()`. Define them in your Bridge admin UI.

## Programmatic API

```tsx
import { getBridgeAuth } from '@nebulr-group/bridge-nextjs/client';

const tokens = await getBridgeAuth().apiTokens.listTokens();
const { token, record } = await getBridgeAuth().apiTokens.createToken({
  name: 'CI pipeline',
  privileges: ['accounts.read', 'flags.read'],
  expireAt: '2026-12-31',
});
await getBridgeAuth().apiTokens.revokeToken(record.id);
```

## Common pitfalls

- **Token shown once.** If the user dismisses the dialog without copying, they cannot retrieve the JWT — they have to revoke and create a new one.
- **Privileges are app-specific.** A token issued by app A cannot be used to access app B's resources.
