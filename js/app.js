// App: portada (hero + muro) con menú lateral de buses y flujo de reserva por autobús.
// Todo se arma con textContent (nunca innerHTML) para evitar XSS.
import { loadConfig } from './config-loader.js';
import * as api from './api.js';
import { renderMapa, contarAsientos } from './seats.js';
import { crearMapa, distanciaKm, coordOk } from './mapa.js';
import { abrirWallet, guardarPase } from './wallet.js';

const h = (t, a = {}, ...k) => { const e = document.createElement(t);
  for (const [x, v] of Object.entries(a)) x === 'class' ? e.className = v : x.startsWith('on') ? e.addEventListener(x.slice(2), v) : e.setAttribute(x, v);
  e.append(...k.filter(c => c != null)); return e; };
const $app = document.getElementById('app');
let cfg, installEvt, tick, cuenta;
const fmt = f => new Date(f + 'T12:00:00').toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});

function modal(...contenido){
  const d = h('dialog', {class:'modal bus-card'}, h('button', {class:'cerrar', onclick:() => d.close()}, '✕'), ...contenido);
  d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal(); return d;
}

/* ---------- PANTALLA 1: bienvenida ---------- */
const busDe = n => cfg.buses.find(b => b.id === (n.bus_id || n.bus));
const busChip = n => busDe(n) ? h('span', {class:'tag bus-tag'}, busDe(n).nombre) : null;
const etqClase = t => 't' + ([...String(t || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % 4);   // color de etiqueta (clase CSS)
const fechaOk = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '');
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
let carTimer;
const titulo = t => h('div', {class:'titulo-sec'}, h('h2', {}, t), h('span', {class:'greca'}));

function barraReacciones(n){
  if(!n || !n.id) return null;
  const c = h('div', {class:'reacciones', onclick:e => e.stopPropagation()});
  const reaccs = [
    {id:'corazon', ico:'❤️', lbl:'Me encanta', prop:'reacc_corazon'},
    {id:'enojo', ico:'😡', lbl:'Me enoja', prop:'reacc_enojo'},
    {id:'entristece', ico:'😢', lbl:'Me entristece', prop:'reacc_entristece'}
  ];
  let cur = localStorage.getItem('alv.reacc.' + n.id) || '';

  const btns = reaccs.map(r => {
    const cont = h('span', {class:'reacc-cont'}, String(n[r.prop] || 0));
    const btn = h('button', {
      type:'button',
      class:'btn-reacc reacc-' + r.id + (cur === r.id ? ' activo' : ''),
      'aria-label': r.lbl,
      title: r.lbl,
      onclick: async e => {
        e.stopPropagation();
        const prev = cur;
        const nuevo = cur === r.id ? '' : r.id;
        cur = nuevo;
        if(nuevo) localStorage.setItem('alv.reacc.' + n.id, nuevo);
        else localStorage.removeItem('alv.reacc.' + n.id);

        if(prev && n['reacc_' + prev] != null) n['reacc_' + prev] = Math.max(0, (n['reacc_' + prev] || 0) - 1);
        if(nuevo && n['reacc_' + nuevo] != null) n['reacc_' + nuevo] = (n['reacc_' + nuevo] || 0) + 1;

        btns.forEach((b, i) => {
          const item = reaccs[i];
          b.el.className = 'btn-reacc reacc-' + item.id + (cur === item.id ? ' activo' : '');
          b.cnt.textContent = String(n[item.prop] || 0);
        });

        try {
          const res = await api.reactNews(n.id, nuevo, prev);
          if(res && typeof res.reacc_corazon === 'number'){
            n.reacc_corazon = res.reacc_corazon;
            n.reacc_enojo = res.reacc_enojo;
            n.reacc_entristece = res.reacc_entristece;
            btns.forEach((b, i) => { b.cnt.textContent = String(n[reaccs[i].prop] || 0); });
          }
        } catch {}
      }
    }, h('span', {class:'reacc-ico'}, r.ico), cont);
    return {el:btn, cnt:cont, id:r.id};
  });

  c.append(...btns.map(b => b.el));
  return c;
}

function detalle(n){
  modal(h('span', {class:'tag ' + etqClase(n.etiqueta)}, n.etiqueta || 'AVISO'), busChip(n), h('h3', {}, n.titulo),
    n.imagen ? h('img', {src:n.imagen, alt:'', class:'foto'}) : null, h('p', {}, n.texto_largo || n.texto),
    barraReacciones(n),
    /^https:\/\//.test(n.enlace || '') ? h('a', {class:'btn naranja', href:n.enlace, target:'_blank', rel:'noopener noreferrer'}, n.enlace_texto || 'VER MÁS') : null);
}
const tarjeta = n => h('article', {class:'noticia bus-card' + (n.fijada ? ' fijada' : ''), tabindex:'0', onclick:() => detalle(n), onkeydown:e => { if(e.key === 'Enter') detalle(n); }},
  h('div', {class:'meta'}, h('span', {class:'tag ' + etqClase(n.etiqueta)}, n.etiqueta || 'AVISO'), busChip(n), fechaOk(n.fecha) ? h('time', {}, fmt(n.fecha)) : null),
  h('h3', {}, n.titulo), n.imagen ? h('img', {src:n.imagen, alt:''}) : null, h('p', {}, n.texto),
  barraReacciones(n));

function ticker(news){                       // cinta de novedades (solo CSS, texto plano)
  const items = news.slice(0, 5).map(n => (busDe(n) ? busDe(n).nombre + ' · ' : '') + (n.etiqueta ? n.etiqueta + ': ' : '') + n.titulo);
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

/* ---------- Tracker de TODOS los buses (portada, dentro de AVISOS DEL VIAJE) ---------- */
let liveTimer;
const hace = seg => seg < 60 ? seg + ' s' : seg < 3600 ? Math.round(seg / 60) + ' min' : Math.round(seg / 3600) + ' h';
function trackerBuses(){                    // ventana "Ubicación de los buses" (se abre desde el menú de las 3 rayas)
  const mapa = crearMapa(), meta = cfg.festival.destino || {}, nota = h('p', {class:'live-estado'}, 'Buscando autobuses…');
  const num = b => (b.id.match(/\d+/) || [b.id])[0];
  const estados = new Map(), lista = h('ul', {class:'live-lista'}, ...cfg.buses.map(b => {
    const st = h('small', {}, 'Aún sin ubicación'); estados.set(b.id, st);
    return h('li', {class:'live-fila'}, h('b', {}, b.nombre), st,
      h('div', {class:'acciones'}, h('button', {class:'btn', type:'button', onclick:() => enVivo(b)}, 'MAPA'))); }));
  const vista = {lat:19.0626, lng:-98.2848, z:13};      // sin buses en ruta: mapa base centrado en el destino
  setTimeout(() => mapa.pintarTodos([], meta, vista), 0);
  async function leer(){
    if(document.hidden) return;
    let ps; try { ps = await api.getPosAll(cfg.buses.map(b => b.id)); } catch { nota.textContent = 'No se pudo consultar la ubicación. Reintentando…'; return; }
    const pts = [];
    for(const b of cfg.buses){
      const p = ps[b.id], st = estados.get(b.id);
      if(!p || !p.tiene || !coordOk(p.lat, p.lng)) continue;
      const t = [(p.activo ? '🟢 En ruta' : '⚪ Sin señal') + ' · hace ' + hace(p.edad)];
      if(p.activo && Number.isFinite(p.speed)) t.push(Math.round(p.speed * 3.6) + ' km/h');
      if(coordOk(meta.lat, meta.lng)) t.push('~' + distanciaKm(p, meta).toFixed(1) + ' km al destino');
      st.textContent = t.join(' · '); pts.push({lat:p.lat, lng:p.lng, etq:num(b), activo:p.activo, foto:b.foto});
    }
    mapa.pintarTodos(pts, meta, vista);
    nota.textContent = pts.length ? 'Posición del último reporte; si el pin está gris, no hay señal reciente.' : 'Aún no hay buses reportando en el mapa.';
  }
  clearInterval(liveTimer); liveTimer = setInterval(leer, 15000); leer();
  const d = modal(h('div', {class:'tracker-home'}, h('h3', {}, '📍 UBICACIÓN DE LOS BUSES'), mapa.el, nota, lista));
  d.addEventListener('close', () => clearInterval(liveTimer));
}

function modalOpiniones(){
  const inpNombre = h('input', {class:'campo', placeholder:'Tu nombre o apodo (opcional)', maxlength:'50', autocomplete:'nickname'});
  const txtMensaje = h('textarea', {class:'campo area', rows:'3', maxlength:'500', placeholder:'¿Cómo podemos mejorar la app o la experiencia del viaje?'});
  const msgEst = h('p', {class:'msg'});
  const listaCont = h('div', {class:'comentarios-lista'}, h('p', {class:'live-estado'}, 'Cargando opiniones…'));

  async function cargarComentarios(){
    try {
      const items = await api.getFeedback();
      listaCont.replaceChildren();
      if(!items || !items.length){
        listaCont.append(h('p', {class:'live-estado'}, 'Aún no hay opiniones. ¡Sé el primero en compartir tu sugerencia!'));
        return;
      }
      items.forEach(c => {
        const f = c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : '';
        listaCont.append(h('article', {class:'comentario-card'},
          h('div', {class:'comentario-cab'},
            h('span', {class:'comentario-autor'}, c.nombre || 'Pasajero'),
            f ? h('time', {class:'comentario-fecha'}, f) : null
          ),
          h('p', {class:'comentario-texto'}, c.mensaje)
        ));
      });
    } catch {
      listaCont.replaceChildren(h('p', {class:'live-estado'}, 'No se pudieron cargar las opiniones en este momento.'));
    }
  }

  async function enviar(){
    const m = txtMensaje.value.trim();
    if(m.length < 3) return msgEst.textContent = 'Escribe tu opinión o sugerencia (mínimo 3 letras)';
    msgEst.textContent = 'Enviando opinión…';
    try {
      await api.sendFeedback(inpNombre.value.trim() || 'Pasajero viajero', m);
      txtMensaje.value = '';
      msgEst.textContent = '✅ ¡Muchas gracias por tu opinión!';
      setTimeout(() => { if(msgEst.textContent.includes('Gracias')) msgEst.textContent = ''; }, 4000);
      cargarComentarios();
    } catch(e) {
      msgEst.textContent = e.message || 'No se pudo enviar tu opinión.';
    }
  }

  const form = h('div', {class:'form-comentario'},
    inpNombre, txtMensaje, msgEst,
    h('button', {class:'btn naranja', type:'button', onclick:enviar}, 'PUBLICAR OPINIÓN')
  );

  modal(h('h3', {}, '💬 OPINIONES Y MEJORAS'),
    h('p', {}, '¡Tu opinión nos ayuda a mejorar la experiencia en los viajes y en esta app! Déjanos tus sugerencias o ideas:'),
    form,
    listaCont
  );
  cargarComentarios();
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
        h('button', {class:'btn naranja', type:'button', onclick:() => abrirWallet(cfg)}, '🎟 MI RESERVA'),
        wa ? h('a', {class:'btn', href:wa, rel:'noopener'}, 'Soporte por WhatsApp') : null)));
  // lista desplegable del cartel: justo debajo de NOVEDADES
  const desplegable = destacados.length || cartel.length ? h('details', {class:'cartel'}, h('summary', {class:'btn'}, 'VER CARTEL COMPLETO'),
    h('ul', {class:'cartel-lista'}, ...[...destacados, ...cartel].map(n => {
      const u = (f.lineup_instagram || {})[n];            // usuario de Instagram (solo letras, números, . y _)
      return h('li', {}, /^[A-Za-z0-9._]{1,30}$/.test(u || '') ? h('a', {href:'https://www.instagram.com/' + u + '/', target:'_blank', rel:'noopener noreferrer', 'aria-label':n + ' en Instagram'}, n) : n); }))) : null;
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
      h('ul', {class:'menu-lista'},
        h('li', {}, h('button', {class:'menu-item', type:'button', onclick:() => { d.close(); abrirWallet(cfg); }}, h('b', {}, '🎟 Mi reserva'), h('small', {}, 'Ver mi folio'))),
        h('li', {}, h('button', {class:'menu-item', type:'button', onclick:() => { d.close(); modalOpiniones(); }}, h('b', {}, '💬 Opiniones y Mejoras'), h('small', {}, 'Buzón de sugerencias')))),
      h('p', {class:'menu-sub'}, 'Elige tu autobús'),
      h('ul', {class:'menu-lista'}, ...cfg.buses.map(b => h('li', {},
        h('button', {class:'menu-item', type:'button', onclick:() => { d.close(); modalBus(b); }},
          h('b', {}, b.nombre), h('small', {}, contarAsientos(b.layout) + ' asientos'))))),
      ...(cfg.festival.tracker === true ? [h('p', {class:'menu-sub'}, 'Seguimiento'),
        h('ul', {class:'menu-lista'}, h('li', {}, h('button', {class:'menu-item', type:'button', onclick:() => { d.close(); trackerBuses(); }},
          h('b', {}, '📍 Ubicación de los buses'), h('small', {}, 'Ver info'))))] : []),
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
    h('p', {class:'itin-tit'}, 'PUNTOS DE ABORDAJE'),
    h('ul', {class:'itin'}, ...(b.itinerario || []).map(x => h('li', {}, h('b', {}, x.punto), h('span', {}, 'Cita: ' + x.cita), h('span', {}, 'Salida: ' + x.salida)))), cupo,
    h('div', {class:'acciones'}, h('a', {class:'btn naranja', href:'#/bus/' + b.id, onclick:() => d.close()}, 'IR A RESERVAR'),
      h('button', {class:'btn', type:'button', onclick:() => { d.close(); enVivo(b); }}, '📍 VER BUS EN VIVO')));
  try { const s = await api.getSeats(b.id), oc = s.taken.length + s.held.length; cupo.textContent = `Libres: ${cap - oc} • Ocupados: ${oc}`; }
  catch { cupo.textContent = `Asientos: ${cap}`; }
}

