// Carga los 3 JSON de config/ y aplica los colores del festival. Máx. 6 buses activos.
export async function loadConfig(){
  const [festival, buses, news] = await Promise.all(['festival','buses','news'].map(n =>
    fetch(`config/${n}.json`, {cache:'no-cache'}).then(r => { if(!r.ok) throw new Error(n); return r.json(); })));
  for (const [k, v] of Object.entries(festival.colores || {}))
    if (/^#[0-9a-f]{6}$/i.test(v)) document.documentElement.style.setProperty('--'+k, v);
  return { festival,
    buses: buses.filter(b => b.activo !== false).slice(0, 6),   // si hay menos de 6, no se muestran vacíos
    news: [...news].sort((a, b) => b.fecha.localeCompare(a.fecha)) };
}
