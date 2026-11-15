# Plantilla de festival (ALV Tours) — núcleo

## Por qué hace falta Supabase
GitHub Pages solo sirve archivos estáticos: todo lo que ve el navegador es público. Si guardara teléfonos o domicilios ahí
(o en localStorage) quedarían expuestos, y una KEY validada en JS se leería en el código. Por eso la KEY (en hash bcrypt),
los asientos y los datos personales viven en Supabase Postgres con RLS, accesibles solo por la Edge Function.

## Cambiar de festival (5 min)
Edita `config/festival.json`, `config/buses.json` (1–6 buses; `activo:false` los oculta) y `config/news.json`. No se toca código.

## Publicar avisos, itinerarios y lineup (sin tocar código)
- **Avisos:** edita `config/news.json` en GitHub. Campos: `titulo`, `etiqueta` (LINEUP, ITINERARIO, AVISO…), `fecha` (AAAA-MM-DD),
  `texto` (resumen), `texto_largo` (detalle; usa `\n` para saltos de línea), `imagen` (ruta dentro del repo, ej. `img/foto.webp`, opcional),
  `fijada: true` (sale primero), `activo: false` (lo oculta) y, opcional, `enlace` (solo `https://`) con `enlace_texto`.
- **Lineup:** `lineup_destacados` (salen en el carrusel) y `lineup_cartel` (el resto, en "Ver cartel completo") dentro de `config/festival.json`.
- **Banner:** `banner` en `festival.json` apunta a `img/banner.webp`. Para cambiarlo, sube otra imagen a `img/` y cambia la ruta.
- Todo el contenido se pinta como texto plano (nunca HTML) y la política CSP no permite imágenes ni scripts externos.

## Puesta en marcha
1. Crea un proyecto en Supabase y ejecuta `supabase/schema.sql` en el SQL Editor.
2. Genera cada KEY con el `insert ... crypt(...)` del final del schema (una por bus; cámbialas por cada festival).
3. Instala Supabase CLI y despliega: `supabase functions deploy api --no-verify-jwt`
4. Secretos: `supabase secrets set ALLOWED_ORIGIN=https://TU-USUARIO.github.io` (el service role ya lo inyecta Supabase).
5. Pon la URL pública `https://TU-PROYECTO.supabase.co/functions/v1/api` en `api_base` de `festival.json`.
6. Sube el repo a GitHub y activa Settings > Pages (rama main, carpeta raíz).

## Checklist antes de publicar
- [ ] RLS activo en las 5 tablas y sin políticas · [ ] KEYs fuera del repo e historial del SQL Editor
- [ ] `ALLOWED_ORIGIN` es tu dominio de Pages · [ ] Branch protection, Dependabot y Secret Scanning activados
- [ ] Datos de prueba ficticios (555-0100) · [ ] Aviso de privacidad revisado

## Pendiente (siguiente entrega)
PWA (manifest, sw.js, iconos, offline), deploy.yml, vista admin con datos enmascarados, cifrado de teléfono/domicilio
con pgcrypto, rate limiting en endpoints distintos de validate-key y limpieza de sesiones/intentos viejos.
