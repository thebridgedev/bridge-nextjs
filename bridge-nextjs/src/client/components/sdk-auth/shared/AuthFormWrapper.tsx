import type { HTMLAttributes, ReactNode } from 'react';

interface AuthFormWrapperProps extends HTMLAttributes<HTMLDivElement> {
  /** Heading text. Pass `null` or `''` to render no heading. */
  heading?: string | null;
  headingSlot?: ReactNode;
  /**
   * Step description, the `<p class="bridge-step-desc">` under the heading.
   * Pass `null` or `''` to render nothing at all — no empty paragraph holding
   * vertical space (TBP-631).
   *
   * Independent of `heading`: suppressing one never affects the other. An app
   * that writes its own page title and subtitle suppresses both; an app that
   * writes only the title suppresses only the heading.
   *
   * Before TBP-631 these lived in each component's markup, outside this
   * wrapper's heading guard, so `heading={null}` could not reach them and a host
   * page ended up printing its own subtitle followed by Bridge's — the same
   * sentence twice, in two voices.
   */
  description?: string | null;
  /**
   * Description as a node, for copy that carries markup — `SignupForm` needs
   * `<strong>{email}</strong>` inside its sentence, which a plain string prop
   * cannot express. Takes precedence over `description`, mirroring how
   * `headingSlot` relates to `heading`.
   */
  descriptionSlot?: ReactNode;
  children?: ReactNode;
}

export function AuthFormWrapper({
  heading,
  headingSlot,
  description,
  descriptionSlot,
  children,
  className,
  style,
  ...rest
}: AuthFormWrapperProps) {
  return (
    <div className={className} style={style} data-bridge-auth-form {...rest}>
      {headingSlot ?? (heading ? <h2 className="bridge-auth-heading">{heading}</h2> : null)}
      {descriptionSlot ??
        (description ? <p className="bridge-step-desc">{description}</p> : null)}
      {children}
    </div>
  );
}

export default AuthFormWrapper;
