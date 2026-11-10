/**
 * TBP-948 — guide drift. The guides in this repo (`mcp/`, `learning/`, the
 * READMEs) are served to AI agents and published on thebridge.dev. When one of
 * them names an export, a component, a component prop or a config option the
 * package does not have, an agent writes code that does not compile, or worse,
 * a prop React silently drops (`key=` instead of `flagKey=`).
 *
 * This reads the package's real public API with the TypeScript compiler (both
 * entry points, `/client` and `/server`, types included) and checks every
 * guide against it:
 *   - every name imported from `@nebulr-group/bridge-nextjs/client` or
 *     `/server` exists in that entry, and no guide imports a subpath that does
 *     not exist (the package root, `/flags`);
 *   - every component a guide renders (`<TeamManagementPanel …>`, in code
 *     blocks and inline code) is exported, unless it is the app's own;
 *   - every prop written on a package component is a prop it takes;
 *   - every `billing: { … }` / `billing.<option>` / `config={{ … }}` option is
 *     a real `BridgeConfig` option;
 *   - every `useXxx()` hook a guide calls is exported (or React's / Next's).
 *
 * Lives in src/ (excluded from the build) so it never ships.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as ts from 'typescript';

const PKG = resolve(__dirname, '..');
const REPO = resolve(PKG, '..');

// ── The package's public API, read from the source ──────────────────────────

const program = ts.createProgram([join(PKG, 'src/client.ts'), join(PKG, 'src/server.ts')], {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  target: ts.ScriptTarget.ES2018,
  esModuleInterop: true,
  skipLibCheck: true,
  strict: true,
  noEmit: true,
});
const checker = program.getTypeChecker();

function exportsOf(entry: string): Map<string, ts.Symbol> {
  const file = program.getSourceFile(join(PKG, 'src', entry));
  if (!file) throw new Error(`no source for ${entry}`);
  const moduleSymbol = checker.getSymbolAtLocation(file);
  if (!moduleSymbol) throw new Error(`no module symbol for ${entry}`);
  return new Map(checker.getExportsOfModule(moduleSymbol).map((s) => [s.getName(), s]));
}

const ENTRIES: Record<string, Map<string, ts.Symbol>> = {
  '@nebulr-group/bridge-nextjs/client': exportsOf('client.ts'),
  '@nebulr-group/bridge-nextjs/server': exportsOf('server.ts'),
};
/** Side-effect-only subpaths in package.json `exports`. */
const ASSET_ENTRIES = new Set(['@nebulr-group/bridge-nextjs/styles']);

