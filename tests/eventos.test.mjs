// kit 1.18: eventos editables desde el panel (catas, pop-ups).
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventosDe, aplicarEventos, limpiarEvento, validarEvento, idEvento, proximos, PREFIJO_SERVICIO } from '../kit/core/eventos.js';
import { serviciosDelDia, generarTurnos } from '../kit/core/turnos.js';

const config = () => ({ horarios: { jue: [['10:00', '00:00']] }, reservas: { maxPersonas: 6, anticipacionMin: 0, diasAdelante: 60 },
  eventos: [
    { id: 'pop', nombre: 'Pop-up', fecha: '2099-11-17', hora: '20:00', cupo: 40, reserva: false },
    { id: 'cata', nombre: 'Cata', fecha: '2099-11-12', hora: '21:00', cupo: 20, precio: 50000 },
    { id: 'rota', nombre: 'Sin fecha', hora: '21:00' },
  ] });

test('eventosDe: limpia, descarta incompletos y ordena por fecha', () => {
  const l = eventosDe(config());
  assert.deepEqual(l.map(e => e.id), ['cata', 'pop']);
  assert.equal(l[0].reserva, true); assert.equal(l[1].reserva, false); assert.equal(l[0].precio, 50000); assert.equal(l[1].precio, null);
  assert.deepEqual(eventosDe(config(), []), [], 'lo guardado (aunque vacío) pisa la semilla');
});

test('aplicarEventos: solo los que tienen inscripción, en el lugar y sin pisar servicios fijos', () => {
  const c = config(); c.reservas.servicios = [{ id: 'cena', nombre: 'Cena', tandas: [{ turnos: ['20:00'] }] }];
  const ref = c.reservas.servicios;
  aplicarEventos(c, eventosDe(c));
  assert.equal(c.reservas.servicios, ref);
  assert.deepEqual(c.reservas.servicios.map(s => s.id), ['cena', PREFIJO_SERVICIO + 'cata']);
  aplicarEventos(c, []);
  assert.deepEqual(ref.map(s => s.id), ['cena']);
});

test('el evento se reserva con su cupo como cualquier servicio con fechas', () => {
  const c = config(); aplicarEventos(c, eventosDe(c));
  assert.deepEqual(serviciosDelDia(c, '2099-11-12').map(s => s.id), ['ev-cata']);
  const ts = generarTurnos({ ...c, tz: 'America/Argentina/Buenos_Aires' }, '2099-11-12', { '21:00': 15 }, 6);
  assert.equal(ts.length, 1); assert.equal(ts[0].libres, 5); assert.equal(ts[0].disponible, false);
});

test('validar, ids y próximos', () => {
  assert.deepEqual(validarEvento(limpiarEvento({ nombre: '', fecha: 'x', hora: '25:99' })), ['nombre', 'fecha', 'hora']);
  assert.equal(limpiarEvento({ cupo: '0' }).cupo, 20);
  assert.equal(idEvento({ nombre: 'Cata de vinos', fecha: '2026-11-12' }, ['cata-de-vinos-1112']), 'cata-de-vinos-1112-2');
  assert.deepEqual(proximos(eventosDe(config()), '2099-11-13').map(e => e.id), ['pop']);
});
