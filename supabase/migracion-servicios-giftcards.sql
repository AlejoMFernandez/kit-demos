-- Kit 1.4 (oct 2026): reservas por servicio y tanda + gift cards.
-- Clientes nuevos: correr schema.sql y DESPUÉS este archivo. Clientes viejos: antes migracion-encargos.sql (1.3).
-- Clientes que ya estaban en producción: correr este archivo UNA vez en el SQL Editor.
-- Es idempotente (se puede volver a correr sin romper nada).

-- ---------- reservas: servicio y extras ----------
alter table reservas add column if not exists servicio text;
alter table reservas add column if not exists extras jsonb;

-- La firma cambia (suma p_servicio y p_extras): se borra la vieja para no dejar dos versiones.
drop function if exists crear_reserva(text, date, text, int, text, text, text, text);

-- Alta de reserva con control de capacidad del lado del servidor.
-- Con "servicios" en la config: el horario tiene que ser un turno de alguna tanda y el cupo es por tanda.
-- Sin "servicios": cupo por superposición de "duracionMin", como siempre.
create or replace function crear_reserva(
  p_negocio text, p_fecha date, p_hora text, p_personas int, p_nombre text, p_telefono text,
  p_email text default null, p_comentario text default null, p_servicio text default null, p_extras jsonb default null
) returns reservas
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb; cap int; dur int; maxp int; usados int; fila reservas;
  serv jsonb; tanda jsonb; turnos text[]; dow text; ext jsonb;
begin
  select config->'reservas' into cfg from negocios where id = p_negocio;
  if cfg is null then raise exception 'negocio_invalido'; end if;
  cap  := coalesce((cfg->>'capacidad')::int, 30);
  dur  := coalesce((cfg->>'duracionMin')::int, 90);
  maxp := coalesce((cfg->>'maxPersonas')::int, 10);
  if p_personas < 1 or p_personas > maxp then raise exception 'personas'; end if;
  if p_fecha < (now() at time zone 'utc')::date - 1 or p_fecha > current_date + 120 then raise exception 'fecha'; end if;
  if cfg->'cerrados' ? p_fecha::text then raise exception 'cerrado'; end if;
  perform pg_advisory_xact_lock(hashtext(p_negocio || p_fecha::text));   -- evita sobreventa con dos reservas simultáneas

  if jsonb_typeof(cfg->'servicios') = 'array' and jsonb_array_length(cfg->'servicios') > 0 then
    select s, t into serv, tanda
      from jsonb_array_elements(cfg->'servicios') s, jsonb_array_elements(coalesce(s->'tandas', '[]'::jsonb)) t
     where t->'turnos' ? p_hora
     limit 1;
    if tanda is null then raise exception 'hora'; end if;
    dow := (array['dom','lun','mar','mie','jue','vie','sab'])[extract(dow from p_fecha)::int + 1];
    if jsonb_typeof(serv->'dias') = 'array' and not (serv->'dias' ? dow) then raise exception 'hora'; end if;
    cap := coalesce((tanda->>'capacidad')::int, (serv->>'capacidad')::int, cap);
    select array_agg(x) into turnos from jsonb_array_elements_text(tanda->'turnos') x;
    select coalesce(sum(personas), 0) into usados from reservas
     where negocio = p_negocio and fecha = p_fecha and estado not in ('cancelada','no_vino') and hora = any(turnos);
  else
    select coalesce(sum(personas), 0) into usados from reservas
     where negocio = p_negocio and fecha = p_fecha and estado not in ('cancelada','no_vino')
       and abs(hora_min(hora) - hora_min(p_hora)) < dur;
  end if;
  if usados + p_personas > cap then raise exception 'sin_lugar'; end if;

  -- extras: solo los que existen en la config ("socio", "cumple"…)
  select nullif(coalesce(jsonb_agg(e), '[]'::jsonb), '[]'::jsonb) into ext
    from jsonb_array_elements_text(coalesce(p_extras, '[]'::jsonb)) e
   where exists (select 1 from jsonb_array_elements(coalesce(cfg->'extras', '[]'::jsonb)) x where x->>'id' = e);

  insert into reservas (negocio, fecha, hora, personas, nombre, telefono, email, comentario, servicio, extras)
  values (p_negocio, p_fecha, p_hora, p_personas, left(trim(p_nombre), 80), left(trim(p_telefono), 30), nullif(left(trim(coalesce(p_email,'')), 120), ''), nullif(left(trim(coalesce(p_comentario,'')), 300), ''),
          serv->>'id', ext)
  returning * into fila;
  return fila;
