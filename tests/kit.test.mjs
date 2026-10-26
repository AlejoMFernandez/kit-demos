// Pruebas unitarias (Node ≥18):  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarTurnos, franjas, aMin, horaVisible, diasReservables } from '../kit/core/turnos.js';
import { armarPedido, linkWhatsApp, mensajePedido } from '../kit/core/pedidos.js';
import { setLang } from '../kit/core/i18n.js';
import { crearFormatoMoneda } from '../kit/core/pais.js';
import { filtrarCarta, temporadaValida } from '../kit/core/temporadas.js';
import { armarPreferencia, origenPermitido } from '../api/mp-preference.js';
import { firmaValida } from '../produccion/api/mp-webhook.js';
import crypto from 'node:crypto';

const horarios = { vie: [['20:00', '01:30']], sab: [['12:00', '15:00']], dom: [] };
const env = { horarios, reservas: { intervaloMin: 30, duracionMin: 90, capacidad: 10, maxPersonas: 8, anticipacionMin: 0, ultimoTurnoMin: 60 }, tz: 'America/Argentina/Buenos_Aires' };
const VIERNES = '2030-01-04'; // viernes, lejos en el futuro

test('franjas que cruzan la medianoche', () => {
  assert.deepEqual(franjas(horarios, VIERNES), [[1200, 1530]]);
  assert.equal(horaVisible(1470), '00:30');
  assert.equal(aMin('24:30'), 1470);
});

test('turnos respetan cierre, intervalo y capacidad con superposición', () => {
  const t = generarTurnos(env, VIERNES, {});
  assert.equal(t[0].label, '20:00');
  assert.equal(t.at(-1).label, '00:30'); // 01:30 - 60 min
  const ocup = { '21:00': 8 };
  const t2 = generarTurnos(env, VIERNES, ocup, 4);
  const at = (h) => t2.find(x => x.hora === h);
  assert.equal(at('21:00').disponible, false);   // 8 + 4 > 10
  assert.equal(at('20:00').disponible, false);   // a 60 min (< 90) se superpone
  assert.equal(at('19:30'), undefined);
  assert.equal(at('22:30').disponible, true);    // a 90 min ya no se superpone
  assert.equal(at('22:00').libres, 2);
});

test('día cerrado y feriados', () => {
  assert.deepEqual(generarTurnos(env, '2030-01-06', {}), []); // domingo
  assert.deepEqual(generarTurnos({ ...env, reservas: { ...env.reservas, cerrados: [VIERNES] } }, VIERNES, {}), []);
  assert.ok(diasReservables(env).length > 0);
});

test('el pedido usa los precios de la carta, no los del carrito', () => {
  const prods = [{ id: 'a', nombre: 'A', precio: 1000 }, { id: 'b', nombre: 'B', precio: 500, disponible: false }, { id: 'c', nombre: 'C', precio: null }];
  const p = armarPedido(prods, [{ id: 'a', cant: 2, precio: 1 }, { id: 'b', cant: 1 }, { id: 'zz', cant: 1 }], { tipo: 'delivery', pedidos: { envio: 300 } });
  assert.equal(p.items.length, 1);
  assert.equal(p.subtotal, 2000);
  assert.equal(p.total, 2300);
});

test('mensaje y link de WhatsApp (es y pt-BR)', () => {
  setLang('es');
  const money = crearFormatoMoneda('AR');
  const ped = { codigo: 'MG-1234', items: [{ cant: 2, nombre: 'MeatMac', precio: 9000, subtotal: 18000, nota: 'sin pickles' }], envio: 0, total: 18000, cliente: { nombre: 'Ana' }, tipo: 'retiro', pago: 'whatsapp' };
  const msg = mensajePedido(ped, { negocio: 'Meat & Grill', money });
  assert.match(msg, /Pedido MG-1234/); assert.match(msg, /2x MeatMac/); assert.match(msg, /sin pickles/); assert.match(msg, /Retiro en el local/);
  assert.match(linkWhatsApp('+54 9 11 1234-5678', msg).url, /^https:\/\/wa\.me\/5491112345678\?text=/);
  assert.equal(linkWhatsApp('https://wa.link/abc', msg).soloLink, true);
  setLang('pt-BR');
  assert.match(mensajePedido({ ...ped, tipo: 'retiro' }, { negocio: 'X', money: crearFormatoMoneda('BR') }), /Retirar no local/);
  assert.match(crearFormatoMoneda('BR')(12.9).replace(/\s/g, ' '), /R\$ 12,90/);
  setLang('es');
});

