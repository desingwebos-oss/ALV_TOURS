// Reporte PDF de reservaciones por autobús (portal admin). Se genera en el navegador con pdf-lib y datos en vivo.
// Fuentes estándar (Helvetica) → soportan acentos y ñ. Sin innerHTML, sin librerías externas.
const W = 612, H = 792, M = 36;
const hexRgb = (PDFLib, hx) => { const n = parseInt(hx.replace('#', ''), 16); return PDFLib.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
// Texto seguro para WinAnsi (Helvetica): conserva acentos/ñ y quita lo que la fuente no puede dibujar
const EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const safe = t => [...String(t ?? '')].map(c => { const k = c.codePointAt(0); if(k <= 255 && k >= 32 || EXTRA.includes(c)) return c;
  const b = c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return b.length === 1 && b.codePointAt(0) >= 32 && b.codePointAt(0) <= 255 ? b : (k < 32 ? ' ' : '?'); }).join('');
// Acentos que suelen faltar en los nombres capturados
const ACENTOS = {Sofia:'Sofía', Josue:'Josué', Jose:'José', Gonzalez:'González', Albarran:'Albarrán', Rodriguez:'Rodríguez', Ivan:'Iván', Noemi:'Noemí', Alanis:'Alanís',
  Martinez:'Martínez', Sanchez:'Sánchez', Cortes:'Cortés', Victor:'Víctor', Angel:'Ángel', Suarez:'Suárez', Lopez:'López', Hernandez:'Hernández', Garcia:'García',
  Perez:'Pérez', Ramirez:'Ramírez', Jimenez:'Jiménez', Gomez:'Gómez', Gutierrez:'Gutiérrez', Fernandez:'Fernández', Diaz:'Díaz', Nunez:'Núñez', Maria:'María', Raul:'Raúl', Santillan:'Santillán'};
const MIN = new Set(['de', 'la', 'del', 'y', 'los', 'las']);
export const nombreBonito = s => String(s || '').trim().split(/\s+/).map((w, i) => { const c = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return i > 0 && MIN.has(w.toLowerCase()) ? w.toLowerCase() : (ACENTOS[c] || c); }).join(' ');
const NOMBRE_BUS = {Babasonico:'Babasónicos', Jose:'José'};
const tituloBus = b => String(b.nombre || b.id).replace(/\s*bus\s*\d+\s*$/i, '').trim().split(' ').map(w => NOMBRE_BUS[w] || w).join(' ').toUpperCase();
const puntoIdx = (b, p) => { const i = (b.itinerario || []).findIndex(x => x.punto === p); return i < 0 ? 99 : i; };
const numBus = id => parseInt((String(id).match(/\d+/) || ['0'])[0], 10);

/* Carga logo y banner (solo navegador). El banner se recorta a la franja del título y se pasa a JPEG. */
export async function cargarImagenes(){
  const logo = new Uint8Array(await (await fetch('img/logo-alv.png')).arrayBuffer());
  const img = new Image(); img.src = 'img/banner.webp'; await img.decode();
  const sy = Math.round(img.naturalHeight * 52 / 448), sh = Math.round(img.naturalHeight * 186 / 448);
  const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = sh;
  cv.getContext('2d').drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, img.naturalWidth, sh);
  const b64 = cv.toDataURL('image/jpeg', .9).split(',')[1], bin = atob(b64), banner = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) banner[i] = bin.charCodeAt(i);
  return { logo, banner };
}

