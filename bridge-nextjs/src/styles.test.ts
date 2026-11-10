/**
 * TBP-946 (port of bridge-svelte TBP-814 + TBP-813) — the default stylesheet
 * follows the app's type, loses to the app's CSS, and styles the new
 * subscription page.
 *
 * Static checks on `styles.css`:
 *   - the layer order statement comes first, `bridge` last after Tailwind v4's layers;
 *   - `--bridge-text-base` is registered with `@property`, outside any layer;
 *   - every rule after that sits inside one `@layer bridge` block, including the
 *     component styles bridge-svelte keeps in each component's scoped <style>;
 *   - no text size is a fixed `rem` any more, and no weight is hard-coded except
 *     the two avatar initials;
 *   - the token fallbacks are the values the rules had before, so an app that sets
 *     nothing sees no change.
 *
 * A small parser is enough for this file (no strings with braces, no nesting
 * beyond at-rules), and keeps the package free of a CSS dependency.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'styles.css'), 'utf8');

type Decl = { property: string; value: string };
type Node =
  | { type: 'rule'; selector: string; decls: Decl[] }
  | { type: 'atrule'; name: string; prelude: string; block: Node[] | null; decls: Decl[] };

function parse(css: string): Node[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  function block(): { nodes: Node[]; decls: Decl[] } {
    const nodes: Node[] = [];
    const decls: Decl[] = [];
    let buf = '';
    while (i < text.length) {
      const ch = text[i++];
      if (ch === '{') {
        const head = buf.trim();
        buf = '';
        const inner = block();
        if (head.startsWith('@')) {
          const [, name, prelude] = head.match(/^@([\w-]+)\s*([\s\S]*)$/) ?? [];
          nodes.push({ type: 'atrule', name, prelude: prelude.trim(), block: inner.nodes, decls: inner.decls });
        } else {
          nodes.push({ type: 'rule', selector: head.replace(/\s+/g, ' '), decls: inner.decls });
          // A rule holds declarations only in this file.
          expect(inner.nodes).toEqual([]);
        }
      } else if (ch === '}') {
        if (buf.trim()) decls.push(decl(buf));
        return { nodes, decls };
      } else if (ch === ';') {
        const stmt = buf.trim();
        buf = '';
        if (!stmt) continue;
        if (stmt.startsWith('@')) {
          const [, name, prelude] = stmt.match(/^@([\w-]+)\s*([\s\S]*)$/) ?? [];
          nodes.push({ type: 'atrule', name, prelude: prelude.trim(), block: null, decls: [] });
        } else {
          decls.push(decl(stmt));
        }
      } else {
        buf += ch;
      }
    }
    return { nodes, decls };
  }
  function decl(stmt: string): Decl {
    const at = stmt.indexOf(':');
    return { property: stmt.slice(0, at).trim(), value: stmt.slice(at + 1).trim().replace(/\s+/g, ' ') };
  }
  return block().nodes;
}

const sheet = parse(source);

type Flat = { selector: string; property: string; value: string };
function flatten(nodes: Node[], out: Flat[] = []): Flat[] {
  for (const node of nodes) {
    if (node.type === 'rule') {
      for (const d of node.decls) out.push({ selector: node.selector, ...d });
    } else if (node.block) {
      flatten(node.block, out);
    }
  }
  return out;
}

const all = flatten(sheet);
const valueOf = (selector: string, property: string) =>
  all.find((d) => d.selector.split(',').map((s) => s.trim()).includes(selector) && d.property === property)?.value;

describe('styles.css — cascade layer (TBP-946, port of TBP-814)', () => {
  it('opens with the layer order statement, bridge after Tailwind v4’s layers', () => {
    const first = sheet[0];
    expect(first.type === 'atrule' && first.name).toBe('layer');
    if (first.type !== 'atrule') return;
    expect(first.block).toBeNull();
    expect(first.prelude.split(',').map((s) => s.trim())).toEqual(['theme', 'base', 'components', 'utilities', 'bridge']);
  });

  it('registers --bridge-text-base with @property, outside the layer', () => {
    const second = sheet[1];
    expect(second.type === 'atrule' && second.name).toBe('property');
    if (second.type !== 'atrule') return;
    expect(second.prelude).toBe('--bridge-text-base');
    const descriptors = Object.fromEntries(second.decls.map((d) => [d.property, d.value]));
    expect(descriptors).toMatchObject({ syntax: "'<length>'", inherits: 'true', 'initial-value': '16px' });
  });

  it('puts everything after the @property inside a single @layer bridge block', () => {
    expect(sheet).toHaveLength(3);
    const layer = sheet[2];
    expect(layer.type === 'atrule' && `${layer.name} ${layer.prelude}`).toBe('layer bridge');
    if (layer.type !== 'atrule') return;
    expect(layer.block!.length).toBeGreaterThan(100);
    // Nothing on the page is unlayered: the only top-level nodes are the three above.
    expect(sheet.filter((n) => n.type === 'rule')).toHaveLength(0);
  });

  it('the component styles bridge-svelte scopes per component are inside the layer too', () => {
    const layer = sheet[2];
    if (layer.type !== 'atrule' || !layer.block) throw new Error('no layer');
    const inLayer = flatten(layer.block).map((d) => d.selector);
    for (const selector of [
      '.bridge-subscription-status',
      '.bss-badge',
      '.bridge-billing-notice',
      '.bridge-quota-banner',
      '.bridge-paywall-panel',
      '.bridge-billing-page',
      '.bridge-billing-heading',
      '.bridge-billing-summary-plan',
      '.bridge-auth-page',
      '.bridge-quota-gate-limit',
    ]) {
      expect(inLayer.some((s) => s.split(',').map((p) => p.trim()).includes(selector))).toBe(true);
    }
  });

  it('derives the base text size from the app’s <body>', () => {
    expect(valueOf(':where(body)', '--bridge-text-base')).toBe('var(--bridge-font-size, 1em)');
  });
});

describe('styles.css — type follows the app (TBP-946, port of TBP-814)', () => {
  it('has no fixed rem font sizes left', () => {
    const fixed = all.filter((d) => d.property === 'font-size' && /^[\d.]+rem$/.test(d.value));
    expect(fixed).toEqual([]);
  });

  it('scales every relative font size from --bridge-text-base with a 1rem fallback', () => {
    const sizes = all.filter((d) => d.property === 'font-size' && d.value !== 'inherit');
    expect(sizes.length).toBeGreaterThan(50);
    for (const d of sizes) {
      expect(`${d.selector} → ${d.value}`).toMatch(/→ calc\([\d.]+ \* var\(--bridge-text-base, 1rem\)\)$/);
    }
  });

  it('hard-codes no font-weight except the two avatar initials', () => {
    // `inherit` (the sign-in links, TBP-899) takes the app's own weight: fine.
    const literal = all.filter(
      (d) => d.property === 'font-weight' && !d.value.startsWith('var(') && d.value !== 'inherit',
    );
    expect(literal.map((d) => d.selector).sort()).toEqual(['.bridge-tenant-avatar', '[data-bridge-workspace-avatar]']);
    for (const d of all.filter((d) => d.property === 'font-weight' && d.value.startsWith('var('))) {
      expect(`${d.selector} → ${d.value}`).toMatch(/→ var\(--bridge-font-weight-(heading|button|label), \d{3}\)$/);
    }
  });

  it('keeps the previous values as the token fallbacks', () => {
    // Pre-port: `.bridge-btn { font-size: 0.875rem; font-weight: 500 }`.
    expect(valueOf('.bridge-btn', 'font-size')).toBe('calc(0.875 * var(--bridge-text-base, 1rem))');
    expect(valueOf('.bridge-btn', 'font-weight')).toBe('var(--bridge-font-weight-button, 500)');
    // Pre-port: `.bridge-billing-heading { font-size: 1.5rem; font-weight: 700 }`.
    expect(valueOf('.bridge-billing-heading', 'font-size')).toBe('calc(1.5 * var(--bridge-text-base, 1rem))');
    expect(valueOf('.bridge-billing-heading', 'font-weight')).toBe('var(--bridge-font-weight-heading, 700)');
    expect(valueOf('.bridge-plan-price-amount', 'font-size')).toBe('calc(1.9 * var(--bridge-text-base, 1rem))');
    expect(valueOf('.bridge-plan-price-amount', 'font-weight')).toBe('var(--bridge-font-weight-heading, 700)');
  });

  it('gives every button a shadow token that defaults to none', () => {
    for (const selector of ['.bridge-btn', '.bridge-btn-primary', '.bridge-btn-secondary', '.bridge-btn-danger']) {
      expect(valueOf(selector, 'box-shadow')).toBe('var(--bridge-button-shadow, none)');
    }
  });

  it('lets --bridge-card-shadow style the plan-change dialog, defaulting to its old shadow', () => {
    const dialogShadows = all.filter(
      (d) => d.property === 'box-shadow' && d.value === 'var(--bridge-card-shadow, 0 24px 60px -12px rgba(0, 0, 0, 0.35))',
    );
    expect(dialogShadows).toHaveLength(1);
  });
});

describe('styles.css — the subscription page (TBP-946, port of TBP-813)', () => {
  it('plan cards and the current-plan panel are surfaces of their own, from the tokens', () => {
    expect(valueOf('[data-bridge-plan-card]', 'background')).toBe('var(--bridge-card-bg, var(--bridge-bg))');
    expect(valueOf('.bridge-billing-summary', 'box-shadow')).toBe(
      'var(--bridge-card-shadow, 0 1px 2px rgb(16 24 40 / 0.06), 0 1px 3px rgb(16 24 40 / 0.04))',
    );
  });

  it('the current plan is marked in the primary colour', () => {
    expect(valueOf('[data-bridge-plan-card][data-current="true"]', 'border')).toBe('2px solid var(--bridge-primary)');
    expect(valueOf('.bridge-plan-current-flag', 'background')).toBe('var(--bridge-primary)');
  });

  it('styles the checkout banner from the success alert tokens', () => {
    expect(valueOf('.bridge-checkout-notice', 'background')).toBe('var(--bridge-alert-success-bg)');
    expect(valueOf('.bridge-checkout-notice', 'color')).toBe('var(--bridge-alert-success-fg)');
  });

  it('documents the new tokens in the header', () => {
    for (const token of [
      '--bridge-card-bg',
      '--bridge-card-shadow',
      '--bridge-button-shadow',
      '--bridge-font-size',
      '--bridge-font-weight-heading',
      '--bridge-font-weight-button',
      '--bridge-font-weight-label',
    ]) {
      expect(source.slice(0, source.indexOf('@layer'))).toContain(token);
    }
  });
});
