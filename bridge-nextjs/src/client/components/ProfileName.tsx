'use client';

import type { HTMLAttributes } from 'react';
import { useBridgeStore } from '../../core/bridge-instance';

/**
 * Displays the current user's full name (or email fallback) when authenticated.
 * Renders nothing when no profile is loaded.
 *
 * Ports `bridge-svelte/src/lib/client/components/ProfileName.svelte`. The data
 * source is the bridge Zustand store — the component re-renders automatically
 * when `auth:profile` fires.
 */
export function ProfileName({
  className,
  style,
  ...rest
}: HTMLAttributes<HTMLSpanElement>): JSX.Element | null {
  const profile = useBridgeStore((s) => s.profile);
  const displayName = profile?.fullName || profile?.email || '';
  if (!displayName) return null;
  return (
    <span className={className} style={style} data-bridge-profile-name {...rest}>
      {displayName}
    </span>
  );
}

export default ProfileName;