end $$;

-- ---------- gift cards ----------
create table if not exists giftcards (
  id uuid primary key default gen_random_uuid(),
  negocio text not null references negocios on delete cascade,
  codigo text not null,
  pedido uuid references pedidos on delete set null,
  pedido_codigo text,
  monto numeric(12,2) not null check (monto > 0),
  saldo numeric(12,2) not null check (saldo >= 0),
  para text, de text, mensaje text, comprador text,
  estado text not null default 'pendiente' check (estado in ('pendiente','vigente','parcial','usada','anulada')),
  creado timestamptz not null default now(),
  activada timestamptz,
  vence timestamptz,
  unique (negocio, codigo)
);
create index if not exists giftcards_negocio_creado on giftcards (negocio, creado desc);
create index if not exists giftcards_pedido on giftcards (pedido);

create table if not exists giftcard_canjes (
  id uuid primary key default gen_random_uuid(),
  giftcard uuid not null references giftcards on delete cascade,
  monto numeric(12,2) not null check (monto > 0),
  nota text,
  por uuid default auth.uid(),
  creado timestamptz not null default now()
);

alter table giftcards enable row level security;
alter table giftcard_canjes enable row level security;
drop policy if exists giftcards_admin on giftcards;  create policy giftcards_admin on giftcards for select to authenticated using (es_admin(negocio));
drop policy if exists canjes_admin on giftcard_canjes;
create policy canjes_admin on giftcard_canjes for select to authenticated using (exists (select 1 from giftcards g where g.id = giftcard and es_admin(g.negocio)));

-- Código corto sin letras que se confunden (0/O, 1/I/L, 5/S): "LCD-7K2Q"
create or replace function gc_codigo(pref text) returns text language sql volatile as $$
  select pref || '-' || string_agg(substr('ABCDEFGHJKMNPQRTUVWXYZ2346789', 1 + floor(random() * 29)::int, 1), '') from generate_series(1, 4)
$$;

-- Alta de pedido (incluye encargos 1.3): los precios salen de la tabla productos y los montos de gift card de la config, no del navegador.
alter table pedidos add column if not exists retiro jsonb;
alter table pedidos add column if not exists sin_precio boolean not null default false;
alter table pedidos add column if not exists sucursal jsonb;
drop function if exists crear_pedido(text, jsonb, text, jsonb, text, text, jsonb);
create or replace function crear_pedido(
  p_negocio text, p_items jsonb, p_tipo text, p_cliente jsonb, p_nota text, p_pago text, p_sucursal jsonb default null, p_retiro jsonb default null
) returns pedidos
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb; linea jsonb; prod productos; items jsonb := '[]'::jsonb; sub numeric := 0; env numeric := 0; cant int; fila pedidos; pref text;
  a_confirmar boolean; sin_p boolean := false;
  gcfg jsonb; monto numeric; gc jsonb; it jsonb; gpref text; cod text;
