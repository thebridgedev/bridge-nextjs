import '@nebulr-group/bridge-nextjs/styles';
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from '../components/Providers';
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
        {/* Providers is a client component that defines the Bridge config
            (incl. billing.paywallRoute) in client code — see its doc comment for
            why this avoids the Server→Client config-serialization pitfall. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
