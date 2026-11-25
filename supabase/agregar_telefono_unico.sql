-- Para proyectos YA instalados: celular único por reserva + bloqueo de asientos de 2 minutos.
-- Ejecutar en Supabase > SQL Editor y después redesplegar la función: supabase functions deploy api --no-verify-jwt

-- 0) Revisa que no haya celulares repetidos (debe devolver 0 filas; si devuelve filas, corrígelas antes del paso 2):
-- select phone, count(*) from reservations group by phone having count(*) > 1;

-- 1) La sesión guarda el celular con el que entró la persona
alter table sessions add column if not exists phone text;

-- 2) UNA reserva por celular, garantizado por la base de datos (aunque fallen la app o la función)
create unique index if not exists reservations_phone_uq on reservations(phone);

-- 3) Bloqueo de asiento: 2 minutos (máx. 10 por sesión)
create or replace function hold_seat(p_bus text, p_seat int, p_session uuid) returns boolean language plpgsql as $$
begin
  if (select count(*) from seats where bus_id=p_bus and session_id=p_session and status='held' and held_until>now()) >= 10 then return false; end if;
  insert into seats(bus_id,seat,status,session_id,held_until) values (p_bus,p_seat,'held',p_session,now()+interval '2 minutes')
  on conflict (bus_id,seat) do update set session_id=p_session, held_until=now()+interval '2 minutes'
  where seats.status='held' and (seats.held_until<now() or seats.session_id=p_session);
  return exists (select 1 from seats where bus_id=p_bus and seat=p_seat and session_id=p_session and status='held');
end $$;

-- 4) Confirmar reserva: si el celular ya tiene una, devuelve false en lugar de fallar
create or replace function crear_reserva(p_bus text, p_session uuid, p_seats int[], p_folio text, p_name text, p_phone text, p_addr text, p_boarding text)
returns boolean language plpgsql as $$
begin
  if (select count(*) from seats where bus_id=p_bus and session_id=p_session and status='held' and held_until>now() and seat=any(p_seats)) <> array_length(p_seats,1) then return false; end if;
  insert into reservations values (p_folio,p_bus,p_name,p_phone,p_addr,p_boarding,p_seats,now());
  update seats set status='taken', held_until=null where bus_id=p_bus and seat=any(p_seats) and session_id=p_session;
  return true;
exception when unique_violation then return false;
end $$;

-- SOPORTE: si alguien se equivocó de asientos/número, TÚ (admin) liberas su reserva desde aquí (la app no permite cambios):
-- delete from seats where bus_id='bus1' and seat = any((select seats from reservations where phone='5512345678'));
-- delete from reservations where phone='5512345678';
