-- Ejecutar en Supabase > SQL Editor. RLS activado SIN políticas: el rol anon NO puede leer ni escribir nada.
-- Solo la Edge Function (service_role, secreto en Supabase) toca estas tablas.
create extension if not exists pgcrypto;
create table bus_keys (bus_id text primary key, key_hash text not null);          -- hash bcrypt, nunca la KEY
create table attempts (ip text, bus_id text, fails int not null default 0, locked_until timestamptz, primary key (ip, bus_id));
create table sessions (id uuid primary key default gen_random_uuid(), token_hash text unique not null, bus_id text not null, expires_at timestamptz not null);
create table seats (bus_id text, seat int check (seat between 1 and 99), status text check (status in ('held','taken')),
  session_id uuid, held_until timestamptz, primary key (bus_id, seat));
create table reservations (folio text primary key, bus_id text not null,
  name text not null check (char_length(name) between 3 and 80), phone text not null check (phone ~ '^[0-9]{10}$'),
  address text check (char_length(address) <= 120), boarding text, seats int[] not null, consent_at timestamptz not null, created_at timestamptz default now());
alter table bus_keys enable row level security; alter table attempts enable row level security; alter table sessions enable row level security;
alter table seats enable row level security; alter table reservations enable row level security;

-- Bloqueo atómico de asiento por 10 min (máx. 10 por sesión). Evita carreras entre dos personas.
create function hold_seat(p_bus text, p_seat int, p_session uuid) returns boolean language plpgsql as $$
begin
  if (select count(*) from seats where bus_id=p_bus and session_id=p_session and status='held' and held_until>now()) >= 10 then return false; end if;
  insert into seats(bus_id,seat,status,session_id,held_until) values (p_bus,p_seat,'held',p_session,now()+interval '10 minutes')
  on conflict (bus_id,seat) do update set session_id=p_session, held_until=now()+interval '10 minutes'
  where seats.status='held' and (seats.held_until<now() or seats.session_id=p_session);
  return exists (select 1 from seats where bus_id=p_bus and seat=p_seat and session_id=p_session and status='held');
end $$;
create function release_seat(p_bus text, p_seat int, p_session uuid) returns void language sql as
$$ delete from seats where bus_id=p_bus and seat=p_seat and session_id=p_session and status='held' $$;

-- Confirma la reserva solo si TODOS los asientos siguen apartados por esa sesión (atómico).
create function crear_reserva(p_bus text, p_session uuid, p_seats int[], p_folio text, p_name text, p_phone text, p_addr text, p_boarding text)
returns boolean language plpgsql as $$
begin
  if (select count(*) from seats where bus_id=p_bus and session_id=p_session and status='held' and held_until>now() and seat=any(p_seats)) <> array_length(p_seats,1) then return false; end if;
  insert into reservations values (p_folio,p_bus,p_name,p_phone,p_addr,p_boarding,p_seats,now());
  update seats set status='taken', held_until=null where bus_id=p_bus and seat=any(p_seats) and session_id=p_session;
  return true;
end $$;
revoke all on function hold_seat, release_seat, crear_reserva from public, anon, authenticated;

-- Generar la KEY de un bus (borra este comando del historial del editor después):
-- insert into bus_keys values ('bus1', crypt('PULSO-BUS1-2026', gen_salt('bf', 10)));

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
