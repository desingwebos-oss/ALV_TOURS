// Mapa parametrizable: layout = [{seats:[1,2,3,4], tv:true}, ...] (viene de buses.json)
export const contarAsientos = layout => layout.reduce((n, r) => n + r.seats.length, 0);
const el = (t, c) => { const e = document.createElement(t); if(c) e.className = c; return e; };
export function renderMapa(cont, layout, {taken=[], held=[], selected=new Set(), onToggle}){
  const ocupados = new Set([...taken, ...held]);
  cont.replaceChildren();
  layout.forEach(row => {
    if(row.tv) cont.append(el('div', 'tv-mark'));
    const fila = el('div', 'fila');
    row.seats.forEach(n => {
      const b = el('button', 'seat ' + (selected.has(n) ? 'selected' : ocupados.has(n) ? 'occupied' : 'free'));
      b.type = 'button'; b.textContent = n; b.disabled = ocupados.has(n);
      b.addEventListener('click', () => onToggle(n));
      fila.append(b);
    });
    cont.append(fila);
  });
}
