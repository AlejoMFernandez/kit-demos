// Sucursales / sedes (cadenas con varios locales).
// cliente.json → "sucursales": [{ "id": "beiro", "nombre": "Devoto", "direccion": "Av. Beiró 3425",
//   "whatsapp": "549…", "horarios": { "mar": [["12:00","02:00"]] }, "mapa": "https://maps…" }]
// Con 2 o más, el checkout pide en qué sede se retira (o desde cuál se envía), el pedido la guarda,
// el WhatsApp sale al número de esa sede (si tiene) y el panel filtra por sede.
export const sucursales = (config) => (Array.isArray(config?.sucursales) ? config.sucursales : []).filter(s => s && s.id);
export const sucursalPorId = (config, id) => sucursales(config).find(s => s.id === id) || null;
export const pideSucursal = (config) => sucursales(config).length > 1;
// Resumen que se guarda en el pedido (no depende de que la sede siga en cliente.json).
export const resumenSucursal = (s) => s ? { id: s.id, nombre: s.nombre || s.id, direccion: s.direccion || '' } : null;

// Precio por sucursal (kit 1.22): cadenas con la misma carta y precios distintos en cada local.
// cliente.json → "carta": { "preciosPorSucursal": true, ... } y en cada producto
//   "precio": 13500 (el de la primera sede) + "preciosSucursal": { "guevara": 12500 }.
// La sede de precios es la elegida en el carrito (kit.carrito.setSucursal / data-kit-sucursal); sin elegir, la primera.
export const preciosPorSucursal = (config) => !!config?.carta?.preciosPorSucursal && sucursales(config).length > 1;
export function precioEnSede(p, sedeId) {
  if (!p || !sedeId || !p.preciosSucursal || typeof p.preciosSucursal !== 'object') return p?.precio ?? null;
  const v = p.preciosSucursal[sedeId];
  return v === undefined ? (p.precio ?? null) : (v === null || v === '' ? null : Number(v));
}
// también tamaños (variantes) y adicionales, cada uno con su propio "preciosSucursal"
const tienePS = (x, id) => !!(x && x.preciosSucursal && x.preciosSucursal[id] !== undefined);
export function conPreciosSede(productos, sedeId) {
  if (!sedeId) return productos;
  return productos.map(p => {
    if (!p) return p;
    const vs = Array.isArray(p.variantes) && p.variantes.some(v => tienePS(v, sedeId));
    const ad = Array.isArray(p.adicionales) && p.adicionales.some(a => tienePS(a, sedeId));
    if (!tienePS(p, sedeId) && !vs && !ad) return p;
    return { ...p,
      ...(tienePS(p, sedeId) ? { precio: precioEnSede(p, sedeId) } : {}),
      ...(vs ? { variantes: p.variantes.map(v => tienePS(v, sedeId) ? { ...v, precio: precioEnSede(v, sedeId) } : v) } : {}),
      ...(ad ? { adicionales: p.adicionales.map(a => tienePS(a, sedeId) ? { ...a, precio: precioEnSede(a, sedeId) } : a) } : {}) };
  });
}
