// App: portada (hero + muro) con menú lateral de buses y flujo de reserva por autobús.
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
const etqClase = t => 't' + ([...String(t || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % 4);   // color de etiqueta (clase CSS)
const fechaOk = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '');
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
let carTimer;
const titulo = t => h('div', {class:'titulo-sec'}, h('h2', {}, t), h('span', {class:'greca'}));

function detalle(n){
  modal(h('span', {class:'tag ' + etqClase(n.etiqueta)}, n.etiqueta || 'AVISO'), h('h3', {}, n.titulo),
    n.imagen ? h('img', {src:n.imagen, alt:'', class:'foto'}) : null, h('p', {}, n.texto_largo || n.texto),
    /^https:\/\//.test(n.enlace || '') ? h('a', {class:'btn naranja', href:n.enlace, target:'_blank', rel:'noopener noreferrer'}, n.enlace_texto || 'VER MÁS') : null);
}
const tarjeta = n => h('article', {class:'noticia bus-card' + (n.fijada ? ' fijada' : ''), tabindex:'0', onclick:() => detalle(n), onkeydown:e => { if(e.key === 'Enter') detalle(n); }},
  h('div', {class:'meta'}, h('span', {class:'tag ' + etqClase(n.etiqueta)}, n.etiqueta || 'AVISO'), fechaOk(n.fecha) ? h('time', {}, fmt(n.fecha)) : null),
  h('h3', {}, n.titulo), n.imagen ? h('img', {src:n.imagen, alt:''}) : null, h('p', {}, n.texto));

function ticker(news){                       // cinta de novedades (solo CSS, texto plano)
  const items = news.slice(0, 5).map(n => (n.etiqueta ? n.etiqueta + ': ' : '') + n.titulo);
  if(!items.length) return null;
  const txt = (items.join('  ✺  ') + '  ✺  ').repeat(3);
  return h('section', {class:'ticker', 'aria-label':'Novedades'}, h('b', {}, 'NOVEDADES'),
    h('div', {class:'ticker-vp', 'aria-hidden':'true'}, h('div', {class:'ticker-pista'}, h('span', {}, txt), h('span', {}, txt))));
}

function carrusel(nombres){                  // carrusel con scroll-snap; se detiene al primer toque
  const pista = h('div', {class:'car-pista', tabindex:'0', role:'group', 'aria-label':'Artistas destacados'},
    ...nombres.map((n, i) => h('article', {class:'slide c' + (i % 5)}, h('h3', {}, n))));
  const ir = d => pista.scrollBy({left:d * Math.max(pista.clientWidth * .8, 240), behavior:sinMovimiento ? 'auto' : 'smooth'});
  const parar = () => clearInterval(carTimer);
  const boton = (txt, lbl, d) => h('button', {class:'car-btn ' + (d < 0 ? 'izq' : 'der'), type:'button', 'aria-label':lbl, onclick:() => { parar(); ir(d); }}, txt);
  for(const ev of ['pointerdown', 'keydown', 'focusin']) pista.addEventListener(ev, parar);
  clearInterval(carTimer);
  if(!sinMovimiento && nombres.length > 1) carTimer = setInterval(() =>
    pista.scrollLeft + pista.clientWidth >= pista.scrollWidth - 4 ? pista.scrollTo({left:0, behavior:'smooth'}) : ir(1), 4500);
  return h('div', {class:'car'}, boton('‹', 'Anterior', -1), pista, boton('›', 'Siguiente', 1));
}

const pieza = (clase, src) => h('img', {class:'pz ' + clase, src, alt:'', loading:'lazy'});
function inicio(){
  const f = cfg.festival, lista = a => Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()) : [];
  const destacados = lista(f.lineup_destacados), cartel = lista(f.lineup_cartel);
  const wa = /^\d{10}$/.test(f.whatsapp_soporte || '') ? 'https://wa.me/52' + f.whatsapp_soporte : null;
  // banner sobrio estilo collage: piezas recortadas del arte, ligeramente giradas y encimadas
  const collage = f.banner ? h('figure', {class:'collage', role:'img', 'aria-label':f.nombre},
    pieza('pz-sol', 'img/collage-sol.webp'), pieza('pz-luna', 'img/collage-luna.webp'),
    pieza('pz-titulo', 'img/collage-titulo.webp'), pieza('pz-volcan', 'img/collage-volcan.webp'), pieza('pz-disco', 'img/collage-disco.webp'),
    h('span', {class:'cinta-washi'})) : h('h1', {}, f.nombre);
  const hero = h('section', {class:'hero'}, collage,
    h('div', {class:'bus-card info'},
      h('div', {class:'chips'}, h('span', {class:'chip'}, fmt(f.fecha)), h('span', {class:'chip'}, f.ciudad)),
      h('p', {}, f.bienvenida),
      h('div', {class:'acciones'},
        h('button', {class:'btn negro', id:'btnInstalar', hidden:'', onclick:() => installEvt && installEvt.prompt()}, 'INSTALAR APP'),
        wa ? h('a', {class:'btn', href:wa, rel:'noopener'}, 'Soporte por WhatsApp') : null)));
  // lista desplegable del cartel: justo debajo de NOVEDADES
  const desplegable = destacados.length || cartel.length ? h('details', {class:'cartel'}, h('summary', {class:'btn'}, 'VER CARTEL COMPLETO'),
    h('ul', {class:'cartel-lista'}, ...[...destacados, ...cartel].map(n => h('li', {}, n)))) : null;
  const avisos = cfg.news.length ? h('section', {class:'avisos'}, titulo('AVISOS DEL VIAJE'), h('div', {class:'muro'}, ...cfg.news.map(tarjeta))) : null;
  const lineup = destacados.length ? h('section', {class:'lineup'}, titulo('LINEUP'), carrusel(destacados)) : null;
  $app.replaceChildren(...[ticker(cfg.news), desplegable, hero, avisos, lineup].filter(Boolean));
}
/* ---------- Menú lateral (3 rayitas): seleccionar asiento por autobús ---------- */
function menuLateral(){
  const btn = document.getElementById('menuBtn'); if(!btn) return;
  const d = h('dialog', {class:'menu-lateral', 'aria-label':'Seleccionar asientos'},
    h('div', {class:'menu-panel'},
      h('div', {class:'menu-cab'}, h('h2', {}, 'SELECCIONAR ASIENTOS'),
        h('button', {class:'cerrar', type:'button', 'aria-label':'Cerrar menú', onclick:() => d.close()}, '✕')),
      h('p', {class:'menu-sub'}, 'Elige tu autobús'),
      h('ul', {class:'menu-lista'}, ...cfg.buses.map(b => h('li', {},
        h('button', {class:'menu-item', type:'button', onclick:() => { d.close(); modalBus(b); }},
          h('b', {}, b.nombre.split(' - ')[0]), h('small', {}, contarAsientos(b.layout) + ' asientos'))))),
      h('a', {class:'menu-inicio', href:'#/', onclick:() => d.close()}, '← Ir al inicio')));
  d.addEventListener('click', e => { if(e.target === d) d.close(); });            // tocar fuera cierra
  d.addEventListener('close', () => btn.setAttribute('aria-expanded', 'false'));
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => { d.showModal(); btn.setAttribute('aria-expanded', 'true'); });
  document.body.append(d);
}
async function modalBus(b){
  const cap = contarAsientos(b.layout), cupo = h('p', {}, `Asientos: ${cap} • consultando disponibilidad…`);
  const d = modal(h('h3', {}, b.nombre), b.foto ? h('img', {src:b.foto, alt:b.nombre, class:'foto'}) : null,
    h('p', {}, 'CHOFER: ' + b.chofer), h('p', {class:'itin-tit'}, 'PUNTOS DE ABORDAJE'),
    h('ul', {class:'itin'}, ...(b.itinerario || []).map(x => h('li', {}, h('b', {}, x.punto), h('span', {}, 'Cita: ' + x.cita), h('span', {}, 'Salida: ' + x.salida)))), cupo,
    h('a', {class:'btn naranja', href:'#/bus/' + b.id, onclick:() => d.close()}, 'IR A RESERVAR'));
  try { const s = await api.getSeats(b.id), oc = s.taken.length + s.held.length; cupo.textContent = `Libres: ${cap - oc} • Ocupados: ${oc}`; }
  catch { cupo.textContent = `Asientos: ${cap}`; }
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
    const sel = h('select', {class:'campo'}, h('option', {value:'', disabled:'', selected:'', hidden:''}, 'Punto de abordaje'), ...(b.itinerario || b.puntos_abordaje.map(p => ({punto:p}))).map(x => h('option', {value:x.punto}, x.cita ? `${x.punto} · cita ${x.cita}` : x.punto)));
    const mapa = h('div', {class:'mapa'}), lista = h('p', {}, ''), msg = h('p', {class:'msg'});
    const nombre = h('input', {class:'campo', placeholder:'Nombre completo', maxlength:'80', autocomplete:'name'});
    const tel = h('input', {class:'campo', placeholder:'WhatsApp / teléfono (10 dígitos)', inputmode:'numeric', maxlength:'14', autocomplete:'tel'});
    const dom = h('input', {class:'campo', placeholder:'Domicilio o punto de referencia', maxlength:'120'});
    const chk = h('input', {type:'checkbox'});
    const fallo = e => { if(e.status === 401) pasoKey('Tu sesión expiró, valida la KEY de nuevo.'); else msg.textContent = e.message; };
    async function pintar(){
      let s = {taken:[], held:[], mine:[]}; try { s = await api.getSeats(b.id, st.token); } catch(e) { return fallo(e); }
      const mine = new Set(s.mine); st.sel = new Set([...st.sel].filter(n => mine.has(n)));
      renderMapa(mapa, b.layout, {taken:s.taken, held:s.held.filter(n => !mine.has(n)), selected:st.sel, onToggle:alternar, frente:b.frente, tvFrente:b.tv_frente});
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

/* ---------- PANTALLA 3: panel de administrador (#/admin) ---------- */
const ETIQUETAS = ['AVISO', 'ITINERARIO', 'URGENTE', 'ABORDAJE', 'LINEUP', 'CLIMA'];
function admin(){
  let token = null;
  const box = h('div', {class:'bus-card'});
  $app.replaceChildren(h('a', {href:'#/'}, '← Ver sitio'), h('h2', {}, 'PANEL ADMIN'), box);
  pasoKey();
  function pasoKey(m = ''){
    const inp = h('input', {type:'password', class:'campo', placeholder:'KEY de administrador', maxlength:'64', autocomplete:'current-password'}), msg = h('p', {class:'msg'}, m);
    const ir = async () => { try { token = (await api.validateKey('admin', inp.value.trim())).token; inp.value = ''; panel(); } catch(e) { msg.textContent = e.message; } };
    inp.addEventListener('keydown', e => { if(e.key === 'Enter') ir(); });
    box.replaceChildren(h('h3', {}, 'ENTRAR'), inp, msg, h('button', {class:'btn negro', onclick:ir}, 'ENTRAR'));
  }
  const fallo = (e, msg) => e.status === 401 ? pasoKey('Sesión expirada, escribe la KEY otra vez.') : (msg.textContent = e.message);
  async function panel(){
    const msg = h('p', {class:'msg'}), lista = h('div', {class:'adm-lista'});
    box.replaceChildren(h('button', {class:'btn naranja', onclick:() => formulario()}, '➕ NUEVO AVISO'), msg, lista);
    let datos = []; try { datos = await api.adminNews(token); } catch(e) { return fallo(e, msg); }
    if(!datos.length) lista.append(h('p', {}, 'Aún no hay avisos. Crea el primero.'));
    datos.forEach(n => lista.append(h('article', {class:'adm-item' + (n.activo ? '' : ' oculto')},
      h('div', {class:'meta'}, h('span', {class:'tag ' + etqClase(n.etiqueta)}, n.etiqueta), fechaOk(n.fecha) ? h('time', {}, fmt(n.fecha)) : null),
      h('h3', {}, (n.fijada ? '📌 ' : '') + n.titulo), h('p', {}, n.texto),
      h('div', {class:'acciones'},
        h('button', {class:'btn', onclick:() => formulario(n)}, 'EDITAR'),
        h('button', {class:'btn', onclick:() => guardar({...n, activo:!n.activo}, msg)}, n.activo ? 'OCULTAR' : 'MOSTRAR'),
        h('button', {class:'btn', onclick:() => guardar({...n, fijada:!n.fijada}, msg)}, n.fijada ? 'QUITAR PIN' : 'FIJAR'),
        h('button', {class:'btn negro', onclick:async () => { if(!confirm('¿Borrar este aviso?')) return;
          try { await api.adminDelete(n.id, token); panel(); } catch(e) { fallo(e, msg); } }}, 'BORRAR')))));
  }
  async function guardar(n, msg){ try { await api.adminSave(n, token); panel(); } catch(e) { fallo(e, msg); } }
  function formulario(n = {}){
    const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const f = {
      etiqueta:h('input', {class:'campo', list:'etiquetas', maxlength:'20', placeholder:'Etiqueta (ej. ITINERARIO)', value:n.etiqueta || 'AVISO'}),
      titulo:h('input', {class:'campo', maxlength:'80', placeholder:'Título', value:n.titulo || ''}),
      texto:h('textarea', {class:'campo area', maxlength:'200', rows:'2', placeholder:'Resumen corto (se ve en la tarjeta)'}),
      largo:h('textarea', {class:'campo area', maxlength:'1500', rows:'6', placeholder:'Detalle completo (se ve al tocar la tarjeta)'}),
      fecha:h('input', {class:'campo', type:'date', value:fechaOk(n.fecha) ? n.fecha : hoy}),
      enlace:h('input', {class:'campo', type:'url', maxlength:'300', placeholder:'Enlace https:// (opcional)', value:n.enlace || ''}),
      fijada:h('input', {type:'checkbox'}), activo:h('input', {type:'checkbox'})};
    f.texto.value = n.texto || ''; f.largo.value = n.texto_largo || ''; f.fijada.checked = !!n.fijada; f.activo.checked = n.activo !== false;
    const msg = h('p', {class:'msg'});
    box.replaceChildren(h('h3', {}, n.id ? 'EDITAR AVISO' : 'NUEVO AVISO'),
      h('datalist', {id:'etiquetas'}, ...ETIQUETAS.map(e => h('option', {value:e}))),
      f.etiqueta, f.titulo, f.texto, f.largo, f.fecha, f.enlace,
      h('label', {}, f.fijada, ' Fijar arriba'), h('br'), h('label', {}, f.activo, ' Visible en el sitio'), msg,
      h('div', {class:'acciones'},
        h('button', {class:'btn negro', onclick:async () => {
          if(!f.titulo.value.trim()) return msg.textContent = 'Escribe un título';
          try { await api.adminSave({id:n.id, etiqueta:f.etiqueta.value, titulo:f.titulo.value, texto:f.texto.value, texto_largo:f.largo.value,
            fecha:f.fecha.value, enlace:f.enlace.value, enlace_texto:n.enlace_texto || '', fijada:f.fijada.checked, activo:f.activo.checked}, token); panel(); }
          catch(e) { fallo(e, msg); } }}, '📣 PUBLICAR'),
        h('button', {class:'btn', onclick:panel}, 'CANCELAR')));
  }
}

/* ---------- Arranque ---------- */
function route(){ clearInterval(tick); clearInterval(carTimer); const m = location.hash.match(/^#\/bus\/([\w-]+)$/); location.hash === '#/admin' ? admin() : m ? reserva(m[1]) : inicio(); scrollTo(0, 0); }
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; document.getElementById('btnInstalar')?.removeAttribute('hidden'); });
(async () => {
  try { cfg = await loadConfig(); api.setBase(cfg.festival.api_base); document.title = cfg.festival.nombre;
    document.getElementById('marca').textContent = cfg.festival.nombre; menuLateral(); addEventListener('hashchange', route); route(); }
  catch { $app.textContent = 'No se pudo cargar la configuración del festival.'; }
})();