/* ---------- Tracker: ubicación del bus en vivo (la transmite el celular del admin) ---------- */
function enVivo(b){
  const mapa = crearMapa(), estado = h('p', {class:'live-estado'}, 'Buscando señal…'), datos = h('p', {class:'live-datos'});
  const enlace = h('a', {class:'btn', target:'_blank', rel:'noopener noreferrer', hidden:''}, 'ABRIR EN GOOGLE MAPS');
  mapa.el.hidden = true;
  const d = modal(h('h3', {}, b.nombre + ' · EN VIVO'), mapa.el, estado, datos, enlace);
  const meta = cfg.festival.destino || {};
  async function leer(){
    try {
      const p = await api.getPos(b.id);
      if(!p.tiene){ mapa.el.hidden = true; enlace.hidden = true; datos.textContent = ''; estado.textContent = 'Este autobús aún no comparte su ubicación. Vuelve a revisar cuando salga.'; return; }
      mapa.el.hidden = false; mapa.pintar(p, meta, b.foto);
      estado.textContent = (p.activo ? '🟢 En ruta · actualizado hace ' : '⚪ Sin señal reciente · última posición hace ') + hace(p.edad);
      const partes = [];
      if(p.activo && Number.isFinite(p.speed)) partes.push(Math.round(p.speed * 3.6) + ' km/h');
      if(coordOk(meta.lat, meta.lng)) partes.push('Faltan ~' + distanciaKm(p, meta).toFixed(1) + ' km a ' + (meta.nombre || 'el destino'));
      datos.textContent = partes.join(' · ');
      enlace.href = 'https://www.google.com/maps?q=' + p.lat + ',' + p.lng; enlace.hidden = false;
    } catch { estado.textContent = 'No se pudo consultar la ubicación. Reintentando…'; }
  }
  const t = setInterval(leer, 10000); d.addEventListener('close', () => clearInterval(t)); leer();
}

