import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Pre-generated WebP variants are content-addressed and immutable: cache first, long TTL.
      matcher: ({ url }) => url.pathname.startsWith("/storage/v1/object/public/catalogue-images/"),
      handler: new CacheFirst({
        cacheName: "catalogue-images",
        plugins: [new ExpirationPlugin({ maxEntries: 3000, maxAgeSeconds: 30 * 24 * 3600 })],
      }),
    },
    {
      // Prices and sessions are never served stale.
      matcher: ({ url }) => url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/auth/v1/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
