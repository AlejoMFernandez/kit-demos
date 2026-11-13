"""Prueba del panel 2.0 (Inicio, Clientes, Números y el día de ejemplo del modo demo).

Uso:  python tests/panel2.py http://localhost:PUERTO/     (sirviendo una web con el kit; abre <url>admin/)
"""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173/'
fallas = []
def check(ok, que):
    print(('  ok   ' if ok else '  FALLA ') + que)
    if not ok: fallas.append(que)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for nombre, w, h, movil in [('desktop', 1440, 900, False), ('celu', 390, 844, True)]:
            print(f'== {nombre}')
            c = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=movil, has_touch=movil); pg = await c.new_page(); errores = []
            pg.on('pageerror', lambda e: errores.append(str(e)[:160])); pg.on('console', lambda m: errores.append(m.text[:160]) if m.type == 'error' else None)
            await pg.goto(BASE + 'admin/'); await pg.wait_for_selector('.kit-login'); await pg.click('.kit-login button'); await pg.wait_for_selector('.p2-kpis', timeout=30000)
            ancho = lambda: pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            check(await pg.locator('.p2-kpi').count() == 4, 'Inicio muestra 4 indicadores')
            n0 = await pg.locator('[data-p2-estado]').count(); check(n0 >= 3, f'hay pedidos de ejemplo en curso ({n0})')
            nuevos = await pg.locator('.p2-chip--pendiente').count()
            await pg.locator('[data-p2-estado][data-a=confirmado]').first.click(); await pg.wait_for_timeout(700)
            check(await pg.locator('.p2-chip--pendiente').count() == nuevos - 1, 'aceptar un pedido lo pasa a Preparando')
            check(await pg.locator('.p2-barra').count() == 7, 'la semana tiene 7 barras'); check(await ancho(), 'Inicio sin scroll horizontal')
            await pg.evaluate("document.querySelector('a[data-vista=clientes]').click()"); await pg.wait_for_selector('.p2-tabla')
            check(await pg.locator('.p2-tabla tbody tr').count() >= 8, 'Clientes lista a los que más vuelven'); check(await pg.locator('.p2-idea').count() >= 1, 'el panel muestra al menos un aviso'); check(await ancho(), 'Clientes sin scroll horizontal')
            await pg.evaluate("document.querySelector('a[data-vista=numeros]').click()"); await pg.wait_for_selector('.p2-rank')
            check(await pg.locator('.p2-rank').count() >= 3, 'Números lista lo más pedido'); check(await ancho(), 'Números sin scroll horizontal')
            await pg.evaluate("document.querySelector('a[data-vista=pedidos]').click()"); await pg.wait_for_selector('.kad-card')
            check(await pg.locator('.kad-card').count() >= 3, 'Pedidos sigue funcionando con el día de ejemplo')
            check(not errores, f'consola sin errores {errores[:2]}'); await c.close()
        await b.close()
    print('\n' + ('✗ ' + str(len(fallas)) + ' fallas' if fallas else '✓ panel 2.0 bien')); sys.exit(1 if fallas else 0)
asyncio.run(main())
