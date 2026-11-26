// Cliente del backend. El token vive SOLO en memoria (nunca localStorage/cookies).
let base = '';
export const setBase = u => { base = u; };
async function call(path, {method='GET', body, token} = {}){
  const r = await fetch(base + path, { method, cache:'no-store',
    headers: { 'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if(!r.ok) throw Object.assign(new Error(d.error || 'Error de servidor'), {status:r.status});
  return d;
}
export const validateKey = (bus_id, key, phone) => call('/validate-key', {method:'POST', body:{bus_id, key, phone}});
export const getSeats = (bus_id, token) => call('/seats?bus_id='+encodeURIComponent(bus_id), {token});
export const holdSeat = (bus_id, seat, token, release=false) => call('/hold-seat', {method:'POST', body:{bus_id, seat, release}, token});
export const createReservation = (data, token) => call('/create-reservation', {method:'POST', body:data, token});
export const myReservation = (folio, phone) => call('/my-reservation?folio='+encodeURIComponent(folio)+'&phone='+encodeURIComponent(phone));
export const wallet = (phone, name) => call('/wallet', {method:"POST", body:{phone, name}});
// Admin (avisos): requieren el token de la KEY "admin"
export const adminNews = token => call('/admin/news', {token});
export const adminSave = (aviso, token) => call('/admin/news-save', {method:'POST', body:aviso, token});
export const adminDelete = (id, token) => call('/admin/news-delete', {method:'POST', body:{id}, token});
// Tracker GPS: lectura pública; envío/paro solo con el token de admin
export const getPos = bus_id => call('/pos?bus_id='+encodeURIComponent(bus_id));
export const adminPos = (datos, token) => call('/admin/pos-set', {method:'POST', body:datos, token});
export const adminPosStop = (bus_id, token) => call('/admin/pos-stop', {method:'POST', body:{bus_id}, token});
// Todas las posiciones de una vez (1 petición). Si la función aún no tiene /pos-all, cae a una petición por bus.
export async function getPosAll(ids){
  try { const d = await call('/pos-all'); if(Array.isArray(d)) return Object.fromEntries(d.map(x => [x.bus_id, x])); } catch {}
  const r = await Promise.all(ids.map(id => getPos(id).then(x => [id, x]).catch(() => [id, {tiene:false}])));
  return Object.fromEntries(r);
}