/* ---------- Transmisión GPS del admin (módulo: se detiene al salir del panel) ---------- */
let gps = null;                                    // {watch, bus, token, ultimo, wake}
async function bloquearPantalla(){ try { if(gps && navigator.wakeLock) gps.wake = await navigator.wakeLock.request('screen'); } catch {} }
function detenerGps(){
  if(!gps) return; const g = gps; gps = null;
  navigator.geolocation.clearWatch(g.watch); try { g.wake?.release(); } catch {}
  api.adminPosStop(g.bus, g.token).catch(() => {});
}
document.addEventListener('visibilitychange', () => { if(gps && document.visibilityState === 'visible') bloquearPantalla(); });

/* ---------- PANTALLA 2: reserva por autobús ---------- */
function reserva(id){
  const b = cfg.buses.find(x => x.id === id); if(!b) return void (location.hash = '#/');
  const st = {token:null, phone:'', sel:new Set(), exp:new Map()};
  const box = h('div', {class:'bus-card'});
  $app.replaceChildren(h('a', {href:'#/'}, '← Volver'), h('h2', {}, b.nombre), box);
  pasoKey();

  function pasoKey(msgTxt = ''){            // Paso 1: celular + KEY (la KEY y el celular se validan SOLO en el servidor)
    clearInterval(tick); clearInterval(cuenta);
    const tel = h('input', {type:'tel', class:'campo', placeholder:'Tu celular (10 dígitos)', inputmode:'numeric', maxlength:'14', autocomplete:'tel'});
    const inp = h('input', {type:'password', class:'campo', placeholder:'KEY del autobús', maxlength:'64', autocomplete:'off'});
    const msg = h('p', {class:'msg'}, msgTxt);
    box.replaceChildren(h('h3', {}, 'VALIDA TU CELULAR Y TU KEY'),
      h('p', {}, 'Solo se permite UNA reserva por celular y después no se puede cambiar. Revisa bien tu número.'), tel, inp, msg,
      h('button', {class:'btn negro', onclick:async () => {
        const t = tel.value.replace(/[\s-]/g, '');
        if(!/^\d{10}$/.test(t)) return msg.textContent = 'El celular debe tener 10 dígitos';
        if(!confirm(`¿Tu celular es ${t}?\n\nCon este número quedará tu reserva y no podrá cambiarse.`)) return;
        try { st.token = (await api.validateKey(b.id, inp.value.trim(), t)).token; st.phone = t; inp.value = ''; pasoReserva(); }
        catch(e) { msg.textContent = e.message; } }}, 'VALIDAR'));
  }
  function pasoReserva(){                   // Pasos 2-4: tus datos → asientos (se apartan 2 min) → confirmar
    const sel = h('select', {class:'campo'}, h('option', {value:'', disabled:'', selected:'', hidden:''}, 'Punto de abordaje'), ...(b.itinerario || b.puntos_abordaje.map(p => ({punto:p}))).map(x => h('option', {value:x.punto}, x.cita ? `${x.punto} · cita ${x.cita}` : x.punto)));
    const mapa = h('div', {class:'mapa'}), lista = h('p', {}, ''), crono = h('p', {class:'live-estado'}), msg = h('p', {class:'msg'});
    const nombre = h('input', {class:'campo', placeholder:'Nombre completo', maxlength:'80', autocomplete:'name'});
    const chk = h('input', {type:'checkbox'});
    const fallo = e => { if(e.status === 401) pasoKey('Tu sesión expiró, valida tu celular y KEY de nuevo.'); else msg.textContent = e.message; };
    const datosOk = () => !/^[\p{L}][\p{L} .'-]{2,79}$/u.test(nombre.value.trim()) ? 'Primero escribe tu nombre completo'
      : !sel.value ? 'Primero elige tu punto de abordaje' : !chk.checked ? 'Primero acepta el aviso de privacidad' : '';
    const mmss = ms => { const x = Math.ceil(ms / 1000); return Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); };
    function reloj(){                       // cuenta regresiva local; al vencer, el servidor ya liberó el asiento y se refresca el mapa
      const t = Date.now(); let menor = Infinity, vencido = false;
      for(const [n, f] of st.exp){ if(f <= t){ vencido = true; st.exp.delete(n); } else menor = Math.min(menor, f); }
      crono.textContent = menor === Infinity ? '' : '⏱ Te quedan ' + mmss(menor - t) + ' para confirmar; si no, el asiento se libera';
      if(vencido) pintar();
    }
    async function pintar(){
      let s = {taken:[], held:[], mine:[], mine_until:{}, now:Date.now()}; try { s = await api.getSeats(b.id, st.token); } catch(e) { return fallo(e); }
      const mine = new Set(s.mine), skew = Date.now() - (s.now || Date.now());
      const perdidos = [...st.sel].filter(n => !mine.has(n));
      if(perdidos.length) msg.textContent = `Se liberó el asiento ${perdidos.sort((a, c) => a - c).join(', ')} (pasaron 2 minutos). Elígelo de nuevo si lo quieres.`;
      st.sel = new Set([...st.sel].filter(n => mine.has(n)));
      st.exp = new Map(s.mine.map(n => [n, new Date(s.mine_until[n]).getTime() + skew]));
      renderMapa(mapa, b.layout, {taken:s.taken, held:s.held.filter(n => !mine.has(n)), selected:st.sel, onToggle:alternar, frente:b.frente, tvFrente:b.tv_frente});
      lista.textContent = `${st.sel.size} SELECCIONADOS` + (st.sel.size ? ': ' + [...st.sel].sort((a, c) => a - c).join(', ') + ' (se liberan a los 2 min si no confirmas)' : '');
      reloj();
    }
    async function alternar(n){
      if(!st.sel.has(n)){ const e = datosOk(); if(e){ msg.textContent = e; return; } }   // sin datos completos no se aparta nada
      try { await api.holdSeat(b.id, n, st.token, st.sel.has(n)); st.sel.has(n) ? st.sel.delete(n) : st.sel.add(n); msg.textContent = ''; }
      catch(e) { fallo(e); }
      pintar();
    }
    async function limpiar(){ for(const n of [...st.sel]) try { await api.holdSeat(b.id, n, st.token, true); } catch {} st.sel.clear(); pintar(); }
    async function enviar(){
      const e = datosOk(); if(e) return msg.textContent = e;
      if(!st.sel.size) return msg.textContent = 'Elige al menos un asiento';
      const n = nombre.value.trim(), asientos = [...st.sel].sort((a, c) => a - c);
      if(!confirm(`Vas a reservar en ${b.nombre}:\n\n• Asientos: ${asientos.join(', ')}\n• Nombre: ${n}\n• Celular: ${st.phone}\n• Abordaje: ${sel.value}\n\nNo podrás cambiarlos después. ¿Confirmas?`)) return;
      const datos = {bus_id:b.id, seats:asientos, boarding:sel.value, name:n, address:sel.value.slice(0, 120), consent:true};
      try { const r = await api.createReservation(datos, st.token); clearInterval(tick); clearInterval(cuenta);
        guardarPase({folio:r.folio, bus_id:b.id, seats:asientos, boarding:datos.boarding, name:n.split(' ')[0], phone:st.phone});   // wallet: queda en este celular
        confirmacion(r.folio, datos); }
      catch(e) { fallo(e); pintar(); }
    }
    box.replaceChildren(h('h3', {}, '1. TUS DATOS'), h('p', {}, 'Celular: ' + st.phone.slice(0, 2) + '••••' + st.phone.slice(-4)), nombre, sel,
      h('label', {}, chk, ' Acepto el ', h('a', {href:'#', onclick:e => { e.preventDefault(); modal(h('h3', {}, 'AVISO DE PRIVACIDAD'), h('p', {}, cfg.festival.aviso_privacidad)); }}, 'aviso de privacidad')),
      h('h3', {}, '2. ELIGE TUS LUGARES'), h('p', {}, 'Cada asiento se aparta solo 2 minutos. Confirma antes de que termine el tiempo.'), mapa, lista, crono, msg,
      h('button', {class:'btn negro', onclick:enviar}, '🔥 CONFIRMAR RESERVA'), ' ', h('button', {class:'btn', onclick:limpiar}, 'LIMPIAR'));
    pintar(); clearInterval(tick); tick = setInterval(pintar, 10000); clearInterval(cuenta); cuenta = setInterval(reloj, 1000);
  }
  function confirmacion(folio, d){          // Paso 5
    box.replaceChildren(h('h3', {}, '¡LISTO, A ROCKEAR!'), h('p', {}, 'Festival: ' + cfg.festival.nombre), h('p', {}, 'Autobús: ' + b.nombre),
      h('p', {}, 'Asientos: ' + d.seats.join(', ')), h('p', {}, 'Abordaje: ' + d.boarding), h('p', {}, 'Nombre: ' + d.name),
      h('h2', {}, 'FOLIO: ' + folio), h('p', {}, 'Guarda tu folio. No lo compartas con nadie.'),
      h('button', {class:'btn naranja', type:'button', onclick:() => abrirWallet(cfg)}, '🎟 VER MI PASE'));
  }
}

