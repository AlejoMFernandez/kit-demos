// Variantes (tamaños), adicionales y seña. Puro (sin DOM): lo usan el carrito, el panel, la capa de datos y las pruebas.
//
// Producto con tamaños y adicionales (el precio sale de la variante + los adicionales elegidos):
//   { "id": "marquise", "precio": null,
//     "variantes": [{ "id": "20", "nombre": "20 cm", "precio": 71000 }, { "id": "24", "nombre": "24 cm", "precio": 77500 }],
//     "adicionales": [{ "id": "macarons", "nombre": "Macarons", "precios": { "20": 12000, "24": 21000 } }] }
//   (un adicional puede tener "precio" fijo en vez de "precios" por variante)
// Línea de carrito: { id, cant, variante: "24", extras: ["macarons"], opc: { molienda: "moka" }, nota }
//
// Opciones de elección única (kit 1.11): "elegí una" por grupo, sin cambiar el precio salvo que el valor tenga "precio":
//   "opciones": [{ "id": "molienda", "nombre": "Molienda",
//                  "valores": [{ "id": "grano", "nombre": "En grano" }, { "id": "moka", "nombre": "Para moka" }] }]
//   (sin elegir, va el primer valor de cada grupo)
//
// Seña: una categoría con "sena": 0.5 cobra ese porcentaje al encargar y el resto al retirar
// (Mercado Pago cobra solo la seña de esos productos y el total de los demás).

export const tieneOpciones = (p) => Array.isArray(p?.opciones) && p.opciones.some(g => g && Array.isArray(g.valores) && g.valores.length);

// { grupoId: valorId } completo y válido (los grupos sin elegir toman su primer valor)
export function opcionesElegidas(p, opc = {}) {
  const out = {};
  if (!tieneOpciones(p)) return out;
  for (const g of p.opciones) {
    if (!g || !Array.isArray(g.valores) || !g.valores.length) continue;
    const v = g.valores.find(x => String(x.id) === String(opc?.[g.id])) || g.valores[0];
    out[g.id] = String(v.id);
  }
  return out;
}

export const tieneVariantes = (p) => Array.isArray(p?.variantes) && p.variantes.some(v => v && v.precio != null);

// { precio, variante, extras, detalle } con los precios de la carta guardada (nunca los del carrito)
export function precioLinea(p, l = {}) {
  if (!p) return { precio: null, variante: null, extras: [], detalle: '' };
  const vars = tieneVariantes(p) ? p.variantes.filter(v => v && v.precio != null) : [];
  const v = vars.length ? (vars.find(x => String(x.id) === String(l.variante)) || vars[0]) : null;
  let precio = v ? Number(v.precio) : (p.precio == null ? null : Number(p.precio));
  const extras = [];
  for (const id of (Array.isArray(l.extras) ? l.extras : [])) {
    const a = (p.adicionales || []).find(x => x.id === id);
    if (!a || extras.some(e => e.id === id)) continue;
    const pa = a.precios && v ? a.precios[v.id] : a.precio;
    if (pa == null) continue;
    extras.push({ id: a.id, nombre: a.nombre, precio: Number(pa) });
    if (precio != null) precio += Number(pa);
  }
  const opc = opcionesElegidas(p, l.opc);
  const opcNombres = [];
  for (const g of (tieneOpciones(p) ? p.opciones : [])) {
    const val = (g.valores || []).find(x => String(x.id) === opc[g.id]); if (!val) continue;
    opcNombres.push(val.nombre);
    if (val.precio != null && precio != null) precio += Number(val.precio);
  }
  const detalle = [v?.nombre, ...opcNombres, ...extras.map(e => `+ ${e.nombre}`)].filter(Boolean).join(' · ').replace(/ · \+ /g, ' + ');
  return { precio, variante: v ? String(v.id) : null, extras: extras.map(e => e.id), detalle, ...(Object.keys(opc).length ? { opc } : {}) };
}

// "desde $X" para productos con tamaños
export function precioDesde(p) {
  const vs = tieneVariantes(p) ? p.variantes.map(v => Number(v.precio)).filter(Number.isFinite) : [];
  return vs.length ? Math.min(...vs) : (p?.precio == null ? null : Number(p.precio));
}

// clave única de una línea (mismo producto con otro tamaño/adicional = otra línea)
const claveOpc = (o) => o && typeof o === 'object' ? Object.keys(o).sort().map(k => `${k}=${o[k]}`).join(',') : '';
export const claveLinea = (l) => l.gc ? `gc|${l.key}` : `${l.id}|${l.variante || ''}|${(l.extras || []).slice().sort().join('+')}|${l.nota || ''}${l.opc && Object.keys(l.opc).length ? `|${claveOpc(l.opc)}` : ''}`;

// porcentaje de seña de un producto según su categoría (1 = pago total)
export function pctSena(p, categorias = []) {
  const c = categorias.find(x => x.id === p?.categoria);
  const v = Number(c?.sena);
  return v > 0 && v < 1 ? v : 1;
}
