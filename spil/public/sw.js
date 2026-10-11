// Offline support: pages are fetched network-first (so updates arrive when online),
// everything else cache-first (Vite's built assets have content hashes in their names).
const CACHE = 'spil-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  const put = (res) => {
    if (res.ok) {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put(req, copy))
    }
    return res
  }

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(put).catch(() => caches.match(req)))
  } else {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(put)))
  }
})
