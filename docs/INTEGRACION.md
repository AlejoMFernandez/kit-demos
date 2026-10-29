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
- [ ] Fotos optimizadas (webp, ancho según dónde se muestran, `srcset` en las grandes, miniaturas para la carta) y `img/lqip.json` generado: ninguna foto queda en gris mientras carga.


## Cadenas: varias sedes

Agregá `"sucursales"` a `cliente.json` (ver `docs/cliente.schema.json`):

```json
"sucursales": [
  { "id": "beiro", "nombre": "Devoto", "direccion": "Av. Beiró 3425", "whatsapp": "", "horarios": { "mar": [["12:00","02:00"]] } }
]
```

- Con 2 o más sedes, el checkout pide **en qué sede se retira** (o desde cuál se envía). Es obligatorio y se recuerda en el navegador.
- El pedido guarda `sucursal: { id, nombre, direccion }`, el mensaje de WhatsApp suma la línea “Sede” y sale al `whatsapp` de esa sede (si no tiene, al general).
- El panel muestra la sede en cada pedido y un selector “Todas las sedes / …” que cada dispositivo recuerda (la tablet de cada local queda en la suya).
- Desde la web: `data-kit-sucursal="beiro"` en cualquier botón deja esa sede elegida (sumale `data-kit-open="carrito"` para abrir el carrito), o `kit.carrito.setSucursal('beiro')`. Estado abierto/cerrado de una sede: `kit.abierto(sede.horarios)`.
- Aclaraciones por plato desde la web: `kit.carrito.agregar('chocludo', 1, { nota: 'salchicha alemana' })` crea una línea aparte con esa nota (va al panel y al WhatsApp).
- Producción: correr `supabase/migracion-sucursales.sql` y cargar las sedes en la config del negocio.


## Carta por temporadas

Para locales que cambian la carta con la estación (invierno, primavera…). En `cliente.json`:

```json
"carta": {
  "temporadas": [{ "id": "primavera", "nombre": "Primavera" }, { "id": "invierno", "nombre": "Invierno" }],
  "temporadaActiva": "primavera",
  "categorias": [
    { "id": "tortillas", "nombre": "La tortilla", "temporada": "primavera" },
    { "id": "tortillas-inv", "nombre": "Tortillas cremosas", "temporada": "invierno" },
    { "id": "vermut", "nombre": "Vermut" }
  ]
}
```

- Las secciones sin `temporada` se ven siempre (bebidas, postres fijos).
- En `/admin` → Carta aparece “Carta que se ve en la web” con un botón por temporada: un clic y la web cambia (las otras quedan guardadas, editables, marcadas como “guardada”). Al crear o renombrar una sección se elige en qué temporada se muestra.
- En la web, `kit:carta` trae `detail.temporada` (y `ctx.temporada`) para titular “Carta de primavera”.
- Producción: correr `supabase/migracion-temporadas.sql` (la activa se guarda en `negocios.config.temporadaActiva`).

## Reserva con el turno ya elegido

Para dibujar la disponibilidad con la identidad de la demo (un pizarrón de turnos, una agenda…):

```js
const dias = kit.reservas.dias();                       // [{ fecha, abierto, offset, dow }]
const turnos = await kit.reservas.turnos(fecha, 2);     // [{ hora, label, libres, capacidad, disponible, pasado }]
kit.reservas.abrir({ fecha, hora: '19:00', personas: 2 });  // popup del kit con ese turno marcado
```

O sin JS: `<button data-kit-open="reservas" data-kit-fecha="2026-10-27" data-kit-hora="19:00">`.

## Descuento en efectivo al retirar

Para locales que cobran distinto en efectivo (ej. Bien être: 20% de martes a viernes, 15% fines de semana y feriados):

```json
"pedidos": { "salidas": ["efectivo", "mercadopago"], "tipos": ["retiro"] },
"pagos": { "efectivo": { "porDia": { "mar": 20, "mie": 20, "jue": 20, "vie": 20, "sab": 15, "dom": 15 }, "feriado": 15, "feriados": ["2026-11-23"] } }
```

