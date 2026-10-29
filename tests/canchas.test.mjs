import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configCanchas, inicios, cotizar, tarifasDe, disponibilidad, ocupacionDia, ocupacionAbonos, libre, ocupacionDemo, abonosDemo, unidades, esPico } from '../kit/core/canchas.js';

const horarios = { lun: [['08:00', '00:00']], mar: [['08:00', '00:00']], mie: [['08:00', '00:00']], jue: [['08:00', '00:00']], vie: [['08:00', '00:00']], sab: [['08:00', '00:00']], dom: [['08:00', '00:00']] };
const config = { horarios, canchas: {
  canchas: [{ id: 'p1', nombre: 'Pádel 1', deporte: 'padel' }, { id: 'p2', nombre: 'Pádel 2', deporte: 'padel' }, { id: 'f1', deporte: 'f5' }, { id: 'f2', deporte: 'f5' }, { id: 'f3', deporte: 'f5' }],
  deportes: [{ id: 'padel', nombre: 'Pádel', duracion: 90 }, { id: 'f5', nombre: 'Fútbol 5', duracion: 60 }, { id: 'f8', nombre: 'Fútbol 8', duracion: 60, usa: ['f1', 'f2', 'f3'] }],
  tarifas: { padel: { noPico: 45000, pico: 70000 }, f5: { noPico: 45000, pico: 70000 }, f8: { noPico: 120000, pico: 190000 } },
  pico: { desde: '18:00' }, feriados: ['2026-11-23'], sena: 30,
  extras: [{ id: 'paleta', nombre: 'Paleta', precio: 5000, deportes: ['padel'], max: 4 }] } };
const C = configCanchas(config);
const tf = tarifasDe(C, {});

test('turnos alineados a la apertura y dentro del horario', () => {
  const p = inicios(C, horarios, '2026-10-29', 'padel');
  assert.equal(p[0], 480); assert.equal(p[1], 570); assert.equal(p[p.length - 1], 21 * 60 + 30);
  const f = inicios(C, horarios, '2026-10-29', 'f5');
  assert.equal(f.length, 16); assert.equal(f[f.length - 1], 23 * 60);
});

test('pico: desde las 18 entre semana, todo el día en finde y feriados', () => {
  assert.equal(esPico(C, '2026-10-29', 17 * 60), false);
  assert.equal(esPico(C, '2026-10-29', 18 * 60), true);
  assert.equal(esPico(C, '2026-10-31', 9 * 60), true);   // sábado
  assert.equal(esPico(C, '2026-11-23', 9 * 60), true);   // feriado
  assert.equal(esPico(C, '2026-10-29', 17 * 60, '16:00'), true);  // hora pico movida desde el panel
});

test('cotiza turno + paletas, seña solo sobre el turno', () => {
  const q = cotizar(C, tf, 'padel', '2026-10-29', 19 * 60 + 30, { paleta: 2 });
  assert.equal(q.precio, 70000); assert.equal(q.total, 80000); assert.equal(q.sena, 21000); assert.equal(q.resto, 59000);
  assert.equal(cotizar(C, tf, 'f8', '2026-10-29', 10 * 60).precio, 120000);
  assert.equal(cotizar(C, tf, 'f5', '2026-10-29', 10 * 60, { paleta: 3 }).extras.length, 0);   // la paleta no es de fútbol
  assert.equal(cotizar(C, tf, 'padel', '2026-10-29', 600, { paleta: 99 }).extras[0].cant, 4);  // tope
});

test('fútbol 8 ocupa las tres de fútbol 5', () => {
  assert.deepEqual(unidades(C, 'f8')[0].ocupa, ['f1', 'f2', 'f3']);
  const ocup = [{ id: 'a', fecha: '2026-10-29', canchas: ['f2'], desde: 1200, hasta: 1260, estado: 'confirmada' }];
  const d8 = disponibilidad(C, horarios, ocup, 'f8', '2026-10-29').find(x => x.desde === 1200);
  assert.equal(d8.libres, 0);
  const d5 = disponibilidad(C, horarios, ocup, 'f5', '2026-10-29').find(x => x.desde === 1200);
  assert.equal(d5.libres, 2);
  const f8 = [{ id: 'b', fecha: '2026-10-29', canchas: ['f1', 'f2', 'f3'], desde: 1260, hasta: 1320 }];
  assert.equal(disponibilidad(C, horarios, f8, 'f5', '2026-10-29').find(x => x.desde === 1260).libres, 0);
});

test('turnos pasados y anticipación no se ofrecen', () => {
  const d = disponibilidad(C, horarios, [], 'f5', '2026-10-29', { fecha: '2026-10-29', min: 10 * 60 + 40 });
  assert.equal(d.find(x => x.desde === 600).libres, 0);
  assert.equal(d.find(x => x.desde === 660).libres, 0);   // faltan menos de 30 min
  assert.equal(d.find(x => x.desde === 720).libres, 3);
});

test('abonos fijos ocupan su día y hora todas las semanas, salvo las liberadas', () => {
  const ab = [{ id: 'x', deporte: 'padel', unidad: 'p1', canchas: ['p1'], dow: 2, hora: 1200, duracion: 90, nombre: 'Martes', estado: 'activo', liberadas: ['2026-11-10'] }];
  assert.equal(ocupacionAbonos(ab, '2026-11-03').length, 1);   // martes
  assert.equal(ocupacionAbonos(ab, '2026-11-10').length, 0);   // liberado
  assert.equal(ocupacionAbonos(ab, '2026-11-04').length, 0);   // miércoles
  assert.equal(ocupacionAbonos([{ ...ab[0], estado: 'baja' }], '2026-11-03').length, 0);
  const oc = ocupacionDia([], ab, '2026-11-03');
  assert.equal(libre(oc, ['p1'], '2026-11-03', 1170, 1260), false);
  assert.equal(libre(oc, ['p2'], '2026-11-03', 1200, 1290), true);
});

test('ocupación demo sin solapes y sin pisar abonos', () => {
  const ab = abonosDemo(C);
  const o = ocupacionDemo(C, horarios, '2026-10-29', 600, ab);
  assert.ok(o.length > 20);
  for (const x of o) {
    assert.equal(libre(o, x.canchas, x.fecha, x.desde, x.hasta, x.id), true, `solapa ${x.id}`);
    assert.equal(libre(ocupacionAbonos(ab, x.fecha), x.canchas, x.fecha, x.desde, x.hasta), true, `pisa abono ${x.id}`);
  }
});
