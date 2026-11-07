import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The build line at the top of every page (2026-11-03): which commit this build is and when it was
 * built, inlined as BUILD_SHA / BUILD_MESSAGE / BUILD_TIME and read by src/lib/build.ts. On Vercel the
 * deployment's own VERCEL_GIT_* (production deploys main-desk, so that is the latest merge there; the
 * message is the full one, so a merge's PR title is in its body); git elsewhere (local builds).
 * Runs when Next loads this file (build, or `next dev` start), never in a browser.
 */
function buildStamp(): Record<string, string> {
  let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  let message = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "";
  if (!sha) {
    try {
      const out = execSync("git log -1 --format=%H%x00%B", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const i = out.indexOf("\0");
      if (i > 0) {
        sha = out.slice(0, i).trim();
        message = out.slice(i + 1).trim();
      }
    } catch {
      // not a git checkout: the line shows the build time only
    }
  }
  return { BUILD_SHA: sha, BUILD_MESSAGE: message.slice(0, 500), BUILD_TIME: new Date().toISOString() };
}

/**
 * Company files (2026-11-07): the names in quote/sheets/, inlined as COMPANY_SHEETS so the top bar can name the
 * newest version of each site sheet without reading the disk on every page (src/lib/files/sheets.ts).
 */
function companySheets(): Record<string, string> {
  let names: string[] = [];
  try {
    names = readdirSync(join(process.cwd(), "sheets")).filter((n) => n.endsWith(".pdf"));
  } catch {
    // no sheets folder: the menu stays hidden
  }
  return { COMPANY_SHEETS: JSON.stringify(names) };
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { ...buildStamp(), ...companySheets() },
  // /files/<kind> reads the PDF from quote/sheets/ at request time, so only that route carries the files.
  outputFileTracingIncludes: { "/files/*": ["./sheets/*.pdf"] },
  poweredByHeader: false,
  async headers() {
    // Quotes carry customer addresses and margins: never let a shared cache or a frame hold them.
    return [
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
