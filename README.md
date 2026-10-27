# kit-demos

Funcionalidades reutilizables para las webs demo de negocios locales: **carta con ABM, reservas (por horario o por servicio y tanda), carrito con salida a WhatsApp o Mercado Pago, gift cards con canje en el panel, carta pública con QR y tarjetas para imprimir, y panel `/admin`** con la identidad de cada cliente.

HTML + CSS + JS puros (módulos ES), sin frameworks y sin build. Se enchufa a la carpeta `web/` de cualquier demo hecha con la skill *demo-web-negocio-local*.

- **Demo**: todo vive en `localStorage` del visitante (cada uno tiene su sandbox, sin backend ni costo). Botón “Reiniciar demo” en el panel.
- **Producción**: Supabase (base de datos, login del dueño, fotos) + Mercado Pago real del cliente. Se cambia con `"modo": "produccion"` en `cliente.json`. Ver [docs/PRODUCCION.md](docs/PRODUCCION.md).

Este repo es también la **página de prueba** (`index.html` + `cliente.json`, un negocio ficticio) y aloja la **función de Mercado Pago sandbox compartida** por todas las demos (`api/mp-preference.js`).

## Estructura

```
index.html  cliente.json  cliente-br.json  img/   ← página de prueba (igual a un web/ de demo)
admin/index.html                                  ← panel de la página de prueba
carta/index.html                                  ← carta pública (la del QR) de la página de prueba
kit/
  kit.js  kit.css                                 ← entrada del sitio público
  menu.css                                        ← carta pública /carta
  core/   theme · i18n (es / pt-BR) · pais · turnos · pedidos · sucursales · ui (popups) · util · qr · tarjeta-qr
  store/  index (elige adaptador) · local (demo) · supabase (producción)
  modules/ carta · carrito · reservas · giftcards · menu (carta del QR)
  admin/  admin.js · admin.css                    ← panel
api/mp-preference.js                              ← Mercado Pago SANDBOX compartido (Vercel)
produccion/api/  mp-preference.js · mp-webhook.js ← pagos reales, se copian al web/ del cliente
supabase/  schema.sql · migracion-servicios-giftcards.sql · alta-cliente.sql
plantillas/ admin/index.html · carta/index.html · cliente.json
scripts/instalar.mjs                              ← copia el kit a una demo
tests/  kit.test.mjs (Node) · e2e.py (Playwright)
docs/   INTEGRACION.md · PRODUCCION.md · MERCADOPAGO.md · cliente.schema.json
```

## Uso rápido en una demo

```bash
node scripts/instalar.mjs "C:\xampp\htdocs\1 - DEMOS\<Negocio>\web"
```

Copia `kit/`, crea `admin/index.html`, `carta/index.html` (la carta del QR) y un `cliente.json` de plantilla si no existen. Después, en el `index.html` de la demo:

```html
<link rel="stylesheet" href="kit/kit.css?v=1">
...
<div data-kit="carta"></div>                      <!-- carta con pestañas -->
<button data-kit-open="reservas">Reservar</button> <!-- popup de reserva -->
<div data-kit="reservas"></div>                   <!-- o formulario en la página -->
<button data-kit-add="meatmac">Lo quiero</button>  <!-- suma al carrito desde cualquier lado -->
<script type="module">
  import { initKit } from './kit/kit.js?v=1';
  const kit = await initKit({ config: 'cliente.json' });
</script>
```

Paso a paso, plantillas propias de ítems y eventos: [docs/INTEGRACION.md](docs/INTEGRACION.md).

### Carta del QR

`/carta/` es la carta pública a la que lleva el QR de las mesas y se actualiza sola con lo que se edite en el panel. En `/admin` → **QR** se arma la tarjeta con la marca del cliente (mesa, cartel que se dobla o sticker) y se descarga en PDF A4 con marcas de corte, JPG a 300 dpi o solo el QR en SVG. Ver [docs/INTEGRACION.md](docs/INTEGRACION.md#carta-del-qr-y-tarjetas-para-imprimir-kit-17).

## Capa de datos

Todo el kit habla con una única interfaz (async), con dos adaptadores intercambiables:

| Área | Métodos |
|---|---|
| Carta | `getCategorias()` `saveCategoria(c)` `deleteCategoria(id)` `getProductos()` `saveProducto(p)` `deleteProducto(id)` `uploadFoto(file)` |
| Reservas | `getOcupacion(fecha)` `createReserva(r)` `getReservas()` `updateReserva(id, patch)` |
| Pedidos | `createPedido(o)` `getPedidos()` `updatePedido(id, patch)` `getPedidoPublico(id)` |
| Panel | `getSession()` `login(email, pass)` `logout()` |
| Otros | `onChange(fn)` · `reset()` (demo) · `importarCarta()` (producción) · `modo` |

Los precios de un pedido **siempre** se recalculan con la carta guardada (en demo en el navegador; en producción en la función `crear_pedido` de Supabase). La capacidad de reservas se controla igual (en producción con bloqueo para que dos reservas simultáneas no sobrevendan).

## Probar

```bash
npm test                                   # unitarias: turnos, pedidos, WhatsApp, Mercado Pago, firma del webhook
python -m http.server 5173                 # servir la raíz (o el web/ de una demo)
python tests/e2e.py http://localhost:5173/ capturas
```

`e2e.py` recorre carta → carrito → pedido por WhatsApp → pago con Mercado Pago → reserva → panel (estados + ABM de carta) → la web refleja los cambios, en 1440×900, 1366×680 y 390×844, revisando que no haya scroll horizontal y que los popups cierren con X, Escape y click afuera.

## Eventos

`kit:listo` (ctx) · `kit:carta` (render de carta) · `kit:carrito` (cambio) · `kit:pedido` (pedido creado) · `kit:reserva` (reserva creada) · `kit:reserva-lista` (cancelable: confirmación propia) · `kit:giftcards` (cancelable: códigos al volver del pago). Se escuchan en `document`.

---

Desarrollado por [Alejo Martín Fernández](https://alejomfernandez.com.ar).