begin
  select config into cfg from negocios where id = p_negocio;
  if cfg is null then raise exception 'negocio_invalido'; end if;
  a_confirmar := coalesce(cfg->'pedidos'->>'sinPrecio', '') = 'a_confirmar';
  gcfg := cfg->'giftcards';
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 60 then raise exception 'items'; end if;
  for linea in select * from jsonb_array_elements(p_items) loop
    if linea->>'id' = 'giftcard' then
      if gcfg is null then continue; end if;
      monto := nullif(linea->'gc'->>'monto', '')::numeric;
      if monto is null or monto <= 0 then continue; end if;
      if not (exists (select 1 from jsonb_array_elements_text(coalesce(gcfg->'montos', '[]'::jsonb)) m where m::numeric = monto)
              or ((gcfg->>'min' is not null or gcfg->>'max' is not null)
                  and monto >= coalesce((gcfg->>'min')::numeric, 1) and monto <= coalesce((gcfg->>'max')::numeric, 1e12))) then continue; end if;
      gc := jsonb_build_object('monto', monto, 'para', left(trim(coalesce(linea->'gc'->>'para', '')), 60), 'de', left(trim(coalesce(linea->'gc'->>'de', '')), 60), 'mensaje', left(trim(coalesce(linea->'gc'->>'mensaje', '')), 200));
      items := items || jsonb_build_object('id', 'giftcard', 'nombre', coalesce(gcfg->>'nombre', 'Gift card'), 'precio', monto, 'cant', 1,
        'nota', case when gc->>'para' <> '' then 'Para ' || (gc->>'para') else '' end, 'subtotal', monto, 'giftcard', gc);
      sub := sub + monto;
      continue;
    end if;
    select * into prod from productos where negocio = p_negocio and id = linea->>'id' and disponible and (precio is not null or a_confirmar);
    if not found then continue; end if;
    cant := greatest(1, least(99, coalesce((linea->>'cant')::int, 1)));
    if prod.precio is null then sin_p := true; end if;
    items := items || jsonb_build_object('id', prod.id, 'nombre', prod.nombre, 'precio', prod.precio, 'cant', cant, 'nota', left(coalesce(linea->>'nota',''), 140), 'subtotal', coalesce(prod.precio, 0) * cant);
    sub := sub + coalesce(prod.precio, 0) * cant;
  end loop;
  if jsonb_array_length(items) = 0 then raise exception 'vacio'; end if;
  -- con precios a confirmar no se cobra online
  if sin_p and p_pago = 'mercadopago' then raise exception 'sin_precio'; end if;
  if p_tipo = 'delivery' then env := coalesce((cfg->'pedidos'->>'envio')::numeric, 0); end if;
  if not sin_p and sub < coalesce((cfg->'pedidos'->>'minimo')::numeric, 0) then raise exception 'minimo'; end if;
  if coalesce(p_cliente->>'nombre','') = '' or length(regexp_replace(coalesce(p_cliente->>'telefono',''), '\D', '', 'g')) < 8 then raise exception 'cliente'; end if;
  if p_sucursal is not null and not exists (select 1 from jsonb_array_elements(coalesce(cfg->'sucursales','[]'::jsonb)) s where s->>'id' = p_sucursal->>'id') then raise exception 'sucursal'; end if;
  -- retiro: fecha válida (hoy a 120 días) y franja con forma conocida
  if p_retiro is not null and (
       (p_retiro->>'fecha')::date < (now() at time zone coalesce(cfg->>'zonaHoraria','America/Argentina/Buenos_Aires'))::date
    or (p_retiro->>'fecha')::date > current_date + 120) then raise exception 'retiro'; end if;
  pref := coalesce(cfg->>'prefijoPedido', 'PD');
  insert into pedidos (negocio, codigo, items, subtotal, envio, total, tipo, cliente, nota, pago, pago_estado, sucursal, retiro, sin_precio)
  values (p_negocio, pref || '-' || (1000 + floor(random() * 9000))::int, items, sub, env, sub + env,
          case when p_tipo = 'delivery' then 'delivery' else 'retiro' end,
          jsonb_build_object('nombre', left(p_cliente->>'nombre', 80), 'telefono', left(p_cliente->>'telefono', 30), 'direccion', left(coalesce(p_cliente->>'direccion',''), 200)),
          left(coalesce(p_nota,''), 300),
          case when p_pago = 'mercadopago' then 'mercadopago' else 'whatsapp' end,
          case when p_pago = 'mercadopago' then 'pendiente' else 'a_coordinar' end,
          case when p_sucursal is null then null else jsonb_build_object('id', left(p_sucursal->>'id', 40), 'nombre', left(coalesce(p_sucursal->>'nombre',''), 80), 'direccion', left(coalesce(p_sucursal->>'direccion',''), 160)) end,
          case when p_retiro is null then null else jsonb_build_object('fecha', p_retiro->>'fecha', 'franja', jsonb_build_object(
            'id', left(coalesce(p_retiro->'franja'->>'id',''), 20), 'nombre', left(coalesce(p_retiro->'franja'->>'nombre',''), 30),
            'desde', left(coalesce(p_retiro->'franja'->>'desde',''), 5), 'hasta', left(coalesce(p_retiro->'franja'->>'hasta',''), 5))) end,
          sin_p)
  returning * into fila;
  -- cada gift card queda "pendiente" hasta que el pago se aprueba o el local la cobra (ver trigger)
  gpref := left(upper(regexp_replace(coalesce(gcfg->>'prefijo', cfg->>'prefijoPedido', 'GC'), '[^A-Za-z0-9]', '', 'g')), 4);
  for it in select * from jsonb_array_elements(items) where value ? 'giftcard' loop
    loop
      cod := gc_codigo(coalesce(nullif(gpref, ''), 'GC'));
      exit when not exists (select 1 from giftcards where negocio = p_negocio and codigo = cod);
    end loop;
    insert into giftcards (negocio, codigo, pedido, pedido_codigo, monto, saldo, para, de, mensaje, comprador)
    values (p_negocio, cod, fila.id, fila.codigo, (it->>'precio')::numeric, (it->>'precio')::numeric,
            nullif(it->'giftcard'->>'para', ''), nullif(it->'giftcard'->>'de', ''), nullif(it->'giftcard'->>'mensaje', ''), left(p_cliente->>'nombre', 80));
  end loop;
  return fila;
