// Edge Function "api": validate-key, seats, hold-seat, create-reservation, my-reservation, wallet, pos (tracker GPS).
// Secretos (SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGIN) viven solo en Supabase, nunca en el repo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN")!, "Access-Control-Allow-Headers": "authorization,content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Vary": "Origin" };
const out = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json",
  "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Strict-Transport-Security": "max-age=31536000" } });
const hex = (u: Uint8Array) => [...u].map(b => b.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
const rnd = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
const busOk = (v: unknown) => typeof v === "string" && /^[\w-]{1,32}$/.test(v);
// Folio legible: TC-<núm. de autobús>-<núm. de reserva en ese autobús>, ej. TC-5-1. TC = clave del evento (secreto EVENT_CODE para cambiarla).
const EVENTO = (Deno.env.get("EVENT_CODE") || "TC").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "TC";
const numBus = (id: string) => (id.match(/\d+/) || ["0"])[0];
const folioOk = (f: string) => /^[A-Z0-9]{1,6}-\d{1,3}-\d{1,4}$/.test(f) || /^[A-HJKMNP-Z2-9]{6}$/.test(f) || /^PG-[0-9A-F]{10}$/.test(f);   // acepta también los formatos anteriores
// Siguiente número de reserva del autobús (1, 2, 3…). Si dos personas confirman a la vez, la base rechaza el duplicado y se reintenta.
async function siguienteFolio(bus: string) {
  const pref = `${EVENTO}-${numBus(bus)}-`;
  const { data } = await db.from("reservations").select("folio").like("folio", pref + "%").limit(1000);
  const max = (data || []).reduce((m, r) => Math.max(m, parseInt(String(r.folio).slice(pref.length), 10) || 0), 0);
  return pref + (max + 1);
}
const limpio = (t: unknown) => String(t ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
// Bloqueo por IP para las consultas de "Mi reserva" (5 fallos = 15 min), usando la misma tabla attempts
async function bloqueada(ip: string) {
  const { data: a } = await db.from("attempts").select("*").eq("ip", ip).eq("bus_id", "wallet").maybeSingle();
  return !!(a?.locked_until && new Date(a.locked_until) > new Date());
}
async function fallaWallet(ip: string) {
  const { data: a } = await db.from("attempts").select("*").eq("ip", ip).eq("bus_id", "wallet").maybeSingle();
  const prev = a && !(a.locked_until && new Date(a.locked_until) <= new Date()) ? a.fails : 0, n = prev + 1;
  await db.from("attempts").upsert({ ip, bus_id: "wallet", fails: n, locked_until: n >= 5 ? new Date(Date.now() + 15 * 60e3).toISOString() : null });
}

// Devuelve la sesión si el token es válido, no expiró y es de ESE bus.
async function sesion(req: Request, bus: string) {
  const t = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!t) return null;
  const { data } = await db.from("sessions").select("id,bus_id,expires_at,phone").eq("token_hash", await sha(t)).maybeSingle();
  return data && data.bus_id === bus && new Date(data.expires_at) > new Date() ? data : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const path = new URL(req.url).pathname.replace(/^.*\/api/, "");
  const q = new URL(req.url).searchParams;
  try {
    if (req.method === "POST" && path === "/validate-key") {
      const { bus_id, key, phone: ph } = await req.json();
      if (!busOk(bus_id) || typeof key !== "string") return out({ error: "Datos inválidos" }, 400);
      const ip = (req.headers.get("x-forwarded-for") || "?").split(",")[0].trim();
      const { data: a } = await db.from("attempts").select("*").eq("ip", ip).eq("bus_id", bus_id).maybeSingle();
      const now = new Date();
      if (a?.locked_until && new Date(a.locked_until) > now) return out({ error: "Demasiados intentos. Intenta en 15 minutos." }, 429);
      const { data: k } = await db.from("bus_keys").select("key_hash").eq("bus_id", bus_id).maybeSingle();
      const ok = !!k && bcrypt.compareSync(key.slice(0, 64), k.key_hash);
      if (!ok) {
        const prev = a && !(a.locked_until && new Date(a.locked_until) <= now) ? a.fails : 0;
        const n = prev + 1;
        await db.from("attempts").upsert({ ip, bus_id, fails: n, locked_until: n >= 5 ? new Date(Date.now() + 15 * 60e3).toISOString() : null });
        return out({ error: "KEY incorrecta" }, 401);
      }
      await db.from("attempts").delete().eq("ip", ip).eq("bus_id", bus_id);
      // Celular obligatorio para buses (el admin no lo usa). UNA reserva por celular; una sola sesión activa por celular.
      let phone: string | null = null;
      if (bus_id !== "admin") {
        phone = String(ph ?? "").replace(/[\s-]/g, "");
        if (!/^\d{10}$/.test(phone)) return out({ error: "Escribe tu celular de 10 dígitos" }, 400);
        const { data: r } = await db.from("reservations").select("folio").eq("phone", phone).maybeSingle();
        if (r) return out({ error: "Este celular ya tiene una reserva. No se puede reservar ni cambiar asientos. Si hubo un error, contacta a soporte." }, 409);
        const { data: old } = await db.from("sessions").select("id").eq("phone", phone);   // otra pestaña/dispositivo con el mismo celular
        if (old?.length) { const ids = old.map((x) => x.id);
          await db.from("seats").delete().in("session_id", ids).eq("status", "held"); await db.from("sessions").delete().in("id", ids); }
      }
      const token = rnd(32);
      const dur = bus_id === "admin" ? 4 * 3600 : 1800;   // admin: 4 h; buses: 30 min
      await db.from("sessions").insert({ token_hash: await sha(token), bus_id, phone, expires_at: new Date(Date.now() + dur * 1e3).toISOString() });
      return out({ token, expires_in: dur });
    }

    // ---------- AVISOS (público: solo lectura de los activos) ----------
    if (req.method === "GET" && path === "/news") {
      const { data } = await db.from("news").select("id,titulo,etiqueta,fecha,fijada,bus_id,texto,texto_largo,enlace,enlace_texto")
        .eq("activo", true).order("fecha", { ascending: false }).limit(12);
      return out(data || []);
    }

    // ---------- TRACKER (público: solo la última posición del bus; "activo" = actualizada hace <= 2 min) ----------
    if (req.method === "GET" && path === "/pos") {
      const bus = q.get("bus_id") || ""; if (!busOk(bus)) return out({ error: "Datos inválidos" }, 400);
      const { data } = await db.from("bus_pos").select("lat,lng,speed,heading,updated_at").eq("bus_id", bus).maybeSingle();
      if (!data) return out({ tiene: false, activo: false });
      const edad = Math.max(0, Math.round((Date.now() - new Date(data.updated_at).getTime()) / 1000));
      return out({ tiene: true, activo: edad <= 120, edad, lat: data.lat, lng: data.lng, speed: data.speed, heading: data.heading });
    }

    if (req.method === "GET" && path === "/pos-all") {          // todas las últimas posiciones en una sola respuesta (público)
      const { data } = await db.from("bus_pos").select("bus_id,lat,lng,speed,heading,updated_at").limit(20);
      return out((data || []).map((x) => { const edad = Math.max(0, Math.round((Date.now() - new Date(x.updated_at).getTime()) / 1000));
        return { bus_id: x.bus_id, tiene: true, activo: edad <= 120, edad, lat: x.lat, lng: x.lng, speed: x.speed, heading: x.heading }; }));
    }

    // ---------- TRACKER EN SEGUNDO PLANO: app Traccar Client (OsmAnd o JSON). Sin sesión; el "id" es "busN.SECRETO" ----------
    if ((req.method === "POST" || req.method === "GET") && path === "/track") {
      const f = (k: string) => { const v = q.get(k); return v === null || v === "" ? NaN : Number(v); };
      let id = q.get("id") || q.get("deviceid") || "", lat = f("lat"), lng = f("lon"), vel = f("speed") * 0.514444 /* nudos → m/s */, rumbo = f("bearing"), prec = f("accuracy");
      if (req.method === "POST" && (req.headers.get("content-type") || "").includes("json")) {   // formato JSON de las versiones nuevas
        const j = await req.json().catch(() => ({})), c = j?.location?.coords || {};
        id = String(j?.device_id || id);
        if (c.latitude != null) lat = Number(c.latitude); if (c.longitude != null) lng = Number(c.longitude);
        if (c.speed != null) vel = Number(c.speed); if (c.heading != null) rumbo = Number(c.heading); if (c.accuracy != null) prec = Number(c.accuracy);
      }
      const i = id.indexOf("."), bus = id.slice(0, i), secreto = id.slice(i + 1);
      if (i < 1 || !busOk(bus) || secreto.length < 16 || secreto.length > 64) return out({ error: "No autorizado" }, 401);
      const { data: k } = await db.from("track_keys").select("key_hash").eq("bus_id", bus).maybeSingle();
      if (!k || k.key_hash !== await sha(secreto)) return out({ error: "No autorizado" }, 401);
      const rg = (v: number, a: number, z: number) => Number.isFinite(v) && v >= a && v <= z ? v : null;
      const la = rg(lat, -90, 90), ln = rg(lng, -180, 180);
      if (la === null || ln === null) return out({ error: "Datos inválidos" }, 400);
      const { error } = await db.from("bus_pos").upsert({ bus_id: bus, lat: la, lng: ln, speed: rg(vel, 0, 100), heading: rg(rumbo, 0, 360),
        acc: rg(prec, 0, 100000), updated_at: new Date().toISOString() });
      return error ? out({ error: "No se pudo guardar" }, 400) : out({ ok: true });
    }

    // ---------- ADMIN (requiere sesión de la KEY "admin") ----------
    if (path.startsWith("/admin/")) {
      if (!(await sesion(req, "admin"))) return out({ error: "Sesión inválida" }, 401);
      if (req.method === "GET" && path === "/admin/news") {
        const { data } = await db.from("news").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(100);
        return out(data || []);
      }
      if (req.method === "POST" && path === "/admin/news-save") {
        const b = await req.json();
        const t = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
        const fila = {
          titulo: t(b.titulo, 80), etiqueta: t(b.etiqueta, 20).toUpperCase() || "AVISO",
          fecha: /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || "") ? b.fecha : new Date().toISOString().slice(0, 10),
          fijada: b.fijada === true, activo: b.activo !== false, bus_id: busOk(b.bus_id) ? b.bus_id : null,
          texto: t(b.texto, 200), texto_largo: t(b.texto_largo, 1500),
          enlace: /^https:\/\//.test(t(b.enlace, 300)) ? t(b.enlace, 300) : "", enlace_texto: t(b.enlace_texto, 30),
        };
        if (!fila.titulo) return out({ error: "Escribe un título" }, 400);
        const esId = typeof b.id === "string" && /^[0-9a-f-]{36}$/i.test(b.id);
        const { data, error } = esId ? await db.from("news").update(fila).eq("id", b.id).select().maybeSingle() : await db.from("news").insert(fila).select().maybeSingle();
        return error || !data ? out({ error: "No se pudo guardar" }, 400) : out(data);
      }
      if (req.method === "POST" && path === "/admin/news-delete") {
        const { id } = await req.json();
        if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return out({ error: "Datos inválidos" }, 400);
        await db.from("news").delete().eq("id", id);
        return out({ ok: true });
      }
      if (req.method === "POST" && path === "/admin/pos-set") {        // el celular del admin envía su GPS
        const b = await req.json();
        const num = (v: unknown, a: number, z: number) => typeof v === "number" && isFinite(v) && v >= a && v <= z ? v : null;
        const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
        if (!busOk(b.bus_id) || lat === null || lng === null) return out({ error: "Datos inválidos" }, 400);
        const { error } = await db.from("bus_pos").upsert({ bus_id: b.bus_id, lat, lng, speed: num(b.speed, 0, 100), heading: num(b.heading, 0, 360),
          acc: num(b.acc, 0, 100000), updated_at: new Date().toISOString() });
        return error ? out({ error: "No se pudo guardar" }, 400) : out({ ok: true });
      }
      if (req.method === "POST" && path === "/admin/pos-stop") {
        const { bus_id } = await req.json(); if (!busOk(bus_id)) return out({ error: "Datos inválidos" }, 400);
        await db.from("bus_pos").delete().eq("bus_id", bus_id);
        return out({ ok: true });
      }
      return out({ error: "No encontrado" }, 404);
    }

    if (req.method === "GET" && path === "/seats") {            // sin datos personales, solo números de asiento
      const bus = q.get("bus_id") || ""; if (!busOk(bus)) return out({ error: "Datos inválidos" }, 400);
      const s = await sesion(req, bus);
      const { data } = await db.from("seats").select("seat,status,session_id,held_until").eq("bus_id", bus);
      const r = { taken: [] as number[], held: [] as number[], mine: [] as number[], mine_until: {} as Record<number, string>, now: Date.now() };
      for (const x of data || []) {
        if (x.status === "taken") r.taken.push(x.seat);
        else if (new Date(x.held_until) > new Date()) { r.held.push(x.seat); if (s && x.session_id === s.id) { r.mine.push(x.seat); r.mine_until[x.seat] = x.held_until; } }
      }
      return out(r);
    }

    if (req.method === "POST" && path === "/hold-seat") {
      const { bus_id, seat, release } = await req.json();
      if (!busOk(bus_id) || !Number.isInteger(seat) || seat < 1 || seat > 99) return out({ error: "Datos inválidos" }, 400);
      const s = await sesion(req, bus_id); if (!s) return out({ error: "Sesión inválida" }, 401);   // sin token no se aparta nada
      if (release) { await db.rpc("release_seat", { p_bus: bus_id, p_seat: seat, p_session: s.id }); return out({ ok: true }); }
      const { data } = await db.rpc("hold_seat", { p_bus: bus_id, p_seat: seat, p_session: s.id });
      return data ? out({ ok: true }) : out({ error: "Ese asiento ya no está disponible (o llegaste al máximo de 10)" }, 409);
    }

    if (req.method === "POST" && path === "/create-reservation") {
      const b = await req.json();
      if (!busOk(b.bus_id)) return out({ error: "Datos inválidos" }, 400);
      const s = await sesion(req, b.bus_id); if (!s) return out({ error: "Sesión inválida" }, 401);
      const name = String(b.name || "").trim(), phone = s.phone;   // el celular sale de la sesión, no del formulario
      if (!phone) return out({ error: "Sesión inválida" }, 401);
      const addr = String(b.address || "").trim().slice(0, 120), boarding = String(b.boarding || "").slice(0, 60);
      const seats = Array.isArray(b.seats) ? [...new Set(b.seats)].filter((n) => Number.isInteger(n) && n > 0 && n < 100) : [];
      if (!/^[\p{L}][\p{L} .'-]{2,79}$/u.test(name) || !seats.length || seats.length > 10 || b.consent !== true)
        return out({ error: "Revisa tus datos y acepta el aviso de privacidad" }, 400);
      const { data: ya } = await db.from("reservations").select("folio").eq("phone", phone).maybeSingle();
      if (ya) return out({ error: "Este celular ya tiene una reserva. No se puede reservar dos veces." }, 409);
      let folio = "", ok = false;
      for (let i = 0; i < 4 && !ok; i++) {       // reintenta si otro pasajero tomó el mismo número al mismo tiempo
        folio = await siguienteFolio(b.bus_id);
        const { data } = await db.rpc("crear_reserva", { p_bus: b.bus_id, p_session: s.id, p_seats: seats, p_folio: folio, p_name: name, p_phone: phone, p_addr: addr, p_boarding: boarding });
        ok = !!data;
      }
      if (!ok) return out({ error: "Tus asientos expiraron (2 min) o fueron tomados. Elígelos de nuevo." }, 409);
      await db.from("sessions").delete().eq("id", s.id);   // reserva hecha: la sesión se cierra, no se pueden apartar más lugares
      return out({ folio });
    }

    // ---------- MI RESERVA (wallet): solo con folio + celular, o celular + nombre. Datos NO sensibles; 5 fallos = bloqueo 15 min ----------
    if (path === "/my-reservation" || path === "/wallet") {
      const ip = (req.headers.get("x-forwarded-for") || "?").split(",")[0].trim();
      if (await bloqueada(ip)) return out({ error: "Demasiados intentos. Intenta en 15 minutos." }, 429);
      const b = req.method === "POST" ? await req.json().catch(() => ({})) : Object.fromEntries(q);
      const phone = String(b.phone ?? "").replace(/[\s-]/g, "");
      if (!/^\d{10}$/.test(phone)) return out({ error: "Escribe tu celular de 10 dígitos" }, 400);
      const { data } = await db.from("reservations").select("folio,bus_id,seats,boarding,name").eq("phone", phone).maybeSingle();
      let ok = false;
      if (data && path === "/my-reservation") ok = folioOk(String(b.folio ?? "").toUpperCase()) && data.folio === String(b.folio).toUpperCase();
      if (data && path === "/wallet") { const n = limpio(b.name); ok = n.length >= 3 && (n === limpio(data.name) || n === limpio(data.name).split(" ")[0]); }
      if (!ok) { await fallaWallet(ip); return out({ error: "No encontramos una reserva con esos datos" }, 404); }
      await db.from("attempts").delete().eq("ip", ip).eq("bus_id", "wallet");
      return out({ ...data, name: data.name.split(" ")[0] });
    }
    return out({ error: "No encontrado" }, 404);
  } catch (_) { return out({ error: "Error de servidor" }, 500); }   // no se filtran detalles ni datos en logs
});
