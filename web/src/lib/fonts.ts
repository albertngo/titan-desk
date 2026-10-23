/**
 * Titan brand type (Brand Guideline Sheet, Social Estates 2024): PT Serif for headings and
 * subheadings, Inter for body copy. The primary display face, Cysan, has no web licence here,
 * so PT Serif carries headings. Self-hosted by next/font at build time.
 */
import { Inter, PT_Serif } from "next/font/google";

export const titanSerif = PT_Serif({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-titan-serif", display: "swap" });
export const titanSans = Inter({ subsets: ["latin"], variable: "--font-titan-sans", display: "swap" });
