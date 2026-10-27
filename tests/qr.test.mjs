// QR propio y PDF de las tarjetas (sin navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearQR, qrSVG } from '../kit/core/qr.js';
import { pdfHoja, ubicaciones, FORMATOS } from '../kit/core/tarjeta-qr.js';

test('QR: versión mínima, tamaño y nivel', () => {
  const q = crearQR('https://kit-demos-amf.vercel.app/carta/', { nivel: 'Q', subirNivel: false });
  assert.equal(q.tam, q.version * 4 + 17);
  assert.equal(q.nivel, 'Q');
  assert.equal(q.modulos.length, q.tam);
  // ojos: esquina con borde oscuro y anillo claro
  assert.equal(q.modulos[0][0], true); assert.equal(q.modulos[1][1], false); assert.equal(q.modulos[3][3], true);
  // patrón de sincronismo en la fila 6
  for (let x = 8; x < q.tam - 8; x++) assert.equal(q.modulos[6][x], x % 2 === 0);
});

test('QR: sube la corrección si entra en la misma versión, y textos largos usan versiones grandes', () => {
  assert.equal(crearQR('hola').nivel, 'H');
  assert.ok(crearQR('x'.repeat(400)).version >= 10);
  assert.throws(() => crearQR('x'.repeat(4000)));
});

test('QR: SVG vectorial con margen', () => {
  const s = qrSVG(crearQR('https://x.co/carta/'), { color: '#123456', margen: 4 });
  assert.match(s, /^<svg [^>]*viewBox="0 0 (\d+) \1"/); assert.match(s, /fill="#123456"/);
});

test('hojas A4: las piezas entran en la hoja con margen para la impresora', () => {
  for (const f of Object.keys(FORMATOS)) {
    const L = ubicaciones(f);
    for (const p of L.piezas) { assert.ok(p.x >= 5 && p.y >= 5, f); assert.ok(p.x + L.w <= 205 && p.y + L.h <= 292, f); }
  }
  assert.equal(ubicaciones('mesa').piezas.length, 4);
  assert.equal(ubicaciones('sticker').piezas.length, 6);
  assert.deepEqual(ubicaciones('tent').piezas.map(p => p.rot), [0, 180]);
});

test('PDF: estructura válida con la imagen y la tabla xref correcta', () => {
  const jpg = new Uint8Array([0xFF, 0xD8, 1, 2, 3, 0xFF, 0xD9]);
  const pdf = pdfHoja(jpg, 100, 140, 'mesa', { nota: 'Pãozito · Cortá por las marcas' });
  const txt = Buffer.from(pdf).toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4')); assert.ok(txt.trimEnd().endsWith('%%EOF'));
  assert.equal((txt.match(/\/Im0 Do/g) || []).length, 4);
  const xref = Number(txt.match(/startxref\n(\d+)/)[1]);
  assert.ok(txt.slice(xref).startsWith('xref'));
  const offs = [...txt.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
  offs.forEach((o, i) => assert.ok(txt.slice(o).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1}`));
});
