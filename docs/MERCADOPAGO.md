# Mercado Pago en las demos (sandbox compartido)

Todas las demos usan **una sola función**: `api/mp-preference.js` de este repo, desplegado en Vercel. Crea la preferencia con credenciales de **prueba** según el país del `cliente.json` (`AR` → pesos, `BR` → reales). Si la función no responde o falta el token, el carrito muestra una **simulación rotulada “DEMO”** (aprobar / rechazar), así la demo nunca se rompe frente al cliente.

## 1. Cuentas de prueba (una vez)

1. Entrá a Mercado Pago Developers → **Tus integraciones** → creá una aplicación (Checkout Pro).
2. En la aplicación → **Cuentas de prueba** → **+ Crear cuenta de prueba**: una **Vendedor** y una **Comprador** de **Argentina**. Repetí para **Brasil** si vas a mostrar demos en pt-BR (vendedor y comprador tienen que ser del mismo país).
3. Iniciá sesión (ventana privada) con el **usuario de prueba vendedor** de cada país, creá ahí una aplicación y copiá su **Access Token** de credenciales.
   - Es el token de un usuario **de prueba**: no mueve plata real. Nunca pongas acá el token de tu cuenta real ni el de un cliente.

> Si Mercado Pago cambia el flujo, la referencia es su doc de “Cuentas de prueba” y “Tarjetas de prueba” de Checkout Pro.

## 2. Desplegar kit-demos en Vercel

1. Importar el repo `AlejoMFernandez/kit-demos` en Vercel (Framework: *Other*, sin build).
2. Settings → Environment Variables:

| Variable | Valor |
|---|---|
| `MP_TEST_TOKEN_AR` | Access Token del vendedor de prueba AR |
| `MP_TEST_TOKEN_BR` | Access Token del vendedor de prueba BR |
| `ALLOWED_ORIGINS` | `https://*.vercel.app,https://alejomfernandez.com.ar,http://localhost` |

3. Redeploy. La URL queda tipo `https://kit-demos.vercel.app/api/mp-preference` (o la que asigne Vercel): esa va en `pagos.mercadopago.endpoint` de cada `cliente.json` de demo, y en `plantillas/cliente.json`.

> Si una demo está en un dominio propio (no `*.vercel.app`), agregalo a `ALLOWED_ORIGINS`.

## 3. Probar un pago

1. En la demo, carrito → “Pagar con Mercado Pago” → “Ir a pagar”.
2. En el checkout, entrá con el **usuario comprador de prueba** del mismo país y pagá con una **tarjeta de prueba** (lista oficial en “Tarjetas de prueba”; el nombre del titular define el resultado, ej. `APRO` aprobado, `OTHE` rechazado).
3. Al volver, la demo muestra “¡Pago aprobado!” y el pedido aparece en `/admin` como **Pagado con Mercado Pago**.

En demo el estado lo marca el navegador al volver (no hay webhook porque los datos viven en localStorage). En producción lo marca el webhook: ver `PRODUCCION.md`.

## Modos de `pagos.mercadopago.modo`

- `sandbox` — función compartida + credenciales de prueba (demos).
- `simulado` — sin llamar a nada: muestra directamente la simulación (útil sin conexión o para grabar un video).
- `produccion` — `/api/mp-preference` del propio cliente con su token real.
