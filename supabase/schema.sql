-- KIT DEMOS · esquema de producción en Supabase
-- Un solo proyecto de Supabase puede atender a varios clientes: todo se separa por "negocio"
-- (el "id" del cliente.json) y cada dueño solo ve y edita lo suyo (Row Level Security).
-- Correr completo en Supabase → SQL Editor. Es idempotente: se puede volver a correr.

create extension if not exists pgcrypto;

-- ---------- tablas ----------
create table if not exists negocios (
  id text primary key,
  nombre text not null,
  config jsonb not null default '{}'::jsonb,   -- reservas (capacidad, duracionMin, maxPersonas), pedidos (envio, minimo), prefijoPedido
  creado timestamptz not null default now()
);

create table if not exists admins (
  user_id uuid not null references auth.users on delete cascade,
  negocio text not null references negocios on delete cascade,
  primary key (user_id, negocio)
);

create table if not exists categorias (
  negocio text not null references negocios on delete cascade,
  id text not null,
  nombre text not null,
  orden int not null default 0,
  primary key (negocio, id)
);

create table if not exists productos (
  negocio text not null references negocios on delete cascade,
  id text not null,
  categoria text,
  nombre text not null,
  descripcion text not null default '',
  precio numeric(12,2),
  foto text,
  etiquetas text[] not null default '{}',
  disponible boolean not null default true,
  orden int not null default 0,
  actualizado timestamptz not null default now(),
  primary key (negocio, id)
);

create table if not exists reservas (
  id uuid primary key default gen_random_uuid(),
  negocio text not null references negocios on delete cascade,
  fecha date not null,
  hora text not null check (hora ~ '^[0-9]{2}:[0-9]{2}$'),   -- minutos del día de servicio; "24:30" = 00:30 del día siguiente
  personas int not null check (personas between 1 and 200),
  nombre text not null check (length(nombre) between 1 and 80),
  telefono text not null check (length(telefono) between 6 and 30),
  email text,
  comentario text check (length(coalesce(comentario,'')) <= 300),
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmada','llego','no_vino','cancelada')),
  creado timestamptz not null default now()
);
create index if not exists reservas_negocio_fecha on reservas (negocio, fecha);

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  negocio text not null references negocios on delete cascade,
  codigo text not null,
  items jsonb not null,
  subtotal numeric(12,2) not null,
  envio numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  tipo text not null default 'retiro' check (tipo in ('retiro','delivery')),
  cliente jsonb not null,
  nota text,
  pago text not null default 'whatsapp' check (pago in ('whatsapp','mercadopago')),
  pago_estado text not null default 'a_coordinar' check (pago_estado in ('a_coordinar','pendiente','aprobado','rechazado','cobrado')),
  pago_id text,
  sucursal jsonb,                                -- cadenas: { id, nombre, direccion } de la sede elegida
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmado','listo','entregado','cancelado')),
  creado timestamptz not null default now()
);
create index if not exists pedidos_negocio_creado on pedidos (negocio, creado desc);

-- ---------- permisos ----------
create or replace function es_admin(n text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and negocio = n)
$$;

alter table negocios   enable row level security;
alter table admins     enable row level security;
alter table categorias enable row level security;
alter table productos  enable row level security;
alter table reservas   enable row level security;
alter table pedidos    enable row level security;

drop policy if exists negocios_leer on negocios;       create policy negocios_leer on negocios for select using (true);
drop policy if exists negocios_editar on negocios;     create policy negocios_editar on negocios for update using (es_admin(id)) with check (es_admin(id));
drop policy if exists admins_propio on admins;         create policy admins_propio on admins for select using (user_id = auth.uid());

drop policy if exists categorias_leer on categorias;   create policy categorias_leer on categorias for select using (true);
drop policy if exists categorias_admin on categorias;  create policy categorias_admin on categorias for all to authenticated using (es_admin(negocio)) with check (es_admin(negocio));
drop policy if exists productos_leer on productos;     create policy productos_leer on productos for select using (true);
drop policy if exists productos_admin on productos;    create policy productos_admin on productos for all to authenticated using (es_admin(negocio)) with check (es_admin(negocio));

