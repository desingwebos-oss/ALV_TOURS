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
  const caja = el('div', 'mapa-vivo'), capa = el('div', 'mapa-tiles'), pinMeta = el('div', 'pin pin-meta', '🏁');
  const attr = el('a', 'mapa-attr', '© OpenStreetMap'); attr.href = 'https://www.openstreetmap.org/copyright'; attr.target = '_blank'; attr.rel = 'noopener noreferrer';
  pinMeta.hidden = true; caja.append(capa, pinMeta, attr);
  const teselas = new Map(), pines = new Map();
  // pts: [{lat, lng, etq}] (uno o varios buses); meta: destino opcional. Ajusta el zoom para que quepan todos.
  function pintarTodos(pts, meta, vista){      // vista: {lat, lng, z} se usa solo si no hay ningún punto que mostrar
    const w = caja.clientWidth || 320, h = caja.clientHeight || 260, hayMeta = meta && coordOk(meta.lat, meta.lng);
    const todos = hayMeta ? [...pts, meta] : pts; if(!todos.length && !vista) return;
    let z = 16, a, ox, oy;
    const caja_ = zz => { const m = todos.map(p => mundo(p.lat, p.lng, zz)), xs = m.map(p => p.x), ys = m.map(p => p.y);
      return {x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys), y1:Math.max(...ys)}; };
    if(todos.length){
      for(; z > 4; z--){ a = caja_(z); if(a.x1 - a.x0 < w - 90 && a.y1 - a.y0 < h - 90) break; }
      a = caja_(z); ox = (a.x0 + a.x1) / 2 - w / 2; oy = (a.y0 + a.y1) / 2 - h / 2;
    } else { z = vista.z; const c = mundo(vista.lat, vista.lng, z); ox = c.x - w / 2; oy = c.y - h / 2; }
    const n = 2 ** z, vistas = new Set();
    for(let ty = Math.max(0, Math.floor(oy / T)); ty <= Math.min(n - 1, Math.floor((oy + h) / T)); ty++)
      for(let tx = Math.floor(ox / T); tx <= Math.floor((ox + w) / T); tx++){
        const k = `${z}/${(tx % n + n) % n}/${ty}`; vistas.add(k);
        let im = teselas.get(k);
        if(!im){ im = el('img'); im.alt = ''; im.width = im.height = T; im.draggable = false; im.src = `https://tile.openstreetmap.org/${k}.png`; capa.append(im); teselas.set(k, im); }
        im.style.transform = `translate(${tx * T - ox}px,${ty * T - oy}px)`;
      }
    for(const [k, im] of teselas) if(!vistas.has(k)){ im.remove(); teselas.delete(k); }
    const ids = new Set();
    for(const p of pts){
      const k = String(p.etq); ids.add(k);
      let pin = pines.get(k); if(!pin){ pin = el('div', 'pin pin-bus', k); caja.append(pin); pines.set(k, pin); }
      pin.classList.toggle('pin-viejo', p.activo === false);
      const q = mundo(p.lat, p.lng, z); pin.style.transform = `translate(${q.x - ox}px,${q.y - oy}px)`;
    }
    for(const [k, pin] of pines) if(!ids.has(k)){ pin.remove(); pines.delete(k); }
    pinMeta.hidden = !hayMeta;
    if(hayMeta){ const q = mundo(meta.lat, meta.lng, z); pinMeta.style.transform = `translate(${q.x - ox}px,${q.y - oy}px)`; }
  }
  const pintar = (bus, meta) => pintarTodos([{lat:bus.lat, lng:bus.lng, etq:'🚌'}], meta);   // un solo bus (ventana EN VIVO)
  return {el:caja, pintar, pintarTodos};
}