- La salida `efectivo` funciona como `whatsapp` (guarda el pedido y abre WhatsApp), pero el total ya trae el descuento del día y el mensaje dice "Pago: efectivo al retirar".
- El panel muestra "Efectivo −20% · cobrar $X".
- En la web: `kit.efectivoHoy()` → `{ pct, dia, feriado }` para mostrar "Hoy 20% off en efectivo".
- **Producción**: la función `crear_pedido` de Supabase todavía no aplica el descuento; antes de usarlo con un cliente real hay que sumarlo ahí (el servidor nunca confía en el total del navegador).

## Panaderías y pastelerías: encargos con fecha, precio a confirmar y fechas especiales (kit 1.3)

```json
"pedidos": {
  "salidas": ["whatsapp", "mercadopago"], "tipos": ["retiro"],
  "sinPrecio": "a_confirmar",
  "encargo": { "anticipacionHoras": 12, "diasAdelante": 14, "franjas": [
    { "id": "manana", "nombre": "Mañana", "desde": "07:00", "hasta": "12:00" },
    { "id": "tarde", "nombre": "Tarde", "desde": "16:00", "hasta": "20:30" } ] }
},
"carta": { "categorias": [
  { "id": "tortas", "nombre": "Tortas", "anticipacionHoras": 48 },
  { "id": "navidad", "nombre": "Navidad", "especial": true, "desde": "2026-12-01", "hasta": "2026-12-24", "avisoDias": 45, "bajada": "Pan dulce de la casa" }
] }
```

- **Precio a confirmar** (`sinPrecio: "a_confirmar"`): los productos con `precio: null` se pueden sumar. Muestran “A confirmar”, el total dice “a confirmar” y el WhatsApp lo aclara en cada línea. Mercado Pago queda deshabilitado hasta que todos los productos del pedido tengan precio (el dueño los carga en /admin y se habilita solo). Sin esa clave, el comportamiento de siempre: “Consultar” y no se puede pedir.
- **Encargo con fecha** (`encargo`): el checkout pide día y franja. Solo ofrece días en que el local abre (`horarios`), franjas que se superponen con el horario y que cumplen la anticipación (la mayor entre `encargo.anticipacionHoras` y la de cada sección del pedido). El pedido guarda `retiro: { fecha, franja }`, va en el WhatsApp (“Retira: lunes 26/10 · Mañana (7 a 12 h)”) y el panel ordena los pedidos por día de retiro y marca los de hoy.
- **Fechas especiales**: categorías con `especial: true`. En la web se ven desde `desde − avisoDias` hasta `hasta` (pestaña punteada en la carta) y sus productos solo se retiran dentro de la ventana. El panel suma la pestaña **Fechas especiales** para crear la fecha, poner la ventana y cargar sus productos. Para mostrar una fecha fuera de temporada en un pitch: `initKit({ fechaEspecial: 'pascuas' })` (las demos lo leen de `?sala=pascuas`).
- Desde la web: `kit.especiales(categorias)` devuelve las fechas visibles hoy y `kit.estadoEspecial(cat)` su estado (`aviso`, `en_curso`…); el evento `kit:carta` trae `detail.especiales`.
- Producción: correr `supabase/migracion-encargos.sql`.

## Tamaños, adicionales y seña (1.5)

Para tortas por encargo con precio por tamaño, extras y una seña online.

```json
"carta": {
  "categorias": [{ "id": "tortas", "nombre": "Tortas", "anticipacionHoras": 96, "sena": 0.5 }],
  "productos": [{ "id": "marquise-pistacho", "categoria": "tortas", "nombre": "Marquise pistacho", "precio": null,
    "variantes": [{ "id": "20", "nombre": "20 cm", "precio": 95000 }, { "id": "24", "nombre": "24 cm", "precio": 113500 }],
    "adicionales": [{ "id": "macarons", "nombre": "Macarons", "precios": { "20": 12000, "24": 21000 } }] }]
}
```