test('función de Mercado Pago: valida y arma la preferencia', () => {
  const { pais, pref } = armarPreferencia({ pais: 'ar', items: [{ title: 'MeatMac', quantity: 2, unit_price: 9000 }], envio: 500, backUrl: 'https://meatandgrill.vercel.app/?kit_pedido=1', pedidoId: 'o-1', negocio: 'meat-and-grill' });
  assert.equal(pais, 'AR');
  assert.equal(pref.items.length, 2);
  assert.equal(pref.items[0].currency_id, 'ARS');
  assert.equal(pref.auto_return, 'approved');
  assert.equal(armarPreferencia({ pais: 'BR', items: [{ title: 'x', quantity: 1, unit_price: 1 }], backUrl: 'http://localhost:5173/' }).pref.auto_return, undefined);
  assert.throws(() => armarPreferencia({ pais: 'AR', items: [{ title: 'x', quantity: 0, unit_price: 1 }], backUrl: 'https://a.b' }));
  assert.throws(() => armarPreferencia({ pais: 'CL', items: [{ title: 'x', quantity: 1, unit_price: 1 }], backUrl: 'https://a.b' }));
  assert.throws(() => armarPreferencia({ pais: 'AR', items: [{ title: 'x', quantity: 1, unit_price: 1 }], backUrl: 'javascript:alert(1)' }));
});

test('orígenes permitidos con comodín', () => {
  const lista = 'https://*.vercel.app,http://localhost,https://alejomfernandez.com.ar';
  assert.ok(origenPermitido('https://meat-grill.vercel.app', lista));
  assert.ok(origenPermitido('http://localhost:5173', lista));
  assert.ok(!origenPermitido('https://evil.com', lista));
  assert.ok(!origenPermitido('https://a.vercel.app.evil.com', lista));
});

test('firma del webhook de Mercado Pago', () => {
  const secret = 's3cr3t', ts = '1742505638683', requestId = 'req-1', dataId = '123456';
  const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  assert.ok(firmaValida({ signature: `ts=${ts},v1=${v1}`, requestId, dataId, secret }));
  assert.ok(!firmaValida({ signature: `ts=${ts},v1=${'0'.repeat(64)}`, requestId, dataId, secret }));
  assert.ok(!firmaValida({ signature: '', requestId, dataId, secret }));
});

test('cadenas: el mensaje lleva la sede y se valida contra cliente.json', async () => {
  const { sucursalPorId, pideSucursal, resumenSucursal } = await import('../kit/core/sucursales.js');
  setLang('es');
  const cfg = { sucursales: [{ id: 'beiro', nombre: 'Devoto', direccion: 'Av. Beiró 3425', whatsapp: '5491100000000' }, { id: 'incas', nombre: 'Parque Chas' }] };
  assert.equal(pideSucursal(cfg), true);
  assert.equal(pideSucursal({ sucursales: [cfg.sucursales[0]] }), false);
  assert.equal(sucursalPorId(cfg, 'nada'), null);
  const money = crearFormatoMoneda('AR');
  const ped = { codigo: 'EM-1', items: [{ cant: 1, nombre: 'Chocludo', precio: 6000, subtotal: 6000, nota: 'salchicha alemana' }], total: 6000, envio: 0, cliente: { nombre: 'Ale' }, tipo: 'retiro', pago: 'whatsapp', sucursal: resumenSucursal(cfg.sucursales[0]) };
  const txt = mensajePedido(ped, { negocio: 'Emperrate', money });
  assert.match(txt, /Sede: Devoto — Av\. Beiró 3425/);
  assert.match(txt, /salchicha alemana/);
  assert.deepEqual(resumenSucursal(cfg.sucursales[0]), { id: 'beiro', nombre: 'Devoto', direccion: 'Av. Beiró 3425' });
});

test('temporadas: filtra secciones y valida la activa', () => {
  const config = { carta: { temporadas: [{ id: 'pri', nombre: 'Primavera' }, { id: 'inv', nombre: 'Invierno' }], temporadaActiva: 'pri' } };
  assert.equal(temporadaValida(config, null), 'pri');
  assert.equal(temporadaValida(config, 'inv'), 'inv');
  assert.equal(temporadaValida(config, 'otono'), 'pri');
  assert.equal(temporadaValida({ carta: {} }, 'inv'), null);
  const cats = [{ id: 'a', temporada: 'pri' }, { id: 'b', temporada: 'inv' }, { id: 'c' }];
  const prods = [{ id: 1, categoria: 'a' }, { id: 2, categoria: 'b' }, { id: 3, categoria: 'c' }, { id: 4, categoria: null }];
  const r = filtrarCarta(cats, prods, 'inv');
  assert.deepEqual(r.cats.map(c => c.id), ['b', 'c']);
  assert.deepEqual(r.prods.map(p => p.id), [2, 3, 4]);
});
