import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soloCarta, soloTienda, esTienda } from '../kit/core/temporadas.js';

const cats = [{ id: 'cafes' }, { id: 't-dulce', tienda: true }, { id: 'panes' }, { id: 't-panes', tienda: true }];
const prods = [{ id: 'latte', categoria: 'cafes' }, { id: 'torta', categoria: 't-dulce' }, { id: 'campo', categoria: 'panes' }, { id: 'bolsa', categoria: 't-panes' }, { id: 'suelto', categoria: null }];

test('la carta del local deja afuera la tienda (y conserva los sueltos)', () => {
  const r = soloCarta(cats, prods);
  assert.deepEqual(r.cats.map(c => c.id), ['cafes', 'panes']);
  assert.deepEqual(r.prods.map(p => p.id), ['latte', 'campo', 'suelto']);
});
test('la tienda trae solo sus secciones y productos', () => {
  const r = soloTienda(cats, prods);
  assert.deepEqual(r.cats.map(c => c.id), ['t-dulce', 't-panes']);
  assert.deepEqual(r.prods.map(p => p.id), ['torta', 'bolsa']);
});
test('sin tienda, nada cambia', () => {
  const r = soloCarta([{ id: 'a' }], [{ id: 'x', categoria: 'a' }]);
  assert.equal(r.cats.length, 1); assert.equal(r.prods.length, 1);
  assert.equal(esTienda({ tienda: true }), true); assert.equal(esTienda(null), false);
});
