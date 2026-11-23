-- Ejecutar UNA vez en Supabase > SQL Editor: tracker GPS de los autobuses.
-- Guarda SOLO la última posición de cada bus (sin historial). Solo la Edge Function (service_role) la toca.
create table if not exists bus_pos (
  bus_id text primary key,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  speed real check (speed is null or speed between 0 and 100),       -- m/s
  heading real check (heading is null or heading between 0 and 360),
  acc real,                                                          -- precisión en metros
  updated_at timestamptz not null default now());
alter table bus_pos enable row level security;
-- Después vuelve a desplegar la función: supabase functions deploy api --no-verify-jwt
