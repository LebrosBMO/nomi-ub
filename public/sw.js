// The smallest service worker a browser needs before it will offer to install the site.
// It deliberately caches nothing: every request goes to the network as usual, so an owner never
// sees yesterday's numbers, and a deploy is live the moment it lands.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
