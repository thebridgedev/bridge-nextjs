import '@nebulr-group/bridge-nextjs/styles';
import { BridgeBillingNotice } from '@nebulr-group/bridge-nextjs/client';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { BridgeWindowExpose } from '../components/BridgeWindowExpose';
import Navbar from '../components/Navbar';
// Demo-only: the e2e harness's per-worker app id. A real app imports
// `BridgeProvider` from '@nebulr-group/bridge-nextjs/client' here instead.
import { TestBridgeProvider as BridgeProvider } from '../test-fixtures/TestBridgeProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'bridge Next.js Demo',
  description: 'Demo application for bridge Next.js integration',
};

// The config is plain data, so this Server Component passes it straight to the
// provider; everything else comes from NEXT_PUBLIC_BRIDGE_* (TBP-742).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <BridgeProvider config={{ loginRoute: '/auth/login', billing: { paywallRoute: '/welcome' } }}>
          <BridgeWindowExpose />
          <Navbar />
          <BridgeBillingNotice />
          <main>{children}</main>
        </BridgeProvider>
      </body>
    </html>
  );
}
