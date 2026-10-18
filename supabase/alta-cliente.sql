-- Alta de un cliente nuevo en el proyecto de Supabase (correr en SQL Editor).
-- 1) Antes: Authentication → Users → "Add user" con el email del dueño y una contraseña.
-- 2) Reemplazar los valores marcados con <> y correr.

insert into negocios (id, nombre, config) values (
  '<id-del-cliente.json>',            -- ej. 'meat-and-grill'
  '<Nombre visible>',
  '{
    "prefijoPedido": "MG",
    "reservas": { "capacidad": 30, "duracionMin": 90, "maxPersonas": 10 },
    "pedidos":  { "envio": 0, "minimo": 0 }
  }'::jsonb
) on conflict (id) do update set nombre = excluded.nombre, config = excluded.config;

insert into admins (user_id, negocio)
select id, '<id-del-cliente.json>' from auth.users where email = '<email-del-dueño>'
on conflict do nothing;

-- La carta se carga después desde /admin → Carta → "Cargar carta inicial" (copia la del cliente.json).
