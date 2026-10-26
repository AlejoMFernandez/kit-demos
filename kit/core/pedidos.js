// Armado de pedidos y mensajes de WhatsApp (puro, sin DOM).
import { t } from './i18n.js';
import { montoValido } from './giftcards.js';

// Recalcula el pedido con los precios de la carta (nunca confía en el precio que trae el carrito).
// Las gift cards (líneas con "gc") se validan contra los montos de cliente.json → giftcards.
export function armarPedido(productos, lineas, { tipo = 'retiro', pedidos = {}, descuentoPct = 0, giftcards = null } = {}) {
  const porId = new Map(productos.map(p => [p.id, p]));
  const items = [];
  for (const l of lineas) {
    if (l.gc) {
      const monto = Number(l.gc.monto);
      if (!giftcards || !montoValido(giftcards, monto)) continue;
      const gc = { monto, para: String(l.gc.para || '').trim().slice(0, 60), de: String(l.gc.de || '').trim().slice(0, 60), mensaje: String(l.gc.mensaje || '').trim().slice(0, 200) };
      items.push({ id: 'giftcard', key: l.key || '', nombre: giftcards.nombre || t('giftcard'), precio: monto, cant: 1, nota: gc.para ? t('gcPara', { para: gc.para }) : '', subtotal: monto, giftcard: gc });
      continue;
    }
    const p = porId.get(l.id);
    if (!p || p.disponible === false) continue;
    const cant = Math.max(1, Math.min(99, parseInt(l.cant, 10) || 1));
    const precio = p.precio == null ? null : Number(p.precio);
    items.push({ id: p.id, nombre: p.nombre, precio, cant, nota: (l.nota || '').slice(0, 140), subtotal: precio == null ? 0 : precio * cant });
  }
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const envio = tipo === 'delivery' ? Number(pedidos.envio || 0) : 0;
  // descuento (ej. efectivo al retirar): se aplica sobre los productos, no sobre el envío
  const pct = Math.max(0, Math.min(100, Number(descuentoPct) || 0));
  const descuento = pct ? Math.round(subtotal * pct / 100) : 0;
  return { items, subtotal, envio, descuentoPct: pct, descuento, total: subtotal + envio - descuento, sinPrecio: items.some(i => i.precio == null) };
}

// Total para mostrar: con productos sin precio confirmado dice "a confirmar" (o "$X + a confirmar").
export function totalTexto(c, money) {
  const sin = c.sinPrecio ?? (c.items || []).some(i => i.precio == null);
  if (!sin) return money(c.total);
  return c.subtotal > 0 ? `${money(c.total)} ${t('masAConfirmar')}` : t('aConfirmar');
}

export function mensajePedido(pedido, { negocio, money, retiroTexto = '' }) {
  const L = [t('waPedido', { negocio }), '', `*${t('waCodigo', { codigo: pedido.codigo })}*`];
  pedido.items.forEach(i => {
    L.push(`${i.cant}x ${i.nombre}${i.precio != null ? ` — ${money(i.subtotal)}` : ` (${t('precioAConfirmar')})`}`);
    if (i.nota) L.push(`   _${i.nota}_`);
  });
  if (pedido.envio) L.push(`${t('envio')}: ${money(pedido.envio)}`);
  if (pedido.descuento) L.push(`${t('descEfectivo', { pct: pedido.descuentoPct })}: -${money(pedido.descuento)}`);
  L.push(`*${t('total')}: ${totalTexto(pedido, money)}*`, '');
  L.push(`${t('waNombre')}: ${pedido.cliente.nombre}`);
  L.push(`${t('waEntrega')}: ${pedido.tipo === 'delivery' ? `${t('delivery')} — ${pedido.cliente.direccion}` : t('retiro')}`);
  if (retiroTexto) L.push(`${t(pedido.tipo === 'delivery' ? 'waCuandoEnvio' : 'waRetira')}: ${retiroTexto}`);
  if (pedido.sucursal) L.push(`${t('waSede')}: ${pedido.sucursal.nombre}${pedido.sucursal.direccion ? ` — ${pedido.sucursal.direccion}` : ''}`);
  if (pedido.nota) L.push(`${t('waNota')}: ${pedido.nota}`);
  L.push(`${t('waPago')}: ${pedido.pago === 'mercadopago' ? t('waPagoMP') : pedido.pago === 'efectivo' ? t('waPagoEfectivo') : t('waPagoWA')}`);
  return L.join('\n');
}

// Link de WhatsApp. Si el negocio tiene un link corto (wa.link, linktree…) que no acepta texto, devuelve { url, soloLink: true }.
export function linkWhatsApp(destino, texto) {
  const d = String(destino || '').trim();
  const num = d.replace(/\D/g, '');
  if (/^https?:/i.test(d) && !/wa\.me|api\.whatsapp\.com/i.test(d)) return { url: d, soloLink: true };
  if (!num) return { url: null, soloLink: true };
  return { url: `https://wa.me/${num}?text=${encodeURIComponent(texto)}`, soloLink: false };
}
