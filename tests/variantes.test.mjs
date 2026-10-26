// Tamaños, adicionales y seña (1.5).  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarPedido, itemsCobro, mensajePedido } from '../kit/core/pedidos.js';
import { precioLinea, precioDesde, claveLinea, pctSena } from '../kit/core/variantes.js';
import { setLang } from '../kit/core/i18n.js';
import { crearFormatoMoneda } from '../kit/core/pais.js';

const torta = { id: 'mp', categoria: 'tortas', nombre: 'Marquise pistacho', precio: null,
  variantes: [{ id: '20', nombre: '20 cm', precio: 95000 }, { id: '24', nombre: '24 cm', precio: 113500 }],
  adicionales: [{ id: 'macarons', nombre: 'Macarons', precios: { 20: 12000, 24: 21000 } }] };
const tote = { id: 'tote', categoria: 'merch', nombre: 'Tote', precio: 15000 };
const categorias = [{ id: 'tortas', nombre: 'Tortas', sena: 0.5 }, { id: 'merch', nombre: 'Merch' }];

test('precio por tamaño + adicional según el tamaño', () => {
  assert.equal(precioLinea(torta, { variante: '24', extras: ['macarons'] }).precio, 134500);
  assert.equal(precioLinea(torta, { variante: '20', extras: ['macarons'] }).precio, 107000);
  assert.equal(precioLinea(torta, { variante: 'xx' }).precio, 95000);          // variante inexistente → la primera
  assert.equal(precioLinea(torta, { variante: '24', extras: ['otro', 'macarons', 'macarons'] }).detalle, '24 cm + Macarons');
  assert.equal(precioDesde(torta), 95000);
  assert.notEqual(claveLinea({ id: 'mp', variante: '20' }), claveLinea({ id: 'mp', variante: '24' }));
});

test('el carrito no puede inventar el precio: sale de la carta', () => {
  const p = armarPedido([torta], [{ id: 'mp', cant: 1, variante: '24', precio: 1 }], { categorias });
  assert.equal(p.total, 113500);
});

test('seña 50% solo sobre la categoría con seña; el resto se paga completo', () => {
  const p = armarPedido([torta, tote], [{ id: 'mp', cant: 1, variante: '24', extras: ['macarons'] }, { id: 'tote', cant: 1 }], { categorias });
  assert.equal(p.total, 149500);
  assert.equal(p.aPagar, 67250 + 15000);
  assert.equal(p.saldo, 67250);
  assert.equal(p.senaPct, 0.5);
  const cobro = itemsCobro(p);
  assert.equal(cobro.reduce((s, i) => s + i.unit_price * i.quantity, 0), p.aPagar);
  assert.equal(cobro[0].title, 'Seña 50% · Marquise pistacho 24 cm + Macarons');
  assert.equal(pctSena(tote, categorias), 1);
});

test('sin seña no cambia nada', () => {
  const p = armarPedido([tote], [{ id: 'tote', cant: 2 }], { categorias });
  assert.equal(p.aPagar, undefined);
  assert.equal(p.total, 30000);
});

test('WhatsApp con tamaño y seña', () => {
  setLang('es');
  const money = crearFormatoMoneda('AR');
  const c = armarPedido([torta], [{ id: 'mp', cant: 1, variante: '24', extras: ['macarons'] }], { categorias });
  const msg = mensajePedido({ ...c, codigo: 'MI-1', tipo: 'retiro', cliente: { nombre: 'Lu' }, pago: 'mercadopago' }, { negocio: 'MILA', money, retiroTexto: 'jueves 29/10 · Tarde (16 a 20 h)' });
  assert.match(msg, /Marquise pistacho \(24 cm \+ Macarons\)/);
  assert.match(msg, /Seña 50%: \$\s?67\.250/);
  assert.match(msg, /Resto al retirar: \$\s?67\.250/);
  assert.match(msg, /seña pagada por Mercado Pago/);
});