function resolved(symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

/** The props a component takes, or null when the export is not a component. */
function propsOf(symbol: ts.Symbol): Set<string> | null {
  const target = resolved(symbol);
  const decl = target.valueDeclaration ?? target.declarations?.[0];
  if (!decl) return null;
  const type = checker.getTypeOfSymbolAtLocation(target, decl);
  const signatures = type.getCallSignatures();
  if (signatures.length === 0) return null;
  const names = new Set<string>();
  for (const signature of signatures) {
    const param = signature.getParameters()[0];
    if (!param) continue;
    const paramType = checker.getTypeOfSymbolAtLocation(param, decl);
    for (const prop of checker.getPropertiesOfType(checker.getNonNullableType(paramType))) names.add(prop.getName());
  }
  return names;
}

function propertyNames(type: ts.Type): Set<string> {
  return new Set(checker.getPropertiesOfType(checker.getNonNullableType(type)).map((p) => p.getName()));
}

const configSymbol = resolved(ENTRIES['@nebulr-group/bridge-nextjs/client'].get('BridgeConfig')!);
const configType = checker.getDeclaredTypeOfSymbol(configSymbol);
const CONFIG_OPTIONS = propertyNames(configType);
const billingProp = checker.getPropertyOfType(configType, 'billing')!;
const BILLING_OPTIONS = propertyNames(checker.getTypeOfSymbolAtLocation(billingProp, billingProp.valueDeclaration!));

// ── The guides ──────────────────────────────────────────────────────────────

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

const GUIDES = [
  ...markdownFiles(join(REPO, 'mcp')),
  ...markdownFiles(join(REPO, 'learning')),
  join(REPO, 'README.md'),
  join(PKG, 'README.md'),
];

/** Code a guide shows: fenced blocks and inline code spans, with their line. */
function codeOf(markdown: string): Array<{ code: string; line: number }> {
  const out: Array<{ code: string; line: number }> = [];
  const lines = markdown.split('\n');
  let fence: string[] | null = null;
  let fenceStart = 0;
  let quoted = false;
  lines.forEach((text, i) => {
    if (/^\s*(?:>\s*)?(?:```|~~~)/.test(text)) {
      if (fence) {
        out.push({ code: fence.join('\n'), line: fenceStart + 1 });
        fence = null;
      } else {
        fence = [];
        fenceStart = i + 1;
        quoted = /^\s*>/.test(text);
      }
      return;
    }
    if (fence) {
      // Code inside a blockquote (`> ```tsx`) keeps its `> ` prefix; drop it.
      fence.push(quoted ? text.replace(/^\s*>\s?/, '') : text);
      return;
    }
    for (const m of text.matchAll(/`([^`\n]+)`/g)) out.push({ code: m[1], line: i + 1 });
  });
  return out;
}

/** Components that are the app's own in the guides' examples, not the package's. */
const APP_COMPONENTS = new Set([
  'AdminPanel', 'AiPanel', 'AnalyticsPanel', 'BetaDashboard', 'BetaReportsPanel', 'Dashboard',
  'ExportButton', 'NewDashboard', 'NewEditor', 'NewLanding', 'OldLanding', 'StableDashboard',
  'UpgradeBanner', 'UpgradePrompt', 'Spinner',
  // next/link, and the docs site's MDX components
  'Link', 'Tabs', 'TabItem',
  // the legacy @nblocks/nblocks-nextjs component a migration note names
  'Login',
]);

/** Hooks from React and Next.js that guides call alongside the package's. */
const FRAMEWORK_HOOKS = new Set([
  'useEffect', 'useState', 'useMemo', 'useRef', 'useCallback', 'useSyncExternalStore', 'useContext',
  'useRouter', 'usePathname', 'useSearchParams', 'useParams',
]);

type Drift = { file: string; line: number; problem: string };

/** Attribute names on the JSX element whose name ends at `from` in `code`. */
function attributesAt(code: string, from: number): string[] {
  const names: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  const skipLine = (i: number) => {
    const end = code.indexOf('\n', i);
    return end === -1 ? code.length : end;
  };
  for (let i = from; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    // Quotes only delimit attribute values; inside `{…}` they may be JSX text ("don't").
    if (depth === 0 && (c === '"' || c === "'" || c === '`')) {
      quote = c;
      continue;
    }
    // A signature written as pseudo-JSX (`appId?: string  // comment`): the
    // name is the prop; the type and any comment after it are not.
    if (depth === 0 && (c === ':' || (c === '/' && code[i + 1] === '/'))) {
      i = skipLine(i) - 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && (c === '>' || (c === '/' && code[i + 1] === '>'))) break;
    else if (depth === 0 && /[A-Za-z_]/.test(c) && /[\s]/.test(code[i - 1] ?? ' ')) {
      const name = /^[A-Za-z_][\w-]*/.exec(code.slice(i))![0];
      names.push(name);
      i += name.length - 1;
    }
  }
  return names;
}

/** Every package export, from either entry. */
function exportNamed(name: string): ts.Symbol | undefined {
  for (const entry of Object.values(ENTRIES)) {
    const s = entry.get(name);
    if (s) return s;
  }
  return undefined;
}

function driftIn(file: string, markdown: string): Drift[] {
  const drift: Drift[] = [];
  const at = (line: number, problem: string) => drift.push({ file: relative(REPO, file), line, problem });
  // Components and hooks the guide defines itself.
  const defined = new Set(
    [...markdown.matchAll(/\b(?:function|const|class)\s+([A-Z]\w*|use[A-Z]\w*)/g)].map((m) => m[1]),
  );

  for (const { code, line } of codeOf(markdown)) {
    // Imports from the package.
    for (const m of code.matchAll(/import\s+(?:type\s+)?(\{[^}]*\}|\w+(?:\s*,\s*\{[^}]*\})?|\*\s+as\s+\w+)\s+from\s+['"](@nebulr-group\/bridge-nextjs[^'"]*)['"]/g)) {
      const [, clause, source] = m;
      const entry = ENTRIES[source];
      if (!entry) {
        at(line, `imports from "${source}", which the package does not export (use /client or /server)`);
        continue;
      }
      const braces = /\{([\s\S]*)\}/.exec(clause);
      if (!braces) {
        at(line, `default-imports from "${source}", which has no default export`);
        continue;
      }
      for (const raw of braces[1].split(',')) {
        const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (name && !entry.has(name)) at(line, `imports \`${name}\` from "${source}", which does not export it`);
      }
    }
    for (const m of code.matchAll(/import\s+['"](@nebulr-group\/bridge-nextjs[^'"]*)['"]/g)) {
      if (!ASSET_ENTRIES.has(m[1]) && !ENTRIES[m[1]]) at(line, `imports "${m[1]}", which the package does not export`);
    }

    // Components and their props.
    for (const m of code.matchAll(/(?<![\w.<])<([A-Z]\w*)(?=[\s/>])/g)) {
      const name = m[1];
      const symbol = exportNamed(name);
      if (!symbol) {
        if (!APP_COMPONENTS.has(name) && !defined.has(name)) {
          at(line, `renders <${name}>, which the package does not export`);
        }
        continue;
      }
      const props = propsOf(symbol);
      if (!props) continue; // a type used in a generic position, e.g. Readable<UserSnapshot>
      for (const attr of attributesAt(code, m.index! + m[0].length)) {
        if (attr === 'key' || props.has(attr)) continue;
        at(line, `<${name}> has no \`${attr}\` prop`);
      }
    }

    // Config options.
    for (const m of code.matchAll(/\bbilling:\s*\{([^{}]*)\}/g)) {
      for (const k of m[1].matchAll(/(?:^|[,{\s])(\w+)\s*:/g)) {
        if (!BILLING_OPTIONS.has(k[1])) at(line, `\`billing.${k[1]}\` is not a billing option`);
      }
    }
    for (const m of code.matchAll(/(?<![\w:-])billing\.(\w+)/g)) {
      if (!BILLING_OPTIONS.has(m[1])) at(line, `\`billing.${m[1]}\` is not a billing option`);
    }
    for (const m of code.matchAll(/\bconfig=\{\{([\s\S]*?)\}\}/g)) {
      // Top-level keys only: blank out nested objects first.
      let body = m[1];
      while (/\{[^{}]*\}/.test(body)) body = body.replace(/\{[^{}]*\}/g, '');
      for (const k of body.matchAll(/(?:^|[,\s])(\w+)\s*:/g)) {
        if (!CONFIG_OPTIONS.has(k[1])) at(line, `\`${k[1]}\` is not a <BridgeProvider config> option`);
      }
    }

    // Hooks.
    for (const m of code.matchAll(/(?<![\w.])(use[A-Z]\w*)\s*\(/g)) {
      const name = m[1];
      if (FRAMEWORK_HOOKS.has(name) || defined.has(name) || exportNamed(name)) continue;
      at(line, `calls \`${name}()\`, which the package does not export`);
    }
  }
  return drift;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('guides name only exports, components, props and options the package has — TBP-948', () => {
  it('reads the real API (guards against checking nothing)', () => {
    expect(GUIDES.length).toBeGreaterThan(20);
    expect(ENTRIES['@nebulr-group/bridge-nextjs/client'].has('FeatureFlag')).toBe(true);
    expect(ENTRIES['@nebulr-group/bridge-nextjs/client'].has('BridgeConfig')).toBe(true); // types too
    expect(ENTRIES['@nebulr-group/bridge-nextjs/server'].has('ServerFeatureFlag')).toBe(true);
    expect(propsOf(ENTRIES['@nebulr-group/bridge-nextjs/client'].get('FeatureFlag')!)).toEqual(
      expect.objectContaining({ size: expect.any(Number) }),
    );
    expect([...propsOf(ENTRIES['@nebulr-group/bridge-nextjs/client'].get('TeamManagementPanel')!)!]).toContain('seatsMetric');
    expect(BILLING_OPTIONS.has('paywallRoute')).toBe(true);
    expect(CONFIG_OPTIONS.has('devBadge')).toBe(true);
  });

  it.each(GUIDES.map((f) => [relative(REPO, f), f]))('%s', (_name, file) => {
    expect(driftIn(file, readFileSync(file, 'utf8'))).toEqual([]);
  });

  describe('goes red on planted drift', () => {
    it.each([
      ['```ts\n' + "import { useBridgeUpgrade } from '@nebulr-group/bridge-nextjs/client';" + '\n```', 'useBridgeUpgrade'],
      ['```ts\n' + "import { FeatureFlag } from '@nebulr-group/bridge-nextjs/flags';" + '\n```', '/flags'],
      ['```ts\n' + "import { BridgeProvider } from '@nebulr-group/bridge-nextjs';" + '\n```', 'does not export'],
      ['```ts\n' + "import { withBridgeAuth } from '@nebulr-group/bridge-nextjs/client';" + '\n```', 'withBridgeAuth'],
      ['Mount `<BridgeUpgradeMount />` in the layout.', '<BridgeUpgradeMount>'],
      ['`<FeatureFlag key="analytics" defaultValue={false}>`', '' /* key is React’s: allowed */],
      ['`<FeatureFlag flagName="analytics" defaultValue={false}>`', 'flagName'],
      ['`<TeamManagementPanel seatMetric="seats" />`', 'seatMetric'],
      ["Set `billing: { paywalRoute: '/welcome' }`.", 'billing.paywalRoute'],
      ['Stripe returns to `billing.successUrl`.', 'billing.successUrl'],
      ['`const q = useQuotas("tickets")`', 'useQuotas'],
      ['```tsx\n<BridgeProvider config={{ apiBaseUrl: API, liveBadge: false }}>\n```', 'liveBadge'],
    ])('%s', (bad, expected) => {
      const found = driftIn(join(REPO, 'planted.md'), bad).map((d) => d.problem).join('\n');
      if (expected) expect(found).toContain(expected);
      else expect(found).toBe('');
    });
  });

  describe('stays green on correct usage', () => {
    it.each([
      '```ts\n' + "import { FeatureFlag, type FlagState, useFlag as flag } from '@nebulr-group/bridge-nextjs/client';" + '\n```',
      '```ts\n' + "import { withBridgeAuth, ServerFeatureFlag } from '@nebulr-group/bridge-nextjs/server';" + '\n```',
      '```ts\n' + "import '@nebulr-group/bridge-nextjs/styles';" + '\n```',
      '`<FeatureFlag flagKey="analytics" defaultValue={false} upgrade loading={<Spinner />}>`',
      '`<TeamManagementPanel seatsMetric="seats" />`',
      "`billing: { successRoute: '/dashboard', paywallRoute: false }`",
      '```tsx\nfunction Header() { return null }\nconst x = <Header />;\n```',
      'Read `Partial<EvalContext>` and `BridgeReadable<UserSnapshot>`.',
    ])('%s', (good) => {
      expect(driftIn(join(REPO, 'planted.md'), good)).toEqual([]);
    });
  });
});
