import type { MetadataRoute } from "next";

// What makes Plotra installable as an app (beat-the-competitors.md, step 2):
// browsers offer "Install Plotra" once this is here and the site is on HTTPS.
// It opens in its own window, and with the service worker (public/sw.js) it
// starts without a connection.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plotra",
    short_name: "Plotra",
    description: "The collaborative writing studio.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f6f3",
    theme_color: "#f3f1ec",
    categories: ["productivity", "books"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
