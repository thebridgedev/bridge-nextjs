/**
 * Live Channel Unification (TBP-288/322/323) — `LazySlice<T>` — the reactive
 * primitive for snapshot-omitted slices.
 *
 * Ported from bridge-svelte's `core/lazy-slice.ts`. The svelte version backed
 * its value with a Svelte `writable`; here we implement a minimal
 * Svelte-store-compatible subscribable directly (a `subscribe(fn)` that calls
 * `fn` with the current value immediately and on every change, returning an
 * unsubscribe function). This keeps `await bridge.app.plans`, `.load()`,
 * `.isLoaded`, `._peek()`, and `$store`-style `.subscribe` working identically
 * to svelte — so the unified-surface Playwright spec ports verbatim.
 *
 * Each lazy slice (plans today; quotas, members, settings, preferences later)
 * is a `LazySlice<T>` instance. The class composes:
 *
 *   1. A Svelte-store-compatible readable of `T | null` — `null` until `.load()`
 *      has resolved at least once.
 *   2. A `.load()` method returning `Promise<T>` — idempotent and dedup-safe;
 *      concurrent callers share the in-flight fetch.
 *   3. A thenable bridge — `await bridge.app.plans` triggers `.load()` and
 *      resolves to `T`.
 *   4. An `apply(value)` setter for reactive binding — channel events call this
 *      to keep loaded slices fresh without re-fetching.
 *   5. `.loading` and `.error` reactive companions for UI binding.
 */

type Subscriber<T> = (value: T) => void;
type Unsubscriber = () => void;

interface Subscribable<T> {
  subscribe(run: Subscriber<T>): Unsubscriber;
}

/** Minimal Svelte-store-compatible readable. Calls `run` immediately and on set. */
class MiniStore<T> implements Subscribable<T> {
  private _value: T;
  private readonly _subs = new Set<Subscriber<T>>();

  constructor(initial: T) {
    this._value = initial;
  }

  subscribe(run: Subscriber<T>): Unsubscriber {
    this._subs.add(run);
    run(this._value);
    return () => this._subs.delete(run);
  }

  set(value: T): void {
    this._value = value;
    for (const run of this._subs) run(value);
  }

  get(): T {
    return this._value;
  }
}

export type LoadFn<T> = () => Promise<T>;

export interface LazySliceOptions<T> {
  /** Called on first `.load()` (or first `await`). Idempotent: subsequent
   *  calls return the cached value unless `force: true` is passed. */
  load: LoadFn<T>;
  /** Optional initial value (e.g. seeded by tests). */
  initial?: T | null;
}

export class LazySlice<T> {
  private readonly _value: MiniStore<T | null>;
  private readonly _loading = new MiniStore<boolean>(false);
  private readonly _error = new MiniStore<Error | null>(null);

  private readonly _loadFn: LoadFn<T>;
  private _loaded = false;
  private _inflight: Promise<T> | null = null;

  readonly loading: Subscribable<boolean>;
  readonly error: Subscribable<Error | null>;

  // Bound subscribe so consumers can use the LazySlice as a Svelte store.
  readonly subscribe: Subscribable<T | null>['subscribe'];

  constructor(opts: LazySliceOptions<T>) {
    this._loadFn = opts.load;
    this._value = new MiniStore<T | null>(opts.initial ?? null);
    this.loading = this._loading;
    this.error = this._error;
    this.subscribe = this._value.subscribe.bind(this._value);
    if (opts.initial !== undefined && opts.initial !== null) this._loaded = true;
  }

  /**
   * Load the slice value. Idempotent — calling more than once returns the
   * cached value unless `force: true` is passed (which re-runs the loader).
   * Concurrent callers share the in-flight promise.
   *
   * On error, the rejection propagates to the caller AND populates `.error`
   * for UI binding. Subsequent `.load()` calls after an error will retry.
   */
  async load(opts?: { force?: boolean }): Promise<T> {
    if (!opts?.force && this._loaded) {
      return this._peek() as T;
    }
    if (this._inflight) return this._inflight;

    this._loading.set(true);
    this._error.set(null);
    this._inflight = this._loadFn()
      .then((v) => {
        this._value.set(v);
        this._loaded = true;
        return v;
      })
      .catch((err) => {
        const e = err instanceof Error ? err : new Error(String(err));
        this._error.set(e);
        throw e;
      })
      .finally(() => {
        this._inflight = null;
        this._loading.set(false);
      });
    return this._inflight;
  }

  /**
   * Reactive binding for already-loaded slices. Channel handlers call this to
   * push fresh values without re-fetching. No-op if the slice hasn't been
   * loaded yet — the next `.load()` will fetch authoritatively.
   */
  apply(value: T): void {
    if (!this._loaded) return;
    this._value.set(value);
  }

  /** Force-set value AND mark loaded. Useful when a slice is hydrated by a
   *  push event before any consumer called `.load()`. */
  preload(value: T): void {
    this._value.set(value);
    this._loaded = true;
  }

  /** True iff `.load()` has resolved at least once OR `preload()` was called. */
  get isLoaded(): boolean {
    return this._loaded;
  }

  /** Make the slice thenable: `await bridge.app.plans` triggers load. */
  then<TR = T, TE = never>(
    onFulfilled?: ((value: T) => TR | PromiseLike<TR>) | null,
    onRejected?: ((reason: unknown) => TE | PromiseLike<TE>) | null,
  ): Promise<TR | TE> {
    return this.load().then(onFulfilled as never, onRejected as never);
  }

  /** Test/internal: synchronously read the current value (or null). */
  _peek(): T | null {
    return this._value.get();
  }

  /** Test-only: reset internal state. */
  _resetForTests(): void {
    this._loaded = false;
    this._inflight = null;
    this._value.set(null);
    this._loading.set(false);
    this._error.set(null);
  }
}
