'use client';

import type { HTMLAttributes } from 'react';

interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
}

export function Spinner({ size = 24, className, style, ...rest }: SpinnerProps) {
  return (
    <span
      className={className}
      style={{ width: `${size}px`, height: `${size}px`, ...(style ?? {}) }}
      data-bridge-spinner
      {...rest}
    />
  );
}

export default Spinner;
