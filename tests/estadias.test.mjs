import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configEstadias, cotizar, libre, nochesEntre, temporadaDe, ocupacionDemo } from '../kit/core/estadias.js';

const cfg = configEstadias({ estadias: { habitaciones: [{ id: 'a' }, { id: 'b' }], sena: 30,
  tarifas: { base: { a: 100, b: 80 }, temporadas: [{ id: 'v', desde: '12-15', hasta: '03-15', precios: { a: 150 }, minNoches: 2 }] } } });

test('noches [llegada, salida)', () => { assert.deepEqual(nochesEntre('2026-11-02', '2026-11-05'), ['2026-11-02', '2026-11-03', '2026-11-04']); });
test('temporada que cruza el año', () => { assert.equal(temporadaDe(cfg.tarifas, '2027-01-10')?.id, 'v'); assert.equal(temporadaDe(cfg.tarifas, '2026-11-10'), null); });
test('cotiza con temporada y base', () => {
  const q = cotizar(cfg, cfg.tarifas, 'a', '2026-12-13', '2026-12-17');
  assert.equal(q.total, 500); assert.equal(q.sena, 150); assert.equal(q.minNoches, 2);
  assert.equal(cotizar(cfg, cfg.tarifas, 'b', '2026-12-14', '2026-12-16').total, 160);
});
test('sin precio → total null', () => { assert.equal(cotizar(cfg, { base: {} }, 'a', '2026-11-01', '2026-11-02').total, null); });
test('el día de salida queda libre', () => {
  const ests = [{ id: 1, habitacion: 'a', llegada: '2026-11-02', salida: '2026-11-05', estado: 'confirmada' }];
  assert.equal(libre(ests, 'a', '2026-11-05', '2026-11-07'), true);
  assert.equal(libre(ests, 'a', '2026-11-04', '2026-11-06'), false);
  assert.equal(libre(ests, 'b', '2026-11-04', '2026-11-06'), true);
  assert.equal(libre([{ ...ests[0], estado: 'cancelada' }], 'a', '2026-11-03', '2026-11-04'), true);
});
test('ocupación demo sin solapes', () => {
  const o = ocupacionDemo(cfg, '2026-10-27');
  for (const e of o) assert.equal(libre(o, e.habitacion, e.llegada, e.salida, e.id), true);
});