-- Reservas y pedidos: el público NO lee ni inserta directo (protege datos personales);
-- crea con las funciones de abajo. El dueño lee y cambia estados.
drop policy if exists reservas_admin on reservas;      create policy reservas_admin on reservas for select to authenticated using (es_admin(negocio));
drop policy if exists reservas_estado on reservas;     create policy reservas_estado on reservas for update to authenticated using (es_admin(negocio)) with check (es_admin(negocio));
drop policy if exists pedidos_admin on pedidos;        create policy pedidos_admin on pedidos for select to authenticated using (es_admin(negocio));
drop policy if exists pedidos_estado on pedidos;       create policy pedidos_estado on pedidos for update to authenticated using (es_admin(negocio)) with check (es_admin(negocio));

-- ---------- funciones públicas (RPC) ----------
create or replace function hora_min(h text) returns int language sql immutable as $$
  select split_part(h, ':', 1)::int * 60 + split_part(h, ':', 2)::int
$$;

-- Ocupación de un día (sin datos personales) para pintar los turnos.
create or replace function ocupacion(p_negocio text, p_fecha date)
returns table (hora text, personas int)
language sql stable security definer set search_path = public as $$
  select r.hora, sum(r.personas)::int from reservas r
  where r.negocio = p_negocio and r.fecha = p_fecha and r.estado not in ('cancelada','no_vino')
  group by r.hora
$$;

-- Alta de reserva con control de capacidad del lado del servidor.
create or replace function crear_reserva(
  p_negocio text, p_fecha date, p_hora text, p_personas int, p_nombre text, p_telefono text,
  p_email text default null, p_comentario text default null
) returns reservas
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb; cap int; dur int; maxp int; usados int; fila reservas;
begin
  select config->'reservas' into cfg from negocios where id = p_negocio;
  if cfg is null then raise exception 'negocio_invalido'; end if;
  cap  := coalesce((cfg->>'capacidad')::int, 30);
  dur  := coalesce((cfg->>'duracionMin')::int, 90);
  maxp := coalesce((cfg->>'maxPersonas')::int, 10);
  if p_personas < 1 or p_personas > maxp then raise exception 'personas'; end if;
  if p_fecha < (now() at time zone 'utc')::date - 1 or p_fecha > current_date + 120 then raise exception 'fecha'; end if;
  perform pg_advisory_xact_lock(hashtext(p_negocio || p_fecha::text));   -- evita sobreventa con dos reservas simultáneas
  select coalesce(sum(personas), 0) into usados from reservas
   where negocio = p_negocio and fecha = p_fecha and estado not in ('cancelada','no_vino')
     and abs(hora_min(hora) - hora_min(p_hora)) < dur;
  if usados + p_personas > cap then raise exception 'sin_lugar'; end if;
  insert into reservas (negocio, fecha, hora, personas, nombre, telefono, email, comentario)
  values (p_negocio, p_fecha, p_hora, p_personas, left(trim(p_nombre), 80), left(trim(p_telefono), 30), nullif(left(trim(coalesce(p_email,'')), 120), ''), nullif(left(trim(coalesce(p_comentario,'')), 300), ''))
  returning * into fila;
  return fila;
end $$;

