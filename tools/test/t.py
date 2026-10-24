import asyncio,os
from playwright.async_api import async_playwright
D=os.path.dirname(os.path.abspath(__file__))+"/"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    async def route(r):
      f=r.request.url.split("http://w.test/")[1].split("?")[0] or "index.html"
      ct="text/html" if f.endswith(".html") else "application/javascript"
      await r.fulfill(body=open(D+f,encoding="utf-8").read(),content_type=ct+"; charset=utf-8")
    for name,w in [("login",390),("index",1100),("index",390)]:
      pg=await b.new_page(viewport={"width":w,"height":900});errs=[]
      pg.on("pageerror",lambda e:errs.append(str(e)));pg.on("console",lambda m:errs.append("console:"+m.text) if m.type=="error" else None)
      await pg.route("http://w.test/**",route)
      await pg.goto(f"http://w.test/{name}.html");await pg.wait_for_timeout(1200)
      if name=="login":
        await pg.screenshot(path=D+"s_login.png")
        await pg.fill("input[name=email]","info@onlyfootball.es");await pg.fill("input[name=pw]","mal");await pg.click("button[type=submit]");await pg.wait_for_timeout(300)
        print("err:",await pg.inner_text(".lg .e"))
        await pg.fill("input[name=pw]","secreto");await pg.click("button[type=submit]");await pg.wait_for_timeout(1200)
      await pg.screenshot(path=D+f"s_{name}_{w}.png")
      if name=="index" and w==1100:
        await pg.click('button[data-tab="equipo"]');await pg.wait_for_timeout(500);await pg.screenshot(path=D+"s_equipo.png",full_page=True)
        await pg.click('button[data-tab="tareas"]');await pg.wait_for_timeout(300)
        await pg.click('button[data-act="tDone"]');await pg.wait_for_timeout(500)
        print("rows t1/t2:",await pg.evaluate("JSON.stringify([window.__rows['tareas\\u0000t1'],window.__rows['tareas\\u0000t2']])"))
      print(name,w,errs)
    await b.close()
asyncio.run(main())
