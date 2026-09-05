// Kill-switch for the service worker of the old single-game deploy, which
// lived at this URL. A browser that still has it will fetch this file on
// its next update check, install it, and get told to go away.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', async () => {
  const keys = await caches.keys()
  await Promise.all(keys.map(k => caches.delete(k)))
  await self.registration.unregister()
  const clients = await self.clients.matchAll({ type: 'window' })
  clients.forEach(c => c.navigate(c.url))
})
