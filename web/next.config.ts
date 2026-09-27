import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

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

export default withSerwist(nextConfig);
