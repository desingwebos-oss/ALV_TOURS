// Mini-mapa en vivo SIN librerías: arma las teselas de OpenStreetMap y coloca el bus (y el destino si hay coordenadas).
// Todo con textContent / CSSOM (sin innerHTML ni estilos en línea → compatible con la CSP).
const T = 256, el = (t, c, txt) => { const e = document.createElement(t); if(c) e.className = c; if(txt != null) e.textContent = txt; return e; };
const mundo = (lat, lng, z) => { const s = T * 2 ** z, r = lat * Math.PI / 180;
  return {x:(lng + 180) / 360 * s, y:(1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * s}; };
export const coordOk = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
export function distanciaKm(a, b){                       // fórmula haversine
  const rad = d => d * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
export function crearMapa(){
  const caja = el('div', 'mapa-vivo'), capa = el('div', 'mapa-tiles'), pinBus = el('div', 'pin pin-bus', '🚌'), pinMeta = el('div', 'pin pin-meta', '🏁');
  const attr = el('a', 'mapa-attr', '© OpenStreetMap'); attr.href = 'https://www.openstreetmap.org/copyright'; attr.target = '_blank'; attr.rel = 'noopener noreferrer';
  pinMeta.hidden = true; caja.append(capa, pinMeta, pinBus, attr);
  const teselas = new Map();
  function pintar(bus, meta){
    const w = caja.clientWidth || 320, h = caja.clientHeight || 260, hayMeta = meta && coordOk(meta.lat, meta.lng);
    let z = 16;
    if(hayMeta) for(; z > 4; z--){ const a = mundo(bus.lat, bus.lng, z), b = mundo(meta.lat, meta.lng, z); if(Math.abs(a.x - b.x) < w - 90 && Math.abs(a.y - b.y) < h - 90) break; }
    const pb = mundo(bus.lat, bus.lng, z), pm = hayMeta ? mundo(meta.lat, meta.lng, z) : null;
    const c = pm ? {x:(pb.x + pm.x) / 2, y:(pb.y + pm.y) / 2} : pb, ox = c.x - w / 2, oy = c.y - h / 2, n = 2 ** z, vistas = new Set();
    for(let ty = Math.max(0, Math.floor(oy / T)); ty <= Math.min(n - 1, Math.floor((oy + h) / T)); ty++)
      for(let tx = Math.floor(ox / T); tx <= Math.floor((ox + w) / T); tx++){
        const k = `${z}/${(tx % n + n) % n}/${ty}`; vistas.add(k);
        let im = teselas.get(k);
        if(!im){ im = el('img'); im.alt = ''; im.width = im.height = T; im.draggable = false; im.src = `https://tile.openstreetmap.org/${k}.png`; capa.append(im); teselas.set(k, im); }
        im.style.transform = `translate(${tx * T - ox}px,${ty * T - oy}px)`;
      }
    for(const [k, im] of teselas) if(!vistas.has(k)){ im.remove(); teselas.delete(k); }
    pinBus.style.transform = `translate(${pb.x - ox}px,${pb.y - oy}px)`;
    pinMeta.hidden = !pm; if(pm) pinMeta.style.transform = `translate(${pm.x - ox}px,${pm.y - oy}px)`;
  }
  return {el:caja, pintar};
}
