-- ==============================================================================
-- ALV TOURS: Migración para Comentarios, Reacciones de Avisos y Check-in de Boletos
-- Ejecutar en Supabase > SQL Editor
-- ==============================================================================

-- 1. SECCIÓN DE COMENTARIOS / OPINIONES DE LA APP
create table if not exists app_feedback (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Pasajero' check (char_length(nombre) between 1 and 60),
  mensaje text not null check (char_length(mensaje) between 3 and 500),
  created_at timestamptz not null default now(),
  activo boolean not null default true
);
alter table app_feedback enable row level security;

-- 2. REACCIONES EN AVISOS DEL ADMIN (Corazón ❤️, Enojo 😡, Entristece 😢)
alter table news add column if not exists reacc_corazon int not null default 0;
alter table news add column if not exists reacc_enojo int not null default 0;
alter table news add column if not exists reacc_entristece int not null default 0;

-- Función atómica para registrar y alternar reacciones
create or replace function reaccionar_noticia(p_id uuid, p_reaccion text, p_anterior text)
returns json language plpgsql as $$
declare
  r record;
begin
  -- Decrementar reacción anterior si existía
  if p_anterior = 'corazon' then
    update news set reacc_corazon = greatest(0, reacc_corazon - 1) where id = p_id;
  elsif p_anterior = 'enojo' then
    update news set reacc_enojo = greatest(0, reacc_enojo - 1) where id = p_id;
  elsif p_anterior = 'entristece' then
    update news set reacc_entristece = greatest(0, reacc_entristece - 1) where id = p_id;
  end if;

  -- Incrementar nueva reacción
  if p_reaccion = 'corazon' then
    update news set reacc_corazon = reacc_corazon + 1 where id = p_id;
  elsif p_reaccion = 'enojo' then
    update news set reacc_enojo = reacc_enojo + 1 where id = p_id;
  elsif p_reaccion = 'entristece' then
    update news set reacc_entristece = reacc_entristece + 1 where id = p_id;
  end if;

  select reacc_corazon, reacc_enojo, reacc_entristece into r from news where id = p_id;
  return row_to_json(r);
end $$;

-- 3. CHECK-IN DE BOLETOS Y ASIENTOS RESERVADOS
alter table reservations add column if not exists checked_in boolean not null default false;
alter table reservations add column if not exists checked_in_at timestamptz;

-- Permisos (RLS activo sin políticas: solo service_role accede a estas tablas)
revoke all on function reaccionar_noticia from public, anon, authenticated;
