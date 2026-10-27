-- Estadías para alojamientos (B&B, cabañas, posadas) · kit 1.9 (oct 2026).
-- Correr UNA vez en el SQL Editor del proyecto antes de pasar a producción un cliente con "modulos.estadias".
-- Las tarifas editables viven en negocios.config.tarifasEstadias (las escribe el panel).

create table if not exists estadias (
  id uuid primary key default gen_random_uuid(),
  negocio text not null references negocios(id) on delete cascade,
  codigo text not null default '',
  habitacion text not null,
  llegada date not null,
  salida date not null check (salida > llegada),
  huespedes int not null default 2,
  nombre text not null default '',
  telefono text not null default '',
  email text not null default '',
  hora_llegada text not null default '',
  comentario text not null default '',
  total numeric, sena numeric,
  origen text not null default 'web' check (origen in ('web','whatsapp','booking','manual','telefono','bloqueo')),
  pago text not null default 'whatsapp',
  pago_estado text not null default 'a_coordinar' check (pago_estado in ('a_coordinar','pendiente','aprobado','rechazado','cobrado')),
  pago_id text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmada','cancelada')),
  creado timestamptz not null default now()
);
create index if not exists estadias_negocio_llegada on estadias (negocio, llegada);

-- nunca dos estadías activas pisándose en la misma habitación
create extension if not exists btree_gist;
alter table estadias drop constraint if exists estadias_sin_solape;
alter table estadias add constraint estadias_sin_solape exclude using gist (
  negocio with =, habitacion with =, daterange(llegada, salida, '[)') with &&
) where (estado <> 'cancelada');

alter table estadias enable row level security;
drop policy if exists estadias_admin on estadias;
create policy estadias_admin on estadias for all using (exists (select 1 from admins a where a.user_id = auth.uid() and a.negocio = estadias.negocio))
  with check (exists (select 1 from admins a where a.user_id = auth.uid() and a.negocio = estadias.negocio));

-- Público: solo qué noches están ocupadas (sin datos de huéspedes)
create or replace function ocupacion_estadias(p_negocio text)
returns table (habitacion text, llegada date, salida date)
language sql stable security definer set search_path = public as $$
  select e.habitacion, e.llegada, e.salida from estadias e
  where e.negocio = p_negocio and e.estado <> 'cancelada' and e.salida >= current_date
$$;

-- Público: pedir una estadía (el total se calcula en el sitio y se revisa en el panel al confirmar)
create or replace function crear_estadia(p_negocio text, p_data jsonb)
returns estadias
language plpgsql security definer set search_path = public as $$
declare fila estadias; pref text;
begin
  if not exists (select 1 from negocios where id = p_negocio) then raise exception 'negocio_invalido'; end if;
  select coalesce(config->>'prefijoPedido', 'ES') into pref from negocios where id = p_negocio;
  insert into estadias (negocio, codigo, habitacion, llegada, salida, huespedes, nombre, telefono, email, hora_llegada, comentario, total, sena, origen, pago, pago_estado)
  values (p_negocio, pref || '-' || (1000 + floor(random() * 9000))::int, left(p_data->>'habitacion', 40), (p_data->>'llegada')::date, (p_data->>'salida')::date,
    greatest(1, least(12, coalesce((p_data->>'huespedes')::int, 2))), left(coalesce(p_data->>'nombre',''), 80), left(coalesce(p_data->>'telefono',''), 30),
    left(coalesce(p_data->>'email',''), 120), left(coalesce(p_data->>'horaLlegada',''), 10), left(coalesce(p_data->>'comentario',''), 400),
    nullif(p_data->>'total','')::numeric, nullif(p_data->>'sena','')::numeric, 'web', coalesce(p_data->>'pago','whatsapp'),
    case when p_data->>'pago' = 'mercadopago' then 'pendiente' else 'a_coordinar' end)
  returning * into fila;
  return fila;
exception when exclusion_violation then raise exception 'sin_lugar';
end $$;
grant execute on function ocupacion_estadias(text) to anon, authenticated;
grant execute on function crear_estadia(text, jsonb) to anon, authenticated;

alter publication supabase_realtime add table estadias;
