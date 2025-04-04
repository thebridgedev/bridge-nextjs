import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from '../components/Navbar';
import "./globals.css";
import { Providers } from './providers';

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
        <Providers>
          <Navbar />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
