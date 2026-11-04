/**
 * Icons the sign-in forms draw (TBP-899). The same SVGs as bridge-svelte, so
 * the four SDKs' sign-in screens look the same: the show-password eye, the
 * passkey and magic-link method icons.
 */

const STAR =
  'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';

/** Show-password toggle: an open eye, or a struck-through one while the password shows. */
export function PasswordToggleIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PasskeyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path fill="currentColor" strokeWidth="0.5" d="M3 20v-2.35c0-.63335.158335-1.175.475-1.625.316665-.45.725-.79165 1.225-1.025 1.11665-.5 2.1875-.875 3.2125-1.125S9.96665 13.5 11 13.5c.43335 0 .85415.02085 1.2625.0625s.82915.10415 1.2625.1875c-.08335.96665.09585 1.87915.5375 2.7375C14.50415 17.34585 15.15 18.01665 16 18.5v1.5H3Zm16 3.675-1.5-1.5v-4.65c-.73335-.21665-1.33335-.62915-1.8-1.2375-.46665-.60835-.7-1.3125-.7-2.1125 0-.96665.34165-1.79165 1.025-2.475.68335-.68335 1.50835-1.025 2.475-1.025s1.79165.34165 2.475 1.025c.68335.68335 1.025 1.50835 1.025 2.475 0 .75-.2125 1.41665-.6375 2-.425.58335-.9625 1-1.6125 1.25l1.25 1.25-1.5 1.5 1.5 1.5-2 2ZM11 11.5c-1.05 0-1.9375-.3625-2.6625-1.0875-.725-.725-1.0875-1.6125-1.0875-2.6625s.3625-1.9375 1.0875-2.6625C9.0625 4.3625 9.95 4 11 4s1.9375.3625 2.6625 1.0875c.725.725 1.0875 1.6125 1.0875 2.6625s-.3625 1.9375-1.0875 2.6625C12.9375 11.1375 12.05 11.5 11 11.5Zm7.5 3.175c.28335 0 .52085-.09585.7125-.2875S19.5 13.95835 19.5 13.675c0-.28335-.09585-.52085-.2875-.7125s-.42915-.2875-.7125-.2875c-.28335 0-.52085.09585-.7125.2875S17.5 13.39165 17.5 13.675c0 .28335.09585.52085.2875.7125s.42915.2875.7125.2875Z" />
    </svg>
  );
}

export function MagicLinkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      <g transform="translate(0, 0) scale(0.3)">
        <path d={STAR} fill="currentColor" stroke="none" />
      </g>
      <g transform="translate(15, 17) scale(0.25)">
        <path d={STAR} fill="currentColor" stroke="none" />
      </g>
      <g transform="translate(19, 15) scale(0.14)">
        <path d={STAR} fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}