- **Tamaños**: el precio sale de la variante elegida (`kit.carrito.agregar(id, 1, { variante: '24', extras: ['macarons'] })`). Sin variante elegida, la primera. La carta muestra “desde $X”. Cada tamaño/adicional es una línea distinta del carrito, y el panel la muestra con su detalle (“24 cm + Macarons”).
- **Adicionales**: `precio` fijo o `precios` por id de variante. Se recalculan siempre con la carta guardada.
- **Seña** (`"sena": 0.5` en la categoría): el checkout muestra Total / Resto al retirar / **Hoy pagás**, el botón dice “Pagar la seña · $X” y Mercado Pago cobra solo la seña de esos productos (más el total de los demás). El pedido guarda `aPagar` y `saldo`; el panel muestra “Seña pagada” y “Resto $X al retirar”, y la entrega se marca como “cobré el resto”.
- `kit.carrito.setRetiro({ fecha, franja })` deja elegido el día y la franja desde un selector propio de la demo (los helpers de `core/encargos.js`, `opcionesRetiro`, sirven para pintarlo con las mismas reglas que el checkout).
- Panel → Carta: los productos con tamaños muestran y editan el precio de cada tamaño, y “Subir precios %” también los actualiza.
- Helpers puros en `kit/core/variantes.js`: `precioLinea`, `precioDesde`, `claveLinea`, `pctSena`, `tieneVariantes`.
- **Producción**: por ahora solo modo demo. Antes de usarlo con un cliente real hay que extender `crear_pedido` en Supabase para recalcular variantes, adicionales y seña (y cobrar `aPagar` en `mp-preference.js` de producción).

## Reservas por servicio y tanda (1.4)

Para locales que trabajan con turnos fijos (bodegones, parrillas con dos vueltas de cena) en vez de “cada 30 minutos dentro del horario”:

```json
"reservas": {
  "capacidad": 150, "maxPersonas": 12, "anticipacionMin": 60, "diasAdelante": 30,
  "servicios": [
    { "id": "almuerzo", "nombre": "Almuerzo", "dias": ["mar","mie","jue","vie","sab","dom"],
      "tandas": [ { "nombre": "Primer tiempo", "turnos": ["12:00","12:15","12:30"] } ] },
    { "id": "cena", "nombre": "Cena",
      "tandas": [ { "nombre": "Primer tiempo", "turnos": ["20:00","20:15","20:30"] },
                  { "nombre": "Segundo tiempo", "turnos": ["22:15","22:30","22:45"], "capacidad": 120 } ] }
  ],
  "extras": [ { "id": "socio", "label": "Soy socio/a" }, { "id": "cumple", "label": "Venimos a festejar un cumple" } ]
}
```

- El formulario suma un selector **Servicio** (siempre dibujado: los que no van ese día quedan apagados, nada salta de lugar) y los horarios agrupados por tanda.
- Todos los turnos de una tanda **comparten el cupo** (`tanda.capacidad ?? servicio.capacidad ?? capacidad`).
- La reserva guarda `servicio` y `extras`; el panel agrupa la lista del día por “Cena · Primer tiempo” y muestra una barra de ocupación por tanda.
- Confirmación propia: `document.addEventListener('kit:reserva-lista', e => { e.preventDefault(); /* e.detail.resumen, e.detail.el */ })`.

## Eventos con fecha y cupo (1.14)

Para catas, shows o talleres en locales que no reservan mesa: un servicio con `fechas` en vez de `dias`.

```json
"modulos": { "reservas": true },
"reservas": { "maxPersonas": 6, "anticipacionMin": 120, "diasAdelante": 60, "servicios": [
  { "id": "cata", "nombre": "Cata de vinos", "fechas": ["2026-11-12"],
    "tandas": [ { "nombre": "Cata de vinos", "turnos": ["20:30"], "capacidad": 20 } ] }
] }
```

- El servicio solo se ofrece esas fechas, aunque el local cierre antes de esa hora (la cata es a las 20:30 y el café cierra a las 20).
- `kit.reservas.turnos(fecha, personas)` devuelve `libres` y `capacidad`: con eso la demo dibuja el cupo (copas, butacas…) y “Quedan N”.
- El panel muestra las reservas del evento agrupadas por servicio, con la barra de ocupación.
- Cambiar la fecha o el cupo por ahora es en `cliente.json` (en producción, en la config del negocio).

## Gift cards (1.4)

```json
"giftcards": { "nombre": "Gift card", "prefijo": "LCD", "validezDias": 60, "montos": [50000, 75000, 100000] }
```

