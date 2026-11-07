import type { Metadata, Viewport } from "next";
import { PT_Serif } from "next/font/google";
import "./globals.css";

/** Titan's brand type (2024 brand guide, 2026-11-07): PT Serif for the top bar's wordmark and the customer
 *  page's headings. Staff screens otherwise use each machine's own font (Segoe UI on the store's Windows PCs);
 *  Inter and Cysan load on the customer page only (CustomerQuote.tsx). */
const ptSerif = PT_Serif({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-ptserif", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Titan Quotes", template: "%s · Titan Quotes" },
  description: "Titan Flooring quoting",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={ptSerif.variable}>
      <body>{children}</body>
    </html>
  );
}
