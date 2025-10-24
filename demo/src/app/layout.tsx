import { BridgeProvider } from '@nebulr-group/bridge-nextjs/client';
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from '../components/Navbar';
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "bridge Next.js Demo",
  description: "Demo application for bridge Next.js integration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* BridgeProvider automatically reads from NEXT_PUBLIC_BRIDGE_APP_ID env var */}
        <BridgeProvider>
          <Navbar />
          <main>{children}</main>
        </BridgeProvider>
      </body>
    </html>
  );
}
