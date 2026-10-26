-- Temporadas de la carta (oct 2026): cada sección puede ser de una temporada (invierno, primavera…)
-- y el dueño elige desde el panel cuál se ve. La activa se guarda en negocios.config → "temporadaActiva".
-- Correr UNA vez en el SQL Editor de cada cliente que ya estaba en producción y quiera usar temporadas
-- (los nuevos ya lo tienen en schema.sql).
alter table categorias add column if not exists temporada text;
