import type { NextConfig } from "next";
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
