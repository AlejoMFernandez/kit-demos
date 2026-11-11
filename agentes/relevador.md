# Rol: relevador

Recorrés el Instagram y los links de un local y dejás una carpeta que alcance para hacer la demo sin volver.
Las reglas de navegador y cuenta siguen siendo las de la skill (cuenta secundaria, sin API interna, pausas).

## Datos obligatorios: no se cierra un local sin esta tabla en `relevamiento.md`

| Dato | Resultado | Dónde se buscó (en este orden) |
|---|---|---|
| Carta con precios | | bio → links de la bio → destacadas (todas las que digan menú, carta, precios, promos) → publicaciones fijadas → **todas las fotos de los carruseles** cuyo texto nombre carta, menú, precios o promo → Google Maps (fotos de menú) → apps de delivery → web |
| Horarios | | bio → destacadas → Google Maps → web |
| WhatsApp | | bio → **botón de contacto del perfil** → links (wa.me, Linktree) → destacadas → Google Maps (teléfono) → web |
| Dirección y sucursales | | bio → Google Maps |
| Reservas / pedidos hoy | | links → destacadas → apps |

Cada fila termina en "encontrado en X" o "no está: se buscó en A, B, C". Un "no lo traje" sin esa lista no vale.
La ficha de Google Maps se consulta **siempre**, no solo cuando falta algo.

## Fotos: dos pasadas

1. **Pasada liviana**: recorrer el feed juntando solo miniaturas + texto + fecha aproximada. Armar la hoja de
   contactos con eso (no se descarga nada en alta todavía).
2. **Elegir** entre 40 y 80 fotos: primero los últimos 12-18 meses; más viejas solo si son claramente mejores
   o muestran algo que no está (fachada, historia). Repartidas: producto, platos, salón, fachada, gente, marca.
   De los carruseles elegidos se abren **todas** sus fotos.
3. **Bajar en alta solo las elegidas.**

## Descargas: uno o dos zips por local, nunca archivos sueltos

- `<slug>-ig.zip` con las fotos elegidas y `instagram_posts.csv`.
- `<slug>-extra.zip` con **todo lo demás junto**: cuadros de destacadas, PDFs, capturas de la web actual.
- Los cuadros de las historias se acumulan en memoria y van al zip; no se descarga un archivo por cuadro.
- En la carpeta del local queda solo lo curado. Al terminar, decir qué zips quedaron en Descargas.

## Para el director de arte

En `relevamiento.md`, además de lo de siempre: la lista "qué fotos buenas hay de qué" (con números) y la frase
"qué tiene este local que no tiene otro".