- Necesita `"carrito": true`. Formulario listo con `<div data-kit="giftcard"></div>`, o diseño propio llamando a `kit.giftcards.agregar({ monto, para, de, mensaje }, { origen: boton })`.
- El monto se valida contra la config (en demo y en la función `crear_pedido` de producción): un monto que no está en `montos` (o fuera de `min`/`max`) no entra.
- Al crearse el pedido, cada gift card queda **pendiente**. Pasa a **vigente** con vencimiento cuando el pago se aprueba (Mercado Pago) o cuando el local la marca cobrada en el panel.
- Al volver del pago aprobado se dispara `kit:giftcards` con `{ pedido, giftcards: [{ codigo, monto, para, de, mensaje, vence }] }`. Con `preventDefault()` la demo dibuja sus propias tarjetas; si no, el kit muestra los códigos.
- Panel → pestaña **Gift cards**: buscar el código, ver saldo y vencimiento, canjear entera o en partes, activar las cobradas en el local y lista de emitidas con estado (pendiente, vigente, usada en parte, usada, vencida).
- Producción: correr `supabase/migracion-servicios-giftcards.sql` (tablas `giftcards` y `giftcard_canjes`, trigger que las activa al cobrarse, RPC de canje solo para el dueño).

### Varias cartas en la misma página (1.5)

`data-kit-categorias="especiales,cookies"` en el contenedor muestra solo esas secciones, y `data-kit-pedir="false"` lo deja como vidriera (sin botón Agregar). Para opciones distintas por contenedor: `initKit({ cartas: { 'carta-local': { template, pedir: false } } })` (la clave es el `id` del contenedor). Ej.: la carta del mostrador como vidriera y los encargos con su propio selector.

## Fotos que cargan lindo (kit 1.6)

`initKit` arranca solo un cargador de imágenes (`core/imagenes.js`): mientras baja cada foto se ve un brillo animado sobre una vista previa borrosa (o el color de la marca), y al llegar aparece con un desenfoque que se aclara. Toma también las fotos que se agregan después (carta, galerías). No hace falta tocar el HTML: solo darle `width`/`height` a cada `<img>` para que no salte el diseño.

```js
initKit({ imagenes: { lqip: 'img/lqip.json' } }); // imagenes: false lo apaga; [data-kit-ph="no"] excluye un bloque
```

El mapa de vistas previas se genera con `python3 scripts/lqip.py web` (≈200 bytes por foto). Volver a correrlo cada vez que se agregan fotos.

Optimizar siempre: webp q≈72, ancho máximo = 2× el tamaño en pantalla, `srcset`/`sizes` en hero y galerías, miniaturas (≈240 px) para las fotos chicas de la carta, `fetchpriority="high"` solo en la foto del hero y `loading="lazy"` en el resto.

## Carta del QR y tarjetas para imprimir (kit 1.7)

Cada demo trae una **carta pública aparte** en `/carta/` (la copia `scripts/instalar.mjs` desde `plantillas/carta/index.html`). Es la página a la que lleva el QR de las mesas: liviana, una sección por vez con pestañas, buscador en toda la carta, estado abierto/cerrado, WhatsApp e Instagram al pie. Lee la misma carta que edita el panel, así que **se actualiza sola**: el QR se imprime una vez y no hay que pisar ningún PDF en Drive.

En el panel aparece la sección **QR** (`modulos.cartaQR: false` la apaga):

- Link fijo de la carta con Copiar / Abrir. Cadenas: un QR por sede (`/carta/?sede=<id>` muestra esa sede y su horario).
- Tarjeta con la identidad del cliente (colores, tipografías, logo, forma y sombra de `cliente.json → marca`) en 3 formatos: **tarjeta de mesa** 9,5 × 13,5 cm (4 por A4), **cartel de mesa** que se dobla al medio (A4) y **sticker** 8,5 × 8,5 cm (6 por A4); y 3 estilos: clásico, color de marca, minimal. Textos editables.
- **PDF** A4 listo para imprimir con marcas de corte, **JPG** a 300 dpi, **Imprimir** directo y **solo el QR en SVG** para una imprenta.
- Todo se genera en el navegador (QR propio en `kit/core/qr.js`, PDF propio en `kit/core/tarjeta-qr.js`): sin servicios externos ni librerías.

