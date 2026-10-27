#!/usr/bin/env python3
"""Genera el mapa de vistas previas borrosas (LQIP) para el cargador de imágenes del kit.

Uso:  python3 scripts/lqip.py <carpeta-web> [salida.json]
      python3 scripts/lqip.py web            -> web/img/lqip.json

Recorre <carpeta-web>/img (jpg, png, webp), arma una miniatura de 12 px de ancho en webp y la
guarda como data URI con la ruta relativa a la web ("img/p/torta.webp"). Cada entrada pesa ~150-300 bytes.
Requiere Pillow (pip install pillow).
"""
import base64, io, json, os, sys
from PIL import Image

web = sys.argv[1] if len(sys.argv) > 1 else 'web'
salida = sys.argv[2] if len(sys.argv) > 2 else os.path.join(web, 'img', 'lqip.json')
EXT = ('.jpg', '.jpeg', '.png', '.webp')
OMITIR = ('antes', 'og.', 'favicon', 'icon')
mapa = {}
for base, _, files in os.walk(os.path.join(web, 'img')):
    for f in sorted(files):
        if not f.lower().endswith(EXT) or any(o in f or o in base for o in OMITIR):
            continue
        ruta = os.path.join(base, f)
        try:
            im = Image.open(ruta).convert('RGBA')
        except Exception:
            continue
        w, h = im.size
        if w < 120:
            continue
        im.thumbnail((12, max(1, round(12 * h / w))))
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=30)
        rel = os.path.relpath(ruta, web).replace(os.sep, '/')
        mapa[rel] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
json.dump(mapa, open(salida, 'w'), separators=(',', ':'))
print(f'{len(mapa)} vistas previas -> {salida} ({os.path.getsize(salida) // 1024} KB)')
