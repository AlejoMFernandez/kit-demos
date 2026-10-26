// Encargos con fecha, precio a confirmar y fechas especiales:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoEspecial, categoriasVisibles, opcionesRetiro, textoRetiro } from '../kit/core/encargos.js';
import { armarPedido, mensajePedido, totalTexto } from '../kit/core/pedidos.js';
import { setLang } from '../kit/core/i18n.js';
import { crearFormatoMoneda } from '../kit/core/pais.js';

const navidad = { id: 'navidad', nombre: 'Navidad', especial: true, desde: '2030-12-01', hasta: '2030-12-24', avisoDias: 30 };

test('estado de una fecha especial según el día', () => {
  assert.equal(estadoEspecial(navidad, '2030-10-01'), 'programada');
  assert.equal(estadoEspecial(navidad, '2030-11-01'), 'aviso');
  assert.equal(estadoEspecial(navidad, '2030-12-10'), 'en_curso');
  assert.equal(estadoEspecial(navidad, '2030-12-25'), 'termino');
  assert.equal(estadoEspecial({ ...navidad, desde: '' }, '2030-12-10'), 'borrador');
  assert.equal(estadoEspecial({ id: 'tortas' }, '2030-12-10'), null);
});

test('la web muestra la fecha especial solo en su ventana (o forzada)', () => {
  const cats = [{ id: 'tortas' }, navidad];
  assert.deepEqual(categoriasVisibles(cats, '2030-10-01').map(c => c.id), ['tortas']);
  assert.deepEqual(categoriasVisibles(cats, '2030-11-15').map(c => c.id), ['tortas', 'navidad']);
  assert.deepEqual(categoriasVisibles(cats, '2030-10-01', 'navidad').map(c => c.id), ['tortas', 'navidad']);
});

test('días de retiro: anticipación por categoría y ventana de la fecha especial', () => {
  const horarios = { lun: [['07:00', '20:30']], mar: [['07:00', '20:30']], mie: [['07:00', '20:30']], jue: [['07:00', '20:30']], vie: [['07:00', '21:00']], sab: [['07:00', '21:00']], dom: [['07:00', '20:30']] };
  const encargo = { anticipacionHoras: 0, diasAdelante: 10, franjas: [{ id: 'm', nombre: 'Mañana', desde: '07:00', hasta: '12:00' }, { id: 't', nombre: 'Tarde', desde: '16:00', hasta: '20:00' }] };
  const productos = [{ id: 'choco', categoria: 'tortas' }, { id: 'pan', categoria: 'navidad' }];
  const categorias = [{ id: 'tortas', anticipacionHoras: 48 }, { ...navidad, desde: '2099-12-01', hasta: '2099-12-24' }];
  const tz = 'America/Argentina/Buenos_Aires';
  const a = opcionesRetiro({ horarios, encargo, tz, productos, categorias, lineas: [{ id: 'choco', cant: 1 }] });
  assert.equal(a.horas, 48);
  assert.equal(a.dias[0].abierto, false);              // hoy no llega con 48 h
  assert.ok(a.dias.some(d => d.abierto));
  const b = opcionesRetiro({ horarios, encargo, tz, productos, categorias, lineas: [{ id: 'pan', cant: 1 }] });
  assert.equal(b.dias[0].fecha, '2099-12-01');         // arranca en la ventana
  assert.ok(b.dias.every(d => d.fecha <= '2099-12-24'));
});

test('pedido con precio a confirmar: total y mensaje de WhatsApp', () => {
  setLang('es');
  const money = crearFormatoMoneda('AR');
  const c = armarPedido([{ id: 'a', nombre: 'Chocotorta', precio: null }, { id: 'b', nombre: 'Docena', precio: 9000 }], [{ id: 'a', cant: 1 }, { id: 'b', cant: 1 }]);
  assert.equal(c.sinPrecio, true);
  assert.match(totalTexto(c, money), /a confirmar/);
  const txt = mensajePedido({ ...c, codigo: 'LBA-1', cliente: { nombre: 'Ana' }, tipo: 'retiro', pago: 'whatsapp' }, { negocio: 'X', money, retiroTexto: textoRetiro({ fecha: '2030-12-02', franja: { nombre: 'Mañana', desde: '07:00', hasta: '12:00' } }, { dias: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'], hoy: '2030-12-01' }) });
  assert.match(txt, /Chocotorta \(precio a confirmar\)/);
  assert.match(txt, /Retira: lunes 2\/12 · Mañana \(7 a 12 h\)/);
});
