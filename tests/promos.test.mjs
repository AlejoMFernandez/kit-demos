import test from 'node:test';
import assert from 'node:assert/strict';
import { armarPedido } from '../kit/core/pedidos.js';
import { promoActiva, aplicarPromosDestacadas } from '../kit/core/promos.js';

const productos = [
  { id: 'fid', categoria: 'fideos', nombre: 'Fideos', variantes: [{ id: 'm', nombre: '½ kg', precio: 5000 }, { id: 'k', nombre: '1 kg', precio: 10000 }] },
  { id: 'rav', categoria: 'ravioles', nombre: 'Ravioles', precio: 7000 },
  { id: 'noq', categoria: 'noquis', nombre: 'Ñoquis', precio: 6000 },
  { id: 'sal', categoria: 'salsas', nombre: 'Tuco', precio: 4000 },
];
const pedidos = { promos: [
  { id: 'mf', nombre: 'Mié fideos', dias: ['mie'], pct: 20, categorias: ['fideos', 'noquis'] },
  { id: 'mr', nombre: 'Mié ravioles', dias: ['mie'], pct: 10, categorias: ['ravioles'] },
  { id: 'n29', nombre: '29 ñoquis', diasMes: [29], pct: 30, categorias: ['noquis'] },
] };
const lineas = [{ id: 'fid', cant: 1, variante: 'k' }, { id: 'rav', cant: 2 }, { id: 'noq', cant: 1 }, { id: 'sal', cant: 1 }];

test('miércoles: 20% fideos y ñoquis, 10% ravioles, nada en salsas', () => {
  const c = armarPedido(productos, lineas, { pedidos, fecha: '2026-11-04' });
  assert.equal(c.subtotal, 10000 + 14000 + 6000 + 4000);
  const mf = c.ajustes.find(a => a.id === 'mf'), mr = c.ajustes.find(a => a.id === 'mr');
  assert.equal(mf.monto, 3200); assert.equal(mr.monto, 1400);
  assert.equal(c.total, 34000 - 4600);
});
test('otro día: sin promos', () => {
  const c = armarPedido(productos, lineas, { pedidos, fecha: '2026-11-05' });
  assert.equal(c.ajustes, undefined); assert.equal(c.total, 34000);
});
test('29 que cae miércoles: los ñoquis toman la mejor, no se suman', () => {
  const c = armarPedido(productos, lineas, { pedidos, fecha: '2026-04-29' });
  assert.equal(c.ajustes.find(a => a.id === 'n29').monto, 1800);
  assert.equal(c.ajustes.find(a => a.id === 'mf').monto, 2000);
});
test('destacado del panel pisa el % y 0 apaga', () => {
  const config = { pedidos: { promos: [{ id: 'x', dias: ['mie'], pct: 20, destacado: 'promos.x' }] } };
  aplicarPromosDestacadas(config, { promos: { x: '0' } });
  assert.equal(promoActiva(config.pedidos.promos[0], '2026-11-04'), false);
  aplicarPromosDestacadas(config, { promos: { x: '25 %' } });
  assert.equal(config.pedidos.promos[0].pct, 25);
});
