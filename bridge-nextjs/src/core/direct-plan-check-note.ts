// TBP-742 (port of bridge-svelte TBP-705) — in development, say once that a
// direct plan-feature check is the exception, not the standard.
//
// Every gate in app code is a flag, and a feature a plan sells is a flag ruled
// `bridge:billing.entitlement.<key> eq true`. `<Entitled to>` and
// `useEntitlements().can(key)` read the plan's feature list directly: supported,
// for when the developer asks for no flag, but worth one line in the console.

let noted = false;

/** A direct plan-feature check ran. `form` is how the app wrote it. */
export function noteDirectPlanCheck(form: 'entitled' | 'can', key: string): void {
  if (noted) return;
  try {
    if (process.env.NODE_ENV === 'production') return;
  } catch {
    return;
  }
  noted = true;
  const written = form === 'entitled' ? `<Entitled to="${key}">` : `useEntitlements().can('${key}')`;
  // eslint-disable-next-line no-console
  console.info(
    `[bridge] ${written} checks the plan directly. The standard is a flag ruled on ` +
      `bridge:billing.entitlement.${key} — see "npx @nebulr-group/bridge-cli check gates". ` +
      `(Development only — this note is not shown in production.)`,
  );
}

/** Test hook: allow the note to print again. */
export function __resetDirectPlanCheckNote(): void {
  noted = false;
}
