-- Sucursales (oct 2026): el pedido guarda la sede elegida y el panel filtra por sede.
-- Correr UNA vez en el SQL Editor de cada cliente que ya estaba en producción (los nuevos ya lo tienen en schema.sql).
-- Además, cargar las sedes en negocios.config → "sucursales" (mismo formato que cliente.json).
alter table pedidos add column if not exists sucursal jsonb;
drop function if exists crear_pedido(text, jsonb, text, jsonb, text, text);
-- Después: volver a correr el bloque "create or replace function crear_pedido" y su "grant execute" de schema.sql.
