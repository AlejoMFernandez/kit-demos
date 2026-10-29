// kit 1.11: opciones de elección única, casillas con descuento, retiro en el día y destacados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { precioLinea, claveLinea, opcionesElegidas } from '../kit/core/variantes.js';
import { armarPedido } from '../kit/core/pedidos.js';
import { opcionesRetiroHoy, franjaRetiroHoy, textoRetiro } from '../kit/core/encargos.js';
import { mezclarDestacados } from '../kit/core/destacados.js';

const cafe = { id: 'peru', categoria: 'grano', nombre: 'Perú', precio: null,
  variantes: [{ id: 'q', nombre: '¼ kg', precio: 9000 }, { id: 'm', nombre: '½ kg', precio: 17000 }],
  opciones: [{ id: 'molienda', nombre: 'Molienda', valores: [{ id: 'grano', nombre: 'En grano' }, { id: 'moka', nombre: 'Para moka' }, { id: 'x', nombre: 'Extra fina', precio: 500 }] }] };
const flat = { id: 'flat', categoria: 'cafe', nombre: 'Flat white', precio: 4000 };
const andes = { id: 'andes', categoria: 'almuerzo', nombre: 'Andes', precio: 10000 };

test('opciones: valor por defecto, elegido y con recargo', () => {
  assert.deepEqual(opcionesElegidas(cafe, {}), { molienda: 'grano' });
  const a = precioLinea(cafe, { variante: 'm', opc: { molienda: 'moka' } });
  assert.equal(a.precio, 17000); assert.equal(a.detalle, '½ kg · Para moka'); assert.deepEqual(a.opc, { molienda: 'moka' });
  assert.equal(precioLinea(cafe, { variante: 'q', opc: { molienda: 'x' } }).precio, 9500);
  assert.equal(precioLinea(cafe, { opc: { molienda: 'nada' } }).opc.molienda, 'grano');
  assert.notEqual(claveLinea({ id: 'peru', variante: 'q', opc: { molienda: 'moka' } }), claveLinea({ id: 'peru', variante: 'q', opc: { molienda: 'grano' } }));
  assert.equal(claveLinea({ id: 'flat' }), 'flat|||');
});

test('casillas: descuento solo sobre sus categorías', () => {
  const pedidos = { casillas: [{ id: 'vaso', label: 'Traigo mi vaso', descuentoPct: 10, categorias: ['cafe'] }, { id: 'aviso', label: 'Sin servilletas' }] };
  const lineas = [{ id: 'flat', cant: 2 }, { id: 'andes', cant: 1 }];
  const sin = armarPedido([flat, andes], lineas, { pedidos });
  assert.equal(sin.total, 18000); assert.equal(sin.ajustes, undefined);
  const con = armarPedido([flat, andes], lineas, { pedidos, casillas: ['vaso', 'aviso'] });
  assert.equal(con.ajustes[0].monto, 800); assert.equal(con.ajustes[1].monto, 0);
  assert.equal(con.total, 17200);
  const ambos = armarPedido([flat, andes], lineas, { pedidos, casillas: ['vaso'], descuentoPct: 10 });
  assert.equal(ambos.descuento, 1800); assert.equal(ambos.ajustes[0].monto, 720); assert.equal(ambos.total, 15480);
});

const H = { lun: [['08:00', '20:00']], mar: [['08:00', '20:00']], mie: [['08:00', '20:00']], jue: [['08:00', '20:00']], vie: [['08:00', '20:00']], sab: [['09:00', '20:00']] };
const ahora = (fecha, min) => ({ fecha, min, dia: Math.round(Date.parse(fecha + 'T00:00Z') / 864e5) });

test('retiro hoy: lo antes posible, horas y próximo día abierto', () => {
  const op = opcionesRetiroHoy({ horarios: H, retiroHoy: { cadaMin: 15, prepMin: 10 }, ahora: ahora('2026-10-29', 622) });
  assert.equal(op.esHoy, true); assert.equal(op.asap.hora, '10:35'); assert.equal(op.horas[0], '10:45'); assert.equal(op.horas.at(-1), '19:45');
  assert.deepEqual(franjaRetiroHoy(op, 'asap'), { id: 'asap', nombre: 'asap', desde: '10:35', hasta: '10:35', asap: true });
  assert.equal(franjaRetiroHoy(op, '10:30'), null);
  const sab = opcionesRetiroHoy({ horarios: H, retiroHoy: {}, ahora: ahora('2026-10-31', 1230) });
  assert.equal(sab.fecha, '2026-11-02'); assert.equal(sab.esHoy, false); assert.equal(sab.asap, null);
  assert.equal(textoRetiro({ fecha: '2026-10-29', franja: { id: '10:45', desde: '10:45', hasta: '10:45' } }, { hoy: '2026-10-29' }), 'hoy 29/10 · 10:45 hs');
  assert.equal(textoRetiro({ fecha: '2026-10-29', franja: { id: 'manana', nombre: 'Mañana', desde: '08:00', hasta: '12:00' } }, { hoy: '2026-10-29' }), 'hoy 29/10 · Mañana (8:00 a 12:00 hs)');
});

test('destacados: valores de cliente.json pisados por lo guardado', () => {
  const config = { destacados: [{ id: 'tolva', campos: [{ id: 'origen' }, { id: 'notas', largo: true }], valores: { origen: 'Perú', notas: 'Dulce' } }] };
  assert.deepEqual(mezclarDestacados(config, {}), { tolva: { origen: 'Perú', notas: 'Dulce' } });
  assert.deepEqual(mezclarDestacados(config, { tolva: { origen: 'Colombia', otro: 'x' } }), { tolva: { origen: 'Colombia', notas: 'Dulce' } });
});
