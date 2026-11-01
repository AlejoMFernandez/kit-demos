-- Tienda online (kit 1.16, nov 2026): secciones con productos armados para encargar
-- (torta entera, docena de cruasanes, caja de chipá, bolsa de panes) que no van en la carta del local ni en la del QR.
-- Correr UNA vez en el SQL Editor de cada cliente que ya estaba en producción antes del kit 1.16.
-- (Los clientes nuevos ya lo tienen en schema.sql.) Los encargos usan migracion-encargos.sql.

alter table categorias add column if not exists tienda boolean not null default false;
