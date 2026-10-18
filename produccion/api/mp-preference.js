// PRODUCCIÓN — va en web/api/mp-preference.js del cliente (no en kit-demos).
// Crea la preferencia con el token REAL del cliente, armando los ítems desde el pedido
// guardado en Supabase (nunca desde lo que manda el navegador).
//
// Variables de entorno del proyecto de Vercel del cliente:
//   MP_ACCESS_TOKEN            Access Token de producción del cliente (APP_USR-…)
//   SUPABASE_URL               https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service_role (solo servidor; nunca en el front)
//   NEGOCIO_ID                 el "id" de su cliente.json
//   SITIO_URL                  https://www.sudominio.com  (origen permitido y base de back_urls)
//   PAIS                       AR | BR

const MONEDA = { AR: 'ARS', BR: 'BRL' };

async function sb(path, init = {}) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  const sitio = new URL(process.env.SITIO_URL);
  const origin = req.headers.origin || '';
  if (origin === sitio.origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'solo POST' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const id = String(body.pedidoId || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'pedido invalido' });

  try {
    const [pedido] = await sb(`pedidos?id=eq.${id}&negocio=eq.${encodeURIComponent(process.env.NEGOCIO_ID)}&select=*`);
    if (!pedido) return res.status(404).json({ error: 'pedido no encontrado' });
    if (pedido.pago !== 'mercadopago' || pedido.pago_estado === 'aprobado') return res.status(409).json({ error: 'pedido no pagable' });
    const moneda = MONEDA[process.env.PAIS || 'AR'];
    const items = pedido.items.map(i => ({ title: i.nombre, quantity: i.cant, unit_price: Number(i.precio), currency_id: moneda }));
    if (Number(pedido.envio) > 0) items.push({ title: process.env.PAIS === 'BR' ? 'Entrega' : 'Envío', quantity: 1, unit_price: Number(pedido.envio), currency_id: moneda });
    const back = new URL(sitio.href); back.searchParams.set('kit_pedido', pedido.id);
    const pref = {
      items, external_reference: pedido.id,
      back_urls: { success: back.href, failure: back.href, pending: back.href }, auto_return: 'approved',
      notification_url: `${sitio.origin}/api/mp-webhook`,
      statement_descriptor: (process.env.MP_DESCRIPTOR || process.env.NEGOCIO_ID).slice(0, 16).toUpperCase(),
      metadata: { negocio: process.env.NEGOCIO_ID, codigo: pedido.codigo },
    };
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `pref-${pedido.id}` },
      body: JSON.stringify(pref),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.message || 'mercadopago' });
    await sb(`pedidos?id=eq.${pedido.id}`, { method: 'PATCH', body: JSON.stringify({ pago_id: j.id }) });
    return res.status(200).json({ id: j.id, init_point: j.init_point });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'error interno' });
  }
}
