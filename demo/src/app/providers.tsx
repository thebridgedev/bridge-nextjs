'use client';

import { NblocksProvider } from 'nblocks-nextjs/client';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NblocksProvider>
      {children}
    </NblocksProvider>
  );
} 