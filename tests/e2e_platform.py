"""
Teste ponta a ponta da PLATAFORMA (site público + painel) no navegador, contra o
simulador local do Supabase (tests/supabase_shim.py) e o PostgreSQL de teste.

Pré‑requisitos (ver README, seção Testes):
  - PostgreSQL local com 0001_plataforma.sql + 0002_demo.sql aplicados e usuárias de teste
  - simulador em http://localhost:8791 e site em http://localhost:8790/bella-brows-lashes/
Uso: python3 tests/e2e_platform.py
"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright

SITE = os.environ.get("SITE", "http://localhost:8790/bella-brows-lashes/")
SHOTS = os.environ.get("SHOTS", "/tmp/shots/p2-")
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
results = []


def check(name, cond, info=""):
    results.append((name, bool(cond)))
    print(("  ✓ " if cond else "  ✗ ") + name + ("" if cond else f" → {info}"), flush=True)


def psql(q):
    r = subprocess.run(["psql", "-X", "-A", "-t", "-q", "-c", q], capture_output=True, text=True)
    return r.stdout.strip()


async def new_ctx(b, mobile=True):
    if mobile:
        return await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="pt-BR")
    return await b.new_context(viewport={"width": 1366, "height": 860}, locale="pt-BR")


def watch(pg, errs):
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)


async def visible_views(pg):
    return await pg.evaluate("[...document.querySelectorAll('.view')].filter(v=>!v.hidden).map(v=>v.dataset.view)")


async def book(pg, service_name, pick_index=0, name="Cliente Teste", phone="65999990000", accept=True, date=None):
    await pg.click(".btn-agenda")
    await pg.wait_for_selector("#pick-list .pick")
    await pg.click(f"label.pick:has-text('{service_name}')")
    await pg.click("#btn-next")
    await pg.wait_for_timeout(300)
    if date:
        await pg.click(f".day[data-date='{date}']")
    else:
        await pg.click(".day.st-available")
    await pg.wait_for_timeout(600)
    slots = await pg.evaluate("[...document.querySelectorAll('.slot')].map(s=>s.dataset.time)")
    t = slots[pick_index]
    day = await pg.evaluate("document.querySelector('.day.is-sel') && document.querySelector('.day.is-sel').dataset.date")
    await pg.click(f".slot[data-time='{t}']")
    await pg.wait_for_timeout(500)
    await pg.fill("#f-name", name)
    await pg.fill("#f-phone", "")
    await pg.type("#f-phone", phone)
    await pg.click("#btn-next")
    await pg.wait_for_timeout(300)
    if accept and await pg.is_visible("#policy-accept"):
        await pg.check("#policy-accept")
    return day, t, slots


def reset_state():
    """Estado inicial conhecido: dados de demonstração renovados e senhas de teste."""
    psql(f"select app.seed_demo('{SITE}')")
    psql("update auth.users set encrypted_password = crypt('Demo#2026', gen_salt('bf')) where email in ('bella@demo.local','lumi@demo.local')")


async def main():
    os.makedirs(os.path.dirname(SHOTS), exist_ok=True)
    reset_state()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)

        # ---------------------------------------------------------------- site público
        print("\nSite público (modo plataforma)")
        ctx = await new_ctx(b)
        pg = await ctx.new_page(); errs = []; watch(pg, errs)
        await pg.goto(SITE); await pg.wait_for_selector("body.is-ready")
        check("site carrega dados do servidor (nome e procedimentos)", await pg.inner_text(".wm-name") == "Bella" and await pg.evaluate("document.querySelectorAll('#services-list .service').length") == 4)
        check("tela inicial mostra só logo, apresentação e botões", await visible_views(pg) == ["inicio"])
        await pg.screenshot(path=SHOTS + "pub-home.png")
        for v in ["procedimentos", "resultados", "localizacao", "contato"]:
            await pg.click(f".menu a[data-go='{v}']"); await pg.wait_for_timeout(250)
            ok = await visible_views(pg) == [v]
            await pg.screenshot(path=SHOTS + f"pub-{v}.png")
            await pg.click(f".view[data-view='{v}'] .back-link"); await pg.wait_for_timeout(250)
            check(f"botão abre somente a tela “{v}” e volta ao início", ok and await visible_views(pg) == ["inicio"])
        check("galeria mostra as fotos cadastradas no servidor, marcadas como ilustrativas", await pg.evaluate("document.querySelectorAll('#results-list .result').length") == 5 and not await pg.evaluate("document.getElementById('results-notice').hidden"))

        # agendamento real pelo site
        day, t, slots = await book(pg, "Design de sobrancelha com henna")
        await pg.screenshot(path=SHOTS + "pub-step5.png")
        await pg.click("#btn-next"); await pg.wait_for_selector("#done-code:not(:empty)", timeout=8000)
        code = await pg.inner_text("#done-code")
        await pg.screenshot(path=SHOTS + "pub-done.png")
        row = psql(f"select a.status||'|'||c.name||'|'||to_char(a.starts_at at time zone 'America/Cuiaba','YYYY-MM-DD HH24:MI') from appointments a join clients c on c.id=a.client_id where a.code='{code}'")
        check("agendamento do site gravado no banco como 'aguardando sinal'", row.startswith("pending|Cliente Teste|" + day + " " + t), row)

        # horário some para outra cliente
        ctx2 = await new_ctx(b); pg2 = await ctx2.new_page(); watch(pg2, errs)
        await pg2.goto(SITE); await pg2.wait_for_selector("body.is-ready")
        await pg2.click(".btn-agenda"); await pg2.click("label.pick:has-text('Design de sobrancelha com henna')"); await pg2.click("#btn-next")
        await pg2.wait_for_timeout(300); await pg2.click(f".day[data-date='{day}']"); await pg2.wait_for_timeout(600)
        slots2 = await pg2.evaluate("[...document.querySelectorAll('.slot')].map(s=>s.dataset.time)")
        check("horário reservado deixa de aparecer para outra cliente", t not in slots2, (t, slots2[:6]))

        # duas clientes ao mesmo tempo no mesmo horário
        c3 = await new_ctx(b); a3 = await c3.new_page(); watch(a3, errs)
        c4 = await new_ctx(b); a4 = await c4.new_page(); watch(a4, errs)
        for pgx in (a3, a4):
            await pgx.goto(SITE); await pgx.wait_for_selector("body.is-ready")
        d3, t3, _ = await book(a3, "Design simples de sobrancelha", 0, "Primeira Cliente", "65911110000", date=day)
        d4, t4, _ = await book(a4, "Design simples de sobrancelha", 0, "Segunda Cliente", "65922220000", date=day)
        check("as duas clientes veem o mesmo horário livre", (d3, t3) == (d4, t4), (d3, t3, d4, t4))
        await asyncio.gather(a3.click("#btn-next"), a4.click("#btn-next"))
        await a3.wait_for_timeout(2500)
        done3 = await a3.evaluate("!document.querySelector('[data-panel=\"6\"]').hidden")
        done4 = await a4.evaluate("!document.querySelector('[data-panel=\"6\"]').hidden")
        toast = (await a3.inner_text("#toast")) + (await a4.inner_text("#toast"))
        check("clique simultâneo: só uma reserva é confirmada", done3 != done4, (done3, done4))
        check("a outra recebe aviso e volta à escolha de horário", "acabou de ser reservado" in toast, toast)
        n = psql(f"select count(*) from appointments a join clients c on c.id=a.client_id where c.name in ('Primeira Cliente','Segunda Cliente')")
        check("banco tem exatamente 1 reserva das duas", n == "1", n)

        # cancelar/remarcar pela cliente
        await pg.click("#agenda .done-actions [data-close]")
        await pg.click(".menu a[data-go='contato']"); await pg.click("#open-manage")
        await pg.fill("#mg-code", code); await pg.type("#mg-phone", "65999990000"); await pg.fill("#mg-pref", "sexta à tarde"); await pg.fill("#mg-reason", "Imprevisto")
        await pg.click("#mg-submit"); await pg.wait_for_timeout(800)
        check("cliente envia pedido de remarcação com protocolo + telefone", "enviado" in await pg.inner_text("#mg-done-text"))
        await ctx.close(); await ctx2.close(); await c3.close(); await c4.close()

        # ---------------------------------------------------------------- login
        print("\nLogin personalizado e recuperação de senha")
        ctx = await new_ctx(b); pg = await ctx.new_page(); watch(pg, errs)
        await pg.goto(SITE + "admin/?p=bella"); await pg.wait_for_selector("#login-form:not([hidden])")
        brand = await pg.inner_text("#auth-name"); color = await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--p').trim()")
        check("login mostra nome, cores e logo da Bella", brand == "Bella" and color == "#b5786a" and "logo-marca" in await pg.get_attribute("#auth-logo", "src"), (brand, color))
        await pg.screenshot(path=SHOTS + "adm-login-bella.png")
        await pg.fill("#login-id", "bella@demo.local"); await pg.fill("#login-pass", "senha-errada"); await pg.click("#login-btn"); await pg.wait_for_timeout(800)
        check("senha errada é recusada", "incorretos" in await pg.inner_text("#login-error"))
        await pg.fill("#login-id", "(00) 98888-0001"); await pg.fill("#login-pass", "Demo#2026"); await pg.click("#login-btn")
        await pg.wait_for_selector("#app:not([hidden])", timeout=8000)
        check("login pelo telefone funciona", await pg.is_visible("#page"))
        await pg.wait_for_selector(".stat"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=SHOTS + "adm-overview.png")
        stats = await pg.evaluate("[...document.querySelectorAll('.stat')].map(s=>s.innerText.replace(/\\n/g,': '))")
        check("visão geral mostra os cards de resumo", len(stats) == 8, stats)

        lumi = await ctx.new_page(); await lumi.goto(SITE + "admin/?p=lumi-nails"); await lumi.wait_for_timeout(1200)
        await lumi.close()

        # recuperação de senha (outra sessão)
        cr = await new_ctx(b); r = await cr.new_page(); watch(r, errs)
        await r.goto(SITE + "admin/?p=bella"); await r.wait_for_selector("#login-form:not([hidden])")
        await r.click("[data-auth-go='forgot']"); await r.fill("#forgot-id", "bella@demo.local")
        if os.path.exists("/tmp/shim_mail.json"): os.remove("/tmp/shim_mail.json")
        await r.click("#forgot-btn"); await r.wait_for_timeout(800)
        sent = os.path.exists("/tmp/shim_mail.json")
        check("recuperação: confirma envio do e-mail", sent and "receberá um e-mail" in await r.inner_text("#forgot-ok"))
        link = json.load(open("/tmp/shim_mail.json"))["link"]
        await r.goto(link); await r.wait_for_selector("#reset-form:not([hidden])")
        await r.fill("#reset-pass", "NovaSenha#2026"); await r.fill("#reset-pass2", "NovaSenha#2026"); await r.click("#reset-btn")
        await r.wait_for_selector("#app:not([hidden])", timeout=8000)
        check("link do e-mail abre “criar nova senha” e entra no painel", await r.is_visible("#page"))
        await r.click("[data-more]"); await r.click("#modal [data-logout]"); await r.wait_for_selector("#login-form:not([hidden])")
        await r.fill("#login-id", "bella@demo.local"); await r.fill("#login-pass", "NovaSenha#2026"); await r.click("#login-btn")
        await r.wait_for_selector("#app:not([hidden])", timeout=8000)
        check("nova senha funciona no login", await r.is_visible("#page"))
        psql("update auth.users set encrypted_password = crypt('Demo#2026', gen_salt('bf')) where email='bella@demo.local'")
        await cr.close()

        # ---------------------------------------------------------------- painel
        print("\nPainel da profissional")
        await pg.click(".tab[data-page='agenda']"); await pg.wait_for_selector("#agenda-body .appt, #agenda-body .empty, #agenda-body .free")
        await pg.click("[data-view='week']"); await pg.wait_for_timeout(700)
        await pg.screenshot(path=SHOTS + "adm-week.png")
        await pg.click("[data-view='month']"); await pg.wait_for_timeout(700)
        await pg.screenshot(path=SHOTS + "adm-month.png")
        await pg.click(f".mday[data-day='{day}']"); await pg.wait_for_timeout(700)
        txt = await pg.inner_text("#agenda-body")
        check("novos agendamentos do site aparecem na agenda do painel", "Cliente Teste" in txt and ("Primeira Cliente" in txt or "Segunda Cliente" in txt), txt[:300])
        check("agenda do dia mostra horários livres", "Horário livre" in txt)
        await pg.screenshot(path=SHOTS + "adm-day.png")
        await pg.click(f"#agenda-body .appt:has-text('Cliente Teste')"); await pg.wait_for_selector("#modal .kv")
        det = await pg.inner_text("#modal-body")
        check("detalhe mostra telefone, procedimento, valores, situação e pedido", all(k in det for k in ["(65) 99999-0000", "henna", "Sinal previsto", "Aguardando sinal", "Sem pagamento", "pediu remarcação"]), det[:400])
        await pg.screenshot(path=SHOTS + "adm-detail.png")
        await pg.click("#modal [data-act='pay']"); await pg.wait_for_selector("#py-save")
        await pg.select_option("#py-method", "pix"); await pg.fill("#py-note", "comprovante conferido"); await pg.click("#py-save")
        await pg.wait_for_timeout(1200)
        det = await pg.inner_text("#modal-body")
        check("registrar sinal manualmente confirma o agendamento", "Confirmado" in det and "Sinal pago" in det, det[:300])
        await pg.click("#modal [data-req][data-status='accepted']"); await pg.wait_for_selector("#rq-go"); await pg.click("#rq-go"); await pg.wait_for_timeout(1000)
        await pg.click("#modal [data-act='reschedule']"); await pg.wait_for_selector("#rs-slots .chip, #rs-slots .hint")
        await pg.wait_for_timeout(500)
        chips = await pg.evaluate("[...document.querySelectorAll('#rs-slots .chip')].map(c=>c.dataset.t)")
        await pg.click(f"#rs-slots .chip[data-t='{chips[-1]}']"); await pg.fill("#rs-reason", "Pedido da cliente"); await pg.click("#rs-go"); await pg.wait_for_timeout(1200)
        row2 = psql(f"select to_char(starts_at at time zone 'America/Cuiaba','HH24:MI') from appointments where code='{code}'")
        check("remarcação pelo painel usa horários livres e grava no banco", row2 == chips[-1], (row2, chips[-1]))
        hist = await pg.inner_text("#modal-body")
        check("histórico registra pedido, pagamento e remarcação", all(k in hist for k in ["Cliente pediu remarcação", "Pagamento registrado", "Remarcado de"]), hist[-500:])
        await pg.click("#modal [data-act='cancel']"); await pg.wait_for_selector("#cx-go")
        await pg.click("#cx-go"); await pg.wait_for_timeout(400)
        check("cancelar exige motivo", await pg.is_visible("#cx-go"))
        await pg.fill("#cx-reason", "Cliente desistiu"); await pg.click("#cx-go"); await pg.wait_for_timeout(1200)
        st = psql(f"select status from appointments where code='{code}'")
        check("cancelamento com motivo gravado (sinal não retido automaticamente)", st == "cancelled", st)
        await pg.click("[data-close-modal]")

        # clientes
        await pg.click(".tab[data-page='clients']"); await pg.wait_for_selector("#cl-list .row")
        await pg.fill("#cl-q", "99999-0000"); await pg.wait_for_timeout(900)
        names = await pg.evaluate("[...document.querySelectorAll('#cl-list .row strong')].map(x=>x.textContent)")
        check("busca de clientes por telefone", names == ["Cliente Teste"], names)
        await pg.fill("#cl-q", "Ana"); await pg.wait_for_timeout(900)
        await pg.click("#cl-list .row"); await pg.wait_for_selector("#cl-notes")
        ctext = await pg.inner_text("#modal-body")
        check("ficha da cliente mostra histórico, procedimentos e valores pagos", "Procedimentos realizados" in ctext and "Valores pagos" in ctext and "Histórico" in ctext)
        await pg.screenshot(path=SHOTS + "adm-client.png")
        await pg.click("[data-close-modal]")

        # pagamentos
        await pg.click(".tab[data-page='payments']"); await pg.wait_for_selector("#pay-stats .stat")
        ptxt = await pg.inner_text("#page")
        check("financeiro mostra recebidos, sinais, Pix, cartão e pendentes", all(k in ptxt for k in ["Recebido no período", "Sinais pagos", "Via Pix", "Via cartão", "Pendente"]))
        await pg.select_option("#pf-method", "card"); await pg.wait_for_timeout(900)
        methods = await pg.evaluate("[...document.querySelectorAll('#pay-list .row small')].map(x=>x.textContent.split(' · ')[0])")
        check("filtro por forma de pagamento", methods and all(m == "Cartão" for m in methods), methods)
        await pg.click("[data-ptab='open']"); await pg.wait_for_timeout(900)
        await pg.screenshot(path=SHOTS + "adm-payments.png")

        # procedimentos
        await pg.click("[data-more]"); await pg.click("#modal [data-page='services']"); await pg.wait_for_selector("#sv-new")
        await pg.click("#sv-new"); await pg.fill("#sv-name", "Tintura de cílios"); await pg.fill("#sv-desc", "Cor intensa para os cílios naturais.")
        await pg.fill("#sv-price", "50"); await pg.fill("#sv-dur", "30")
        await pg.set_input_files("#sv-img-file", os.path.join(os.path.dirname(__file__), "fixtures", "foto-teste.png"))
        await pg.wait_for_timeout(1200)
        up = await pg.input_value("#sv-img")
        check("envio de foto vai para o Storage da conta (pasta da profissional)", "/storage/v1/object/public/tenant-assets/" in up, up)
        await pg.click("#sv-save"); await pg.wait_for_timeout(1000)
        check("novo procedimento cadastrado no painel", "Tintura de cílios" in await pg.inner_text("#page"))
        await pg.screenshot(path=SHOTS + "adm-services.png")

        # horários: abrir domingo de manhã
        await pg.click("[data-more]"); await pg.click("#modal [data-page='hours']"); await pg.wait_for_selector("#hours-save")
        await pg.check(".wk-day[data-wd='0'] [data-on]", force=True)
        sun = pg.locator(".wk-day[data-wd='0'] .wk-period").first
        await sun.locator("[data-s]").fill("09:00"); await sun.locator("[data-e]").fill("12:00")
        await pg.click("#hours-save"); await pg.wait_for_timeout(1200)
        wk = psql("select string_agg(weekday||' '||start_time||'-'||end_time, ',') from business_hours h join tenants t on t.id=h.tenant_id where t.slug='bella' and weekday=0")
        check("horário de domingo salvo", wk == "0 09:00:00-12:00:00", wk)
        await pg.screenshot(path=SHOTS + "adm-hours.png", full_page=True)

        # personalização
        await pg.click("[data-more]"); await pg.click("#modal [data-page='site']"); await pg.wait_for_selector("#pf-save")
        await pg.fill("#pf-tagline", "Sobrancelhas e cílios com cuidado de verdade.")
        await pg.click(".swatch[data-preset='1']"); await pg.click("#pf-save"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=SHOTS + "adm-site.png")

        # o site público reflete tudo
        cp = await new_ctx(b); sp = await cp.new_page(); watch(sp, errs)
        await sp.goto(SITE); await sp.wait_for_selector("body.is-ready")
        tag = await sp.inner_text(".tagline"); col = await sp.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--rose').trim()")
        svcs = await sp.evaluate("[...document.querySelectorAll('#services-list h3')].map(x=>x.textContent)")
        check("site público mostra nova frase e nova cor", tag.startswith("Sobrancelhas e cílios com cuidado") and col == "#7d6aa8", (tag, col))
        check("site público mostra o novo procedimento", "Tintura de cílios" in svcs, svcs)
        await sp.click(".btn-agenda"); await sp.click("label.pick:has-text('Tintura de cílios')"); await sp.click("#btn-next"); await sp.wait_for_timeout(400)
        sundays = await sp.evaluate("[...document.querySelectorAll('.day')].filter(d=>new Date(d.dataset.date+'T12:00').getDay()===0).map(d=>d.className)")
        check("domingo aberto no painel fica disponível na agenda pública", any("st-available" in c for c in sundays), sundays[:3])
        await sp.screenshot(path=SHOTS + "pub-after-admin.png")
        await cp.close()

        # isolamento no navegador: Lumi não vê Bella
        print("\nIsolamento entre profissionais")
        cl = await new_ctx(b, mobile=False); lp = await cl.new_page(); watch(lp, errs)
        await lp.goto(SITE + "admin/?p=lumi-nails"); await lp.wait_for_selector("#login-form:not([hidden])")
        lbrand = await lp.inner_text("#auth-name"); lcol = await lp.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--p').trim()")
        check("login da Lumi tem identidade própria (nome e cor)", lbrand == "Lumi" and lcol == "#7d6aa8", (lbrand, lcol))
        await lp.screenshot(path=SHOTS + "adm-login-lumi-desktop.png")
        await lp.fill("#login-id", "lumi@demo.local"); await lp.fill("#login-pass", "Demo#2026"); await lp.click("#login-btn")
        await lp.wait_for_selector(".stat"); await lp.wait_for_timeout(500)
        await lp.click(".side-item[data-page='clients']"); await lp.wait_for_selector("#cl-list .row")
        lnames = await lp.evaluate("[...document.querySelectorAll('#cl-list .row strong')].map(x=>x.textContent)")
        check("Lumi vê só as próprias clientes", sorted(lnames) == ["Gabriela Exemplo", "Helena Demonstração"], lnames)
        # tentar abrir o painel da Bella logada como Lumi
        await lp.goto(SITE + "admin/?p=bella"); await lp.wait_for_selector(".stat"); await lp.wait_for_timeout(500)
        check("com login da Lumi, ?p=bella continua mostrando só a Lumi", "Lumi" in await lp.inner_text("#side-name"))
        tid_b = psql("select id from tenants where slug='bella'")
        forged = await lp.evaluate(f"Bella.api.rpc('admin_clients', {{tenant_id: '{tid_b}'}}).then(()=>'VAZOU', e=>e.message)")
        check("requisição forjada para dados da Bella é recusada pelo servidor", "Acesso negado" in forged, forged)
        await lp.screenshot(path=SHOTS + "adm-lumi-desktop.png")
        await lp.click(".side-item[data-page='agenda']"); await lp.wait_for_timeout(800)
        await lp.click("[data-view='week']"); await lp.wait_for_timeout(800)
        await lp.screenshot(path=SHOTS + "adm-lumi-week-desktop.png")
        await cl.close()

        # desktop da Bella
        cd = await new_ctx(b, mobile=False); dp = await cd.new_page(); watch(dp, errs)
        await dp.goto(SITE + "admin/?p=bella"); await dp.wait_for_selector("#login-form:not([hidden])")
        await dp.screenshot(path=SHOTS + "adm-login-bella-desktop.png")
        await dp.fill("#login-id", "bella@demo.local"); await dp.fill("#login-pass", "Demo#2026"); await dp.click("#login-btn")
        await dp.wait_for_selector(".stat"); await dp.wait_for_timeout(500)
        await dp.screenshot(path=SHOTS + "adm-overview-desktop.png")
        await dp.click(".side-item[data-page='agenda']"); await dp.wait_for_timeout(500); await dp.click("[data-view='month']"); await dp.wait_for_timeout(800)
        await dp.screenshot(path=SHOTS + "adm-month-desktop.png")
        sp2 = await cd.new_page(); await sp2.goto(SITE); await sp2.wait_for_selector("body.is-ready")
        await sp2.screenshot(path=SHOTS + "pub-home-desktop.png")
        overflow = await sp2.evaluate("document.documentElement.scrollWidth > innerWidth")
        check("site público sem rolagem lateral no computador", not overflow)
        await cd.close()

        relevant = [e for e in errs if "net::" not in e and "ERR_" not in e]
        check("nenhum erro de JavaScript em todas as telas", not relevant, relevant[:5])
        await b.close()
    reset_state()

    ok = sum(1 for _, c in results if c)
    print(f"\n{ok} de {len(results)} verificações passaram.")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    asyncio.run(main())
