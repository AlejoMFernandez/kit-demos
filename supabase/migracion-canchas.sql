-- Canchas para complejos deportivos (fútbol, pádel…) · kit 1.12 (oct 2026).
-- Correr UNA vez en el SQL Editor del proyecto antes de pasar a producción un cliente con "modulos.canchas".
-- Las tarifas editables viven en negocios.config.tarifasCanchas (las escribe el panel); la definición de canchas
-- y deportes en negocios.config.canchas (copiá ahí el bloque "canchas" de cliente.json al dar de alta al cliente).
-- Horas en MINUTOS del día (1200 = 20:00). Un turno ocupa [desde, hasta).

create table if not exists turnos_cancha (
  id uuid primary key default gen_random_uuid(),
  negocio text not null references negocios(id) on delete cascade,
  codigo text not null default '',
  deporte text, unidad text,
  canchas text[] not null,
  fecha date not null,
  desde int not null, hasta int not null check (hasta > desde),
  nombre text not null default '', telefono text not null default '', email text not null default '',
  comentario text not null default '', motivo text not null default '',
  extras jsonb not null default '[]', precio numeric, total numeric, sena numeric, pico boolean,
  origen text not null default 'web' check (origen in ('web','whatsapp','mostrador','manual','telefono','bloqueo')),
  pago text not null default 'complejo',
  pago_estado text not null default 'a_coordinar' check (pago_estado in ('a_coordinar','pendiente','aprobado','rechazado','cobrado')),
  pago_id text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmada','cancelada','no_vino','jugado')),
  creado timestamptz not null default now()
);
create index if not exists turnos_cancha_negocio_fecha on turnos_cancha (negocio, fecha);

create table if not exists abonos_cancha (
  id uuid primary key default gen_random_uuid(),
  negocio text not null references negocios(id) on delete cascade,
  deporte text not null, unidad text not null, canchas text[] not null,
  dow int not null check (dow between 0 and 6), hora int not null, duracion int not null,
  nombre text not null default '', telefono text not null default '',
  desde date not null default current_date, liberadas date[] not null default '{}',
  estado text not null default 'activo' check (estado in ('activo','baja')),
  creado timestamptz not null default now()
);

alter table turnos_cancha enable row level security;
alter table abonos_cancha enable row level security;
drop policy if exists turnos_cancha_admin on turnos_cancha;
create policy turnos_cancha_admin on turnos_cancha for all using (exists (select 1 from admins a where a.user_id = auth.uid() and a.negocio = turnos_cancha.negocio))
  with check (exists (select 1 from admins a where a.user_id = auth.uid() and a.negocio = turnos_cancha.negocio));
drop policy if exists abonos_cancha_admin on abonos_cancha;
create policy abonos_cancha_admin on abonos_cancha for all using (exists (select 1 from admins a where a.user_id = auth.uid() and a.negocio = abonos_cancha.negocio))
  with check (exists (select 1 from admins a where a.user_id = auth.uid() and a.negocio = abonos_cancha.negocio));

-- Todo lo que ocupa canchas en un rango (turnos activos + abonos fijos), sin datos personales.
create or replace function ocupacion_canchas(p_negocio text, p_desde date, p_hasta date)
returns table (fecha date, canchas text[], desde int, hasta int)
language sql stable security definer set search_path = public as $$
  select t.fecha, t.canchas, t.desde, t.hasta from turnos_cancha t
   where t.negocio = p_negocio and t.estado <> 'cancelada' and t.fecha between p_desde and p_hasta
  union all
  select d::date, a.canchas, a.hora, a.hora + a.duracion
    from abonos_cancha a, generate_series(p_desde, p_hasta, interval '1 day') d
   where a.negocio = p_negocio and a.estado = 'activo' and extract(dow from d)::int = a.dow and d::date >= a.desde and not (d::date = any (a.liberadas))
$$;

-- Público: reservar un turno. El precio y la seña se calculan ACÁ con las tarifas del negocio (nunca se confía en el navegador).
create or replace function crear_turno_cancha(p_negocio text, p_data jsonb)
returns turnos_cancha
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb; cc jsonb; dep jsonb; tf jsonb; fila turnos_cancha;
  v_fecha date := (p_data->>'fecha')::date; v_desde int := (p_data->>'desde')::int; v_hasta int; v_canchas text[];
  v_pico boolean; v_precio numeric; v_extras jsonb := '[]'; v_total numeric; v_sena numeric; pct numeric; x jsonb; n int; pref text;