-- Alta de pedido: los precios salen de la tabla productos, no del navegador.
create or replace function crear_pedido(
  p_negocio text, p_items jsonb, p_tipo text, p_cliente jsonb, p_nota text, p_pago text, p_sucursal jsonb default null
) returns pedidos
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb; linea jsonb; prod productos; items jsonb := '[]'::jsonb; sub numeric := 0; env numeric := 0; cant int; fila pedidos; pref text;
begin
  select config into cfg from negocios where id = p_negocio;
  if cfg is null then raise exception 'negocio_invalido'; end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 60 then raise exception 'items'; end if;
  for linea in select * from jsonb_array_elements(p_items) loop
    select * into prod from productos where negocio = p_negocio and id = linea->>'id' and disponible and precio is not null;
    if not found then continue; end if;
    cant := greatest(1, least(99, coalesce((linea->>'cant')::int, 1)));
    items := items || jsonb_build_object('id', prod.id, 'nombre', prod.nombre, 'precio', prod.precio, 'cant', cant, 'nota', left(coalesce(linea->>'nota',''), 140), 'subtotal', prod.precio * cant);
    sub := sub + prod.precio * cant;
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'vacio'; end if;
  if p_tipo = 'delivery' then env := coalesce((cfg->'pedidos'->>'envio')::numeric, 0); end if;
  if sub < coalesce((cfg->'pedidos'->>'minimo')::numeric, 0) then raise exception 'minimo'; end if;
  if coalesce(p_cliente->>'nombre','') = '' or length(regexp_replace(coalesce(p_cliente->>'telefono',''), '\D', '', 'g')) < 8 then raise exception 'cliente'; end if;
  -- la sede tiene que existir en la config del negocio (se guarda solo id, nombre y dirección)
  if p_sucursal is not null and not exists (select 1 from jsonb_array_elements(coalesce(cfg->'sucursales','[]'::jsonb)) s where s->>'id' = p_sucursal->>'id') then raise exception 'sucursal'; end if;
  pref := coalesce(cfg->>'prefijoPedido', 'PD');
  insert into pedidos (negocio, codigo, items, subtotal, envio, total, tipo, cliente, nota, pago, pago_estado, sucursal)
  values (p_negocio, pref || '-' || (1000 + floor(random() * 9000))::int, items, sub, env, sub + env,
          case when p_tipo = 'delivery' then 'delivery' else 'retiro' end,
          jsonb_build_object('nombre', left(p_cliente->>'nombre', 80), 'telefono', left(p_cliente->>'telefono', 30), 'direccion', left(coalesce(p_cliente->>'direccion',''), 200)),
          left(coalesce(p_nota,''), 300),
          case when p_pago = 'mercadopago' then 'mercadopago' else 'whatsapp' end,
          case when p_pago = 'mercadopago' then 'pendiente' else 'a_coordinar' end,
          case when p_sucursal is null then null else jsonb_build_object('id', left(p_sucursal->>'id', 40), 'nombre', left(coalesce(p_sucursal->>'nombre',''), 80), 'direccion', left(coalesce(p_sucursal->>'direccion',''), 160)) end)
  returning * into fila;
  return fila;
end $$;

-- Estado público de un pedido (para la pantalla de vuelta de Mercado Pago). El uuid no se adivina.
create or replace function pedido_publico(p_id uuid)
returns table (id uuid, codigo text, estado text, pago_estado text, total numeric)
language sql stable security definer set search_path = public as $$
  select id, codigo, estado, pago_estado, total from pedidos where id = p_id
$$;

grant execute on function ocupacion(text, date), crear_reserva(text, date, text, int, text, text, text, text),
  crear_pedido(text, jsonb, text, jsonb, text, text, jsonb), pedido_publico(uuid) to anon, authenticated;

-- ---------- tiempo real (el panel ve pedidos y reservas al instante) ----------
do $$ begin
  begin alter publication supabase_realtime add table pedidos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table reservas; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table productos; exception when duplicate_object then null; end;
end $$;

-- ---------- fotos ----------
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true) on conflict (id) do nothing;
drop policy if exists fotos_admin_subir on storage.objects;
create policy fotos_admin_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and es_admin((storage.foldername(name))[1]));
drop policy if exists fotos_admin_borrar on storage.objects;
create policy fotos_admin_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and es_admin((storage.foldername(name))[1]));