Opcional en `cliente.json`:

```json
"instagram": "usuario",
"marca": { "logoClaro": "img/logo-blanco.svg", "isotipo": "img/isotipo.svg" },
"cartaQR": { "url": "https://dominio-del-cliente.com/carta/", "pedir": false, "estilo": "marca", "textos": { "titulo": "Nuestra carta" } }
```

- `logoClaro`: logo para el estilo Color de marca (sin él, el logo va sobre una placa clara).
- `isotipo`: ícono cuadrado en el centro del QR (pasa a corrección de errores alta).
- `cartaQR.url`: si el cliente usa dominio propio, para que el QR impreso no dependa del `.vercel.app`.
- `cartaQR.pedir: true`: la carta del QR también deja pedir (con el módulo carrito).

**Carta completa para imprimir (kit 1.8)**: en la misma sección (pestaña *Carta completa*) se arma la carta entera en hojas A4 con la marca del cliente: estilo clásico / color de marca / minimal, 1 o 2 columnas (o automático, con columnas parejas), descripciones sí/no, QR al pie que lleva a la carta online, qué secciones incluir y textos editables (por defecto "Precios vigentes al <fecha>"). Se descarga en **PDF** (todas las hojas), **JPG** (una imagen por hoja, para WhatsApp o Instagram) o se manda a imprimir. Sale siempre de la carta del panel (respeta temporada, fechas especiales y lo pausado).

**En el pitch**: abrir `/admin` → Imprimir, descargar el PDF con su marca y mostrarlo; después cambiar un precio en Carta y abrir `/carta/` en otra pestaña: se actualiza al instante. En demo los cambios viven en el navegador del dueño (el panel lo avisa); en producción, con Supabase, cada cambio llega a todos los celulares.

**Generar el QR desde la web publicada**, nunca desde XAMPP: el link sale del dominio donde está abierto el panel (el panel avisa si es una dirección local).

## Alojamientos: estadías por noche (kit 1.9)

Para B&B, cabañas y posadas (primer uso: B&B Como en Casa, Villa La Angostura). En `cliente.json`:

```json
"modulos": { "carta": false, "carrito": false, "estadias": true, "admin": true },
"estadias": {
  "habitaciones": [{ "id": "deluxe", "nombre": "Doble Deluxe", "descripcion": "Cama queen · 20 m²", "capacidad": 2, "foto": "img/hab.webp" }],
  "tarifas": {
    "base": { "deluxe": 104481 },
    "temporadas": [{ "id": "verano", "nombre": "Verano", "desde": "12-15", "hasta": "03-15", "precios": { "deluxe": null }, "minNoches": 2 }]
  },
  "sena": 30, "minNoches": 1, "maxNoches": 30, "diasAdelante": 365,
  "checkin": ["14:30", "20:00"], "checkout": "10:30"
}
```

- Web: `<div data-kit="estadias">` (calendario de 2 meses en desktop / 1 en celu, habitaciones, resumen con seña, datos y hora estimada de llegada) o `<button data-kit-open="estadias" data-kit-hab="deluxe">` (popup: modal ancho en desktop, hoja desde abajo en el celu).
- Una estadía ocupa las noches `[llegada, salida)`: el día de salida queda libre para otra llegada.
- Salidas: **Señar con Mercado Pago** (la seña = `sena` % del total, usa la misma función compartida) o **Consultar por WhatsApp** (mensaje armado). Las dos entran al panel como “pendiente”.
- La demo puede dibujar su propia confirmación: `document.addEventListener('kit:estadia-lista', e => { e.preventDefault(); … e.detail.resumen … })`.
- JS: `kit.estadias.abrir({ habitacion, llegada, salida })`, `kit.estadias.cotizar(hab, a, b)`, `kit.estadias.ocupadas(hab)`.
- Panel → **Estadías**: ocupación por habitación (14 días, navegable), solicitudes (confirmar / WhatsApp / cancelar), próximas llegadas, tarifas por temporada editables (+ % de seña y mínimo de noches), reserva manual (WhatsApp, teléfono, Booking) y bloqueo de fechas. En demo arranca con ocupación de ejemplo (`"demoOcupacion": false` la apaga).
- Producción: correr `supabase/migracion-estadias.sql` (tabla con restricción anti-solapamiento, RPC públicas `ocupacion_estadias` y `crear_estadia`). Pendiente: sincronizar con el iCal de Booking para evitar doble reserva.