/* ---------- PANTALLA 3: panel de administrador (#/admin) ---------- */
const ETIQUETAS = ['AVISO', 'ITINERARIO', 'URGENTE', 'ABORDAJE', 'LINEUP', 'CLIMA'];
let chkCtrl = null, audioCtx = null;

function sonidoBeep(exito = true){
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = exito ? 880 : 330;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
    osc.start(); osc.stop(audioCtx.currentTime + 0.25);
  } catch {}
  try { if (navigator.vibrate) navigator.vibrate(exito ? [80, 50, 80] : 300); } catch {}
}

function checkinAdmin(box, token, alExpirar){
  const visor = h('div', {class:'visor-camara'});
  visor.hidden = true;
  const video = h('video', {class:'video-camara', playsinline:'', muted:''});
  const reticula = h('div', {class:'reticula-qr'}, h('div', {class:'reticula-linea'}));
  visor.append(video, reticula);

  const inpFolio = h('input', {class:'campo', placeholder:'Folio del boleto (ej. TC-1-2)', maxlength:'30', autocomplete:'off'});
  const btnScan = h('button', {class:'btn naranja', type:'button'}, '📷 ABRIR ESCÁNER QR');
  const btnBuscar = h('button', {class:'btn negro', type:'button'}, 'VALIDAR FOLIO');
  const msgEst = h('p', {class:'msg'});
  const statsBox = h('div', {class:'checkin-stats'});

  let stream = null, scanTimer = null, escaneando = false, cooldown = 0, abiertos = 0, procesando = false, detector = null;

  async function actualizarStats(){
    try {
      const r = await api.adminCheckinsSummary(token);
      statsBox.replaceChildren();
      if(!r || !r.length) return;
      const totalAsientos = r.reduce((acc, x) => acc + (x.seats || []).length, 0);
      const abordados = r.filter(x => x.checked_in).reduce((acc, x) => acc + (x.seats || []).length, 0);
      statsBox.append(h('span', {class:'stat-chip'}, `Total abordados: ${abordados} / ${totalAsientos} asientos`));
      cfg.buses.forEach(b => {
        const delBus = r.filter(x => x.bus_id === b.id);
        const bTot = delBus.reduce((acc, x) => acc + (x.seats || []).length, 0);
        const bAbord = delBus.filter(x => x.checked_in).reduce((acc, x) => acc + (x.seats || []).length, 0);
        if(bTot > 0) statsBox.append(h('span', {class:'stat-chip'}, `${b.nombre}: ${bAbord}/${bTot}`));
      });
    } catch {}
  }

  // Modal de resultado: éxito (verde), ya escaneado (amarillo), error (rojo) o check-in deshecho (azul).
  // Mientras está abierto el escáner se pausa para no leer dos veces el mismo boleto.
  function modalCheckin(tipo, titulo, sub, res = null){
    const icono = {exito:'✅', alerta:'⚠️', error:'❌', deshecho:'↩️'}[tipo];
    const bus = res ? (busDe({bus_id:res.bus_id}) || {nombre:res.bus_id || 'Autobús'}) : null;
    const fila = (et, val) => h('div', {class:'res-fila'}, h('small', {}, et), h('b', {}, val));
    const asientos = res ? h('div', {class:'res-fila'}, h('small', {}, 'ASIENTOS'), h('div', {class:'badge-asientos'}, ...(res.seats || []).map(s => h('span', {class:'badge-asiento'}, '#' + s)))) : null;
    const puedeDeshacer = res && (tipo === 'exito' || tipo === 'alerta');
    const d = modal(h('div', {class:'res-icono', 'aria-hidden':'true'}, icono), h('h3', {}, titulo), h('p', {class:'res-sub'}, sub),
      ...(res ? [fila('PASAJERO', res.name || '-'), fila('FOLIO', res.folio), fila('AUTOBÚS', bus.nombre), asientos,
        fila('ABORDAJE', res.boarding || 'No especificado'), fila('CELULAR', res.phone || '-')] : []),
      h('div', {class:'acciones'},
        h('button', {class:'btn naranja', type:'button', onclick:() => d.close()}, '▶ SIGUIENTE BOLETO'),
        puedeDeshacer ? h('button', {class:'btn', type:'button', onclick:() => { d.close(); procesarCheckin(res.folio, 'revert'); }}, '↩ DESHACER CHECK-IN') : null));
    d.classList.add('res-modal', tipo); d.setAttribute('role', tipo === 'error' ? 'alertdialog' : 'dialog'); d.setAttribute('aria-label', titulo);
    d.addEventListener('click', e => { if(e.target === d) d.close(); });          // tocar fuera también cierra
    abiertos++; sonidoBeep(tipo === 'exito' || tipo === 'deshecho');
    d.addEventListener('close', () => { abiertos--; cooldown = Date.now() + 1500; inpFolio.value = ''; });
    return d;
  }

  async function procesarCheckin(folio, accion = 'checkin'){
    const f = String(folio || '').trim().toUpperCase();
    if(!f) return void (msgEst.textContent = 'Escribe o escanea un folio');
    if(procesando) return;
    if(!/^[A-Z0-9-]{1,30}$/.test(f)){ msgEst.textContent = ''; return void modalCheckin('error', 'QR NO VÁLIDO', 'Este código no es un boleto de ALV Tours.'); }
    procesando = true; msgEst.textContent = 'Verificando en Supabase…';
    try {
      const resp = await api.adminCheckin(f, token, accion);
      msgEst.textContent = '';
      const res = resp.reservation || {};
      const hora = resp.checked_in_at ? new Date(resp.checked_in_at).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : 'ahora';
      if(resp.revertido) modalCheckin('deshecho', 'CHECK-IN DESHECHO', 'El boleto quedó otra vez como pendiente de abordar.', res);
      else if(resp.ya_validado) modalCheckin('alerta', 'BOLETO YA ESCANEADO', `Este boleto ya hizo check-in a las ${hora}. Cuidado con boletos duplicados.`, res);
      else modalCheckin('exito', '¡CHECK-IN EXITOSO!', `Asientos validados en Supabase a las ${hora}`, res);
    } catch(e) {
      msgEst.textContent = '';
      if(e.status === 401) return void (alExpirar && alExpirar());
      modalCheckin('error', e.status === 404 ? 'BOLETO NO ENCONTRADO' : 'NO SE PUDO VALIDAR',
        e.status === 404 ? `Folio "${f}": verifica que esté bien escrito o que sea de este evento.` : (e.message || 'Revisa tu conexión e intenta de nuevo.'));
    } finally { procesando = false; actualizarStats(); }
  }

  async function iniciarCamara(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      msgEst.textContent = 'Tu navegador no permite acceso a la cámara. Usa la validación manual por folio.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      video.srcObject = stream;
      await video.play();
      visor.hidden = false;
      escaneando = true;
      btnScan.textContent = '■ CERRAR CÁMARA';
      btnScan.className = 'btn negro';
      msgEst.textContent = 'Apunta la cámara al código QR del boleto…';
      bucleEscaneo();
    } catch(err) {
      msgEst.textContent = 'No se pudo acceder a la cámara (' + err.message + '). Valida por folio.';
    }
  }

  function detenerCamara(){
    escaneando = false;
    clearTimeout(scanTimer);
    if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
    visor.hidden = true;
    btnScan.textContent = '📷 ABRIR ESCÁNER QR';
    btnScan.className = 'btn naranja';
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {willReadFrequently:true});

  async function bucleEscaneo(){
    if(!escaneando) return;
    if(video.readyState >= video.HAVE_CURRENT_DATA && Date.now() > cooldown && !abiertos && !procesando){
      let textoDetectado = null;
      if('BarcodeDetector' in window){
        try {
          detector = detector || new window.BarcodeDetector({formats:['qr_code']});
          const barcodes = await detector.detect(video);
          if(barcodes && barcodes.length && barcodes[0].rawValue) textoDetectado = barcodes[0].rawValue;
        } catch {}
      }
      if(!textoDetectado && window.jsQR && video.videoWidth > 0){
        try {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(imgData.data, imgData.width, imgData.height, {inversionAttempts:'dontInvert'});
          if(code && code.data) textoDetectado = code.data;
        } catch {}
      }
      if(textoDetectado && escaneando && !abiertos && !procesando){
        const f = textoDetectado.trim().toUpperCase();
        inpFolio.value = f.slice(0, 30);
        procesarCheckin(f);
      }
    }
    scanTimer = setTimeout(bucleEscaneo, 200);
  }

  btnScan.addEventListener('click', () => { escaneando ? detenerCamara() : iniciarCamara(); });
  btnBuscar.addEventListener('click', () => { procesarCheckin(inpFolio.value); });
  inpFolio.addEventListener('keydown', e => { if(e.key === 'Enter') procesarCheckin(inpFolio.value); });

  box.replaceChildren(
    h('h3', {}, '📷 ESCANEAR QR / CHECK-IN'),
    h('p', {}, 'Valida los asientos reservados al abordar. Escanea el QR del boleto con la cámara o escribe el folio para registrar el check-in en Supabase:'),
    statsBox,
    h('div', {class:'acciones'}, btnScan),
    visor,
    h('div', {class:'sep-arriba'}, inpFolio),
    h('div', {class:'acciones'}, btnBuscar),
    msgEst
  );

  return { detener: detenerCamara, refrescar: actualizarStats };
}

