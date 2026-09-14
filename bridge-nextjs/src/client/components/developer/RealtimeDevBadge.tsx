'use client';

/**
 * TBP-644 — development-only "Live updates off — why?" corner badge.
 *
 * `<BridgeProvider>` mounts this automatically. It renders only in development
 * builds (`process.env.NODE_ENV !== 'production'`) and only while live updates
 * are actually off: refused (`unauthorized`), connected but deaf (`degraded`),
 * or retrying for longer than 30 s. Opt out with `config.devBadge: false`.
 *
 * Styled inline so it neither needs `@nebulr-group/bridge-react/styles` nor
 * picks anything up from the host app's CSS.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useRealtimeStatusDetail } from '../../../core/realtime-status';
import {
  REALTIME_BADGE_RETRYING_AFTER_MS,
  createRetryClock,
  isDevBuild,
  realtimeBadgeView,
} from '../../../core/realtime-dev-badge';

export interface RealtimeDevBadgeProps {
  /** Set false to never render (the provider passes `config.devBadge`). Default true. */
  enabled?: boolean;
}

const PANEL_ID = 'bridge-realtime-dev-badge-panel';

const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const s = {
  root: {
    position: 'fixed',
    right: 16,
    bottom: 16,
    zIndex: 2147483000,
    margin: 0,
    padding: 0,
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 1.4,
    fontWeight: 400,
    letterSpacing: 'normal',
    textTransform: 'none',
    textAlign: 'left',
    color: '#f5f5f5',
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  },
  badge: {
    display: 'block',
    maxWidth: 'min(360px, calc(100vw - 32px))',
    margin: 0,
    padding: 0,
    background: '#1f2328',
    border: '1px solid #3d444d',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
  },
  bar: { display: 'flex', alignItems: 'center' },
  button: {
    appearance: 'none',
    margin: 0,
    padding: '6px 10px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
  },
  dot: { color: '#f85149' },
  panel: { display: 'block', padding: '4px 10px 10px', borderTop: '1px solid #3d444d' },
  row: { display: 'flex', gap: 8, paddingTop: 6 },
  label: { flex: '0 0 72px', color: '#9198a1' },
  code: { fontFamily: MONO, overflowWrap: 'anywhere' },
  link: { display: 'inline-block', marginTop: 8, color: '#58a6ff', textDecoration: 'underline' },
  note: { display: 'block', marginTop: 8, color: '#9198a1', fontSize: 11 },
} satisfies Record<string, CSSProperties>;

/**
 * The badge. Renders nothing in production builds or when `enabled` is false —
 * checked before any hook runs, so a production tree never subscribes.
 */
export function RealtimeDevBadge({ enabled = true }: RealtimeDevBadgeProps) {
  if (!enabled || !isDevBuild()) return null;
  return <RealtimeDevBadgeView />;
}

function RealtimeDevBadgeView() {
  const status = useRealtimeStatusDetail();
  const clockRef = useRef(createRetryClock());
  // Start of the current retry run — stable across the closed/connecting flips
  // inside one episode (see createRetryClock). Idempotent for a given status,
  // so StrictMode's double-invoke is harmless.
  const retryingSince = useMemo(() => clockRef.current(status, Date.now()), [status]);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | undefined>(undefined);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Tick `now` once the retrying threshold passes — nothing else re-renders.
  useEffect(() => {
    if (retryingSince === undefined) return;
    const remaining = retryingSince + REALTIME_BADGE_RETRYING_AFTER_MS - Date.now();
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, remaining) + 50);
    return () => clearTimeout(timer);
  }, [retryingSince]);

  const view = realtimeBadgeView(status, retryingSince, now);
  const visible = !!view && view.key !== dismissedKey;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && expanded) {
      setExpanded(false);
      toggleRef.current?.focus();
    }
  };

  return (
    <div style={s.root} data-testid="bridge-realtime-dev-badge-root">
      <span role="status" aria-live="polite" style={s.srOnly}>
        {visible && view ? `Bridge live updates are off: ${view.reason}` : ''}
      </span>
      {visible && view && (
        <aside
          style={s.badge}
          aria-label="Bridge live updates (development only)"
          data-testid="bridge-realtime-dev-badge"
          onKeyDown={onKeyDown}
        >
          <div style={s.bar}>
            <button
              ref={toggleRef}
              type="button"
              style={{ ...s.button, flex: 1 }}
              aria-expanded={expanded}
              aria-controls={PANEL_ID}
              onClick={() => setExpanded((e) => !e)}
            >
              <span style={s.dot} aria-hidden="true">
                ●
              </span>{' '}
              Live updates off — why?
            </button>
            <button
              type="button"
              style={{ ...s.button, fontSize: 14, lineHeight: 1, color: '#b0b8c1' }}
              aria-label="Dismiss the live updates notice"
              onClick={() => {
                setDismissedKey(view.key);
                setExpanded(false);
              }}
            >
              ×
            </button>
          </div>
          {expanded && (
            <div id={PANEL_ID} style={s.panel}>
              <div style={s.row}>
                <span style={s.label}>Reason</span>
                <code style={s.code}>{view.reason}</code>
              </div>
              <div style={s.row}>
                <span style={s.label}>Whose side</span>
                <span>{view.sideLabel}</span>
              </div>
              {view.ref && (
                <div style={s.row}>
                  <span style={s.label}>Ref</span>
                  <code style={s.code}>{view.ref}</code>
                </div>
              )}
              {view.docsUrl && (
                <a style={s.link} href={view.docsUrl} target="_blank" rel="noopener noreferrer">
                  How to fix this ↗
                </a>
              )}
              <span style={s.note}>Development builds only — never shown to your users.</span>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

export default RealtimeDevBadge;
