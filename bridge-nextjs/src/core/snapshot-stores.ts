/**
 * Live Channel Unification (TBP-287/319) — `session.snapshot` reactive stores.
 *
 * Ported from bridge-svelte's `core/snapshot-stores.ts`. Svelte writable stores
 * become a single Zustand store (per §5.1 of the port skill); the conceptual
 * shape and the public contract are identical.
 *
 * These mirror the wire shape produced by bridge-api's SessionSnapshotService
 * and are written exactly once per channel-subscribe (initial connect AND every
 * reconnect) by the bridge runtime. Consumers read them via the unified `bridge`
 * surface in `src/core/bridge.ts`.
 *
 * Initial state is `null` for every slice. The first paint reads `null` until
 * the channel connects and the snapshot lands; framework components either gate
 * on null (skeleton) or fall back to defaults baked at the consumer site.
 *
 * Stores live in their own module so the snapshot consumer in `bridge-runtime`
 * can update them without pulling in the whole `bridge-instance` graph (and so
 * tests can reset them between cases via `__resetSnapshotStores`).
 */
import { create } from 'zustand';

export interface BrandingSnapshot {
  logo: string;
  name: string;
  primaryButtonBgColor?: string;
  textColor?: string;
  bgColor?: string;
  fontFamily?: string;
}

export interface SubscriptionSnapshot {
  plan: { slug: string; name: string };
  status: string;
  endsAt?: string;
  gateEngaged?: boolean;
}

export interface UserSnapshot {
  id: string;
  email?: string;
  role: string;
  tenantId: string;
}

interface SnapshotState {
  appBranding: BrandingSnapshot | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantSubscription: SubscriptionSnapshot | null;
  tenantEntitlements: Record<string, boolean> | null;
  user: UserSnapshot | null;
}

/**
 * The Zustand store backing every snapshot slice. Hooks/selectors read narrow
 * slices via `useSnapshotStore(s => s.user)` etc.; the unified `bridge` surface
 * exposes each slice as a Svelte-store-compatible readable (see `bridge.ts`).
 */
export const useSnapshotStore = create<SnapshotState>(() => ({
  appBranding: null,
  tenantId: null,
  tenantName: null,
  tenantSubscription: null,
  tenantEntitlements: null,
  user: null,
}));

export interface SessionSnapshotData {
  app: { branding: BrandingSnapshot };
  tenant: {
    id: string;
    name: string;
    subscription: SubscriptionSnapshot;
    entitlements: Record<string, boolean>;
  };
  user: UserSnapshot;
}

/**
 * Apply a server-emitted snapshot to the reactive store. Called from the
 * RealtimeClient `setOnSnapshot` callback wired up in `bridge-runtime`.
 *
 * Side-effect only — never throws. A partial server that omits an inner field
 * leaves the corresponding slice unchanged rather than clobbering it with `null`.
 */
export function applySessionSnapshot(data: SessionSnapshotData): void {
  const patch: Partial<SnapshotState> = {};
  if (data?.app?.branding) patch.appBranding = data.app.branding;
  if (data?.tenant) {
    if (typeof data.tenant.id === 'string') patch.tenantId = data.tenant.id;
    if (typeof data.tenant.name === 'string') patch.tenantName = data.tenant.name;
    if (data.tenant.subscription) patch.tenantSubscription = data.tenant.subscription;
    if (data.tenant.entitlements) patch.tenantEntitlements = data.tenant.entitlements;
  }
  if (data?.user) patch.user = data.user;
  if (Object.keys(patch).length > 0) useSnapshotStore.setState(patch);
}

/** Test-only: reset every snapshot slice to `null`. */
export function __resetSnapshotStores(): void {
  useSnapshotStore.setState({
    appBranding: null,
    tenantId: null,
    tenantName: null,
    tenantSubscription: null,
    tenantEntitlements: null,
    user: null,
  });
}