async function adminOpiniones(box, token, alExpirar){
  const msg = h('p', {class:'msg'}), lista = h('div', {class:'adm-lista'});
  box.replaceChildren(h('h3', {}, '💬 OPINIONES DE LOS USUARIOS'), msg, lista);
  try {
    const items = await api.getFeedback();
    if(!items.length) { lista.append(h('p', {}, 'Aún no hay opiniones recibidas.')); return; }
    items.forEach(c => {
      const f = c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : '';
      lista.append(h('article', {class:'adm-item'},
        h('div', {class:'meta'}, h('b', {}, c.nombre || 'Pasajero'), f ? h('time', {}, f) : null),
        h('p', {}, c.mensaje),
        h('div', {class:'acciones'},
          h('button', {class:'btn negro', onclick:async () => {
            if(!confirm('¿Eliminar esta opinión?')) return;
            try { await api.adminDeleteFeedback(c.id, token); adminOpiniones(box, token, alExpirar); }
            catch(e) { if(e.status === 401 && alExpirar) alExpirar(); else msg.textContent = e.message; }
          }}, 'BORRAR'))
      ));
    });
  } catch(e) { msg.textContent = 'No se pudieron cargar opiniones: ' + e.message; }
}

function admin(){
  let token = null, abierta = null;
  const login = h('div', {class:'bus-card'}), menu = h('div', {class:'adm-menu'});
  // Cada sección vive en su propio contenedor y se muestra dentro de un modal
  const box = h('div'), trk = h('div'), chk = h('div'), fdb = h('div');
  const cabecera = () => [h('a', {href:'#/'}, '← Ver sitio'), h('h2', {}, 'PANEL ADMIN')];
  $app.replaceChildren(...cabecera(), login);
  pasoKey();

  function cerrarSeccion(){ if(abierta && abierta.open) abierta.close(); }
  function abrirSeccion(contenido, alCerrar){
    cerrarSeccion();
    const d = abierta = modal(contenido);
    d.classList.add('adm-modal');
    d.addEventListener('close', () => { if(abierta === d) abierta = null; if(alCerrar) alCerrar(); pintarMenu(); });
    return d;
  }
  const expira = () => pasoKey('Sesión expirada, escribe la KEY otra vez.');
  function pintarMenu(){
    const op = (ico, tit, sub, fn) => h('button', {class:'adm-op', type:'button', onclick:fn},
      h('span', {class:'adm-ico', 'aria-hidden':'true'}, ico), h('b', {}, tit), h('small', {}, sub));
    menu.replaceChildren(
      op('📷', 'Check-in QR', 'Escanear boletos', () => { abrirSeccion(chk, () => chkCtrl && chkCtrl.detener()); chkCtrl && chkCtrl.refrescar(); }),
      op('📰', 'Noticias', 'Publicar y editar avisos', () => { panel(); abrirSeccion(box); }),
      op('💬', 'Opiniones', 'Buzón de los usuarios', () => { adminOpiniones(fdb, token, expira); abrirSeccion(fdb); }),
      cfg.festival.tracker === true ? op('📍', 'Ubicación del bus', gps ? '🟢 Transmitiendo' : 'Sin transmitir', () => abrirSeccion(trk)) : null);
  }

  function pasoKey(m = ''){
    cerrarSeccion(); if(chkCtrl){ chkCtrl.detener(); chkCtrl = null; }
    $app.replaceChildren(...cabecera(), login);
    const inp = h('input', {type:'password', class:'campo', placeholder:'KEY de administrador', maxlength:'64', autocomplete:'current-password'}), msg = h('p', {class:'msg'}, m);
    const ir = async () => {
      try {
        token = (await api.validateKey('admin', inp.value.trim())).token;
        inp.value = '';
        $app.replaceChildren(...cabecera(), h('p', {class:'live-estado'}, 'Elige una opción:'), menu);
        pintarMenu(); tracker();
        chkCtrl = checkinAdmin(chk, token, expira);
      } catch(e) { msg.textContent = e.message; }
    };
    inp.addEventListener('keydown', e => { if(e.key === 'Enter') ir(); });
    login.replaceChildren(h('h3', {}, 'ENTRAR'), inp, msg, h('button', {class:'btn negro', onclick:ir}, 'ENTRAR'));
  }
  function tracker(){                       // compartir la ubicación GPS de este celular como la de un bus
    const sel = h('select', {class:'campo'}, ...cfg.buses.map(b => h('option', {value:b.id}, b.nombre)));
    const est = h('p', {class:'live-estado'}), btn = h('button', {class:'btn naranja', type:'button'});
    const pintarBtn = () => { btn.textContent = gps ? '■ DETENER UBICACIÓN' : '▶ INICIAR UBICACIÓN'; sel.disabled = !!gps; };
    const hora = () => new Date().toLocaleTimeString('es-MX');
    function enviar(pos){
      if(!gps) return; const ahora = Date.now(); if(ahora - gps.ultimo < 5000) return; gps.ultimo = ahora;
      const c = pos.coords;
      api.adminPos({bus_id:gps.bus, lat:c.latitude, lng:c.longitude, speed:c.speed ?? null, heading:c.heading ?? null, acc:c.accuracy}, token)
        .then(() => { if(gps) est.textContent = `🟢 Transmitiendo · último envío ${hora()} · precisión ±${Math.round(c.accuracy)} m`; })
        .catch(e => { if(e.status === 401){ detenerGps(); pintarBtn(); est.textContent = 'La sesión expiró. Entra de nuevo con la KEY y reinicia.'; } else est.textContent = e.status ? '⚠️ El servidor rechazó la ubicación (' + e.message + '). ¿Ejecutaste agregar_tracker.sql y desplegaste la función?' : '⚠️ Sin internet, reintentando…'; });
    }
    btn.addEventListener('click', () => {
      if(gps){ detenerGps(); pintarBtn(); est.textContent = 'Transmisión detenida.'; return; }
      if(!navigator.geolocation){ est.textContent = 'Este navegador no tiene GPS.'; return; }
      est.textContent = 'Pidiendo permiso de ubicación…';
      gps = {bus:sel.value, token, ultimo:0, wake:null};
      gps.watch = navigator.geolocation.watchPosition(enviar,
        er => { est.textContent = er.code === 1 ? 'Permiso de ubicación denegado. Actívalo en el navegador y vuelve a intentar.' : 'No se pudo obtener el GPS (' + er.message + ').'; if(er.code === 1){ detenerGps(); pintarBtn(); } },
        {enableHighAccuracy:true, maximumAge:5000, timeout:20000});
      bloquearPantalla(); pintarBtn();
    });
    pintarBtn(); est.textContent = gps ? '🟢 Transmitiendo…' : 'Sin transmitir.';
    trk.replaceChildren(h('h3', {}, '📍 UBICACIÓN DEL BUS'),
      h('p', {}, 'Elige el bus que va en este celular y toca iniciar. Esta opción solo transmite con la página abierta y la pantalla encendida; para segundo plano usa la app Traccar Client (ver README).'), sel, est, btn);
  }
  const fallo = (e, msg) => e.status === 401 ? pasoKey('Sesión expirada, escribe la KEY otra vez.') : (msg.textContent = e.message);
  async function panel(){
    const msg = h('p', {class:'msg'}), lista = h('div', {class:'adm-lista'});
    box.replaceChildren(h('button', {class:'btn naranja', onclick:() => formulario()}, '➕ NUEVO AVISO'), msg, lista);
    let datos = []; try { datos = await api.adminNews(token); } catch(e) { return fallo(e, msg); }
    if(!datos.length) lista.append(h('p', {}, 'Aún no hay avisos. Crea el primero.'));
    datos.forEach(n => {
      const reaccInfo = [
        `❤️ ${n.reacc_corazon || 0}`,
        `😡 ${n.reacc_enojo || 0}`,
        `😢 ${n.reacc_entristece || 0}`
      ].join('  ·  ');
      lista.append(h('article', {class:'adm-item' + (n.activo ? '' : ' oculto')},
        h('div', {class:'meta'}, h('span', {class:'tag ' + etqClase(n.etiqueta)}, n.etiqueta), busChip(n), fechaOk(n.fecha) ? h('time', {}, fmt(n.fecha)) : null),
        h('h3', {}, (n.fijada ? '📌 ' : '') + n.titulo), h('p', {}, n.texto),
        h('p', {class:'reacc-info'}, 'Reacciones: ' + reaccInfo),
        h('div', {class:'acciones'},
          h('button', {class:'btn', onclick:() => formulario(n)}, 'EDITAR'),
          h('button', {class:'btn', onclick:() => guardar({...n, activo:!n.activo}, msg)}, n.activo ? 'OCULTAR' : 'MOSTRAR'),
          h('button', {class:'btn', onclick:() => guardar({...n, fijada:!n.fijada}, msg)}, n.fijada ? 'QUITAR PIN' : 'FIJAR'),
          h('button', {class:'btn negro', onclick:async () => { if(!confirm('¿Borrar este aviso?')) return;
            try { await api.adminDelete(n.id, token); panel(); } catch(e) { fallo(e, msg); } }}, 'BORRAR'))));
    });
  }
  async function guardar(n, msg){ try { await api.adminSave(n, token); panel(); } catch(e) { fallo(e, msg); } }
  function formulario(n = {}){
    const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const f = {
      etiqueta:h('input', {class:'campo', list:'etiquetas', maxlength:'20', placeholder:'Etiqueta (ej. ITINERARIO)', value:n.etiqueta || 'AVISO'}),
      bus:h('select', {class:'campo', 'aria-label':'Autobús que publica el aviso'}, h('option', {value:''}, 'Aviso general (todos los buses)'), ...cfg.buses.map(b => h('option', {value:b.id}, b.nombre))),
      titulo:h('input', {class:'campo', maxlength:'80', placeholder:'Título', value:n.titulo || ''}),
      texto:h('textarea', {class:'campo area', maxlength:'200', rows:'2', placeholder:'Resumen corto (se ve en la tarjeta)'}),
      largo:h('textarea', {class:'campo area', maxlength:'1500', rows:'6', placeholder:'Detalle completo (se ve al tocar la tarjeta)'}),
      fecha:h('input', {class:'campo', type:'date', value:fechaOk(n.fecha) ? n.fecha : hoy}),
      enlace:h('input', {class:'campo', type:'url', maxlength:'300', placeholder:'Enlace https:// (opcional)', value:n.enlace || ''}),
      fijada:h('input', {type:'checkbox'}), activo:h('input', {type:'checkbox'})};
    f.bus.value = n.bus_id || ''; f.texto.value = n.texto || ''; f.largo.value = n.texto_largo || ''; f.fijada.checked = !!n.fijada; f.activo.checked = n.activo !== false;
    const msg = h('p', {class:'msg'});
    box.replaceChildren(h('h3', {}, n.id ? 'EDITAR AVISO' : 'NUEVO AVISO'),
      h('datalist', {id:'etiquetas'}, ...ETIQUETAS.map(e => h('option', {value:e}))),
      f.etiqueta, f.bus, f.titulo, f.texto, f.largo, f.fecha, f.enlace,
      h('label', {}, f.fijada, ' Fijar arriba'), h('br'), h('label', {}, f.activo, ' Visible en el sitio'), msg,
      h('div', {class:'acciones'},
        h('button', {class:'btn negro', onclick:async () => {
          if(!f.titulo.value.trim()) return msg.textContent = 'Escribe un título';
          try { await api.adminSave({id:n.id, etiqueta:f.etiqueta.value, bus_id:f.bus.value, titulo:f.titulo.value, texto:f.texto.value, texto_largo:f.largo.value,
            fecha:f.fecha.value, enlace:f.enlace.value, enlace_texto:n.enlace_texto || '', fijada:f.fijada.checked, activo:f.activo.checked}, token); panel(); }
          catch(e) { fallo(e, msg); } }}, '📣 PUBLICAR'),
        h('button', {class:'btn', onclick:panel}, 'CANCELAR')));
  }
}

/* ---------- Arranque ---------- */
function route(){
  clearInterval(tick); clearInterval(cuenta); clearInterval(carTimer); clearInterval(liveTimer);
  if(location.hash !== '#/admin'){
    detenerGps();
    if(chkCtrl){ chkCtrl.detener(); chkCtrl = null; }
  }
  const m = location.hash.match(/^#\/bus\/([\w-]+)$/);
  location.hash === '#/admin' ? admin() : m ? reserva(m[1]) : inicio();
  scrollTo(0, 0);
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; document.getElementById('btnInstalar')?.removeAttribute('hidden'); });
(async () => {
  try { cfg = await loadConfig(); api.setBase(cfg.festival.api_base); document.title = cfg.festival.nombre;
    document.getElementById('marca').textContent = cfg.festival.nombre; menuLateral(); addEventListener('hashchange', route); route(); }
  catch { $app.textContent = 'No se pudo cargar la configuración del festival.'; }
})();
