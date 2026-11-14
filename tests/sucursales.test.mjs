// Precio por sucursal (kit 1.22)
import test from 'node:test';
import assert from 'node:assert/strict';
import { preciosPorSucursal, precioEnSede, conPreciosSede } from '../kit/core/sucursales.js';

const config = { carta: { preciosPorSucursal: true }, sucursales: [{ id: 'malabia' }, { id: 'guevara' }] };

test('se activa solo con la bandera y 2 o más sedes', () => {
  assert.equal(preciosPorSucursal(config), true);
  assert.equal(preciosPorSucursal({ ...config, carta: {} }), false);
  assert.equal(preciosPorSucursal({ ...config, sucursales: [{ id: 'a' }] }), false);
});

test('precio de la sede, o el base si no tiene', () => {
  const p = { id: 'avocado', precio: 15000, preciosSucursal: { guevara: 13500 } };
  assert.equal(precioEnSede(p, 'guevara'), 13500);
  assert.equal(precioEnSede(p, 'malabia'), 15000);
  assert.equal(precioEnSede({ precio: 5 }, 'guevara'), 5);
  assert.equal(precioEnSede({ precio: 6500, preciosSucursal: { guevara: null } }, 'guevara'), null);
});

test('tamaños y adicionales también cambian por sede', () => {
  const [p] = conPreciosSede([{ id: 'v60', precio: null,
    variantes: [{ id: '1', precio: 8700, preciosSucursal: { guevara: 8400 } }],
    adicionales: [{ id: 'mollet', precio: 2500, preciosSucursal: { guevara: 2200 } }] }], 'guevara');
  assert.equal(p.variantes[0].precio, 8400);
  assert.equal(p.adicionales[0].precio, 2200);
});

test('sin sede no toca nada', () => {
  const lista = [{ id: 'a', precio: 1, preciosSucursal: { guevara: 2 } }];
  assert.equal(conPreciosSede(lista, ''), lista);
});
