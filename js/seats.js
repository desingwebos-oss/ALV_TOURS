// Mapa de asientos digitalizado a partir de los croquis de cada autobús (se dibuja con textContent, nunca innerHTML).
// Cada fila de "layout" en buses.json puede ser:
//   { izq:[1,2], der:[3,4], tvIzq:true, tvDer:true }  → dos pares de asientos con pasillo en medio
//   { fila:[43,44,47,45,46], alinear:'izq' }          → fila corrida (asientos del fondo)
//   { seats:[...] }                                   → formato anterior (se sigue aceptando)
// Dentro de izq/der: número = asiento · null = hueco · "WC" u otro texto = zona especial · {t:"WC", span:2} = zona de 2 columnas.
// Nivel del bus (opcional): frente:{izq:"CHOFER", der:"PUERTA"} y tv_frente:true.
const el = (t, c, txt) => { const e = document.createElement(t); if(c) e.className = c; if(txt != null) e.textContent = txt; return e; };
const celdas = r => [...(r.izq || []), ...(r.der || []), ...(r.fila || []), ...(r.seats || [])].filter(Number.isInteger);
export const numerosAsiento = layout => layout.flatMap(celdas);
export const contarAsientos = layout => numerosAsiento(layout).length;

export function renderMapa(cont, layout, {taken = [], held = [], selected = new Set(), onToggle, frente, tvFrente} = {}){
  const ocupados = new Set([...taken, ...held]);
  const asiento = n => {
    const b = el('button', 'seat ' + (selected.has(n) ? 'selected' : ocupados.has(n) ? 'occupied' : 'free'), n);
    b.type = 'button'; b.disabled = ocupados.has(n);
    b.setAttribute('aria-label', 'Asiento ' + n + (ocupados.has(n) ? ', ocupado' : selected.has(n) ? ', seleccionado' : ', libre'));
    b.addEventListener('click', () => onToggle(n));
    return b;
  };
  const especial = c => {                          // WC, escaleras, etc.
    const o = typeof c === 'string' ? {t:c} : c, e = el('div', 'esp' + (o.span === 2 ? ' x2' : ''), o.t);
    e.setAttribute('role', 'img'); e.setAttribute('aria-label', o.t); return e;
  };
  const celda = c => Number.isInteger(c) ? asiento(c) : c == null ? el('div', 'hueco') : especial(c);
  const lado = (lista, tv) => { const d = el('div', 'lado' + (tv ? ' tv' : '')); d.append(...(lista || []).map(celda)); return d; };

  cont.replaceChildren();
  if(frente){                                      // frente del bus: chofer y puerta
    const f = el('div', 'frente');
    if(frente.izq) { const c = el('div', 'chofer'); c.append(el('i', 'volante'), el('span', '', frente.izq)); f.append(c); }
    f.append(el('span', 'relleno'));
    if(frente.der) f.append(el('span', 'puerta', frente.der));
    cont.append(f);
  }
  if(tvFrente) cont.append(el('div', 'tv-frente', 'TV'));
  layout.forEach(row => {
    if(row.seats){                                 // formato anterior
      if(row.tv) cont.append(el('div', 'tv-mark'));
      const fila = el('div', 'fila'); fila.append(...row.seats.map(asiento)); cont.append(fila); return;
    }
    if(row.fila){
      const fila = el('div', 'fila-bus completa' + (row.alinear === 'izq' ? ' alin-izq' : '')); fila.append(...row.fila.map(celda)); cont.append(fila); return;
    }
    const fila = el('div', 'fila-bus' + (row.tvIzq || row.tvDer ? ' con-tv' : ''));
    fila.append(lado(row.izq, row.tvIzq), el('div', 'pasillo'), lado(row.der, row.tvDer));
    cont.append(fila);
  });
}
