// Ajustes de presentación sin tocar app.js:
// 1) Quita el carrusel de LINEUP de abajo (se conserva la lista desplegable de arriba).
const app = document.getElementById('app');

const norm = t => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();

function quitarCarruselLineup() {
  if (!app) return;
  // El carrusel inferior es el que tiene flechas ‹ › (la lista de arriba son botones de «chips» sin flechas).
  const flechas = [...app.querySelectorAll('button, [role="button"], a')].filter(el => {
    const t = norm(el.textContent), l = norm(el.getAttribute('aria-label'));
    return t === '‹' || t === '›' || t === '<' || t === '>' || /(anterior|siguiente|prev|next)/.test(l);
  });
  for (const f of flechas) {
    let bloque = f.closest('section') || f;
    // sube hasta el hijo directo de #app que lo contiene
    while (bloque.parentElement && bloque.parentElement !== app && bloque.tagName !== 'SECTION') bloque = bloque.parentElement;
    const txt = norm(bloque.textContent);
    // seguridad: no ocultar nada que contenga la lista de arriba, los buses o el aviso de instalación
    if (bloque === app || txt.includes('ver cartel completo') || /\bbus 1\b/.test(txt)) continue;
    if (!/lineup/.test(txt)) continue;
    bloque.setAttribute('hidden', '');
    bloque.style.display = 'none';
  }
}

const aplicar = quitarCarruselLineup;
aplicar();
if (app) new MutationObserver(aplicar).observe(app, { childList: true, subtree: true });
