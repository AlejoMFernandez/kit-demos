-- Panel v2 (oct 2026): estados nuevos para reservas ("llegó", "no vino") y pagos cobrados en el local.
-- Correr UNA vez en el SQL Editor de cada cliente que ya estaba en producción antes del panel v2.
-- (Los clientes nuevos ya lo tienen en schema.sql.)
alter table reservas drop constraint if exists reservas_estado_check;
alter table reservas add constraint reservas_estado_check check (estado in ('pendiente','confirmada','llego','no_vino','cancelada'));
alter table pedidos drop constraint if exists pedidos_pago_estado_check;
alter table pedidos add constraint pedidos_pago_estado_check check (pago_estado in ('a_coordinar','pendiente','aprobado','rechazado','cobrado'));

-- las reservas "no vino" liberan el lugar
create or replace function ocupacion(p_negocio text, p_fecha date)
returns table (hora text, personas int)
language sql stable security definer set search_path = public as $$
  select r.hora, sum(r.personas)::int from reservas r
  where r.negocio = p_negocio and r.fecha = p_fecha and r.estado not in ('cancelada','no_vino')
  group by r.hora
$$;
-- crear_reserva: volver a correr su bloque de schema.sql (ya excluye 'no_vino').
