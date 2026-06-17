import { NextRequest, NextResponse } from 'next/server';
import { requireFeatureFlagForRoute } from '@nebulr-group/bridge-nextjs/server';

/**
 * API route gated by the `demo-flag` feature flag (FF 2.0 server route handler).
 * `requireFeatureFlagForRoute` evaluates the flag locally (backend-mode
 * BridgeFlags + pull cache) against the request's token claims, returns 403 when
 * off, and propagates the eval context downstream via `x-bridge-context`.
 */
export function GET(request: NextRequest) {
  return requireFeatureFlagForRoute('demo-flag', async () => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    return NextResponse.json({
      date: formattedDate,
      time: formattedTime,
      timestamp: now.getTime(),
      message:
        'This data is protected by the demo-flag feature flag — if you see this message the flag is enabled',
    });
  })(request);
}
