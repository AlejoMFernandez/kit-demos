"""Linter visual de demos (V2): busca errores que se ven, no errores de código.

Uso:
  python tests/lint-visual.py <url> [carpeta_salida] [--solo celu,desktop] [--espera 4500]

Qué revisa en cada pantalla (celu 390, android 360, notebook 1366, desktop 1440, grande 1920):
  ERRORES (bloquean la entrega)
    - scroll horizontal y qué elemento lo provoca
    - textos superpuestos entre sí
    - texto cortado dentro de su caja o recortado por su contenedor
    - texto que no se lee: contraste medido sobre los pixeles reales del fondo (fotos incluidas)
    - imágenes rotas, errores de consola, pedidos que fallan
  AVISOS (se miran uno por uno)
    - contraste justo, texto pegado al borde de su caja o de la pantalla
    - secciones pegadas entre sí y ritmo de espacios desparejo
    - botones y links chicos para el dedo, inputs que hacen zoom en iPhone
    - imágenes pixeladas (estiradas por encima de su tamaño real)
    - el botón principal del hero queda fuera de la primera pantalla
    - saltos de layout al cargar (CLS)

Salida: <carpeta>/informe.json, <pantalla>-pagina.png (página con los hallazgos marcados) y
<pantalla>-hallazgos.png (recortes numerados para mirar rápido). Sale con código 1 si hay errores.
Requiere playwright y pillow.
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = {sys.argv[i][2:]: sys.argv[i + 1] for i in range(1, len(sys.argv) - 1) if sys.argv[i].startswith('--')}
URL = args[0] if args else 'http://localhost:5173/'
OUT = args[1] if len(args) > 1 else 'lint'
ESPERA = int(opts.get('espera', 4500))
os.makedirs(OUT, exist_ok=True)

PANTALLAS = [
    ('celu', 390, 844, True), ('android', 360, 740, True),
    ('notebook', 1366, 680, False), ('desktop', 1440, 900, False), ('grande', 1920, 1080, False),
]
if 'solo' in opts:
    PANTALLAS = [p for p in PANTALLAS if p[0] in opts['solo'].split(',')]

MEDIR = r"""
async ([vw, vh]) => {
  const celu = vw < 700; // el ancho pedido: en un celu, una página que desborda agranda innerWidth
  const H = [];
  const add = (tipo, nivel, el, r, msg, extra) => H.push(Object.assign({ tipo, nivel, sel: sel(el), msg,
    x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }, extra || {}));
  const sel = el => { const p = []; for (let e = el, i = 0; e && e.nodeType === 1 && i < 4; e = e.parentElement, i++) {
      let s = e.tagName.toLowerCase(); if (e.id) { p.unshift(s + '#' + e.id); break; }
      const c = (e.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.'); p.unshift(c ? s + '.' + c : s); }
    return p.join(' > '); };
  const csCache = new Map(); const CS = e => { let c = csCache.get(e); if (!c) { c = getComputedStyle(e); csCache.set(e, c); } return c; };
  const rgba = s => { const m = (s || '').match(/[\d.]+/g); if (!m) return [0, 0, 0, 0]; return [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1]; };
  const inter = (a, b) => { const l = Math.max(a.left, b.left), r = Math.min(a.right, b.right), t = Math.max(a.top, b.top), bt = Math.min(a.bottom, b.bottom);
    return (r > l && bt > t) ? { left: l, right: r, top: t, bottom: bt, width: r - l, height: bt - t } : null; };
  const area = r => r ? r.width * r.height : 0;

  // contexto de cada elemento: opacidad acumulada, fijo, recorte por ancestros, animado, decorativo
  const ctxCache = new Map();
  const ctx = el => { if (!el || el === document.documentElement) return { op: 1, fijo: false, clips: [], anim: false, deco: false, oculto: false };
    let c = ctxCache.get(el); if (c) return c; const p = ctx(el.parentElement), cs = CS(el);
    c = { op: p.op * parseFloat(cs.opacity || 1), fijo: p.fijo || cs.position === 'fixed' || cs.position === 'sticky', clips: p.clips,
      anim: p.anim || (el.getAnimations ? el.getAnimations().some(a => a.playState === 'running') : false),
      deco: p.deco || el.getAttribute('aria-hidden') === 'true',
      oculto: p.oculto || cs.display === 'none' || cs.visibility !== 'visible' };
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const r = el.getBoundingClientRect();
      c.clips = p.clips.concat([{ el, r, scroller: (/auto|scroll/.test(cs.overflowX + cs.overflowY) && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) || el.scrollWidth > el.clientWidth * 1.5 || (el.scrollWidth > el.clientWidth + 24 && el.children.length > 2) }]); }
    ctxCache.set(el, c); return c; };

  // bloques de texto: elementos con texto propio
  const T = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const porEl = new Map();
  for (let n; (n = tw.nextNode());) { if (!n.nodeValue.trim()) continue; const e = n.parentElement; if (!e || /^(SCRIPT|STYLE|NOSCRIPT|OPTION|TITLE)$/.test(e.tagName)) continue;
    if (!porEl.has(e)) porEl.set(e, []); porEl.get(e).push(n); }
  for (const [el, nodos] of porEl) { const c = ctx(el); if (c.oculto || c.op < 0.2) continue;
    let l = 1e9, t = 1e9, r = -1e9, b = -1e9; const rg = document.createRange();
    for (const n of nodos) { rg.selectNodeContents(n); for (const q of rg.getClientRects()) { if (q.width < 1 || q.height < 1) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); } }
    if (r <= l || b <= t) continue; const rect = { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
    const cs = CS(el); const clampP = cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
    let v = rect, scroller = false; for (const k of c.clips) { if (k.scroller) scroller = true; v = v && inter(v, k.r); }
    const frac = area(v) / area(rect);
    T.push({ el, elTop: el.getBoundingClientRect().top, rect, vis: v, frac, c, cs, scroller, clampP, txt: nodos.map(n => n.nodeValue.trim()).join(' ').slice(0, 60), fs: parseFloat(cs.fontSize), fw: parseInt(cs.fontWeight) || 400 });
  }
  const visibles = T.filter(t => t.frac > 0.5 || (t.clampP && t.frac > 0.15));

  // 1. scroll horizontal
  const sw = Math.max(document.documentElement.scrollWidth, innerWidth);
  if (sw > vw + 1) { let n = 0; for (const el of document.body.querySelectorAll('*')) { const c = ctx(el); if (c.oculto || c.fijo) continue; const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right <= vw + 1) continue; let v = r; for (const k of c.clips) v = v && inter(v, k.r); if (!v || v.right <= vw + 1) continue;
      if ([...el.children].some(ch => ch.getBoundingClientRect().right > vw + 1)) continue;
      add('scroll-horizontal', 'error', el, r, `se pasa ${Math.round(r.right - vw)} px del ancho de la pantalla`); if (++n >= 6) break; }
    if (!n) add('scroll-horizontal', 'error', document.body, { left: 0, top: 0, width: vw, height: 40 }, `la página mide ${sw} px de ancho en una pantalla de ${vw}`); }

  // 2. texto cortado o recortado
  for (const t of T) { const { el, cs, c } = t; if (c.anim || c.deco) continue;
    const propio = (cs.overflowX !== 'visible' || cs.overflowY !== 'visible');
    const clamp = cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
    if (propio && !clamp && !/auto|scroll/.test(cs.overflowX + cs.overflowY) && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 3) && t.frac > 0.2)
      add('texto-cortado', 'error', el, el.getBoundingClientRect(), `el texto no entra en su caja: "${t.txt}"`);
    else if (t.frac > 0.08 && t.frac < 0.92 && !t.scroller && !t.clampP && !c.fijo && !(t.vis.width >= t.rect.width - 1 && t.vis.top - t.rect.top <= 0.24 * t.fs && t.rect.bottom - t.vis.bottom <= 0.24 * t.fs))
      add('texto-recortado', 'error', el, t.rect, `se ve solo el ${Math.round(t.frac * 100)}% del texto: "${t.txt}"`);
  }

  // 3. textos superpuestos
  const expuesto = t => { t.el.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = t.el.getBoundingClientRect(), q = t.rect, dy = r.top - t.elTop; let ok = 0, n = 0;
    for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.3, 0.7]) { const x = q.left + q.width * fx, y = q.top + dy + q.height * fy; if (x < 0 || y < 0 || x >= vw || y >= vh) continue; n++;
      const e = document.elementFromPoint(x, y); if (e && (e === t.el || t.el.contains(e) || (e.contains(t.el) && e.getBoundingClientRect().width < q.width * 3))) ok++; }
    return n === 0 || ok / n >= 0.5; };
  const S = visibles.filter(t => !t.c.fijo && !t.c.deco && !t.c.anim).sort((a, b) => a.rect.top - b.rect.top); let ns = 0;
  for (let i = 0; i < S.length && ns < 25; i++) for (let j = i + 1; j < S.length; j++) { const a = S[i], b = S[j]; if (b.rect.top >= a.rect.bottom) break;
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue; const x = inter(a.vis, b.vis); if (!x) continue;
    const m = Math.min(area(a.vis), area(b.vis)); if (area(x) < 0.2 * m || area(x) < 36) continue; if (!expuesto(a) || !expuesto(b)) continue;
    add('textos-superpuestos', 'error', b.el, { left: Math.min(a.rect.left, b.rect.left), top: Math.min(a.rect.top, b.rect.top), width: Math.max(a.rect.right, b.rect.right) - Math.min(a.rect.left, b.rect.left), height: Math.max(a.rect.bottom, b.rect.bottom) - Math.min(a.rect.top, b.rect.top) },
      `"${a.txt}" se pisa con "${b.txt}"`); ns++; break; }

  scrollTo(0, 0); await new Promise(r => setTimeout(r, 300));
  // 4. aire: texto pegado a su caja o a la pantalla
  let na = 0; for (const t of visibles) { if (t.c.deco || t.c.anim || na >= 30) continue; const r = t.vis;
    if (!t.c.fijo && r.width > 30) { const m = celu ? 12 : 16; if (r.left < m - 0.5 || r.right > vw - m + 0.5) { if (!t.scroller) { add('texto-pegado-pantalla', 'aviso', t.el, t.rect, `a ${Math.round(Math.min(r.left, vw - r.right))} px del borde de la pantalla: "${t.txt}"`); na++; continue; } } }
    for (let e = t.el; e && e !== document.body; e = e.parentElement) { const cs = CS(e); const bg = rgba(cs.backgroundColor);
      const caja = bg[3] > 0.05 || cs.backgroundImage !== 'none' || (parseFloat(cs.borderLeftWidth) > 0 && parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderRightWidth) > 0); if (!caja) continue;
      const b = e.getBoundingClientRect(); if (b.width < 70) break; const dl = t.rect.left - b.left, dr = b.right - t.rect.right, dt = t.rect.top - b.top, db = b.bottom - t.rect.bottom;
      const lat = Math.min(dl, dr), ver = Math.min(dt, db);
      if ((lat >= -1 && lat < 6) || (ver >= -1 && ver < 2)) { add('texto-pegado-caja', 'aviso', t.el, t.rect, `a ${Math.round(Math.max(0, Math.min(lat, ver)))} px del borde de su caja: "${t.txt}"`); na++; }
      break; } }

  // 5. datos para medir contraste afuera (sobre la captura sin texto)
  const textos = visibles.filter(t => t.cs.webkitBackgroundClip !== 'text' && !t.c.deco && !t.el.closest(':disabled, [aria-disabled="true"]')).map(t => { const col = rgba(t.cs.webkitTextFillColor && t.cs.webkitTextFillColor !== t.cs.color ? t.cs.webkitTextFillColor : t.cs.color);
    return { sel: sel(t.el), txt: t.txt, x: Math.round(t.vis.left + scrollX), y: Math.round(t.vis.top + scrollY), w: Math.round(t.vis.width), h: Math.round(t.vis.height), color: [col[0], col[1], col[2], col[3] * Math.min(1, t.c.op)], fs: t.fs, fw: t.fw, fijo: t.c.fijo, op: t.c.op }; })
    .filter(t => t.color[3] > 0.05 && t.w >= 6 && t.h >= 6);

  // 6. toques e inputs (solo celu)
  if (celu) { let n = 0; for (const el of document.querySelectorAll('a[href], button, [role="button"], input:not([type=hidden]), select, textarea, summary')) { const c = ctx(el); if (c.oculto || c.op < 0.2) continue;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; let v = r; for (const k of c.clips) v = v && inter(v, k.r); if (area(v) < 0.5 * area(r)) continue;
      const cs = CS(el); if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/checkbox|radio|range|file/.test(el.type) && parseFloat(cs.fontSize) < 16) add('input-zoom-iphone', 'aviso', el, r, `campo con letra de ${parseFloat(cs.fontSize)} px (menos de 16 hace zoom en iPhone)`);
      if (cs.display === 'inline' && el.tagName === 'A' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 20) continue;
      if ((r.width < 40 || r.height < 40) && n < 20) { add('toque-chico', 'aviso', el, r, `zona de toque de ${Math.round(r.width)}×${Math.round(r.height)} px: "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`); n++; } } }

  // 7. imágenes
  for (const im of document.images) { const c = ctx(im); if (c.oculto) continue; const r = im.getBoundingClientRect(); if (r.width < 2) continue;
    if (im.complete && im.naturalWidth === 0 && im.getAttribute('src')) add('imagen-rota', 'error', im, r, `no carga: ${(im.currentSrc || im.src).split('/').pop().slice(0, 50)}`);
    else if (im.naturalWidth && r.width >= 240 && r.width * devicePixelRatio > im.naturalWidth * 1.35 && !/\.svg/.test(im.currentSrc || '')) add('imagen-pixelada', 'aviso', im, r, `se muestra a ${Math.round(r.width * devicePixelRatio)} px y el archivo mide ${im.naturalWidth}`); }

  // 8. ritmo entre secciones
  let bloques = [...document.querySelectorAll('main > *')]; if (bloques.length < 3) bloques = [...document.querySelectorAll('section')];
  bloques = bloques.filter(b => { const r = b.getBoundingClientRect(); return r.height > 140 && !ctx(b).oculto && !ctx(b).fijo; }).filter((b, i, a) => !a.some(o => o !== b && o.contains(b)));
  const ext = bloques.map(b => { let top = 1e9, bot = -1e9; for (const t of visibles) if (b.contains(t.el) && !t.c.deco && !t.c.fijo) { top = Math.min(top, t.vis.top); bot = Math.max(bot, t.vis.bottom); }
    for (const el of b.querySelectorAll('button, a[class], img, picture, video, canvas, svg')) { const c = ctx(el); if (c.oculto || c.op < 0.2 || c.fijo) continue; const r = el.getBoundingClientRect(); if (r.width < 24 || r.height < 24) continue; let v = r; for (const k of c.clips) v = v && inter(v, k.r); if (!v) continue; top = Math.min(top, v.top); bot = Math.max(bot, v.bottom); }
    return { b, r: b.getBoundingClientRect(), top, bot }; }).filter(e => e.bot > e.top).sort((a, b) => a.r.top - b.r.top);
  const huecos = []; for (let i = 0; i + 1 < ext.length; i++) { const a = ext[i], b = ext[i + 1]; let tA = -1e9; for (const t of visibles) if (a.b.contains(t.el) && !t.c.deco) tA = Math.max(tA, t.vis.bottom); let tB = 1e9; for (const t of visibles) if (b.b.contains(t.el) && !t.c.deco) tB = Math.min(tB, t.vis.top);
    const g = tB - tA; if (tA < -1e8 || tB > 1e8) continue; huecos.push(g); const min = celu ? 40 : 56;
    if (g < min && g > -200) add('secciones-pegadas', 'aviso', b.b, { left: 0, top: tA, width: vw, height: Math.max(8, g) }, `solo ${Math.round(g)} px entre el contenido de "${sel(a.b)}" y el de "${sel(b.b)}"`); }

  // 9. hero: botón principal dentro de la primera pantalla
  const hero = ext[0] && ext[0].b; if (hero) { const cta = [...hero.querySelectorAll('a[class], button')].filter(e => { const c = ctx(e), r = e.getBoundingClientRect(); return !c.oculto && c.op > 0.2 && !c.fijo && r.width > 60 && r.height > 28 && (e.textContent || '').trim().length > 2; })[0];
    if (cta) { const r = cta.getBoundingClientRect(); if (r.bottom + scrollY > vh) add('hero-cta-afuera', 'aviso', cta, r, `el botón "${cta.textContent.trim().slice(0, 30)}" queda ${Math.round(r.bottom + scrollY - vh)} px debajo de la primera pantalla`); }
    const hr = hero.getBoundingClientRect(); if (Math.abs(hr.height - vh) > 3 && hr.height < vh * 1.6) H.push({ tipo: 'hero-alto', nivel: 'aviso', sel: sel(hero), msg: `el hero mide ${Math.round(hr.height)} px y la pantalla ${vh}`, x: 0, y: Math.round(hr.top + scrollY), w: vw, h: Math.round(hr.height) }); }

  return { hallazgos: H, textos, alto: document.documentElement.scrollHeight, ancho: vw, huecos: huecos.map(Math.round) };
}
"""

SIN_TEXTO = "*,*::before,*::after{-webkit-text-fill-color:transparent!important;text-shadow:none!important;transition:none!important;caret-color:transparent!important}"


def lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def contraste(t, fondo):
    """Contraste del texto contra los pixeles reales de su fondo (percentil 15: la parte donde peor se lee)."""
    x0, y0 = max(0, t['x']), max(0, t['y'])
    x1, y1 = min(fondo.width, t['x'] + t['w']), min(fondo.height, t['y'] + t['h'])
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    rec = fondo.crop((x0, y0, x1, y1)).resize((min(32, max(4, (x1 - x0) // 6)), min(12, max(3, (y1 - y0) // 6))), Image.BILINEAR)
    r, g, b, a = t['color']
    vals = []
    for px in list(rec.get_flattened_data() if hasattr(rec, 'get_flattened_data') else rec.getdata()):
        col = [r * a + px[0] * (1 - a), g * a + px[1] * (1 - a), b * a + px[2] * (1 - a)]
        l1, l2 = lum(col), lum(px)
        vals.append((max(l1, l2) + 0.05) / (min(l1, l2) + 0.05))
    vals.sort()
    return vals[int(len(vals) * 0.15)]


async def revisar(browser, nombre, w, h, tactil):
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, has_touch=tactil, is_mobile=tactil, device_scale_factor=1)
    pg = await ctx.new_page()
    consola, fallidos = [], []
    pg.on('pageerror', lambda e: consola.append(str(e)[:200]))
    pg.on('console', lambda m: consola.append(m.text[:200]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.on('response', lambda r: fallidos.append(f'{r.status} {r.url[:120]}') if r.status >= 400 and 'fonts.g' not in r.url else None)
    await pg.add_init_script("window.__cls=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true})}catch(e){}")
    await pg.goto(URL, wait_until='load', timeout=60000)
    try:
        await pg.evaluate('document.fonts.ready')
    except Exception:
        pass
    await pg.wait_for_timeout(ESPERA)
    await pg.add_style_tag(content='html{scroll-behavior:auto!important}')
    await pg.evaluate("""async () => { const paso = innerHeight * 0.6; for (let y = 0; y < document.documentElement.scrollHeight; y += paso) { scrollTo(0, y); await new Promise(r => setTimeout(r, 220)); }
        scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 500)); scrollTo(0, 0); await new Promise(r => setTimeout(r, 900)); }""")
    cls = await pg.evaluate('window.__cls')
    data = await pg.evaluate(MEDIR, [w, h])
    H = data['hallazgos']
    pagina = f'{OUT}/{nombre}-pagina.png'
    await pg.screenshot(path=pagina, full_page=True)
    await pg.add_style_tag(content=SIN_TEXTO)
    await pg.wait_for_timeout(150)
    await pg.screenshot(path=f'{OUT}/_{nombre}-fondo.png', full_page=True)
    fondo = Image.open(f'{OUT}/_{nombre}-fondo.png').convert('RGB')
    n_err = n_av = 0
    for t in data['textos']:
        c = contraste(t, fondo)
        if c is None:
            continue
        grande = t['fs'] >= 24 or (t['fs'] >= 18.5 and t['fw'] >= 700)
        minimo = 3.0 if grande else 4.5
        base = dict(sel=t['sel'], x=t['x'], y=t['y'], w=t['w'], h=t['h'])
        if c < (2.0 if grande else 2.6) and t.get('op', 1) >= 0.6 and n_err < 30:
            H.append(dict(base, tipo='no-se-lee', nivel='error', msg=f'contraste {c:.1f}:1 (mínimo {minimo}): "{t["txt"]}"')); n_err += 1
        elif c < minimo and n_av < 30:
            H.append(dict(base, tipo='contraste-justo', nivel='aviso', msg=f'contraste {c:.1f}:1 (mínimo {minimo}): "{t["txt"]}"')); n_av += 1
    os.remove(f'{OUT}/_{nombre}-fondo.png')
    for e in dict.fromkeys(consola):
        H.append(dict(tipo='consola', nivel='error', sel='', msg=e, x=0, y=0, w=0, h=0))
    for e in dict.fromkeys(fallidos):
        H.append(dict(tipo='pedido-fallido', nivel='error', sel='', msg=e, x=0, y=0, w=0, h=0))
    if cls > 0.1:
        H.append(dict(tipo='salto-de-layout', nivel='aviso', sel='', msg=f'la página salta al cargar (CLS {cls:.2f}; lo aceptable es menos de 0,10)', x=0, y=0, w=0, h=0))
    hs = [g for g in data['huecos'] if g > 0]
    if len(hs) >= 4 and max(hs) > 4 * max(1, min(hs)):
        H.append(dict(tipo='ritmo-desparejo', nivel='aviso', sel='', msg=f'espacios entre secciones muy distintos: de {min(hs)} a {max(hs)} px ({hs})', x=0, y=0, w=0, h=0))
    H.sort(key=lambda x: (x['nivel'] != 'error', x['y']))
    for i, x in enumerate(H, 1):
        x['n'] = i

    # página marcada + hoja de recortes
    img = Image.open(pagina).convert('RGB'); d = ImageDraw.Draw(img)
    marcados = [x for x in H if x['w'] > 0]
    for x in marcados:
        col = (230, 30, 40) if x['nivel'] == 'error' else (240, 150, 0)
        d.rectangle([x['x'] - 3, x['y'] - 3, x['x'] + x['w'] + 3, x['y'] + x['h'] + 3], outline=col, width=3)
        d.rectangle([x['x'] - 3, x['y'] - 19, x['x'] + 8 * len(str(x['n'])) + 5, x['y'] - 3], fill=col); d.text((x['x'], x['y'] - 17), str(x['n']), fill='white')
    limpio = Image.open(pagina).convert('RGB')
    img.save(pagina)
    if marcados:
        cw, chh, cols = 360, 230, 4
        sel = marcados[:32]; filas = (len(sel) + cols - 1) // cols
        hoja = Image.new('RGB', (cols * cw, filas * chh), (24, 24, 24)); dh = ImageDraw.Draw(hoja)
        for i, x in enumerate(sel):
            m = 40; box = (max(0, x['x'] - m), max(0, x['y'] - m), min(limpio.width, x['x'] + x['w'] + m), min(limpio.height, x['y'] + min(x['h'], 500) + m))
            if box[2] <= box[0] or box[3] <= box[1]:
                continue
            rec = limpio.crop(box); rec.thumbnail((cw - 12, chh - 34))
            ox, oy = (i % cols) * cw + 6, (i // cols) * chh + 28; hoja.paste(rec, (ox, oy))
            col = (255, 90, 90) if x['nivel'] == 'error' else (255, 180, 40)
            dh.text((ox, oy - 22), f"{x['n']}. {x['tipo']}", fill=col); dh.text((ox, oy - 11), x['msg'][:58], fill=(200, 200, 200))
        hoja.save(f'{OUT}/{nombre}-hallazgos.png')
    await ctx.close()
    return dict(pantalla=nombre, ancho=w, alto=h, alto_pagina=data['alto'], cls=round(cls, 3), huecos=data['huecos'], hallazgos=H)


async def main():
    async with async_playwright() as p:
        proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
        local = 'localhost' in URL or '127.0.0.1' in URL
        browser = await p.chromium.launch(proxy={'server': proxy} if proxy and not local else None)
        informe = dict(url=URL, pantallas=[])
        for nombre, w, h, tactil in PANTALLAS:
            r = await revisar(browser, nombre, w, h, tactil)
            informe['pantallas'].append(r)
            err = [x for x in r['hallazgos'] if x['nivel'] == 'error']; av = [x for x in r['hallazgos'] if x['nivel'] == 'aviso']
            print(f"\n== {nombre} {w}×{h} · {len(err)} errores · {len(av)} avisos · página de {r['alto_pagina']} px")
            for x in r['hallazgos']:
                print(f"  {'✗' if x['nivel'] == 'error' else '!'} {x['n']:>2} [{x['tipo']}] {x['msg']}" + (f"\n        {x['sel']} @ y={x['y']}" if x['sel'] else ''))
        await browser.close()
    json.dump(informe, open(f'{OUT}/informe.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(1 for r in informe['pantallas'] for x in r['hallazgos'] if x['nivel'] == 'error')
    print(f"\n{'✗ NO SE ENTREGA' if total else '✓ sin errores'}: {total} errores en total · informe en {OUT}/informe.json")
    sys.exit(1 if total else 0)

asyncio.run(main())
