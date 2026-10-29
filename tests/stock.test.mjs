// Stock del día y cupo por franja (kit 1.13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stockDe, faltantes, ocupacionFranjas, cantidadesPorProducto } from '../kit/core/stock.js';
import { opcionesRetiro } from '../kit/core/encargos.js';

const cfg = { carta: { stock: true } };
const prods = [{ id: 'vacio', nombre: 'Vacío', stock: 3 }, { id: 'lomo', nombre: 'Lomo', stock: null }, { id: 'molle', nombre: 'Mollejas', stock: 0 }];

test('stockDe: solo con carta.stock y número', () => {
  assert.equal(stockDe(cfg, prods[0]), 3);
  assert.equal(stockDe(cfg, prods[1]), null);
  assert.equal(stockDe(cfg, prods[2]), 0);
  assert.equal(stockDe({ carta: {} }, prods[0]), null);
  assert.equal(stockDe(cfg, { stock: '-2' }), 0);
});

test('faltantes suma líneas del mismo producto', () => {
  assert.deepEqual(faltantes(cfg, prods, [{ id: 'vacio', cant: 2 }, { id: 'vacio', cant: 1 }]), []);
  assert.equal(faltantes(cfg, prods, [{ id: 'vacio', cant: 2 }, { id: 'vacio', cant: 2 }])[0].quedan, 3);
  assert.deepEqual(faltantes(cfg, prods, [{ id: 'lomo', cant: 50 }]), []);
  assert.equal(cantidadesPorProducto([{ id: 'a', cant: 2 }, { id: 'giftcard', cant: 1, gc: {} }]).size, 1);
});

test('ocupación de franjas ignora cancelados', () => {
  const o = ocupacionFranjas([
    { estado: 'pendiente', retiro: { fecha: '2026-10-30', franja: { id: 'f21' } } },
    { estado: 'cancelado', retiro: { fecha: '2026-10-30', franja: { id: 'f21' } } },
    { estado: 'listo', retiro: { fecha: '2026-10-30', franja: { id: 'f21' } } },
  ]);
  assert.equal(o['2026-10-30|f21'], 2);
});

test('cupoFranja: franja llena no se ofrece', () => {
  const horarios = { lun: [['19:30', '22:30']], mar: [['19:30', '22:30']], mie: [['19:30', '22:30']], jue: [['19:30', '22:30']], vie: [['19:30', '22:30']], sab: [['19:30', '22:30']], dom: [['19:30', '22:30']] };
  const encargo = { diasAdelante: 3, cupoFranja: 2, franjas: [{ id: 'f21', nombre: '21:00', desde: '21:00', hasta: '21:30' }] };
  const base = opcionesRetiro({ horarios, encargo, tz: 'America/Argentina/Buenos_Aires' });
  const dia = base.dias[base.dias.length - 1];
  assert.equal(dia.franjas[0].lleno, false);
  const lleno = opcionesRetiro({ horarios, encargo, tz: 'America/Argentina/Buenos_Aires', ocupacion: { [`${dia.fecha}|f21`]: 2 } });
  const d2 = lleno.dias.find(d => d.fecha === dia.fecha);
  assert.equal(d2.franjas[0].lleno, true);
  assert.equal(d2.franjas[0].disponible, false);
});
