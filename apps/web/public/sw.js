// Minimal service worker for PWA installability.
// Does not cache anything — the app is online-only.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: let all fetches pass through to the network.
  // This service worker exists solely to satisfy PWA install criteria.
});
