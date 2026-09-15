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

/**
 * TBP-644 — move `bridge.tenant.subscription` on a `subscription.plan_changed`
 * push. Until now this slice was written only by `session.snapshot`, and a plan
 * change never re-sends one, so an upgraded workspace kept rendering its old
 * plan until a reload — while auth-core's `useBridge().subscription`, hydrated
 * from the very same push, already had the new one.
 *
 * The push is authoritative for plan and status (auth-core's contract for it:
 * "consumers hydrate their cached state on receipt; no refetch required").
 * Fields it does not carry (`endsAt`, `gateEngaged`) keep their current value.
 * A payload without a plan slug is ignored. Never throws.
 */
export function applySubscriptionPlanChanged(
  msg: { to?: { slug?: unknown; name?: unknown } | null; status?: unknown } | null | undefined,
): void {
  const slug = msg?.to?.slug;
  if (typeof slug !== 'string' || slug === '') return;
  const name = typeof msg?.to?.name === 'string' ? msg.to.name : slug;
  const status = typeof msg?.status === 'string' ? msg.status : undefined;
  useSnapshotStore.setState((s) => ({
    tenantSubscription: {
      ...(s.tenantSubscription ?? {}),
      plan: { slug, name },
      status: status ?? s.tenantSubscription?.status ?? '',
    },
  }));
}

/**
 * TBP-644 — replace `bridge.tenant.entitlements` from an `entitlements.changed`
 * push that carries the map (the slice is documented as "replaced wholesale on
 * every entitlements.changed push", but only `session.snapshot` ever wrote it).
 * The signal-only lifecycle variant of the same kind carries no map and leaves
 * the slice untouched. Never throws.
 */
export function applyEntitlementsChanged(msg: { entitlements?: unknown } | null | undefined): void {
  const map = msg?.entitlements;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return;
  useSnapshotStore.setState({ tenantEntitlements: { ...(map as Record<string, boolean>) } });
}

/**
 * TBP-660 — repair `bridge.tenant.subscription` from a fresh `GET /billing/state`
 * read after a reconnect, when a `subscription.plan_changed` push may have been
 * lost while the socket was down or being replaced. The read is authoritative
 * for plan and status; `endsAt` / `gateEngaged` are taken when present and kept
 * otherwise. A state without a plan slug is ignored. Never throws.
 */
export function applySubscriptionState(
  state:
    | { plan?: { slug?: unknown; name?: unknown } | null; status?: unknown; endsAt?: unknown; gateEngaged?: unknown }
    | null
    | undefined,
): void {
  const slug = state?.plan?.slug;
  if (typeof slug !== 'string' || slug === '') return;
  const name = typeof state?.plan?.name === 'string' ? state.plan.name : slug;
  useSnapshotStore.setState((s) => ({
    tenantSubscription: {
      ...(s.tenantSubscription ?? {}),
      plan: { slug, name },
      status: typeof state?.status === 'string' ? state.status : s.tenantSubscription?.status ?? '',
      ...(typeof state?.endsAt === 'string' ? { endsAt: state.endsAt } : {}),
      ...(typeof state?.gateEngaged === 'boolean' ? { gateEngaged: state.gateEngaged } : {}),
    },
  }));
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
