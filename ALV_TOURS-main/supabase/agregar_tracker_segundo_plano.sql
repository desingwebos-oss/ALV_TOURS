-- Ejecutar UNA vez en Supabase > SQL Editor: tracker en SEGUNDO PLANO (app Traccar Client en el celular de cada bus).
-- Crea una clave secreta aleatoria por bus y MUESTRA el identificador completo UNA sola vez (en la base solo se guarda su hash).
-- Copia el resultado a un lugar privado; NO lo subas a GitHub.
create table if not exists track_keys (bus_id text primary key, key_hash text not null);
alter table track_keys enable row level security;

with n as (select 'bus' || g as bus_id, replace(gen_random_uuid()::text, '-', '') as secreto from generate_series(1, 7) g),
     ins as (insert into track_keys select bus_id, encode(digest(secreto, 'sha256'), 'hex') from n
             on conflict (bus_id) do update set key_hash = excluded.key_hash returning bus_id)
select n.bus_id, n.bus_id || '.' || n.secreto as identificador_para_la_app from n order by n.bus_id;
-- Después vuelve a desplegar la función: supabase functions deploy api --no-verify-jwt
