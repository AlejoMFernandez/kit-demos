# Pasar una demo a producción

Cuando el cliente contrata, la misma web pasa de “cada visitante tiene su sandbox” a datos reales compartidos: pedidos y reservas que le llegan al dueño, carta que edita él, pagos que cobra en su cuenta.

Resumen: **Supabase** (datos + login + fotos) · **`modo: "produccion"`** en `cliente.json` · **funciones de pago reales** en el `web/api/` del cliente · **webhook** de Mercado Pago.

---

## 0. Antes de empezar (pedirle al cliente)

- Email del dueño (para entrar al panel) y quién más necesita acceso.
- Su **cuenta de Mercado Pago** del país del negocio (AR o BR) con la que va a cobrar. Él crea la aplicación en *Tus integraciones* y te pasa el **Access Token de producción** y la **clave secreta de webhooks** por un canal privado (nunca por un grupo). Alternativa: que te agregue como colaborador.
- Confirmar carta, precios, horarios, capacidad de reservas, costo de envío y pedido mínimo.
- Dominio (si va a tener uno propio).

## 1. Supabase (una sola vez para todos tus clientes)

Un proyecto de Supabase atiende a varios clientes: todo se separa por `negocio` y cada dueño solo ve lo suyo (Row Level Security).

1. Crear el proyecto en supabase.com (región São Paulo, la más cercana a AR/BR).
2. SQL Editor → pegar y correr **`supabase/schema.sql`** (se puede volver a correr sin romper nada).
3. Project Settings → API: anotar **Project URL**, **anon key** (va en el front) y **service_role key** (solo en variables de entorno de Vercel, nunca en el código del sitio).
4. Authentication → Providers → Email: dejar activado; desactivar “Allow new users to sign up” (los usuarios los creás vos).

> El plan gratis pausa proyectos sin uso y tiene límites de almacenamiento; para clientes que pagan abono, conviene el plan pago (verificar precio actual en supabase.com/pricing) y repartir su costo entre los abonos.

## 2. Alta del cliente en Supabase

1. Authentication → Users → **Add user**: email del dueño + contraseña provisoria (que la cambie después).
2. SQL Editor → `supabase/alta-cliente.sql` con el `id` de su `cliente.json`, prefijo de pedidos, capacidad/duración/máximo de reservas, envío y mínimo. **Tienen que coincidir con `cliente.json`**: el servidor valida con estos valores.

## 3. `cliente.json` en modo producción

```json
"modo": "produccion",
"supabase": { "url": "https://xxxx.supabase.co", "anonKey": "eyJ…" },
"pagos": { "mercadopago": { "endpoint": "/api/mp-preference", "modo": "produccion" } }
```

La anon key es pública por diseño: lo que protege los datos son las políticas de `schema.sql`.

## 4. Cargar la carta

Entrar a `/admin` con el usuario del dueño → **Carta** → **Cargar carta inicial** (copia la de `cliente.json`). Las fotos que suba el dueño van al bucket `fotos/<id-del-cliente>/`. Las fotos que ya estaban en `img/` siguen sirviéndose desde la web.

## 5. Pagos reales

```bash
node scripts/instalar.mjs "<ruta>\web" --produccion
```

Copia `produccion/api/mp-preference.js` y `mp-webhook.js` a `web/api/` (y un `package.json` mínimo). En el proyecto de Vercel **del cliente** → Environment Variables:

| Variable | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | Access Token de producción del cliente (`APP_USR-…`) |
| `MP_WEBHOOK_SECRET` | Clave secreta de webhooks del cliente |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (solo acá) |
| `NEGOCIO_ID` | `id` de su `cliente.json` |
| `SITIO_URL` | `https://www.sudominio.com` (sin barra final) |
| `PAIS` | `AR` o `BR` |

Cómo funciona:
1. El navegador crea el pedido con `crear_pedido` (precios desde la tabla `productos`).
2. `/api/mp-preference` lee **ese pedido desde Supabase** y arma la preferencia con el token del cliente (el navegador no puede cambiar montos).
3. Mercado Pago avisa a `/api/mp-webhook`; la función vuelve a consultar el pago en la API de MP, valida la firma `x-signature` y marca el pedido `aprobado` (y `confirmado`) o `rechazado`.

En *Tus integraciones* del cliente → Webhooks: URL `https://<dominio>/api/mp-webhook`, evento **Pagos**. (La preferencia también manda `notification_url`, así que funciona aunque no se configure ahí, pero la clave secreta sale de esa pantalla.)

## 6. Prueba final (con el cliente presente o grabando)

- [ ] Login en `/admin` con el usuario del dueño; desde otro navegador sin sesión, `/admin` pide contraseña.
- [ ] Editar un precio y una foto en el panel → se ven en la web en otro celular.
- [ ] Reserva desde el celu con datos móviles → aparece en el panel al instante (tiempo real) → confirmar → botón “Escribirle” abre WhatsApp con el mensaje.
- [ ] Pedido por WhatsApp → llega el mensaje y el pedido aparece en el panel.
- [ ] Pago real de bajo monto con Mercado Pago → vuelve a la web → el panel lo muestra pagado → reembolsarlo desde la cuenta del cliente.
- [ ] Repetir dos reservas al mismo horario hasta llenar la capacidad: la siguiente debe decir “se llenó”.

## 7. Qué cubre el abono mensual

Hosting (Vercel), base de datos y fotos (Supabase), dominio si lo gestionás vos, mantenimiento (cambios chicos de textos/estructura, actualizaciones del kit, monitoreo de pagos y webhooks) y soporte por WhatsApp. La carta, precios, fotos, reservas y pedidos los maneja el dueño solo desde `/admin`.

## Volver a modo demo

`"modo": "demo"` en `cliente.json`, o agregar `?demo` a la URL para probar algo sin tocar los datos reales.
