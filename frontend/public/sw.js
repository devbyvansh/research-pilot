const CACHE = 'researchpilot-v7'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/researchpilot-brand-v2.png', '/social-card.png', '/favicon-v2.ico', '/favicon-16-v2.png', '/favicon-32-v2.png', '/favicon-48-v2.png', '/icon-32-v2.png', '/icon-180-v2.png', '/icon-192-v2.png', '/icon-512-v2.png']
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())))
self.addEventListener('activate', event => event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()])))
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)) }
    return response
  }).catch(() => caches.match('/'))))
})
