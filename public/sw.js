// Service worker mínimo: só existe para exibir notificações no Android/iPhone
// (o Chrome do Android não aceita "new Notification" fora de um service worker).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (abertas.length) return abertas[0].focus();
    return self.clients.openWindow('./#onibus');
  })());
});
