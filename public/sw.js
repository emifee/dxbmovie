// DXBmovies AI — Service Worker
// Handles push notifications and notification click routing.
// This SW deliberately does NOT intercept fetch — Next.js handles that.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ── Push event: show the notification ─────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'DXBmovies', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'DXBmovies AI 🎬';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/badge-72.png',
    data: { url: data.url || '/' },
    tag: data.type || 'dxb-notification',
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: focus app or open at the right URL ───────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open somewhere, focus it
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // App is closed — open it at the correct URL
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
