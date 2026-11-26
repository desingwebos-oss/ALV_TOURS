// "Mi reserva" estilo wallet: el pase se guarda en ESTE celular (funciona sin internet) y se puede volver a consultar
// con celular + nombre. Todo se pinta con textContent (nunca innerHTML).
import * as api from './api.js';
import { qrMatriz } from './qr.js';

const K = 'alv.pase';
export const leerPase = () => { try { const p = JSON.parse(localStorage.getItem(K) || 'null'); return p && typeof p.folio === 'string' ? p : null; } catch { return null; } };
export const guardarPase = p => { try { localStorage.setItem(K, JSON.stringify({...p, guardado:Date.now()})); } catch {} };
const borrarPase = () => { try { localStorage.removeItem(K); } catch {} };

const h = (t, a = {}, ...k) => { const e = document.createElement(t);
  for (const [x, v] of Object.entries(a)) x === 'class' ? e.className = v : x.startsWith('on') ? e.addEventListener(x.slice(2), v) : e.setAttribute(x, v);
  e.append(...k.filter(c => c != null)); return e; };
const fmtFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '') ? new Date(f + 'T12:00:00').toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'}) : '';

function qrCanvas(texto, px = 5){
  const m = qrMatriz(texto), q = 2, n = m.length + q * 2, c = h('canvas', {class:'pase-qr', width:n * px, height:n * px, role:'img', 'aria-label':'Código QR de tu folio ' + texto});
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#2A1A10';
  m.forEach((fila, j) => fila.forEach((on, i) => { if(on) x.fillRect((i + q) * px, (j + q) * px, px, px); }));
  return c;
}
const datosPase = (cfg, p) => {
  const bus = cfg.buses.find(b => b.id === p.bus_id) || {}, it = (bus.itinerario || []).find(x => x.punto === p.boarding) || {};
  return {bus:bus.nombre || p.bus_id, cita:it.cita || '', salida:it.salida || '', nombre:p.name, asientos:(p.seats || []).join(', '), abordaje:p.boarding || '', folio:p.folio,
    festival:cfg.festival.nombre, fecha:fmtFecha(cfg.festival.fecha), lugar:cfg.festival.ciudad || ''};
};
const campo = (et, val) => val ? h('div', {class:'pase-campo'}, h('small', {}, et), h('b', {}, val)) : null;

function tarjeta(d){
  return h('article', {class:'pase', 'aria-label':'Pase de reserva'},
    h('div', {class:'pase-top'},
      h('div', {class:'pase-marcas'}, h('img', {class:'pase-logo', src:'img/logo-alv.png', alt:'ALV Tours', width:'66', height:'60'}),
        h('img', {class:'pase-logo pase-comuna', src:'img/collage-titulo.webp', alt:d.festival, width:'172', height:'60'})),
      h('b', {}, 'PASE DE ABORDAJE'), h('span', {}, [d.fecha, d.lugar].filter(Boolean).join(' · '))),
    h('div', {class:'pase-cuerpo'}, campo('PASAJERO', d.nombre), campo('AUTOBÚS', d.bus), campo('ASIENTOS', d.asientos), campo('ABORDAJE', d.abordaje),
      campo('CITA', d.cita), campo('SALIDA', d.salida)),
    h('div', {class:'pase-corte', 'aria-hidden':'true'}),
    h('div', {class:'pase-pie'}, qrCanvas(d.folio), h('div', {class:'pase-folio'}, h('small', {}, 'FOLIO'), h('strong', {}, d.folio))));
}

