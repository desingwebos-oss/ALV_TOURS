# Plantilla de festival (ALV Tours) — núcleo

## Por qué hace falta Supabase
GitHub Pages solo sirve archivos estáticos: todo lo que ve el navegador es público. Si guardara teléfonos o domicilios ahí
(o en localStorage) quedarían expuestos, y una KEY validada en JS se leería en el código. Por eso la KEY (en hash bcrypt),
los asientos y los datos personales viven en Supabase Postgres con RLS, accesibles solo por la Edge Function.

## Cambiar de festival (5 min)
Edita `config/festival.json`, `config/buses.json` (1–7 buses; `activo:false` los oculta; cada bus necesita su KEY en `bus_keys`) y `config/news.json`. No se toca código.

## Croquis de los autobuses (mapa de asientos)
Cada bus de `config/buses.json` trae su croquis digitalizado en `layout` (filas `izq` / `der` con pasillo, `fila` para el fondo, `tvIzq`/`tvDer` para las pantallas)
y opcionalmente `frente` (chofer/puerta) y `tv_frente`. Dentro de `izq`/`der`: número = asiento, `null` = hueco, `"WC"` = zona especial, `{"t":"WC","span":2}` = zona de 2 columnas.
Buses 1, 3, 6 y 7 tienen su croquis; los buses 2, 4 y 5 usan el del Bus 1 con `"layout_de":"bus1"` (quita esa línea y pon su propio `layout` cuando los digitalices).
Bus 7: ejecuta `supabase/agregar_bus7.sql` para crear su KEY.

## Itinerario por bus
Cada bus tiene `itinerario`: lista de `{punto, cita, salida}`. Se muestra en la ventana del bus (en lugar del precio) y como opciones de abordaje al reservar; `puntos_abordaje` solo repite los nombres.

## Tracker GPS del bus
1. En Supabase > SQL Editor ejecuta `supabase/agregar_tracker.sql` y vuelve a desplegar la función (`supabase functions deploy api --no-verify-jwt`).
2. En `config/festival.json` llena `destino.lat` y `destino.lng` (Google Maps: clic derecho sobre el recinto > copiar coordenadas) para mostrar 🏁 y "Faltan ~X km".
3. Durante el viaje, el admin abre `#/admin`, entra con su KEY, elige el bus y toca **INICIAR UBICACIÓN** (acepta el permiso de GPS). Debe dejar la pantalla encendida y con datos.
4. Los pasajeros abren el menú > bus > **VER BUS EN VIVO**. Se actualiza cada 10 s; si pasan 2 min sin señal se muestra "Sin señal reciente". Solo se guarda la última posición (sin historial).
El mapa usa teselas de OpenStreetMap (permitidas en la CSP de `index.html`). Para mucho tráfico conviene un proveedor de mapas propio.

## Menú lateral
El botón de 3 rayitas (arriba a la izquierda, junto al nombre del festival) abre la ventana "Seleccionar asientos" con la lista de buses.

## Panel de administrador (publicar desde el celular)
1. En Supabase > SQL Editor ejecuta `supabase/actualizar_admin.sql` (crea la tabla `news`). Antes de correrlo, descomenta y cambia la frase de la KEY admin
   (`insert into bus_keys values ('admin', crypt('TU-FRASE-LARGA', gen_salt('bf',10)))`) y las KEYs de bus3–bus6.
2. Vuelve a desplegar la función: `supabase functions deploy api --no-verify-jwt`
3. Abre `https://TU-USUARIO.github.io/ALV_TOURS/#/admin` en el celular (agrégalo a pantalla de inicio), escribe la KEY y publica/edita/fija/oculta/borra avisos.
La sesión dura 4 h y la KEY se valida solo en el servidor (5 intentos fallidos = bloqueo de 15 min). Si la API no responde, el sitio muestra `config/news.json`.

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