/* Arma el PDF. rows = reservaciones de la API; buses = cfg.buses; col = festival.colores */
export async function crearPdf(PDFLib, rows, buses, festival, imgs, ahora = new Date()){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const col = k => hexRgb(PDFLib, festival.colores[k]);
  const NAR = col('naranja'), AZU = col('azul'), ROS = col('rosa'), VER = col('verde'), AMA = col('amarillo'), CRE = col('crema'), TIN = col('tinta'), PAP = col('papel');
  const ALT = rgb(1, .94, .76);
  const colores = [NAR, AZU, ROS, VER, AMA];
  const pdf = await PDFDocument.create();
  pdf.setTitle('Reservaciones por bus · ALV Tours'); pdf.setAuthor('ALV Tours');
  const F = await pdf.embedFont(StandardFonts.Helvetica), FB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const banner = await pdf.embedJpg(imgs.banner), logo = await pdf.embedPng(imgs.logo);
  const BH = W * banner.height / banner.width;
  const stamp = ahora.toLocaleString('es-MX', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
  const fecha = festival.fecha ? new Date(festival.fecha + 'T12:00:00').toLocaleDateString('es-MX', {day:'numeric', month:'short', year:'numeric'}).toUpperCase().replace(/\./g, '') : '';
  const sub = safe(`${festival.nombre || ''} · ${fecha} · ${(festival.ciudad || '').toUpperCase()}`);
  const rr = (x, y, w, h, r) => `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  const ancho = (t, f, s) => f.widthOfTextAtSize(t, s);
  function envolver(t, f, s, mw){ const pal = safe(t).split(' '), ls = []; let l = '';
    for(const p of pal){ const x = l ? l + ' ' + p : p; if(ancho(x, f, s) <= mw || !l) l = x; else { ls.push(l); l = p; } }
    if(l) ls.push(l); return ls.length ? ls : ['']; }
  const fondo = pg => { pg.drawRectangle({x:0, y:0, width:W, height:H, color:CRE});
    for(let x = 11; x < W; x += 22) for(let y = 11; y < H; y += 22) pg.drawCircle({x, y, size:1.3, color:TIN, opacity:.09}); };
  const sombra = (pg, t, x, y, f, s, c, off = 2.5) => { pg.drawText(t, {x:x + off, y:y - off, size:s, font:f, color:TIN}); pg.drawText(t, {x, y, size:s, font:f, color:c}); };
  function pagina(b, n, bc){
    const pg = pdf.addPage([W, H]); fondo(pg);
    pg.drawImage(banner, {x:0, y:H - BH, width:W, height:BH});
    pg.drawLine({start:{x:0, y:H - BH}, end:{x:W, y:H - BH}, thickness:4, color:TIN});
    const pc = [NAR, AZU, ROS, AMA], fw = 26;
    for(let i = 0; i <= W / fw; i++){ const x = i * fw + 2, y0 = H - BH - 2;
      pg.drawSvgPath('M 0 0 H 22 V 17 L 11 26 L 0 17 Z', {x, y:y0, color:pc[i % 4], borderColor:TIN, borderWidth:1.2});
      pg.drawCircle({x:x + 11, y:y0 - 10, size:3, color:CRE}); }
    const cx = 62, cy = H - BH + 4, r = 34;
    pg.drawCircle({x:cx + 3, y:cy - 3, size:r, color:TIN}); pg.drawCircle({x:cx, y:cy, size:r, color:PAP, borderColor:TIN, borderWidth:3.5});
    const lw = r * 1.5, lh = lw * logo.height / logo.width; pg.drawImage(logo, {x:cx - lw / 2, y:cy - lh / 2, width:lw, height:lh});
    const ty = H - BH - 52;
    sombra(pg, safe(tituloBus(b)), 106, ty, FB, 26, bc);
    pg.drawText(sub, {x:108, y:ty - 16, size:9, font:FB, color:TIN});
    const px = W - M - 92, py = ty - 10;
    pg.drawSvgPath(rr(0, 0, 92, 34, 17), {x:px + 3, y:py - 3 + 34, color:TIN});
    pg.drawSvgPath(rr(0, 0, 92, 34, 17), {x:px, y:py + 34, color:AMA, borderColor:TIN, borderWidth:3});
    const bt = 'BUS ' + n; pg.drawText(bt, {x:px + 46 - ancho(bt, FB, 15) / 2, y:py + 11, size:15, font:FB, color:TIN});
    pg.drawLine({start:{x:M, y:40}, end:{x:W - M, y:40}, thickness:1.5, color:TIN, dashArray:[5, 4]});
    pg.drawText('ALV TOURS · Atrévete | Libérate | Vive', {x:M, y:26, size:8, font:FB, color:TIN});
    const pie = safe(`Actualizado ${stamp}   ·   Página ${pdf.getPageCount()}`); pg.drawText(pie, {x:W - M - ancho(pie, FB, 8), y:26, size:8, font:FB, color:TIN});
    return pg;
  }
  const TOPY = H - BH - 72, BOT = 52, CW = W - 2 * M;
  // lista de buses: los configurados + cualquiera que aparezca en los datos
  const lista = buses.map(b => ({...b})); rows.forEach(r => { if(!lista.some(b => b.id === r.bus_id)) lista.push({id:r.bus_id, nombre:r.bus_id, itinerario:[]}); });
  lista.sort((a, b) => numBus(a.id) - numBus(b.id));
  lista.forEach((b, i) => {
    const bc = colores[i % colores.length], n = numBus(b.id);
    const g = rows.filter(r => r.bus_id === b.id).map(r => ({...r, asientos:[...(r.seats || [])].map(Number).sort((x, y) => x - y)}))
      .sort((x, y) => puntoIdx(b, x.boarding) - puntoIdx(b, y.boarding) || String(x.boarding).localeCompare(String(y.boarding)) || (x.asientos[0] ?? 999) - (y.asientos[0] ?? 999));
    const totAs = g.reduce((s, r) => s + r.asientos.length, 0), abor = g.filter(r => r.checked_in).length;
    let pg = pagina(b, n, bc), y = TOPY;
    // chips
    let x = M;
    [[`${g.length} reservaciones`, AMA, 120], [`${totAs} asientos`, bc, 100], [`${abor} abordaron`, VER, 100]].forEach(([t, c, w]) => {
      pg.drawRectangle({x, y:y - 22, width:w, height:22, color:c, borderColor:TIN, borderWidth:2.5});
      pg.drawText(t, {x:x + w / 2 - ancho(t, FB, 9) / 2, y:y - 15, size:9, font:FB, color:TIN}); x += w; });
    y -= 22 + 16;
    const seccion = t => { pg.drawText(t, {x:M, y:y - 9, size:11, font:FB, color:TIN}); y -= 15; pg.drawLine({start:{x:M, y}, end:{x:W - M, y}, thickness:2.5, color:TIN}); y -= 7; };
    const encabezado = (cols, ws) => { pg.drawRectangle({x:M, y:y - 20, width:CW, height:20, color:bc});
      let cx = M; cols.forEach((t, i) => { const c = t.c ? cx + ws[i] / 2 - ancho(t.t, FB, 8) / 2 : cx + 6; pg.drawText(t.t, {x:c, y:y - 13, size:8, font:FB, color:TIN}); cx += ws[i]; });
      pg.drawLine({start:{x:M, y:y - 20}, end:{x:W - M, y:y - 20}, thickness:2, color:TIN}); return 20; };
    const grid = (top, h, ws) => { let cx = M; ws.slice(0, -1).forEach(w => { cx += w; pg.drawLine({start:{x:cx, y:top}, end:{x:cx, y:top - h}, thickness:.6, color:TIN}); }); };
    // itinerario
    seccion('RUTA E ITINERARIO');
    const wi = [200, 90, 110, CW - 400], it = b.itinerario || [];
    const ti = y; encabezado([{t:'Punto de abordaje'}, {t:'Cita'}, {t:'Salida'}, {t:'Asientos', c:1}], wi); y -= 20;
    it.forEach(s => { const as = g.filter(r => r.boarding === s.punto).reduce((a, r) => a + r.asientos.length, 0);
      pg.drawRectangle({x:M, y:y - 20, width:CW, height:20, color:PAP});
      pg.drawText(safe(s.punto), {x:M + 6, y:y - 13, size:8.5, font:FB, color:TIN}); pg.drawText(safe(s.cita || ''), {x:M + wi[0] + 6, y:y - 13, size:8.5, font:F, color:TIN});
      pg.drawText(safe(s.salida || ''), {x:M + wi[0] + wi[1] + 6, y:y - 13, size:8.5, font:F, color:TIN});
      const t = String(as); pg.drawText(t, {x:M + 400 + wi[3] / 2 - ancho(t, FB, 8.5) / 2, y:y - 13, size:8.5, font:FB, color:TIN});
      pg.drawLine({start:{x:M, y:y - 20}, end:{x:W - M, y:y - 20}, thickness:.8, color:TIN}); y -= 20; });
    grid(ti, ti - y, wi); pg.drawRectangle({x:M, y, width:CW, height:ti - y, borderColor:TIN, borderWidth:2.5});
    y -= 14;
    // pasajeros
    seccion('LISTA DE PASAJEROS');
    const wp = [50, 190, 70, 130, 50, 50], cab = [{t:'Folio'}, {t:'Nombre'}, {t:'Teléfono'}, {t:'Asientos'}, {t:'Total', c:1}, {t:'Abordó', c:1}], bandas = [];
    let tp = y; y -= encabezado(cab, wp); let k = 0;
    const pintaBanda = bd => { pg.drawRectangle({x:M, y:bd.y - 17, width:CW, height:17, color:TIN}); pg.drawText(bd.tx, {x:M + 6, y:bd.y - 12, size:8.5, font:FB, color:AMA}); };
    const cierraTabla = () => { grid(tp, tp - y, wp); bandas.splice(0).forEach(pintaBanda); pg.drawRectangle({x:M, y, width:CW, height:tp - y, borderColor:TIN, borderWidth:2.5}); };
    if(!g.length){ pg.drawRectangle({x:M, y:y - 24, width:CW, height:24, color:PAP}); pg.drawText('Sin reservaciones todavía.', {x:M + 6, y:y - 16, size:9, font:F, color:TIN}); y -= 24; }
    const fila = r => {
      const nom = envolver(nombreBonito(r.name), FB, 8.5, wp[1] - 10), ase = envolver(r.asientos.join(', '), FB, 9, wp[3] - 10);
      const lines = Math.max(nom.length, ase.length), rh = Math.max(18, lines * 10 + 7);
      if(y - rh < BOT + 6){ cierraTabla(); pg = pagina(b, n, bc); y = TOPY; tp = y; y -= encabezado(cab, wp); k = 0; }
      pg.drawRectangle({x:M, y:y - rh, width:CW, height:rh, color:k % 2 ? ALT : PAP});
      pg.drawLine({start:{x:M, y:y - rh}, end:{x:W - M, y:y - rh}, thickness:.6, color:TIN});
      const base = y - rh / 2 - 3, ml = (ls, i) => y - (rh - ls.length * 10) / 2 - 8 - i * 10 + 1;
      pg.drawText(safe(r.folio), {x:M + 6, y:base, size:7.5, font:FB, color:TIN});
      nom.forEach((l, i) => pg.drawText(l, {x:M + wp[0] + 6, y:ml(nom, i), size:8.5, font:FB, color:TIN}));
      pg.drawText(safe(r.phone || '—'), {x:M + wp[0] + wp[1] + 6, y:base, size:8, font:F, color:TIN});
      ase.forEach((l, i) => pg.drawText(l, {x:M + wp[0] + wp[1] + wp[2] + 6, y:ml(ase, i), size:9, font:FB, color:TIN}));
      const cx5 = M + wp[0] + wp[1] + wp[2] + wp[3], tt = String(r.asientos.length);
      pg.drawText(tt, {x:cx5 + wp[4] / 2 - ancho(tt, FB, 9) / 2, y:base, size:9, font:FB, color:TIN});
      const ab = r.checked_in ? 'Sí' : '—'; pg.drawText(ab, {x:cx5 + wp[4] + wp[5] / 2 - ancho(ab, FB, 8) / 2, y:base, size:8, font:FB, color:r.checked_in ? rgb(.1, .5, .2) : TIN});
      y -= rh; k++; };
    // una banda por punto de abordaje (en el orden del itinerario) y sus pasajeros debajo
    const puntos = []; g.forEach(r => { const u = puntos[puntos.length - 1]; if(u && u.punto === r.boarding) u.filas.push(r); else puntos.push({punto:r.boarding, filas:[r]}); });
    puntos.forEach(pt => {
      const cita = ((b.itinerario || []).find(x => x.punto === pt.punto) || {}).cita, bh = 17;
      if(y - bh - 24 < BOT + 6){ cierraTabla(); pg = pagina(b, n, bc); y = TOPY; tp = y; y -= encabezado(cab, wp); }
      const as = pt.filas.reduce((a2, r) => a2 + r.asientos.length, 0), tx = safe(`${pt.punto}${cita ? '  ·  cita ' + cita : ''}  ·  ${pt.filas.length} reserv. / ${as} asientos`);
      const bd = {y, tx}; pintaBanda(bd); bandas.push(bd); y -= bh; k = 0;
      pt.filas.forEach(fila); });
    cierraTabla();
  });
  return pdf.save();
}
