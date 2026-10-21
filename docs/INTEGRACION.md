# Integrar el kit en una demo

Se hace en el **paso 4** de la skill, con el moodboard ya aprobado (ahí se definió qué módulos van y cómo se ven).

## 1. `cliente.json`

Se arma en el paso 1 con la carta transcripta. Campos clave (esquema completo en `docs/cliente.schema.json`):

- `id` (slug), `nombre`, `pais` (`AR`/`BR` → moneda, formato, zona horaria, Mercado Pago), `idioma` (`es`/`pt-BR`), `whatsapp`.
- `marca`: los **mismos tokens del moodboard** (colores con nombre propio → `fondo`, `superficie`, `texto`, `primario`, `acento`, `borde`), fuentes y `estilo` (`forma`: recta/redondeada/pildora, `sombra`: suave/dura/ninguna, `borde`, `mayusculas`). Si la web ya carga las fuentes, dejar `googleFonts` vacío.
- `modulos`: `carta`, `carrito`, `reservas`, `admin`.
- `horarios` por día (`lun`…`dom`), `reservas` (intervalo, duración de mesa, capacidad, máximo de personas…), `pedidos` (`salidas`, `tipos`, `envio`, `minimo`).
- `carta`: categorías y productos. **Precio que no está confirmado → `null`**: se muestra “Consultar” y no se puede pedir (nunca inventar precios).
- `pagos.mercadopago.endpoint`: en demos, la función compartida (`https://kit-demos-amf.vercel.app/api/mp-preference`).

## 2. Copiar el kit

```bash
node scripts/instalar.mjs "<ruta>\web"
```

Vuelve a correrlo cuando el kit cambie: reemplaza `web/kit/` y no toca `cliente.json` ni `admin/index.html`.

## 3. Enganchar en el HTML

```html
<link rel="stylesheet" href="kit/kit.css?v=1">        <!-- ANTES del css de la demo, así la demo puede pisarlo -->
<link rel="stylesheet" href="css/style.css?v=8">
```

Lugares de montaje:

| Atributo | Qué hace |
|---|---|
| `data-kit="carta"` | Carta con pestañas, se re-renderiza cuando el dueño edita en /admin |
| `data-kit="reservas"` | Formulario de reserva en la página |
| `data-kit-open="reservas"` | Abre la reserva en popup |
| `data-kit-open="carrito"` | Abre el carrito |
| `data-kit-add="<id>"` | Suma un producto (sirve en WOWs: “lo quiero” del golden ticket, sticker arrastrado, etc.) |
| `data-kit-qty="<id>"` | Muestra “Agregar” o el selector − n + |

```html
<script type="module">
  import { initKit } from './kit/kit.js?v=1';
  const kit = await initKit({
    config: 'cliente.json',
    carta: {
      numerar: true,
      itemClass: 'item',                       // clase propia de la demo además de kit-item
      template: (p, ctx) => `...`,             // HTML propio de cada ítem (opcional)
      etiquetas: { casa: { label: 'De la casa', icono: '<svg…>' } },
    },
    carrito: { label: 'Mi pedido', icono: '<svg…>' },
    badge: true,                               // píldora “Probá el panel del dueño” (solo demo)
  });
</script>
```

Con `template` la carta conserva el diseño propio de la demo. Dentro del template:
- `ctx.money(p.precio)` formatea con la moneda del país (devuelve `null` si no hay precio),
- `ctx.asset(p.foto)` resuelve la ruta de la foto,
- `ctx.etiquetaHTML('picante')` dibuja el ícono,
- poné `<div data-kit-qty="${p.id}"></div>` donde va el botón de agregar.

Si la demo tenía JS que leía la carta del HTML (foto flotante, sorteos…), movelo al evento:

```js
document.addEventListener('kit:carta', (e) => { /* e.detail.el, e.detail.productos */ });
```

## 4. WhatsApp “armar pedido” (el WOW de siempre)

El carrito ya genera el mensaje y abre WhatsApp. Si el WOW de la demo tiene su propia animación (caja que se llena, saquinho), que llame a `kit.carrito.agregar(id)` o use `data-kit-add`, y su botón final haga `kit.carrito.abrir()`: así el pedido **también entra al panel**.

## 5. Panel `/admin`

`admin/index.html` ya está. El panel usa los mismos tokens; si querés un logo distinto sobre el color primario, usá `marca.logoPanel`.

## 6. Checklist antes de entregar

- [ ] `?v=N` actualizado en los `<link>`/`<script>` del kit y de la demo.
- [ ] `python tests/e2e.py http://localhost:5173/ capturas` desde `web/` sin fallas (1440, 1366×680, 390×844).
- [ ] Popups: X, Escape y click afuera. Nada aparece de golpe.
- [ ] Contraste de pestañas, chips y botones sobre los fondos con patrón de la demo.
- [ ] Botón flotante del carrito y píldora del panel no tapan CTAs ni el chat/mascota.
- [ ] Pedido por WhatsApp llega con el texto armado (probar en el celu).
- [ ] Mercado Pago sandbox: pago aprobado con tarjeta de prueba y vuelta a la web.
- [ ] Crédito en el footer.
