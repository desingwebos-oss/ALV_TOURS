-- Ejecutar UNA vez en Supabase > SQL Editor: cada aviso puede indicar qué autobús lo publica (bus1 ... bus7). Vacío = aviso general.
alter table news add column if not exists bus_id text check (bus_id is null or bus_id ~ '^[A-Za-z0-9_-]{1,32}$');
-- Después vuelve a desplegar la función: supabase functions deploy api --no-verify-jwt