begin
  select config into cfg from negocios where id = p_negocio;
  if cfg is null then raise exception 'negocio_invalido'; end if;
  cc := cfg->'canchas';
  select d into dep from jsonb_array_elements(cc->'deportes') d where d->>'id' = p_data->>'deporte';
  if dep is null then raise exception 'deporte'; end if;
  v_hasta := v_desde + coalesce((dep->>'duracion')::int, 60);
  if dep ? 'usa' then select array_agg(e) into v_canchas from jsonb_array_elements_text(dep->'usa') e;
  else
    select array[c->>'id'] into v_canchas from jsonb_array_elements(cc->'canchas') c where c->>'id' = p_data->>'unidad' and c->>'deporte' = dep->>'id';
  end if;
  if v_canchas is null then raise exception 'cancha'; end if;
  if v_fecha < current_date or v_fecha > current_date + coalesce((cc->>'diasAdelante')::int, 14) then raise exception 'fecha'; end if;

  -- un turno a la vez por negocio: nada de dos reservas pisándose
  perform pg_advisory_xact_lock(hashtext('canchas:' || p_negocio));
  if exists (select 1 from ocupacion_canchas(p_negocio, v_fecha, v_fecha) o where o.canchas && v_canchas and o.desde < v_hasta and v_desde < o.hasta) then raise exception 'sin_lugar'; end if;

  tf := coalesce(cfg->'tarifasCanchas', '{}'::jsonb);
  v_pico := extract(dow from v_fecha) in (0, 6) or (cc->'feriados') ? v_fecha::text
            or v_desde >= (split_part(coalesce(tf->>'picoDesde', cc->'pico'->>'desde', '18:00'), ':', 1)::int * 60 + split_part(coalesce(tf->>'picoDesde', cc->'pico'->>'desde', '18:00'), ':', 2)::int);
  v_precio := coalesce(tf->(dep->>'id')->>(case when v_pico then 'pico' else 'noPico' end), cc->'tarifas'->(dep->>'id')->>(case when v_pico then 'pico' else 'noPico' end))::numeric;
  v_total := v_precio;
  for x in select * from jsonb_array_elements(coalesce(cc->'extras', '[]')) loop
    n := least(coalesce((x->>'max')::int, 10), greatest(0, coalesce((p_data->'extras'->>(x->>'id'))::int, 0)));
    if n > 0 and (not (x ? 'deportes') or (x->'deportes') ? (dep->>'id')) then
      v_extras := v_extras || jsonb_build_object('id', x->>'id', 'nombre', x->>'nombre', 'cant', n, 'precio', coalesce(tf->'extras'->>(x->>'id'), x->>'precio')::numeric);
      v_total := v_total + n * coalesce(tf->'extras'->>(x->>'id'), x->>'precio')::numeric;
    end if;
  end loop;
  pct := coalesce((tf->>'sena')::numeric, (cc->>'sena')::numeric, 0);
  v_sena := case when p_data->>'pago' = 'mercadopago' and v_precio is not null and pct > 0 then round(v_precio * pct / 100 / 100) * 100 end;
  pref := coalesce(cfg->>'prefijoPedido', 'CH');

  insert into turnos_cancha (negocio, codigo, deporte, unidad, canchas, fecha, desde, hasta, nombre, telefono, email, extras, precio, total, sena, pico, origen, pago, pago_estado, estado)
  values (p_negocio, pref || '-' || (1000 + floor(random() * 9000))::int, dep->>'id', coalesce(p_data->>'unidad', dep->>'id'), v_canchas, v_fecha, v_desde, v_hasta,
    left(coalesce(p_data->>'nombre',''), 80), left(coalesce(p_data->>'telefono',''), 30), left(coalesce(p_data->>'email',''), 120),
    v_extras, v_precio, v_total, v_sena, v_pico, 'web', coalesce(p_data->>'pago','complejo'),
    case when p_data->>'pago' = 'mercadopago' then 'pendiente' else 'a_coordinar' end, 'pendiente')
  returning * into fila;
  return fila;
end $$;

-- Público: lo que ve quien reservó al volver de Mercado Pago (sin teléfono)
create or replace function turno_cancha_publico(p_id uuid)
returns table (id uuid, codigo text, estado text, pago_estado text, deporte text, unidad text, canchas text[], fecha date, desde int, hasta int, nombre text, extras jsonb, precio numeric, total numeric, sena numeric, pico boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.codigo, t.estado, t.pago_estado, t.deporte, t.unidad, t.canchas, t.fecha, t.desde, t.hasta, split_part(t.nombre, ' ', 1), t.extras, t.precio, t.total, t.sena, t.pico
  from turnos_cancha t where t.id = p_id
$$;

grant execute on function ocupacion_canchas(text, date, date) to anon, authenticated;
grant execute on function crear_turno_cancha(text, jsonb) to anon, authenticated;
grant execute on function turno_cancha_publico(uuid) to anon, authenticated;

alter publication supabase_realtime add table turnos_cancha;
alter publication supabase_realtime add table abonos_cancha;
-- Pendiente para el webhook de Mercado Pago: al aprobarse la seña, pasar estado 'pendiente' → 'confirmada' (ver produccion/api/mp-webhook.js).
