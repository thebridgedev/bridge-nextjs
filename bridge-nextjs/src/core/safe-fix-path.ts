/**
 * A same-app path, or null. A backend's `fix` becomes a link the user clicks,
 * so an absolute URL, a protocol-relative `//host` or a `javascript:` value is
 * never followed — the configured subscription page is used instead.
 */
export function safeFixPath(fix: unknown): string | null {
  if (typeof fix !== 'string') return null;
  const value = fix.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}
