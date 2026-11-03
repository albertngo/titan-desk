import type { NextConfig } from "next";
import { execSync } from "node:child_process";

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
import withSerwistInit from "@serwist/next";
import { withEve } from "eve/next";

const storageHost = process.env.NEXT_PUBLIC_STORAGE_HOST ?? "127.0.0.1";

// @serwist/next injects a webpack config, so production builds use webpack (`next build --webpack`
// in package.json); Next 16 defaults to Turbopack and refuses a webpack config otherwise.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: buildStamp(),
  images: {
    // The phone fetches pre-generated WebP variants straight from the Storage CDN:
    // no Vercel optimizer hop, no transformation cost, immutable caching applies.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    remotePatterns: [
      { protocol: "https", hostname: storageHost, pathname: "/storage/v1/object/public/catalogue-images/**" },
      { protocol: "http", hostname: "127.0.0.1", pathname: "/storage/v1/object/public/catalogue-images/**" },
    ],
  },
};

// withEve mounts the askBert agent (web/agents/askbert, discovered as a workspace member) at
// /eve/askbert/v1/*: proxied to a local eve dev server under `next dev`, and deployed on Vercel
// as a separate service routed before the Next.js app.
export default withEve(withSerwist(nextConfig));
