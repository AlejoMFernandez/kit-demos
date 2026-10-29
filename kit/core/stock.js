// Stock del día (kit 1.13), puro: lo usan la web, el panel y el adaptador demo.
//
// cliente.json → "carta": { "stock": true, "stockAviso": 6 }
// Cada producto: "stock" = lo que queda hoy (null = sin límite) y "stockBase" = lo que se cocina por noche.
// Cada pedido descuenta; si se cancela, devuelve. Con stock 0 el producto queda "agotado por hoy".

export function stockDe(config, p) {
  if (!config?.carta?.stock || !p || p.stock == null || p.stock === '') return null;
  const n = Number(p.stock); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

// cantidades por producto de una lista de líneas [{ id, cant }]
export function cantidadesPorProducto(lineas = []) {
  const m = new Map();
  lineas.forEach(l => { if (l && l.id && !l.gc && l.id !== 'giftcard') m.set(l.id, (m.get(l.id) || 0) + (Number(l.cant) || 0)); });
  return m;
}

// ¿Alcanza el stock? Devuelve [{ id, nombre, pide, quedan }] con lo que no alcanza (vacío = ok).
export function faltantes(config, productos, lineas) {
  const porId = new Map(productos.map(p => [p.id, p]));
  const out = [];
  cantidadesPorProducto(lineas).forEach((pide, id) => {
    const p = porId.get(id); const q = stockDe(config, p);
    if (q != null && pide > q) out.push({ id, nombre: p.nombre, pide, quedan: q });
  });
  return out;
}

// Ocupación de franjas: { "2026-10-29|f2100": 3 } a partir de los pedidos activos.
export function ocupacionFranjas(pedidos = []) {
  const o = {};
  pedidos.filter(p => p.retiro?.fecha && p.retiro?.franja?.id && !String(p.estado || '').startsWith('cancel'))
    .forEach(p => { const k = `${p.retiro.fecha}|${p.retiro.franja.id}`; o[k] = (o[k] || 0) + 1; });
  return o;
}
