import type { Metadata, Viewport } from "next";
import { Inter, PT_Serif } from "next/font/google";
import "./globals.css";

/** Titan's brand type (2024 brand guide, 2026-11-07): Inter for the interface, PT Serif for the
 *  wordmark and the customer page's headings. Cysan, the display face, loads on the customer page only. */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const ptSerif = PT_Serif({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-ptserif", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Titan Quotes", template: "%s · Titan Quotes" },
  description: "Titan Flooring quoting",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${inter.variable} ${ptSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
