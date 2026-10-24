"""Prueba de la lectura de contratos en la web: pedir lectura, panel pendiente y subida de un contrato."""
import asyncio, json, os, re
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__)) + "/"
SITE = os.path.join(D, "..", "..", "site") + "/"
SEED = {
    "jugadores": {"j1": {"nombre": "Prueba Uno", "posicion": "DC", "club": "Club X", "responsables": ["josemi"],
                         "docsAgencia": [{"id": "abc123", "nombre": "agencia.pdf", "tipo": "pdf", "fecha": "2026-10-01"}]}},
    "miembros": {"josemi": {"nombre": "Josemi", "userId": "uid-josemi", "activo": True}},
    "privado/contratos/items": {"j1": {"club": {}, "comisiones": []}},
}

def page_html():
    s = open(SITE + "index.html", encoding="utf-8").read()
    s = re.sub(r'<script src="https://cdn.jsdelivr.net/npm/@supabase[^"]+"></script>',
               '<script>window.SEED=' + json.dumps(SEED) + '</script><script src="sbmock.js"></script>', s)
    return s

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1100, "height": 900})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def route(r):
            f = r.request.url.split("http://w.test/")[1].split("?")[0]
            if f == "index.html":
                return await r.fulfill(body=page_html(), content_type="text/html; charset=utf-8")
            src = D + f if f == "sbmock.js" else SITE + f
            if os.path.exists(src):
                return await r.fulfill(body=open(src, "rb").read(), content_type="application/javascript")
            await r.fulfill(status=404, body="")
        await pg.route("http://w.test/**", route)
        await pg.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
        await pg.goto("http://w.test/index.html"); await pg.wait_for_timeout(1500)
        await pg.evaluate('()=>{S.nav={tab:"jugadores",id:"j1",sub:"contrato"};render()}'); await pg.wait_for_timeout(400)
        print("panel:", (await pg.inner_text("section.panel.span2"))[:200].replace("\n", " | "))
        await pg.click('button[data-act="lectLeer"]'); await pg.wait_for_timeout(500)
        print("fila:", await pg.evaluate('()=>JSON.stringify(window.__rows["privado/contratos/items\\u0000j1"].lectura)'))
        print("panel tras pedir:", (await pg.inner_text("section.panel.span2"))[:200].replace("\n", " | "))
        await pg.screenshot(path=D + "s_contrato.png")
        # subir un contrato del club
        inp = pg.locator('input[data-upload="club"]')
        if await inp.count():
            await inp.first.set_input_files({"name": "club.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 x"})
            await pg.wait_for_timeout(800)
            print("tras subir:", await pg.evaluate('()=>JSON.stringify(window.__rows["privado/contratos/items\\u0000j1"].lectura)'))
        else:
            print("no hay input de subida del club")
        print("errores:", errs)
        await b.close()

asyncio.run(main())
