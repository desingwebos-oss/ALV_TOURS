// App: portada (hero + muro + barra de buses) y flujo de reserva por autobús.
// Todo se arma con textContent (nunca innerHTML) para evitar XSS.
import { loadConfig } from './config-loader.js';
import * as api from './api.js';
import { renderMapa, contarAsientos } from './seats.js';

const h = (t, a = {}, ...k) => { const e = document.createElement(t);
  for (const [x, v] of Object.entries(a)) x === 'class' ? e.className = v : x.startsWith('on') ? e.addEventListener(x.slice(2), v) : e.setAttribute(x, v);
  e.append(...k.filter(c => c != null)); return e; };
const $app = document.getElementById('app');
let cfg, installEvt, tick;
const fmt = f => new Date(f + 'T12:00:00').toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});

function modal(...contenido){
  const d = h('dialog', {class:'modal bus-card'}, h('button', {class:'cerrar', onclick:() => d.close()}, '✕'), ...contenido);
  d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal(); return d;
}

/* ---------- PANTALLA 1: bienvenida ---------- */
function inicio(){
  const f = cfg.festival;
  const hero = h('section', {class:'hero vivid-bg'},
    f.poster ? h('div', {class:'poster-wrap'}, h('img', {src:f.poster, alt:f.nombre})) : null,
    h('div', {class:'bus-card'}, h('span', {class:'tag'}, 'LET IT ROCK'), h('h1', {}, f.nombre),
      h('p', {}, `${fmt(f.fecha)} • ${f.ciudad}`), h('p', {}, f.bienvenida),
      h('button', {class:'btn negro', id:'btnInstalar', hidden:'', onclick:() => installEvt && installEvt.prompt()}, 'INSTALAR APP'),
      h('p', {}, h('a', {href:'https://wa.me/52' + f.whatsapp_soporte, rel:'noopener'}, 'Soporte por WhatsApp'))));
  const muro = h('section', {class:'muro'}, ...cfg.news.map(n =>
    h('article', {class:'noticia bus-card', onclick:() => modal(h('span', {class:'tag'}, n.etiqueta), h('h3', {}, n.titulo), n.imagen ? h('img', {src:n.imagen, alt:'', class:'foto'}) : null, h('p', {}, n.texto_largo || n.texto))},
      h('span', {class:'tag'}, n.etiqueta), h('h3', {}, n.titulo), n.imagen ? h('img', {src:n.imagen, alt:''}) : null, h('p', {}, n.texto))));
  const barra = h('nav', {class:'barra'}, ...cfg.buses.map(b => h('button', {class:'btn', onclick:() => modalBus(b)}, b.nombre)));
  $app.replaceChildren(hero, muro, barra);
}
async function modalBus(b){
  let s = {taken:[], held:[]}; try { s = await api.getSeats(b.id); } catch {}
  const oc = s.taken.length + s.held.length, cap = contarAsientos(b.layout);
  modal(h('h3', {}, b.nombre), b.foto ? h('img', {src:b.foto, alt:b.nombre, class:'foto'}) : null,
    h('p', {}, 'CHOFER: ' + b.chofer), h('p', {}, 'Ruta: ' + b.puntos_abordaje.join(' → ')),
    h('p', {}, `Libres: ${cap - oc} • Ocupados: ${oc}`),
    h('a', {class:'btn naranja', href:'#/bus/' + b.id, onclick:() => document.querySelector('dialog')?.close()}, 'IR A RESERVAR'));
}

