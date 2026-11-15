-- Ejecutar UNA vez en Supabase > SQL Editor si tu base ya existe (agrega avisos + KEY admin + buses 3-6).

-- Avisos publicados desde el panel de administrador (#/admin). Solo la Edge Function (service_role) los toca.
create table if not exists news (id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(titulo) between 1 and 80),
  etiqueta text not null default 'AVISO' check (char_length(etiqueta) <= 20),
  fecha date not null default current_date, fijada boolean not null default false, activo boolean not null default true,
  texto text not null default '' check (char_length(texto) <= 200), texto_largo text not null default '' check (char_length(texto_largo) <= 1500),
  enlace text not null default '', enlace_texto text not null default '', created_at timestamptz default now());
alter table news enable row level security;

-- KEY del administrador (misma tabla que los buses, bus_id = 'admin'). Usa una frase larga; borra el comando del historial después:
-- insert into bus_keys values ('admin', crypt('TU-FRASE-LARGA-DE-ADMIN', gen_salt('bf', 10)));
-- KEYs de los 6 buses (una distinta por bus):
-- insert into bus_keys values ('bus3', crypt('PULSO-BUS3-2026', gen_salt('bf', 10))); -- idem bus4, bus5, bus6

-- Aviso de ejemplo (el itinerario). Edítalo desde el panel #/admin.
insert into news (titulo, etiqueta, fecha, fijada, texto, texto_largo) values
 ('Itinerario del viaje (ejemplo)', 'ITINERARIO', current_date, true, 'Aquí publicarás horarios de salida y regreso.',
  E'EJEMPLO: edita este aviso desde #/admin.\nSalida: (hora) en tu punto de abordaje\nRegreso: (hora) desde Foro Cholula\nLlega 20 minutos antes.');
