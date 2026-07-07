# Tokens

A drop-in component for managing API tokens. Renders a complete token management UI.

**Usage:**

```tsx
// app/settings/api-tokens/page.tsx
'use client';
import { ApiTokenManagement } from '@nebulr-group/bridge-nextjs/client';

export default function ApiTokensPage() {
  return <ApiTokenManagement className="my-token-panel" />;
}
```

The component provides:
- List of existing API tokens
- Create new tokens with a privilege picker (searchable)
- Revoke tokens with confirmation
- Display a new token value once after creation (show/hide/copy)
- Token expiry date display

No additional props are required beyond standard `HTMLAttributes<HTMLDivElement>` props (`className`, `style`, etc.), which are forwarded to the root element.