const cargarImg = src => new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
async function descargarImagen(d){           // pase como imagen para guardarlo en la galería o mandarlo por WhatsApp
  const [logo, comuna] = await Promise.all([cargarImg('img/logo-alv.png'), cargarImg('img/collage-titulo.webp')]);
  const W = 900, H = 1400, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const rr = (X, Y, w, hh, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + hh, r); x.arcTo(X + w, Y + hh, X, Y + hh, r); x.arcTo(X, Y + hh, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  x.fillStyle = '#FFC83D'; x.fillRect(0, 0, W, H);
  rr(60, 60, W - 120, H - 120, 40); x.fillStyle = '#FFFBF0'; x.fill(); x.lineWidth = 8; x.strokeStyle = '#2A1A10'; x.stroke();
  x.save(); rr(60, 60, W - 120, 340, 40); x.clip(); x.fillStyle = '#F7931E'; x.fillRect(60, 60, W - 120, 340); x.restore();
  if(logo){ const lh = 130, lw = lh * logo.naturalWidth / logo.naturalHeight; x.drawImage(logo, 110, 85, lw, lh); }
  if(comuna){ const ch = 130, cw = ch * comuna.naturalWidth / comuna.naturalHeight, cx = W - 110 - cw; x.save(); rr(cx, 85, cw, ch, 18); x.clip(); x.drawImage(comuna, cx, 85, cw, ch); x.restore(); rr(cx, 85, cw, ch, 18); x.lineWidth = 6; x.strokeStyle = '#2A1A10'; x.stroke(); }
  x.fillStyle = '#2A1A10'; x.textAlign = 'center'; x.font = '900 64px system-ui,sans-serif'; x.fillText('PASE DE ABORDAJE', W / 2, 300); x.font = '600 30px system-ui,sans-serif'; x.fillText([d.fecha, d.lugar].filter(Boolean).join(' · '), W / 2, 355);
  x.textAlign = 'left'; let y = 470;
  for (const [et, v] of [['PASAJERO', d.nombre], ['AUTOBÚS', d.bus], ['ASIENTOS', d.asientos], ['ABORDAJE', d.abordaje], ['CITA', d.cita], ['SALIDA', d.salida]]) {
    if(!v) continue; x.fillStyle = '#7a5a3a'; x.font = '700 24px system-ui,sans-serif'; x.fillText(et, 120, y); x.fillStyle = '#2A1A10'; x.font = '800 40px system-ui,sans-serif'; x.fillText(String(v).slice(0, 34), 120, y + 46); y += 92; }
  x.strokeStyle = '#2A1A10'; x.lineWidth = 4; x.setLineDash([16, 12]); x.beginPath(); x.moveTo(110, 1065); x.lineTo(W - 110, 1065); x.stroke(); x.setLineDash([]);
  const q = qrCanvas(d.folio, 8); x.drawImage(q, 115, 1095, 210, 210);
  x.fillStyle = '#7a5a3a'; x.font = '700 24px system-ui,sans-serif'; x.fillText('FOLIO', 370, 1170); x.fillStyle = '#2A1A10'; x.font = '900 88px ui-monospace,Menlo,Consolas,monospace'; x.fillText(d.folio, 365, 1260);
  c.toBlob(b => { if(!b) return; const u = URL.createObjectURL(b), a = h('a', {href:u, download:'pase-' + d.folio + '.png'}); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }, 'image/png');
}

export function abrirWallet(cfg){
  const dlg = h('dialog', {class:'modal bus-card wallet', 'aria-label':'Mi reserva'}, h('button', {class:'cerrar', type:'button', 'aria-label':'Cerrar', onclick:() => dlg.close()}, '✕'));
  dlg.addEventListener('close', () => dlg.remove()); document.body.append(dlg); dlg.showModal();
  const cuerpo = h('div', {}); dlg.append(h('h3', {}, '🎟 MI RESERVA'), cuerpo);

  function consulta(msg = ''){
    const tel = h('input', {class:'campo', type:'tel', inputmode:'numeric', maxlength:'10', placeholder:'Tu celular (10 dígitos)', autocomplete:'tel-national'});
    const nom = h('input', {class:'campo', maxlength:'80', placeholder:'Tu nombre (como lo registraste)', autocomplete:'given-name'}), m = h('p', {class:'msg'}, msg);
    const ir = async () => {
      const t = tel.value.replace(/[\s-]/g, ''); if(!/^\d{10}$/.test(t)) return m.textContent = 'El celular debe tener 10 dígitos';
      if(nom.value.trim().length < 3) return m.textContent = 'Escribe tu nombre'; m.textContent = 'Buscando…';
      try { const r = await api.wallet(t, nom.value.trim()); const p = {...r, phone:t}; guardarPase(p); pase(p); } catch(e) { m.textContent = e.message; }
    };
    nom.addEventListener('keydown', e => { if(e.key === 'Enter') ir(); });
    cuerpo.replaceChildren(h('p', {}, 'Consulta tu folio con tu celular. Se guardará en este teléfono para verlo cuando quieras, incluso sin internet.'), tel, nom, m,
      h('button', {class:'btn negro', type:'button', onclick:ir}, 'VER MI PASE'));
  }

  function pase(p){
    const d = datosPase(cfg, p), nota = h('p', {class:'live-estado'}, 'Guardado en este celular · se ve sin internet');
    cuerpo.replaceChildren(tarjeta(d), nota,
      h('div', {class:'acciones'},
        h('button', {class:'btn naranja', type:'button', onclick:() => descargarImagen(d)}, '💾 GUARDAR IMAGEN'),
        h('button', {class:'btn', type:'button', onclick:() => { if(confirm('¿Quitar el pase de este celular? Podrás volver a consultarlo con tu celular y nombre.')){ borrarPase(); consulta(); } }}, 'QUITAR DE AQUÍ')));
    if(p.phone) api.myReservation(p.folio, p.phone).then(r => {          // actualiza con lo que diga el servidor (si hay internet)
      const nuevo = {...p, bus_id:r.bus_id, seats:r.seats, boarding:r.boarding, name:r.name}; guardarPase(nuevo);
      if(JSON.stringify([p.bus_id, p.seats, p.boarding]) !== JSON.stringify([nuevo.bus_id, nuevo.seats, nuevo.boarding])) pase(nuevo); else nota.textContent = '✔ Verificado con el servidor · guardado en este celular';
    }).catch(e => { nota.textContent = e.status === 404 ? '⚠️ No encontramos esta reserva en el servidor. Escribe a soporte.' : 'Sin conexión: mostrando la copia guardada en este celular.'; });
  }

  const guardado = leerPase(); guardado ? pase(guardado) : consulta();
}
