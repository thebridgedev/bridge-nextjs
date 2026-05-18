'use client';

import type { HTMLAttributes, ReactNode } from 'react';

interface AuthFormWrapperProps extends HTMLAttributes<HTMLDivElement> {
  heading?: string;
  headingSlot?: ReactNode;
  children?: ReactNode;
}

export function AuthFormWrapper({
  heading,
  headingSlot,
  children,
  className,
  style,
  ...rest
}: AuthFormWrapperProps) {
  return (
    <div className={className} style={style} data-bridge-auth-form {...rest}>
      {headingSlot ?? (heading ? <h2 className="bridge-auth-heading">{heading}</h2> : null)}
      {children}
    </div>
  );
}

export default AuthFormWrapper;
