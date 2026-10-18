// Función serverless COMPARTIDA para todas las demos (Vercel): crea una preferencia de
// Mercado Pago con credenciales de PRUEBA según el país del negocio.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   MP_TEST_TOKEN_AR   Access Token de un VENDEDOR DE PRUEBA de Argentina (nunca el de una cuenta real)
//   MP_TEST_TOKEN_BR   Access Token de un VENDEDOR DE PRUEBA de Brasil
//                      (Mercado Pago Developers → Tus integraciones → Cuentas de prueba; ver docs/MERCADOPAGO.md)
//   ALLOWED_ORIGINS    Orígenes que pueden llamarla, separados por coma. Acepta comodín:
//                      https://*.vercel.app,https://alejomfernandez.com.ar,http://localhost
//
// En PRODUCCIÓN no se usa esta función: cada cliente tiene la suya (produccion/api/) con su
// token real y leyendo el pedido desde Supabase.

const TOKENS = { AR: 'MP_TEST_TOKEN_AR', BR: 'MP_TEST_TOKEN_BR' };
const MONEDA = { AR: 'ARS', BR: 'BRL' };

export function origenPermitido(origin, lista = process.env.ALLOWED_ORIGINS || '') {
  if (!origin) return false;
  return lista.split(',').map(s => s.trim()).filter(Boolean).some(p => {
    if (p === '*') return true;
    const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+') + '(:\\d+)?$', 'i');
    return re.test(origin);
  });
}

export function armarPreferencia(body) {
  const pais = String(body.pais || '').toUpperCase();
  if (!MONEDA[pais]) throw new Error('pais invalido');
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 60) throw new Error('items invalidos');
  const limpios = items.map((i) => {
    const title = String(i.title || '').slice(0, 120).trim();
    const quantity = Math.trunc(Number(i.quantity));
    const unit_price = Math.round(Number(i.unit_price) * 100) / 100;
    if (!title || !(quantity >= 1 && quantity <= 99) || !(unit_price > 0 && unit_price < 10_000_000)) throw new Error('item invalido');
    return { title, quantity, unit_price, currency_id: MONEDA[pais] };
  });
  const envio = Number(body.envio || 0);
  if (envio > 0 && envio < 1_000_000) limpios.push({ title: pais === 'BR' ? 'Entrega' : 'Envío', quantity: 1, unit_price: envio, currency_id: MONEDA[pais] });
  let back;
  try { back = new URL(String(body.backUrl)); } catch (_) { throw new Error('backUrl invalida'); }
  if (!/^https?:$/.test(back.protocol)) throw new Error('backUrl invalida');
  const pedidoId = String(body.pedidoId || '').slice(0, 80);
  const pref = {
    items: limpios,
    external_reference: pedidoId,
    statement_descriptor: String(body.negocio || 'DEMO').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 16).toUpperCase() || 'DEMO',
    back_urls: { success: back.href, failure: back.href, pending: back.href },
    metadata: { negocio: String(body.negocio || '').slice(0, 60), codigo: String(body.codigo || '').slice(0, 20), demo: true },
  };
  if (back.protocol === 'https:') pref.auto_return = 'approved'; // MP exige https para volver solo
  return { pais, pref };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (origenPermitido(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'solo POST' });
  if (!origenPermitido(origin)) return res.status(403).json({ error: 'origen no permitido' });

  let datos;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    datos = armarPreferencia(body);
  } catch (e) { return res.status(400).json({ error: e.message }); }

  const token = process.env[TOKENS[datos.pais]];
  if (!token) return res.status(503).json({ error: `falta ${TOKENS[datos.pais]}` });

  try {
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `${datos.pref.external_reference}-${Date.now()}` },
      body: JSON.stringify(datos.pref),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.message || 'mercadopago', detalle: j.cause || null });
    return res.status(200).json({ id: j.id, init_point: j.init_point, sandbox_init_point: j.sandbox_init_point });
  } catch (e) {
    return res.status(502).json({ error: 'no se pudo contactar a Mercado Pago' });
  }
}