## Campos propios por producto (ej. cartelera de un teatro)

Para negocios donde cada "producto" no es un plato con precio (un teatro con obras, un club con actividades). En `cliente.json`:

```json
"modulos": { "carta": true, "carrito": false, "cartaQR": false },
"carta": {
  "sinPrecio": true, "sinEtiquetas": true, "descripcionMax": 1200, "campoFila": "funciones",
  "campos": [
    { "id": "genero", "label": "Género" },
    { "id": "funciones", "label": "Días y horarios" },
    { "id": "link", "label": "Link de compra", "tipo": "url" },
    { "id": "destacada", "label": "Destacada en la portada", "tipo": "check", "ayuda": "…" }
  ]
}
```

- El editor del panel suma esos campos (`tipo`: texto, `url`, `textarea`, `check`) y los guarda en el producto (`p.link`, `p.destacada`…). La web los recibe tal cual en el `template` de la carta y en `kit:carta`.
- `sinPrecio` saca el precio del editor, la columna de la lista (muestra `campoFila`) y el "subir precios"; `sinEtiquetas` saca las etiquetas.
- Renombrá el panel con `textos` (`"carta": "Cartelera"`, `"agregarPlato": "Agregar obra"`, `"plato": "Obra"`…).
- Producción: correr `supabase/migracion-campos.sql` (columna `extra jsonb`).
- Primer uso: Teatro Politeama.

## Cafeterías y take away: opciones, retiro en el día, casillas y destacados (kit 1.11)

Primer uso: Makia (cafetería de especialidad con ventanilla take away).

```json
"carta": { "productos": [{ "id": "peru", "categoria": "grano", "nombre": "Perú · Amazonas", "precio": null,
  "variantes": [{ "id": "q", "nombre": "¼ kg", "precio": 9500 }, { "id": "m", "nombre": "½ kg", "precio": 18000 }],
  "opciones": [{ "id": "molienda", "nombre": "Molienda", "valores": [{ "id": "grano", "nombre": "En grano" }, { "id": "moka", "nombre": "Para moka" }] }] }] },
"pedidos": {
  "salidas": ["mercadopago", "efectivo", "whatsapp"], "tipos": ["retiro"],
  "retiroHoy": { "cadaMin": 15, "prepMin": 10, "asap": true },
  "encargo": { "anticipacionHoras": 48, "franjas": [ … ] },
  "casillas": [{ "id": "vaso", "label": "Traigo mi vaso térmico", "sub": "10% off en el café", "descuentoPct": 10, "categorias": ["cafe", "frios"] }]
},
"destacados": [{ "id": "tolva", "nombre": "En tolva", "campos": [{ "id": "origen", "label": "Origen" }, { "id": "notas", "label": "Notas", "largo": true }],
  "valores": { "origen": "Perú · Amazonas", "notas": "Caramelo, muy dulce" } }]
```

