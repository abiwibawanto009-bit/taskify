// Taskify PWA - Service Worker

const STATIC_CACHE_NAME = 'taskify-static-v1';
const DYNAMIC_CACHE_NAME = 'taskify-dynamic-v1';

// Static resources to cache immediately
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap'
];

// 1. Install Event: Cache Static Assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Cleanup Stale Caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating service worker...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
            console.log('[Service Worker] Removing old cache registry:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Serve cached assets or make network calls
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Strategy for API routes (Network First, fallback to Cache)
  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone the response to store in cache
          const responseClone = response.clone();
          // We only cache GET requests (e.g. fetching tasks)
          if (event.request.method === 'GET' && !requestUrl.pathname.includes('/vapid-public-key')) {
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try to return cached data
          return caches.match(event.request);
        })
    );
    return;
  }

  // Strategy for Static Assets (Cache First, fallback to Network)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Fallback to fetch and cache dynamically if not pre-cached
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        
        const responseToCache = networkResponse.clone();
        caches.open(STATIC_CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return networkResponse;
      });
    })
  );
});

// 4. Push Event: Handle incoming push notifications from backend
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Notification received', event);

  let data = { title: 'New Notification', body: 'Something happened!' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      // Fallback if data is raw text
      data = { title: 'Taskify Board', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon.svg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      { action: 'explore', title: 'Open Board', icon: '/icons/icon.svg' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 5. Notification Click Event: Focus or Open PWA client
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  console.log('[Service Worker] Notification click Detected. Action:', action);

  event.notification.close();

  if (action === 'close') {
    return;
  }

  // Explore or click on body -> open application client
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window client is already open, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
