import { NblocksProvider } from '@nebulr-group/nblocks-nextjs/client';
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from '../components/Navbar';
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "nBlocks Next.js Demo",
  description: "Demo application for nBlocks Next.js integration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* NblocksProvider automatically reads from NEXT_PUBLIC_NBLOCKS_APP_ID env var */}
        <NblocksProvider>
          <Navbar />
          <main>{children}</main>
        </NblocksProvider>
      </body>
    </html>
  );
}