- **Opciones de elección única** (`opciones`): “elegí una” por grupo (molienda, leche, punto). Sin elegir va el primer valor; un valor puede sumar `precio`. `kit.carrito.agregar('peru', 1, { variante: 'q', opc: { molienda: 'moka' } })`. Es otra línea del carrito y el detalle (“¼ kg · Para moka”) llega al WhatsApp y al panel.
- **Retiro en el día** (`retiroHoy`): el checkout ofrece “Lo antes posible (listo a las 10:35)” o una hora de hoy cada `cadaMin`, dentro de `horarios` y con `prepMin` de preparación. Si hoy ya cerró, ofrece el próximo día abierto. El pedido guarda `retiro: { fecha, franja: { id: '10:45', desde: '10:45', hasta: '10:45' } }` (o `id: 'asap'`), así el panel lo ordena igual que los encargos. Si el carrito tiene algo de una categoría con `anticipacionHoras` o una fecha especial, usa el selector de encargo (día y franja). `kit.carrito.setHora('10:45' | 'asap')`.
- **Casillas** (`casillas`): interruptores del checkout. Con `descuentoPct` descuentan ese % de los productos de `categorias` (sin `categorias`, de todo); sin `descuentoPct` son solo un aviso. El pedido guarda `ajustes: [{ id, nombre, pct, monto }]`; el WhatsApp y la tarjeta del panel los muestran. `kit.carrito.setCasilla('vaso', true)` + evento `kit:casillas`.
- **Destacados** (`destacados`): textos cortos que el dueño cambia desde el panel (pestaña con el nombre del destacado). En la web, `<span data-kit-destacado="tolva.origen"></span>` se completa solo y el evento `kit:destacados` trae todos (`ctx.destacado('tolva')`). En producción se guardan en `negocios.config.destacados` (no hace falta migración).
- **Producción**: opciones, casillas y retiro en el día son, por ahora, solo modo demo, igual que los tamaños: antes de un cliente real hay que sumarlos a `crear_pedido` en Supabase (recalcular `opc`, `ajustes` y aceptar el `retiro` con hora).
- **Confirmación propia** (`kit:exito`, cancelable): `document.addEventListener('kit:exito', e => { e.preventDefault(); /* e.detail.pedido, .codigo, .estado, .waUrl */ })` reemplaza el popup de “¡Pedido enviado!” / “Pago aprobado” por el de la demo (en Makia, el ticket que sale por la ventanilla). En demo, `getPedidoPublico` ahora también trae `retiro`, `items` y el nombre.
## Complejos deportivos: reservas por cancha (kit 1.12)

Para canchas de fútbol, pádel, tenis… (primer uso: La Estación Fútbol · Pádel, Villa Bosch). En `cliente.json`:

```json
"modulos": { "carta": false, "carrito": false, "canchas": true, "cartaQR": false, "admin": true },
"canchas": {
  "canchas":  [{ "id": "p1", "nombre": "Pádel 1", "deporte": "padel" }, { "id": "f1", "nombre": "Fútbol 5 · 1", "deporte": "f5" }],
  "deportes": [{ "id": "padel", "nombre": "Pádel", "duracion": 90 }, { "id": "f5", "nombre": "Fútbol 5", "duracion": 60 },
               { "id": "f8", "nombre": "Fútbol 8", "duracion": 60, "usa": ["f1", "f2", "f3"] }],
  "tarifas":  { "padel": { "noPico": 45000, "pico": 70000 }, "f5": { "noPico": 45000, "pico": 70000 }, "f8": { "noPico": 120000, "pico": 190000 } },
  "pico": { "desde": "18:00", "findes": true, "feriados": true }, "feriados": ["2026-12-08"],
  "sena": 30, "extras": [{ "id": "paleta", "nombre": "Alquiler de paleta", "precio": 5000, "deportes": ["padel"], "max": 4 }],
  "diasAdelante": 14, "anticipacionMin": 30, "cancelacionHoras": 48
}
```

