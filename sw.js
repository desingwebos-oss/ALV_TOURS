// Service worker de ALV Tours: permite instalar la app y abrirla sin conexión.
// Estrategia "red primero": siempre intenta traer lo más nuevo (avisos, buses, lineup) y solo usa la copia guardada si no hay internet.
// Las llamadas a Supabase (otro dominio) NO se tocan: asientos y reservas siempre van directo al servidor.
const V = 'alv-v2';
const BASE = ['./', 'index.html', 'manifest.json', 'css/style.css', 'css/escenario.css', 'js/app.js', 'js/api.js', 'js/seats.js',
  'js/config-loader.js', 'js/pwa.js', 'js/ajustes.js', 'img/escenario.jpg', 'config/festival.json', 'config/buses.json', 'config/news.json',
  'img/logo-alv.png', 'img/icon-192.png', 'img/collage-sol.webp', 'img/collage-luna.webp', 'img/collage-titulo.webp',
  'img/collage-volcan.webp', 'img/collage-disco.webp'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.allSettled(BASE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(V).then(c => c.put(r, copia)); }
    return res;
  }).catch(() => caches.match(r).then(x => x || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
