// Carga los JSON de config/ y aplica los colores del festival. Máx. 7 buses activos.
// Los avisos vienen del panel de administrador (API); si la API no responde, se usa config/news.json.
async function avisosApi(base, respaldo){
  if(!base) return respaldo;
  const c = new AbortController(), t = setTimeout(() => c.abort(), 4000);
  try { const r = await fetch(base + '/news', {cache:'no-store', signal:c.signal}); if(!r.ok) throw 0;
    const d = await r.json(); return Array.isArray(d) ? d : respaldo; }
  catch { return respaldo; } finally { clearTimeout(t); }
}
export async function loadConfig(){
  const [festival, buses, news] = await Promise.all(['festival','buses','news'].map(n =>
    fetch(`config/${n}.json`, {cache:'no-cache'}).then(r => { if(!r.ok) throw new Error(n); return r.json(); })));
  for (const [k, v] of Object.entries(festival.colores || {}))
    if (/^#[0-9a-f]{6}$/i.test(v)) document.documentElement.style.setProperty('--'+k, v);
  const avisos = await avisosApi(festival.api_base, news);
  // "layout_de":"busN" reutiliza el croquis (layout, frente, tv_frente) de otro bus
  const conCroquis = buses.map(b => { const o = b.layout_de && buses.find(x => x.id === b.layout_de && x.layout);
    return o ? {...b, layout:o.layout, frente:b.frente || o.frente, tv_frente:b.tv_frente ?? o.tv_frente} : b; });
  return { festival,
    buses: conCroquis.filter(b => Array.isArray(b.layout) && b.activo !== false).slice(0, 7),
    // avisos: los "fijada":true van primero, luego los más recientes; "activo":false los oculta
    news: avisos.filter(n => n.activo !== false).sort((a, b) => (b.fijada ? 1 : 0) - (a.fijada ? 1 : 0) || (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 12) };
}
