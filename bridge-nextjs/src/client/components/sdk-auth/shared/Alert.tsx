'use client';

import type { HTMLAttributes, ReactNode } from 'react';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'error' | 'info' | 'success';
  children?: ReactNode;
}

export function Alert({
  variant = 'error',
  children,
  className,
  style,
  ...rest
}: AlertProps) {
  if (!children) return null;
  return (
    <div
      className={className}
      style={style}
      data-variant={variant}
      data-bridge-alert
      role="alert"
      {...rest}
    >
      {children}
    </div>
  );
}

export default Alert;