/* ---------- PANTALLA 2: reserva por autobús ---------- */
function reserva(id){
  const b = cfg.buses.find(x => x.id === id); if(!b) return void (location.hash = '#/');
  const st = {token:null, sel:new Set()};
  const box = h('div', {class:'bus-card'});
  $app.replaceChildren(h('a', {href:'#/'}, '← Volver'), h('h2', {}, b.nombre), box);
  pasoKey();

  function pasoKey(msgTxt = ''){            // Paso 1: KEY (se valida SOLO en el servidor)
    const inp = h('input', {type:'password', class:'campo', placeholder:'KEY del autobús', maxlength:'64', autocomplete:'off'});
    const msg = h('p', {class:'msg'}, msgTxt);
    box.replaceChildren(h('h3', {}, 'VALIDA TU KEY'), inp, msg,
      h('button', {class:'btn negro', onclick:async () => {
        try { st.token = (await api.validateKey(b.id, inp.value.trim())).token; inp.value = ''; pasoReserva(); }
        catch(e) { msg.textContent = e.message; } }}, 'VALIDAR'));
  }
  function pasoReserva(){                   // Pasos 2-4
    const sel = h('select', {class:'campo'}, h('option', {value:'', disabled:'', selected:'', hidden:''}, 'Punto de abordaje'), ...b.puntos_abordaje.map(p => h('option', {value:p}, p)));
    const mapa = h('div', {class:'mapa'}), lista = h('p', {}, ''), msg = h('p', {class:'msg'});
    const nombre = h('input', {class:'campo', placeholder:'Nombre completo', maxlength:'80', autocomplete:'name'});
    const tel = h('input', {class:'campo', placeholder:'WhatsApp / teléfono (10 dígitos)', inputmode:'numeric', maxlength:'14', autocomplete:'tel'});
    const dom = h('input', {class:'campo', placeholder:'Domicilio o punto de referencia', maxlength:'120'});
    const chk = h('input', {type:'checkbox'});
    const fallo = e => { if(e.status === 401) pasoKey('Tu sesión expiró, valida la KEY de nuevo.'); else msg.textContent = e.message; };
    async function pintar(){
      let s = {taken:[], held:[], mine:[]}; try { s = await api.getSeats(b.id, st.token); } catch(e) { return fallo(e); }
      const mine = new Set(s.mine); st.sel = new Set([...st.sel].filter(n => mine.has(n)));
      renderMapa(mapa, b.layout, {taken:s.taken, held:s.held.filter(n => !mine.has(n)), selected:st.sel, onToggle:alternar});
      lista.textContent = `${st.sel.size} SELECCIONADOS` + (st.sel.size ? ': ' + [...st.sel].sort((a, c) => a - c).join(', ') + ' (apartados 10 min)' : '');
    }
    async function alternar(n){
      try { await api.holdSeat(b.id, n, st.token, st.sel.has(n)); st.sel.has(n) ? st.sel.delete(n) : st.sel.add(n); msg.textContent = ''; }
      catch(e) { fallo(e); }
      pintar();
    }
    async function limpiar(){ for(const n of [...st.sel]) try { await api.holdSeat(b.id, n, st.token, true); } catch {} st.sel.clear(); pintar(); }
    async function enviar(){
      const t = tel.value.replace(/[\s-]/g, ''), n = nombre.value.trim();
      if(!sel.value) return msg.textContent = 'Elige tu punto de abordaje';
      if(!st.sel.size) return msg.textContent = 'Elige al menos un asiento';
      if(!/^[\p{L}][\p{L} .'-]{2,79}$/u.test(n)) return msg.textContent = 'Nombre no válido';
      if(!/^\d{10}$/.test(t)) return msg.textContent = 'El teléfono debe tener 10 dígitos';
      if(!chk.checked) return msg.textContent = 'Debes aceptar el aviso de privacidad';
      const datos = {bus_id:b.id, seats:[...st.sel].sort((a, c) => a - c), boarding:sel.value, name:n, phone:t, address:dom.value.trim().slice(0, 120), consent:true};
      try { const r = await api.createReservation(datos, st.token); clearInterval(tick); confirmacion(r.folio, datos); }
      catch(e) { fallo(e); pintar(); }
    }
    box.replaceChildren(h('h3', {}, 'ELIGE TUS LUGARES'), sel, mapa, lista, nombre, tel, dom,
      h('label', {}, chk, ' Acepto el ', h('a', {href:'#', onclick:e => { e.preventDefault(); modal(h('h3', {}, 'AVISO DE PRIVACIDAD'), h('p', {}, cfg.festival.aviso_privacidad)); }}, 'aviso de privacidad')),
      msg, h('button', {class:'btn negro', onclick:enviar}, '🔥 APARTAR LUGARES'), ' ', h('button', {class:'btn', onclick:limpiar}, 'LIMPIAR'));
    pintar(); clearInterval(tick); tick = setInterval(pintar, 15000);
  }
  function confirmacion(folio, d){          // Paso 5
    box.replaceChildren(h('h3', {}, '¡LISTO, A ROCKEAR!'), h('p', {}, 'Festival: ' + cfg.festival.nombre), h('p', {}, 'Autobús: ' + b.nombre),
      h('p', {}, 'Asientos: ' + d.seats.join(', ')), h('p', {}, 'Abordaje: ' + d.boarding), h('p', {}, 'Nombre: ' + d.name),
      h('h2', {}, 'FOLIO: ' + folio), h('p', {}, 'Guarda tu folio. No lo compartas con nadie.'));
  }
}

/* ---------- Arranque ---------- */
function route(){ clearInterval(tick); const m = location.hash.match(/^#\/bus\/([\w-]+)$/); m ? reserva(m[1]) : inicio(); scrollTo(0, 0); }
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; document.getElementById('btnInstalar')?.removeAttribute('hidden'); });
(async () => {
  try { cfg = await loadConfig(); api.setBase(cfg.festival.api_base); document.title = cfg.festival.nombre;
    document.getElementById('marca').textContent = cfg.festival.nombre; addEventListener('hashchange', route); route(); }
  catch { $app.textContent = 'No se pudo cargar la configuración del festival.'; }
})();
