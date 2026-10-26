-- Encargos con fecha, precio a confirmar y fechas especiales (kit 1.3, oct 2026).
-- Correr UNA vez en el SQL Editor de cada cliente que ya estaba en producción antes del kit 1.3.
-- (Los clientes nuevos ya lo tienen en schema.sql.)

-- fechas especiales = categorías con ventana
alter table categorias add column if not exists especial boolean not null default false;
alter table categorias add column if not exists desde date;
alter table categorias add column if not exists hasta date;
alter table categorias add column if not exists aviso_dias int not null default 30;
alter table categorias add column if not exists bajada text;
alter table categorias add column if not exists anticipacion_horas int;

-- el pedido guarda cuándo se retira y si tiene precios a confirmar
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
begin
  select config into cfg from negocios where id = p_negocio;
  if cfg is null then raise exception 'negocio_invalido'; end if;
  a_confirmar := coalesce(cfg->'pedidos'->>'sinPrecio', '') = 'a_confirmar';
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 60 then raise exception 'items'; end if;
  for linea in select * from jsonb_array_elements(p_items) loop
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
  return fila;
end $$;
grant execute on function crear_pedido(text, jsonb, text, jsonb, text, text, jsonb, jsonb) to anon, authenticated;
