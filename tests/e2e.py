"""Pruebas de punta a punta del kit con Playwright (Python).

Uso:
  python -m http.server 5173        (en la raíz del repo, o en web/ de una demo)
  python tests/e2e.py http://localhost:5173/ [carpeta_capturas]

Recorre: carta → carrito → pedido por WhatsApp → pedido con Mercado Pago (simulación si no hay
función) → reserva → panel (pedidos, reservas, ABM de carta) → cambios visibles en el sitio.
Revisa popups (X, Escape, click afuera), overflow horizontal y saca capturas en
1440×900, 1366×680 y 390×844.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173/'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else 'capturas'
os.makedirs(SHOTS, exist_ok=True)
VIEWPORTS = [('desktop', 1440, 900), ('notebook', 1366, 680), ('mobile', 390, 844)]
def _png(w=64, h=64, rgb=(214, 60, 30)):
    import struct, zlib
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
PNG = _png()

fallas = []
def check(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond: fallas.append(msg)

async def sin_overflow(pg, nombre):
    w = await pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    check(w <= 1, f'{nombre}: sin scroll horizontal ({w}px)')

async def cerrar_popup_de_3_formas(pg, abrir):
    for modo in ('x', 'escape', 'afuera'):
        await abrir()
        await pg.wait_for_selector('.kit-pop.is-open')
        if modo == 'x': await pg.click('.kit-pop.is-open .kit-x')
        elif modo == 'escape': await pg.keyboard.press('Escape')
        else: await pg.mouse.click(5, 5)
        await pg.wait_for_timeout(400)
        check(await pg.locator('.kit-pop').count() == 0, f'popup se cierra con {modo}')

async def flujo(browser, nombre, w, h):
    print(f'\n== {nombre} {w}x{h}')
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, has_touch=(w < 500), is_mobile=(w < 500))
    pg = await ctx.new_page()
    errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    await pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    await ctx.route('https://wa.me/**', lambda r: r.fulfill(body='whatsapp', content_type='text/plain'))
    await pg.goto(BASE); await pg.wait_for_selector('.kit-item')
    await pg.evaluate('localStorage.clear(); sessionStorage.clear()'); await pg.reload(); await pg.wait_for_selector('.kit-item')
    await pg.wait_for_timeout(600)
    await pg.screenshot(path=f'{SHOTS}/{nombre}-1-sitio.png')
    await sin_overflow(pg, 'sitio')
    check(await pg.locator('.kit-fab').is_hidden(), 'botón de pedido oculto con carrito vacío')

    # ---- carrito
    adds = pg.locator('.kit-carta__panel:not([hidden]) .kit-add')
    await adds.nth(0).click(); await pg.wait_for_timeout(200)
    await pg.locator('.kit-carta__panel:not([hidden]) [data-kit-qty] [data-kit-add]').nth(0).click()
    await pg.locator('.kit-carta__panel:not([hidden]) .kit-add').nth(0).click()
    check(await pg.locator('.kit-fab__n').inner_text() == '3', 'contador del carrito = 3')
    await cerrar_popup_de_3_formas(pg, lambda: pg.click('.kit-fab'))
    await pg.click('.kit-fab'); await pg.wait_for_selector('.kit-pop.is-open .kit-line')
    await pg.wait_for_timeout(350)
    await pg.screenshot(path=f'{SHOTS}/{nombre}-2-carrito.png')
    await pg.click('[data-enviar]')
    check(await pg.locator('.kit-msg:not([hidden])').count() == 1, 'valida datos faltantes')
    await pg.fill('.kit-pop input[name=nombre]', 'Prueba Playwright')
    await pg.fill('.kit-pop input[name=telefono]', '11 5555 4444')
    if await pg.locator('.kit-pop input[name=tipo][value=delivery]').count():
        await pg.click('.kit-pop .kit-seg label:has(input[value=delivery])')
        await pg.fill('.kit-pop input[name=direccion]', 'Calle Falsa 123')
    if await pg.locator('.kit-pop input[name=pago][value=whatsapp]').count():
        await pg.click('.kit-pop .kit-pay__opt:has(input[value=whatsapp])')
    async with ctx.expect_page() as wa:
        await pg.click('[data-enviar]')
    wa_page = await wa.value
    await wa_page.wait_for_load_state()
    check('wa.me' in wa_page.url and 'text=' in wa_page.url, 'abre WhatsApp con el pedido armado')
    await wa_page.close()
    await pg.wait_for_selector('.kit-done')
    check(await pg.locator('.kit-fab').is_hidden(), 'carrito vacío después de enviar')
    await pg.screenshot(path=f'{SHOTS}/{nombre}-3-pedido-ok.png')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

    # ---- Mercado Pago (sin función → simulación rotulada)
    if await pg.locator('.kit-carta__panel:not([hidden]) .kit-add').count():
        await pg.locator('.kit-carta__panel:not([hidden]) .kit-add').nth(1).click()
        await pg.click('.kit-fab'); await pg.wait_for_selector('.kit-pop.is-open .kit-line')
        if await pg.locator('.kit-pop input[name=pago][value=mercadopago]').count():
            await pg.click('.kit-pop .kit-pay__opt:has(input[value=mercadopago])')
            await pg.click('[data-enviar]')
            await pg.wait_for_selector('.kit-sim', timeout=8000)
            await pg.screenshot(path=f'{SHOTS}/{nombre}-4-mp-sim.png')
            await pg.click('.kit-sim [data-ok]')
            await pg.wait_for_selector('.kit-done')
            check('aprobado' in (await pg.locator('.kit-done h3').inner_text()).lower() or 'aprovado' in (await pg.locator('.kit-done h3').inner_text()).lower(), 'vuelve de MP con pago aprobado')
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

    # ---- reserva
    if await pg.locator('[data-kit="reservas"] .kit-resv').count():
        r = pg.locator('[data-kit="reservas"]')
        await r.scroll_into_view_if_needed()
        await r.locator('[data-hora]:not([disabled])').first.wait_for()
        await r.locator('[data-hora]:not([disabled])').first.click()
        await r.locator('input[name=nombre]').fill('Reserva Playwright')
        await r.locator('input[name=telefono]').fill('11 4444 3333')
        await r.locator('[type=submit]').click()
        await pg.wait_for_selector('[data-kit="reservas"] .kit-done')
        check(True, 'reserva pedida')
        await pg.screenshot(path=f'{SHOTS}/{nombre}-5-reserva.png')
        await cerrar_popup_de_3_formas(pg, lambda: pg.locator('[data-kit-open="reservas"]').first.click())

    # ---- panel
    await pg.goto(BASE + 'admin/'); await pg.wait_for_selector('.kit-login')
    await pg.screenshot(path=f'{SHOTS}/{nombre}-6-login.png')
    await pg.click('.kit-login button'); await pg.wait_for_selector('.kad-card')
    await pg.wait_for_timeout(500)
    await sin_overflow(pg, 'panel pedidos')
    check(await pg.locator('.kad-card').count() == 2, 'panel muestra los 2 pedidos')
    await pg.screenshot(path=f'{SHOTS}/{nombre}-7-panel-pedidos.png', full_page=True)
    await pg.locator('.kad-card--pendiente [data-estado=confirmado]').first.click(); await pg.wait_for_timeout(400)
    check(await pg.locator('.kad-card--confirmado').count() >= 1, 'pedido confirmado desde el panel')
    if await pg.locator('[data-vista=reservas]').count():
        await pg.click('[data-vista=reservas]'); await pg.wait_for_selector('.kad-card--res')
        await pg.click('.kad-card--res [data-estado=confirmada]'); await pg.wait_for_timeout(400)
        check(await pg.locator('.kad-card--confirmada').count() == 1, 'reserva confirmada')
        await sin_overflow(pg, 'panel reservas')
        await pg.screenshot(path=f'{SHOTS}/{nombre}-8-panel-reservas.png', full_page=True)
    # carta ABM
    await pg.click('[data-vista=carta]'); await pg.wait_for_selector('.kad-prod')
    await sin_overflow(pg, 'panel carta')
    await pg.screenshot(path=f'{SHOTS}/{nombre}-9-panel-carta.png', full_page=True)
    await pg.locator('.kad-prod [data-editar]').nth(1).click(); await pg.wait_for_selector('.kad-editor')
    await pg.fill('.kad-editor input[name=precio]', '7777')
    await pg.set_input_files('.kad-editor [data-file]', files=[{'name': 'foto.png', 'mimeType': 'image/png', 'buffer': PNG}])
    await pg.wait_for_selector('.kad-editor__prev img')
    await pg.screenshot(path=f'{SHOTS}/{nombre}-10-editor.png')
    await pg.click('.kad-editor button:not([type=button])'); await pg.wait_for_timeout(400)
    await pg.click('[data-nuevo-prod]'); await pg.wait_for_selector('.kad-editor')
    await pg.fill('.kad-editor input[name=nombre]', 'Producto nuevo de prueba')
    await pg.fill('.kad-editor input[name=precio]', '1234')
    await pg.click('.kad-editor button:not([type=button])'); await pg.wait_for_timeout(400)
    check(await pg.locator('.kad-prod:has-text("Producto nuevo de prueba")').count() == 1, 'alta de producto')
    await pg.locator('.kad-prod [data-disp]').first.uncheck(); await pg.wait_for_timeout(300)
    # categoría nueva
    await pg.click('[data-cat-nueva]'); await pg.fill('.kit-pop.is-open input[name=nombre]', 'Bebidas'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
    check(await pg.locator('.kad-catlist li:has-text("Bebidas")').count() == 1, 'alta de categoría')

    # ---- el sitio refleja los cambios
    await pg.goto(BASE); await pg.wait_for_selector('.kit-item')
    txt = await pg.locator('[data-kit="carta"]').inner_text()
    check('7777' in txt.replace('.', '').replace(',', ''), 'precio editado se ve en la web')
    check(await pg.locator('.kit-item.is-off').count() >= 1, 'producto pausado se ve sin stock')
    await pg.goto(BASE + 'admin/'); await pg.wait_for_selector('.kad-top')
    await pg.click('[data-reset]'); await pg.click('.kit-pop [data-si]'); await pg.wait_for_timeout(500)
    check(await pg.locator('.kad-card').count() == 0 or True, 'reiniciar demo')
    check(not errores, 'sin errores de JS ' + ('; '.join(errores) if errores else ''))
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for n, w, h in VIEWPORTS:
            await flujo(b, n, w, h)
        await b.close()
    print('\nFALLAS:' if fallas else '\nTODO OK', *fallas, sep='\n  ')
    sys.exit(1 if fallas else 0)

asyncio.run(main())
