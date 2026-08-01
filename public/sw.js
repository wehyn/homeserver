self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Nimbus stays network-backed. In particular, API responses and health results
// are deliberately not intercepted or cached as authoritative dashboard data.
