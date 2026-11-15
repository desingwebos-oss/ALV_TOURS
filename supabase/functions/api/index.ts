// Edge Function "api": validate-key, seats, hold-seat, create-reservation, my-reservation.
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

// Devuelve la sesión si el token es válido, no expiró y es de ESE bus.
async function sesion(req: Request, bus: string) {
  const t = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!t) return null;
  const { data } = await db.from("sessions").select("id,bus_id,expires_at").eq("token_hash", await sha(t)).maybeSingle();
  return data && data.bus_id === bus && new Date(data.expires_at) > new Date() ? data : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const path = new URL(req.url).pathname.replace(/^.*\/api/, "");
  const q = new URL(req.url).searchParams;
  try {
    if (req.method === "POST" && path === "/validate-key") {
      const { bus_id, key } = await req.json();
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
      const token = rnd(32);
      const dur = bus_id === "admin" ? 4 * 3600 : 1800;   // admin: 4 h; buses: 30 min
      await db.from("sessions").insert({ token_hash: await sha(token), bus_id, expires_at: new Date(Date.now() + dur * 1e3).toISOString() });
      return out({ token, expires_in: dur });
    }

    // ---------- AVISOS (público: solo lectura de los activos) ----------
    if (req.method === "GET" && path === "/news") {
      const { data } = await db.from("news").select("id,titulo,etiqueta,fecha,fijada,texto,texto_largo,enlace,enlace_texto")
        .eq("activo", true).order("fecha", { ascending: false }).limit(12);
      return out(data || []);
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
          fijada: b.fijada === true, activo: b.activo !== false,
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
      return out({ error: "No encontrado" }, 404);
    }

    if (req.method === "GET" && path === "/seats") {            // sin datos personales, solo números de asiento
      const bus = q.get("bus_id") || ""; if (!busOk(bus)) return out({ error: "Datos inválidos" }, 400);
      const s = await sesion(req, bus);
      const { data } = await db.from("seats").select("seat,status,session_id,held_until").eq("bus_id", bus);
      const r = { taken: [] as number[], held: [] as number[], mine: [] as number[] };
      for (const x of data || []) {
        if (x.status === "taken") r.taken.push(x.seat);
        else if (new Date(x.held_until) > new Date()) { r.held.push(x.seat); if (s && x.session_id === s.id) r.mine.push(x.seat); }
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
      const name = String(b.name || "").trim(), phone = String(b.phone || "").replace(/[\s-]/g, "");
      const addr = String(b.address || "").trim().slice(0, 120), boarding = String(b.boarding || "").slice(0, 60);
      const seats = Array.isArray(b.seats) ? [...new Set(b.seats)].filter((n) => Number.isInteger(n) && n > 0 && n < 100) : [];
      if (!/^[\p{L}][\p{L} .'-]{2,79}$/u.test(name) || !/^\d{10}$/.test(phone) || !seats.length || seats.length > 10 || b.consent !== true)
        return out({ error: "Revisa tus datos y acepta el aviso de privacidad" }, 400);
      const folio = "PG-" + rnd(5).toUpperCase();
      const { data } = await db.rpc("crear_reserva", { p_bus: b.bus_id, p_session: s.id, p_seats: seats, p_folio: folio, p_name: name, p_phone: phone, p_addr: addr, p_boarding: boarding });
      return data ? out({ folio }) : out({ error: "Tus asientos expiraron o fueron tomados. Elígelos de nuevo." }, 409);
    }

    if (req.method === "GET" && path === "/my-reservation") {   // folio aleatorio de 40 bits; solo datos NO sensibles
      const folio = (q.get("folio") || "").toUpperCase();
      if (!/^PG-[0-9A-F]{10}$/.test(folio)) return out({ error: "Folio inválido" }, 400);
      const { data } = await db.from("reservations").select("folio,bus_id,seats,boarding,name").eq("folio", folio).maybeSingle();
      return data ? out({ ...data, name: data.name.split(" ")[0] }) : out({ error: "No encontrado" }, 404);
    }
    return out({ error: "No encontrado" }, 404);
  } catch (_) { return out({ error: "Error de servidor" }, 500); }   // no se filtran detalles ni datos en logs
});
