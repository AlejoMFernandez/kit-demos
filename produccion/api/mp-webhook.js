// PRODUCCIÓN — va en web/api/mp-webhook.js del cliente.
// Mercado Pago avisa acá cada cambio de un pago. Volvemos a pedir el pago a la API de MP
// (no confiamos en el cuerpo de la notificación) y actualizamos el pedido en Supabase.
//
// Variables extra: MP_WEBHOOK_SECRET (Tus integraciones → Webhooks → clave secreta).
import crypto from 'node:crypto';

const ESTADO = { approved: 'aprobado', authorized: 'aprobado', in_process: 'pendiente', pending: 'pendiente', in_mediation: 'pendiente', rejected: 'rechazado', cancelled: 'rechazado', refunded: 'rechazado', charged_back: 'rechazado' };

// Firma x-signature: "ts=...,v1=..." · manifiesto "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" · HMAC-SHA256
// (formato documentado por Mercado Pago; si cambia, actualizar acá).
export function firmaValida({ signature, requestId, dataId, secret }) {
  if (!secret) return true;
  if (!signature) return false;
  const parts = Object.fromEntries(String(signature).split(',').map(p => p.split('=').map(s => s.trim())));
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId || '') ? String(dataId).toLowerCase() : dataId;
  let manifest = '';
  if (id) manifest += `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;
  const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(parts.v1)); } catch (_) { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const tipo = body.type || req.query.type || req.query.topic;
  const dataId = String(req.query['data.id'] || body.data?.id || req.query.id || '');
  if (tipo !== 'payment' || !dataId) return res.status(200).json({ ignorado: true });

  if (!firmaValida({ signature: req.headers['x-signature'], requestId: req.headers['x-request-id'], dataId: req.query['data.id'] || dataId, secret: process.env.MP_WEBHOOK_SECRET })) {
    return res.status(401).json({ error: 'firma invalida' });
  }

  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } });
    if (!r.ok) return res.status(200).json({ ok: false });
    const pago = await r.json();
    const pedidoId = pago.external_reference;
    if (!/^[0-9a-f-]{36}$/i.test(pedidoId || '')) return res.status(200).json({ ok: false });
    const estado = ESTADO[pago.status] || 'pendiente';
    const patch = { pago_estado: estado, pago_id: String(pago.id) };
    if (estado === 'aprobado') patch.estado = 'confirmado';
    const u = `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&negocio=eq.${encodeURIComponent(process.env.NEGOCIO_ID)}`;
    await fetch(u, { method: 'PATCH', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'reintentar' }); // MP reintenta si no devolvemos 2xx
  }
}
