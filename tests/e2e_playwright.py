# Teste do MODO DEMONSTRAÇÃO LOCAL (sem servidor), em tela de celular.
# Rode um servidor na pasta do projeto (python3 -m http.server 8000) e depois: python3 tests/e2e_playwright.py
import asyncio, sys
from playwright.async_api import async_playwright
U=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8000/"
async def main():
    __import__("os").makedirs("tests/screenshots", exist_ok=True)
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=__import__("os").environ.get("CHROME") or None)
        ctx=await b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,device_scale_factor=2)
        pg=await ctx.new_page(); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" and "ERR_" not in m.text and "Failed to load resource" not in m.text else None)
        await pg.goto(U); await pg.wait_for_timeout(800)
        vis=lambda: pg.evaluate("[...document.querySelectorAll('.view')].filter(v=>!v.hidden).map(v=>v.dataset.view)")
        print("inicial:", await vis(), "| strip:", await pg.inner_text("#mode-strip"))
        await pg.screenshot(path="tests/screenshots/v-home.png")
        for t in ["procedimentos","resultados","localizacao","contato"]:
            await pg.click(f".menu a[data-go='{t}']"); await pg.wait_for_timeout(400)
            print(t, "→", await vis(), "| altura", await pg.evaluate("document.body.scrollHeight"))
            await pg.screenshot(path=f"tests/screenshots/v-{t}.png")
            await pg.click(f".view[data-view='{t}'] .back-link"); await pg.wait_for_timeout(300)
            print("  voltar →", await vis())
        await pg.click(".menu a[data-go='resultados']"); await pg.wait_for_timeout(300)
        await pg.go_back(); await pg.wait_for_timeout(300); print("botão voltar do navegador →", await vis())
        # agenda
        await pg.click(".btn-agenda"); await pg.wait_for_timeout(400)
        await pg.click("label.pick:has(input[value='design-henna'])"); await pg.click("#btn-next"); await pg.wait_for_timeout(300)
        await pg.click(".day.st-available"); await pg.wait_for_timeout(600)
        t=await pg.get_attribute(".slot","data-time"); await pg.click(".slot"); await pg.wait_for_timeout(600)
        await pg.fill("#f-name","Ana Teste"); await pg.type("#f-phone","65999990000"); await pg.click("#btn-next"); await pg.wait_for_timeout(300)
        print("passo5 botão desabilitado antes de aceitar política:", await pg.is_disabled("#btn-next"))
        await pg.screenshot(path="tests/screenshots/v-step5.png")
        await pg.check("#policy-accept"); await pg.click("#btn-next"); await pg.wait_for_timeout(500)
        print("final:", await pg.inner_text("#s6"), await pg.inner_text("#done-code"), await pg.inner_text("#done-status"))
        await pg.screenshot(path="tests/screenshots/v-done.png")
        code=await pg.inner_text("#done-code")
        await pg.click("#agenda [data-close] >> nth=-1"); await pg.wait_for_timeout(200)
        await pg.click(".menu a[data-go='contato']"); await pg.wait_for_timeout(300)
        await pg.click("#open-manage"); await pg.fill("#mg-code", code); await pg.type("#mg-phone","65999990000"); await pg.click("#mg-submit"); await pg.wait_for_timeout(300)
        print("pedido:", await pg.inner_text("#mg-done-text"))
        print("erros:", errs)
        await b.close()
asyncio.run(main())
