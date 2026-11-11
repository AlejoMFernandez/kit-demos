"""Ficha de diseño de una demo publicada: datos para el registro de diseño (diseno/registro.json).

Uso:  python scripts/ficha-diseno.py <url> <carpeta_salida>
Deja ficha.json (hero, navegación, secciones, tipografías, colores) y hero.png (desktop + celu).
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
from PIL import Image

URL, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
DATOS = r"""() => {
  const fam = e => e ? getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null;
  const txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 70);
  let bloques = [...document.querySelectorAll('main > *')]; if (bloques.length < 3) bloques = [...document.querySelectorAll('section')];
  bloques = bloques.filter(b => b.getBoundingClientRect().height > 120);
  const hero = bloques[0]; const h1 = document.querySelector('h1');
  const medios = hero ? [...hero.querySelectorAll('img, video, canvas, svg, picture')].map(e => { const r = e.getBoundingClientRect(); return { t: e.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left) }; }).filter(m => m.w > 120 && m.h > 120).slice(0, 6) : [];
  const hr = h1 ? h1.getBoundingClientRect() : null; const nav = document.querySelector('header, nav'); const nc = nav ? getComputedStyle(nav) : null;
  const btn = hero ? [...hero.querySelectorAll('a[class], button')].filter(e => txt(e).length > 2 && e.getBoundingClientRect().width > 60) : [];
  return { titulo: document.title, h1: txt(h1), h1_px: h1 ? Math.round(parseFloat(getComputedStyle(h1).fontSize)) : null,
    h1_pos: hr ? (hr.left + hr.width / 2 < innerWidth * 0.42 ? 'izquierda' : hr.left + hr.width / 2 > innerWidth * 0.58 ? 'derecha' : 'centro') : null,
    hero_alto: hero ? Math.round(hero.getBoundingClientRect().height) : null, hero_medios: medios, hero_botones: btn.slice(0, 4).map(txt),
    hero_animado: hero ? hero.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length : 0,
    nav: nav ? { pos: nc.position, links: [...nav.querySelectorAll('a')].map(txt).filter(Boolean).slice(0, 10) } : null,
    secciones: bloques.map(b => ({ id: b.id || (b.className || '').toString().split(' ')[0], titulo: txt(b.querySelector('h1, h2, h3')), alto: Math.round(b.getBoundingClientRect().height),
      form: b.querySelectorAll('input, select, textarea').length })),
    fuentes: { h1: fam(h1), h2: fam(document.querySelector('h2')), cuerpo: fam(document.body) },
    colores: { fondo: getComputedStyle(document.body).backgroundColor, h1: h1 ? getComputedStyle(h1).color : null, boton: btn[0] ? getComputedStyle(btn[0]).backgroundColor : null },
    alto_pagina: document.documentElement.scrollHeight };
}"""

async def main():
    async with async_playwright() as p:
        proxy = os.environ.get('HTTPS_PROXY')
        b = await p.chromium.launch(proxy={'server': proxy} if proxy and 'localhost' not in URL else None)
        ficha = {'url': URL}; caps = []
        for nombre, w, h, tactil in [('desktop', 1440, 900, False), ('celu', 390, 844, True)]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=tactil, is_mobile=tactil)
            pg = await ctx.new_page(); await pg.goto(URL, wait_until='load', timeout=60000); await pg.wait_for_timeout(5200)
            ficha[nombre] = await pg.evaluate(DATOS); await pg.screenshot(path=f'{OUT}/_{nombre}.png'); caps.append(Image.open(f'{OUT}/_{nombre}.png').convert('RGB')); os.remove(f'{OUT}/_{nombre}.png'); await ctx.close()
        d, c = caps; d = d.resize((720, 450)); c = c.resize((208, 450)); im = Image.new('RGB', (934, 450), (24, 24, 24)); im.paste(d, (0, 0)); im.paste(c, (726, 0)); im.save(f'{OUT}/hero.png')
        json.dump(ficha, open(f'{OUT}/ficha.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1); await b.close()
asyncio.run(main())
