// Promos fijas que se aplican solas según el día (kit 1.19). Puro (sin DOM): lo usan el carrito, la capa de datos y la web.
// Primer uso: San Jorge · Fábrica de Pastas (miércoles −20% fideos y ñoquis, −10% ravioles; el 29, ñoquis).
//
// cliente.json → "pedidos": { "promos": [
//   { "id": "mie-fideos",   "nombre": "Miércoles −20% fideos y ñoquis", "dias": ["mie"],  "pct": 20, "categorias": ["fideos", "noquis"], "destacado": "promos.mieFideos" },
//   { "id": "29-noquis",    "nombre": "29 de ñoquis",                   "diasMes": [29],  "pct": 15, "categorias": ["noquis"] }
// ] }
// - "dias": días de la semana (lun…dom) y/o "diasMes": números del mes. Sin "categorias": todo el pedido.
// - No se suman: cada producto toma la mejor promo que le toque ese día (si el 29 cae miércoles, gana el mayor %).
// - "destacado": "<destacado>.<campo>" toma el % de un destacado editable del panel (0 o vacío = apagada).
// - El día es el de HOY en la zona del negocio (o el que fuerce la demo: initKit({ fechaPromo: '2026-11-04' })).
import { DIAS, diaSemana } from './turnos.js';

export const promosDe = (pedidos) => (Array.isArray(pedidos?.promos) ? pedidos.promos.filter(p => p && p.id) : []);

// ¿la promo va ese día ("YYYY-MM-DD")?
export function promoActiva(pr, fecha) {
  if (!pr || !fecha || pr.activa === false) return false;
  const pct = Number(pr.pct) || 0; if (pct <= 0) return false;
  const dia = DIAS[diaSemana(fecha)];
  const dm = Number(fecha.slice(8, 10));
  return (Array.isArray(pr.dias) && pr.dias.includes(dia)) || (Array.isArray(pr.diasMes) && pr.diasMes.map(Number).includes(dm));
}

export const promosDelDia = (pedidos, fecha) => promosDe(pedidos).filter(pr => promoActiva(pr, fecha));

// La mejor promo para un producto ese día (o null)
export function mejorPromo(pedidos, fecha, categoria) {
  let best = null;
  for (const pr of promosDelDia(pedidos, fecha)) {
    const cats = Array.isArray(pr.categorias) && pr.categorias.length ? pr.categorias : null;
    if (cats && !cats.includes(categoria)) continue;
    if (!best || Number(pr.pct) > Number(best.pct)) best = pr;
  }
  return best;
}

// Ajustes del pedido: [{ id, nombre, pct, monto, promo: true }] sobre los items ya armados.
// factor = lo que queda después de otros descuentos generales (ej. efectivo): se aplica sobre eso.
export function ajustesPromos(pedidos, fecha, items, catDe, factor = 1) {
  const porPromo = new Map();
  for (const i of items) {
    if (i.giftcard || !i.subtotal) continue;
    const pr = mejorPromo(pedidos, fecha, catDe(i.id)); if (!pr) continue;
    const m = porPromo.get(pr.id) || { id: pr.id, nombre: pr.nombre || pr.id, pct: Number(pr.pct), monto: 0, promo: true };
    m.monto += i.subtotal * factor * Number(pr.pct) / 100;
    porPromo.set(pr.id, m);
  }
  return [...porPromo.values()].map(a => ({ ...a, monto: Math.round(a.monto) })).filter(a => a.monto > 0);
}

// Los % editables desde el panel (destacados) pisan los de cliente.json.
export function aplicarPromosDestacadas(config, destacados = {}) {
  for (const pr of promosDe(config.pedidos)) {
    if (!pr.destacado) continue;
    const [d, c] = String(pr.destacado).split('.');
    const v = destacados?.[d]?.[c];
    if (v == null || v === '') continue;
    const n = Number(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
    pr.pct = Number.isFinite(n) ? Math.max(0, Math.min(90, n)) : 0;
  }
}
