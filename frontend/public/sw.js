const CACHE = 'researchpilot-v8'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/researchpilot-logo.png', '/social-card.png', '/favicon.ico', '/favicon-16.png', '/favicon-32.png', '/favicon-48.png', '/icon-32.png', '/icon-180.png', '/icon-192.png', '/icon-512.png']
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())))
self.addEventListener('activate', event => event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()])))
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)) }
    return response
  }).catch(() => caches.match('/'))))
})