end $$;
grant execute on function crear_pedido(text, jsonb, text, jsonb, text, text, jsonb, jsonb) to anon, authenticated;

-- Pago aprobado (webhook de MP) o cobrado en el local (panel) → las gift cards del pedido pasan a vigentes.
create or replace function activar_giftcards() returns trigger
language plpgsql security definer set search_path = public as $$
declare dias int;
begin
  if new.pago_estado in ('aprobado','cobrado') and old.pago_estado is distinct from new.pago_estado then
    select coalesce((config->'giftcards'->>'validezDias')::int, 60) into dias from negocios where id = new.negocio;
    update giftcards set estado = 'vigente', activada = now(), vence = now() + make_interval(days => dias)
     where pedido = new.id and estado = 'pendiente';
  end if;
  return new;
end $$;
drop trigger if exists pedidos_activar_giftcards on pedidos;
create trigger pedidos_activar_giftcards after update of pago_estado on pedidos for each row execute function activar_giftcards();

-- Público: lo que ve el comprador al volver del pago (el uuid del pedido no se adivina).
create or replace function giftcards_de_pedido(p_id uuid)
returns table (codigo text, monto numeric, saldo numeric, para text, de text, mensaje text, vence timestamptz, estado text)
language sql stable security definer set search_path = public as $$
  select codigo, monto, saldo, para, de, mensaje, vence, estado from giftcards where pedido = p_id and estado <> 'pendiente' order by creado
$$;

-- Canje desde el panel (solo el dueño): entera o en partes.
create or replace function canjear_giftcard(p_negocio text, p_codigo text, p_monto numeric, p_nota text default null)
returns giftcards
language plpgsql security definer set search_path = public as $$
declare g giftcards;
begin
  if not es_admin(p_negocio) then raise exception 'permiso'; end if;
  select * into g from giftcards where negocio = p_negocio and codigo = upper(trim(p_codigo)) for update;
  if not found then raise exception 'gc_no_existe'; end if;
  if g.estado not in ('vigente','parcial') or (g.vence is not null and g.vence < now()) or g.saldo <= 0 then raise exception 'gc_no_canjeable'; end if;
  if p_monto is null or p_monto <= 0 or p_monto > g.saldo then raise exception 'gc_monto'; end if;
  update giftcards set saldo = saldo - p_monto, estado = case when saldo - p_monto <= 0 then 'usada' else 'parcial' end where id = g.id returning * into g;
  insert into giftcard_canjes (giftcard, monto, nota) values (g.id, p_monto, nullif(left(trim(coalesce(p_nota, '')), 120), ''));
  return g;
end $$;

-- Cobrada en el local (pedido por WhatsApp): marca el pedido cobrado y el trigger la activa.
create or replace function activar_giftcard(p_negocio text, p_codigo text)
returns giftcards
language plpgsql security definer set search_path = public as $$
declare g giftcards; dias int; gid uuid;
begin
  if not es_admin(p_negocio) then raise exception 'permiso'; end if;
  select * into g from giftcards where negocio = p_negocio and codigo = upper(trim(p_codigo));
  if not found then raise exception 'gc_no_existe'; end if;
  if g.estado <> 'pendiente' then return g; end if;
  gid := g.id;
  update pedidos set pago_estado = 'cobrado' where id = g.pedido and pago_estado not in ('aprobado','cobrado');
  -- por si el pedido ya figuraba cobrado (el trigger no se dispara sin cambio)
  select coalesce((config->'giftcards'->>'validezDias')::int, 60) into dias from negocios where id = p_negocio;
  update giftcards set estado = 'vigente', activada = now(), vence = now() + make_interval(days => dias) where id = gid and estado = 'pendiente';
  select * into g from giftcards where id = gid;
  return g;
end $$;

grant execute on function crear_reserva(text, date, text, int, text, text, text, text, text, jsonb),
  giftcards_de_pedido(uuid) to anon, authenticated;
grant execute on function canjear_giftcard(text, text, numeric, text), activar_giftcard(text, text) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table giftcards; exception when duplicate_object then null; end;
end $$;
