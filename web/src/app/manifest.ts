import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest without cookies: the proxy matcher must keep excluding it.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "askBert",
    short_name: "askBert",
    description: "Titan Flooring staff catalogue lookup",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#111827",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
