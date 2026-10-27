#!/usr/bin/env node
// Instala o actualiza el kit en la carpeta web/ de una demo.
//
//   node scripts/instalar.mjs "C:\xampp\htdocs\1 - DEMOS\Meat And Grill\web"
//
// Copia:  kit/                      → web/kit/        (se reemplaza siempre: es código del kit)
//         plantillas/admin/index.html → web/admin/index.html (solo si no existe)
//         plantillas/carta/index.html → web/carta/index.html (solo si no existe: la carta del QR)
//         plantillas/cliente.json   → web/cliente.json (solo si no existe)
// Con --produccion también copia produccion/api/ → web/api/ (pagos reales del cliente).
import { cp, mkdir, access, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destino = process.argv.slice(2).find(a => !a.startsWith('--'));
const prod = process.argv.includes('--produccion');
if (!destino) { console.error('Uso: node scripts/instalar.mjs <carpeta web/> [--produccion]'); process.exit(1); }
const WEB = resolve(destino);
const existe = (p) => access(p).then(() => true, () => false);

if (!(await existe(join(WEB, 'index.html')))) { console.error(`No encuentro ${join(WEB, 'index.html')}: ¿es la carpeta web/ de la demo?`); process.exit(1); }

const version = JSON.parse(await readFile(join(RAIZ, 'package.json'), 'utf8')).version;
await rm(join(WEB, 'kit'), { recursive: true, force: true });
await cp(join(RAIZ, 'kit'), join(WEB, 'kit'), { recursive: true });
await writeFile(join(WEB, 'kit', 'VERSION'), `${version}\n`);
console.log(`✓ kit ${version} → ${join(WEB, 'kit')}`);

if (!(await existe(join(WEB, 'admin', 'index.html')))) {
  await mkdir(join(WEB, 'admin'), { recursive: true });
  await cp(join(RAIZ, 'plantillas', 'admin', 'index.html'), join(WEB, 'admin', 'index.html'));
  console.log('✓ panel → admin/index.html');
} else console.log('· admin/index.html ya existe (no se toca)');

if (!(await existe(join(WEB, 'carta', 'index.html')))) {
  await mkdir(join(WEB, 'carta'), { recursive: true });
  await cp(join(RAIZ, 'plantillas', 'carta', 'index.html'), join(WEB, 'carta', 'index.html'));
  console.log('✓ carta pública (la del QR) → carta/index.html');
} else console.log('· carta/index.html ya existe (no se toca)');

if (!(await existe(join(WEB, 'cliente.json')))) {
  await cp(join(RAIZ, 'plantillas', 'cliente.json'), join(WEB, 'cliente.json'));
  console.log('✓ cliente.json de plantilla: completalo con la marca, la carta y los horarios');
} else console.log('· cliente.json ya existe (no se toca)');

if (prod) {
  await mkdir(join(WEB, 'api'), { recursive: true });
  await cp(join(RAIZ, 'produccion', 'api'), join(WEB, 'api'), { recursive: true });
  if (!(await existe(join(WEB, 'package.json')))) {
    await writeFile(join(WEB, 'package.json'), JSON.stringify({ private: true, type: 'module', engines: { node: '>=18' } }, null, 2) + '\n');
    console.log('✓ package.json (las funciones de api/ usan módulos ES)');
  }
  console.log('✓ funciones de pago reales → api/ (configurá las variables en Vercel: ver docs/PRODUCCION.md)');
}
console.log('\nListo. Recordá subir ?v= en los <link>/<script> del kit al publicar.');