- Los turnos arrancan alineados a la apertura (`horarios`) cada `duracion` minutos. Un deporte con `usa` es **combinado**: reservarlo ocupa todas esas canchas juntas (fútbol 8 = las 3 de fútbol 5) y solo se ofrece cuando están todas libres.
- **Pico / no pico** automático: desde `pico.desde` entre semana, todo el día en fines de semana y `feriados`. El dueño cambia precios, hora pico y % de seña desde el panel.
- **Seña** (`sena` %): sobre el valor del turno; los adicionales se pagan en el complejo. Salidas: "Pagar la seña" (Mercado Pago, misma función compartida) o "Reservar y pagar en el complejo" (avisa por WhatsApp).
- **La demo dibuja su propio selector** (mapa del predio, tablero…) con `kit.canchas`: `dias()`, `disponibilidad(deporte, fecha)`, `estado(fecha, desde, hasta)`, `cotizar(...)`, `tarifas()`, `abrir({ deporte, unidad, fecha, desde })` (checkout: hoja en el celu, modal en desktop) y `onCambio(fn)`. Sin JS propio: `<div data-kit="canchas">` o `<button data-kit-open="canchas" data-kit-deporte="padel" data-kit-fecha="…" data-kit-desde="1200">`.
- Confirmación propia: `document.addEventListener('kit:cancha-lista', e => { e.preventDefault(); … e.detail.turno, e.detail.resumen, e.detail.whatsapp })`.
- Panel → **Canchas**: grilla del día por cancha (pico sombreado, línea de "ahora", F8 como un bloque sobre las 3 filas, tocar un hueco = reserva manual), indicadores, para confirmar, próximos turnos (confirmar, cobré el resto, no vino, WhatsApp, cancelar), **abonos fijos** (mismo día y hora todas las semanas, liberar una semana, dar de baja), precios y franjas, y **"Llueve: bloquear"** (bloquea canchas en un rango y lista los turnos afectados con el mensaje de reprogramación listo para WhatsApp). En demo arranca con ocupación de ejemplo alrededor de hoy (`"demoOcupacion": false` la apaga).
- Producción: correr `supabase/migracion-canchas.sql` y copiar el bloque `canchas` de cliente.json a `negocios.config.canchas`. `crear_turno_cancha` recalcula precio y seña en el servidor y bloquea con un lock para que no haya dos reservas pisándose. Pendiente: que el webhook de Mercado Pago pase el turno a "confirmada" al aprobarse la seña.
## Stock del día y cupo por franja (kit 1.13)

Para cocinas que hacen una cantidad fija por noche y se agotan (primer uso: Lumbre · Empanadas, Villa del Parque). En `cliente.json`:

```json
"carta": { "stock": true, "stockAviso": 6, "productos": [
  { "id": "vacio", "nombre": "Vacío al malbec", "precio": 4500, "stock": 18, "stockBase": 36 }
] },
"pedidos": { "encargo": { "anticipacionHoras": 0, "diasAdelante": 2, "cupoFranja": 6, "franjas": [
  { "id": "f2100", "nombre": "21:00 a 21:30", "desde": "21:00", "hasta": "21:30" } ] } }
```

- `stock` = lo que queda hoy (vacío o `null` = sin límite); `stockBase` = lo que se cocina por noche.
- Cada pedido descuenta el stock al crearse; si el pedido se cancela desde el panel, lo devuelve. Con stock 0 el producto queda **agotado por hoy** (`ctx.pedible(p)` da `false`, la carta lo marca `is-off` y muestra “Agotado por hoy”).
- El carrito no deja sumar más de lo que queda (toast “Por hoy quedan N…” y evento `kit:stock-tope`), recorta las líneas si el stock bajó en otra pestaña y, si al enviar algo ya no alcanza, avisa sin crear el pedido.
- En la web: `kit.stockDe(p)` (número o `null`), `kit.agotado(p)`, `kit.stockAviso`. La carta por defecto muestra “Últimas N” cuando quedan `stockAviso` o menos.
- Panel → Carta: la columna “Stock hoy” con − n + en cada renglón (vacío = sin límite), el botón **Cargar stock de la noche** (vuelve todo a `stockBase`) y los dos campos en el editor del plato.
- **Cupo por franja** (`encargo.cupoFranja`, o `cupo` en cada franja): cuando una franja llega a ese número de pedidos activos del día, el checkout la muestra “completa” y no la ofrece. Si la franja se llama por su horario (“21:00 a 21:30”) no se repite el horario en el checkout ni en el WhatsApp.
- **Producción**: por ahora solo modo demo. El stock se guarda en `productos.extra` (migración de campos), pero falta que `crear_pedido` de Supabase lo valide y descuente en el servidor, y una RPC pública con la ocupación de franjas.

## Horarios siempre con minutos y "hs" (kit 1.15)

Regla de Alejo para todas las demos: los horarios se escriben **"8:00 a 20:00 hs"**, nunca "8 a 20". El kit ya los muestra así en el retiro de los pedidos, los encargos y el WhatsApp ("Mañana (9:00 a 13:00 hs)", "hoy 29/10 · 10:45 hs"). En el HTML de cada demo (horarios del local, footer, menú, chips de "abierto hasta…") usar el mismo formato.
