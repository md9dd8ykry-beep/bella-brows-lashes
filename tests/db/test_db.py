"""
Testes do banco (segurança, isolamento entre profissionais, regras e concorrência).
Rodam contra um PostgreSQL local que emula o Supabase (tests/db/00_supabase_local.sql).

Uso:  PGHOST=... PGPORT=... PGUSER=postgres python3 tests/db/test_db.py
"""
import json, os, subprocess, sys, threading, datetime

DB = os.environ.get("PGDATABASE", "plat")
ok = 0
fails = []


def psql(sql, role=None, uid=None):
    pre = ""
    if role:
        pre += f"set role {role};"
    if uid:
        pre += f"select set_config('request.jwt.claims', '{json.dumps({'sub': uid, 'role': 'authenticated'})}', false);"
    r = subprocess.run(["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c", pre + sql],
                       capture_output=True, text=True)
    out = r.stdout.strip().splitlines()
    return (r.returncode == 0, (out[-1] if out else ""), r.stderr.strip())


def rpc(fn, p, role="anon", uid=None):
    lit = json.dumps(p).replace("'", "''")
    good, out, err = psql(f"select public.{fn}('{lit}'::jsonb);", role, uid)
    return good, (json.loads(out) if good and out else None), err


def check(name, cond, info=""):
    global ok
    if cond:
        ok += 1
        print("  ✓", name)
    else:
        fails.append(name)
        print("  ✗", name, "→", info)


def setup_users():
    psql("delete from public.tenant_members; delete from auth.users;")
    ids = {}
    for email in ("bella@demo.local", "lumi@demo.local"):
        _, out, _ = psql(f"insert into auth.users(email, encrypted_password) values ('{email}', crypt('Demo#2026', gen_salt('bf'))) returning id;")
        ids[email] = out
    psql("select app.link_owner('bella@demo.local','bella','(00) 98888-0001'); select app.link_owner('lumi@demo.local','lumi-nails');")
    psql("select app.seed_demo('');")
    _, b, _ = psql("select id from tenants where slug='bella'")
    _, l, _ = psql("select id from tenants where slug='lumi-nails'")
    return ids["bella@demo.local"], ids["lumi@demo.local"], b, l


def next_open_day(weekdays, skip=0):
    d = datetime.date.today()
    n = 0
    while True:
        d += datetime.timedelta(days=1)
        if d.isoweekday() % 7 in weekdays:
            if n >= skip:
                return d.isoformat()
            n += 1


def main():
    UB, UL, TB, TL = setup_users()
    print("\nAcesso anônimo (site público)")
    g, site, e = rpc("public_site", {"slug": "bella"})
    check("public_site devolve perfil, serviços e regras", g and len(site["services"]) == 4 and site["tenant"]["name"] == "Bella Brows & Lashes", e)
    check("public_site não expõe dados privados", g and "clients" not in json.dumps(site) and "phone_digits" not in json.dumps(site))
    g, busy, e = rpc("public_busy", {"slug": "bella"})
    keys = set(k for b in busy["bookings"] for k in b) if g else set()
    check("public_busy só traz data/hora/duração (sem nome/telefone)", g and keys == {"date", "start", "durationMin"} and len(busy["bookings"]) > 0, keys)
    check("anon não lê tabela de agendamentos", not psql("select count(*) from appointments", "anon")[0])
    check("anon não lê clientes", not psql("select count(*) from clients", "anon")[0])
    check("anon não executa funções do painel", not rpc("admin_overview", {"tenant_id": TB})[0])
    check("anon não executa app.link_owner", not psql("select app.link_owner('x','bella')", "anon")[0])
    check("anon não executa app.seed_demo", not psql("select app.seed_demo()", "anon")[0])
    g, r, e = rpc("public_site", {"slug": "nao-existe"})
    check("perfil inexistente → erro", not g and "não encontrada" in e, e)

    print("\nLogin e isolamento entre profissionais")
    g, me, e = rpc("admin_me", {}, "authenticated", UB)
    check("admin_me lista só a conta da Bella", g and [t["slug"] for t in me["tenants"]] == ["bella"], me)
    g, ov, e = rpc("admin_overview", {"tenant_id": TB}, "authenticated", UB)
    check("Bella vê a própria visão geral", g and ov["week_count"] >= 0 and len(ov["upcoming"]) > 0, e)
    g, _, e = rpc("admin_overview", {"tenant_id": TL}, "authenticated", UB)
    check("Bella NÃO acessa visão geral da Lumi", not g and "Acesso negado" in e, e)
    g, _, e = rpc("admin_clients", {"tenant_id": TL}, "authenticated", UB)
    check("Bella NÃO lista clientes da Lumi", not g and "Acesso negado" in e, e)
    _, n, _ = psql("select count(*) from appointments", "authenticated", UB)
    _, nb, _ = psql(f"select count(*) from appointments where tenant_id='{TB}'")
    check("RLS: leitura direta da tabela só retorna linhas da Bella", n == nb, (n, nb))
    _, n, _ = psql(f"select count(*) from clients where tenant_id='{TL}'", "authenticated", UB)
    check("RLS: filtrar por tenant da Lumi retorna 0", n == "0", n)
    _, n, _ = psql(f"with u as (update appointments set status='cancelled' where tenant_id='{TL}' returning 1) select count(*) from u", "authenticated", UB)
    check("RLS: Bella não altera agendamentos da Lumi", n == "0", n)
    g, _, e = psql(f"insert into clients(tenant_id,name,phone,phone_digits) values ('{TL}','Intrusa','1','1')", "authenticated", UB)
    check("RLS: Bella não insere dados na conta da Lumi", not g and "row-level security" in e, e)
    g, _, e = psql(f"update tenants set status='suspended', plan_id='pro' where id='{TB}'", "authenticated", UB)
    check("profissional não altera o próprio plano/status", not g and "permission denied" in e, e)
    g, _, e = psql(f"insert into tenant_members(tenant_id,user_id) values ('{TL}','{UB}')", "authenticated", UB)
    check("profissional não se adiciona em outra conta", not g, e)
    g, me, e = rpc("admin_me", {}, "authenticated", UL)
    check("Lumi vê só a própria conta", g and [t["slug"] for t in me["tenants"]] == ["lumi-nails"])
    g, ap, e = rpc("admin_appointments", {"tenant_id": TL, "from": "2000-01-01", "to": "2100-01-01"}, "authenticated", UL)
    check("Lumi vê os 3 agendamentos dela (e nenhum da Bella)", g and len(ap) == 3, len(ap or []))
    g, r, e = rpc("public_login_email", {"slug": "bella", "phone": "00 98888-0001"})
    check("login por telefone encontra o e-mail da profissional", g and r["email"] == "bella@demo.local", r)
    g, r, e = rpc("public_login_email", {"slug": "lumi-nails", "phone": "00 98888-0001"})
    check("telefone da Bella não abre a conta da Lumi", g and r["email"] is None, r)

    print("\nAgendamento pelo site (validações no servidor)")
    sv = {s["name"]: s["id"] for s in site["services"]}
    day = next_open_day({1, 2, 3, 4, 5, 6}, skip=8)
    base = {"slug": "bella", "date": day, "name": "Teste Cliente", "phone": "(65) 99999-0000", "accept_policy": True}
    g, bk, e = rpc("public_book", {**base, "start": "13:30", "service_ids": [sv["Design simples de sobrancelha"], sv["Brow Lamination"]]})
    check("reserva de 2 procedimentos (100 min) criada", g and bk["duration_min"] == 100 and bk["end"] == "15:10" and float(bk["total"]) == 165, e or bk)
    check("sinal de 50% calculado no servidor", g and float(bk["deposit_due"]) == 82.5)
    code = bk["code"] if g else ""
    g, _, e = rpc("public_book", {**base, "phone": "(65) 98888-1111", "start": "13:30", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("mesmo horário → SLOT_TAKEN", not g and "acabou de ser reservado" in e, e)
    g, _, e = rpc("public_book", {**base, "phone": "(65) 98888-1111", "start": "15:15", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("encostado no fim sem respeitar o preparo de 10 min → bloqueado", not g and "reservado" in e, e)
    g, _, e = rpc("public_book", {**base, "phone": "(65) 98888-1111", "start": "15:20", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("após o preparo de 10 min → permitido", g, e)
    g, _, e = rpc("public_book", {**base, "start": "10:45", "service_ids": [sv["Extensão de cílios"]]})
    check("atendimento que atravessa o almoço → recusado", not g and "fora do expediente" in e, e)
    sunday = next_open_day({0})
    g, _, e = rpc("public_book", {**base, "date": sunday, "start": "09:00", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("domingo (sem expediente) → recusado", not g and "fora do expediente" in e, e)
    _, off, _ = psql(f"select to_char(starts_at at time zone 'America/Cuiaba','YYYY-MM-DD') from time_off where tenant_id='{TB}' and kind='folga'")
    g, _, e = rpc("public_book", {**base, "date": off, "start": "08:00", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("dia de folga bloqueado → recusado", not g and "bloqueado" in e, e)
    _, lumi_svc, _ = psql(f"select id from services where tenant_id='{TL}' limit 1")
    g, _, e = rpc("public_book", {**base, "start": "08:00", "service_ids": [lumi_svc]})
    check("serviço de outra profissional → recusado", not g and "indisponível" in e, e)
    g, _, e = rpc("public_book", {**base, "start": "08:00", "accept_policy": False, "service_ids": [sv["Design simples de sobrancelha"]]})
    check("sem aceitar a política de cancelamento → recusado", not g and "política" in e, e)
    g, _, e = rpc("public_book", {**base, "date": "2001-01-01", "start": "08:00", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("data no passado → recusada", not g and "fora do período" in e, e)
    g, _, e = rpc("public_book", {**base, "name": "Ana", "start": "08:00", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("nome sem sobrenome → recusado", not g and "sobrenome" in e, e)

    print("\nConcorrência: duas clientes no mesmo horário ao mesmo tempo")
    res = []
    lit = lambda p: json.dumps(p).replace("'", "''")

    def worker(phone):
        p = {**base, "phone": phone, "start": "08:00", "service_ids": [sv["Design de sobrancelha com henna"]]}
        r = subprocess.run(["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c",
                            f"set role anon; begin; select public.public_book('{lit(p)}'::jsonb); select pg_sleep(1.5); commit;"],
                           capture_output=True, text=True)
        res.append((r.returncode, r.stderr.strip()))
    ths = [threading.Thread(target=worker, args=(f"(65) 97777-000{i}",)) for i in range(2)]
    [t.start() for t in ths]
    [t.join() for t in ths]
    wins = [r for r in res if r[0] == 0]
    loses = [r for r in res if r[0] != 0]
    check("exatamente uma reserva vence e a outra recebe SLOT_TAKEN", len(wins) == 1 and len(loses) == 1 and "reservado" in loses[0][1], res)
    # 8 tentativas simultâneas
    res.clear()
    ths = [threading.Thread(target=worker, args=(f"(65) 96666-00{i:02d}",)) for i in range(8)]
    base["start"] = "08:00"
    [t.start() for t in ths]
    [t.join() for t in ths]
    check("8 tentativas simultâneas no mesmo horário já ocupado → nenhuma passa", all(r[0] != 0 for r in res), res[:2])
    _, n, _ = psql(f"""select count(*) from appointments a join appointments b on a.tenant_id=b.tenant_id and a.id<b.id
                      and a.status in ('pending','confirmed','completed') and b.status in ('pending','confirmed','completed')
                      and tstzrange(a.starts_at,a.block_until) && tstzrange(b.starts_at,b.block_until)""")
    check("nenhuma sobreposição existe no banco", n == "0", n)

    print("\nPainel: pagamentos, status, remarcação e histórico")
    _, aid, _ = psql(f"select id from appointments where tenant_id='{TB}' and code='{code}'")
    g, det, e = rpc("admin_appointment", {"tenant_id": TB, "id": aid}, "authenticated", UB)
    check("novo agendamento do site aparece no painel", g and det["code"] == code and det["client"]["name"] == "Teste Cliente" and det["status"] == "pending", e)
    check("pagamento NÃO é marcado como recebido automaticamente", g and det["payment_status"] == "unpaid" and float(det["paid"]) == 0)
    g, _, e = rpc("admin_record_payment", {"tenant_id": TB, "appointment_id": aid, "kind": "deposit", "method": "pix", "amount": 82.5, "note": "comprovante conferido"}, "authenticated", UB)
    g2, det, _ = rpc("admin_appointment", {"tenant_id": TB, "id": aid}, "authenticated", UB)
    check("registro manual do sinal (Pix) → confirmado", g and det["status"] == "confirmed" and det["payment_status"] == "deposit_paid" and float(det["remaining"]) == 82.5, e or det)
    g, _, e = rpc("admin_record_payment", {"tenant_id": TB, "appointment_id": aid, "kind": "deposit", "method": "pix", "amount": 10}, "authenticated", UL)
    check("Lumi não registra pagamento em agendamento da Bella", not g, e)
    g, _, e = rpc("admin_set_status", {"tenant_id": TB, "id": aid, "status": "cancelled"}, "authenticated", UB)
    check("cancelar sem motivo → recusado", not g and "motivo" in e, e)
    g, _, e = rpc("admin_set_status", {"tenant_id": TB, "id": aid, "status": "cancelled", "reason": "Cliente pediu"}, "authenticated", UB)
    check("cancelamento com motivo registrado", g, e)
    g, _, e = rpc("public_book", {**base, "phone": "(65) 95555-0000", "start": "13:30", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("horário cancelado volta a ficar livre", g, e)
    g, _, e = rpc("admin_set_status", {"tenant_id": TB, "id": aid, "status": "confirmed"}, "authenticated", UB)
    check("reativar cancelado em horário já ocupado → recusado", not g and "ocupado" in e, e)
    _, a2, _ = psql(f"select id from appointments where tenant_id='{TB}' and status='pending' and starts_at>now() order by starts_at limit 1")
    g, _, e = rpc("admin_reschedule", {"tenant_id": TB, "id": a2, "date": day, "start": "07:00", "reason": "Pedido da cliente"}, "authenticated", UB)
    check("remarcação para horário livre", g, e)
    g, _, e = rpc("admin_reschedule", {"tenant_id": TB, "id": a2, "date": day, "start": "13:45", "reason": "x"}, "authenticated", UB)
    check("remarcação para horário ocupado → recusada", not g and "conflita" in e, e)
    g, det, _ = rpc("admin_appointment", {"tenant_id": TB, "id": aid}, "authenticated", UB)
    types = [ev["type"] for ev in det["events"]]
    check("histórico registra criação, pagamento e mudanças de status", types[:1] == ["created"] and "payment_confirmed" in types and types.count("status_changed") >= 2, types)
    g, pay, e = rpc("admin_payments", {"tenant_id": TB}, "authenticated", UB)
    methods = {y["method"] for y in pay["payments"]} if g else set()
    check("financeiro lista pagamentos Pix e cartão e valores em aberto", g and {"pix", "card"} <= methods and len(pay["open"]) > 0, e or methods)

    print("\nCancelamento/remarcação solicitados pela cliente")
    _, pc, _ = psql(f"select a.code || '|' || c.phone from appointments a join clients c on c.id=a.client_id where a.tenant_id='{TB}' and a.status='confirmed' and a.starts_at>now() and not exists(select 1 from change_requests r where r.appointment_id=a.id) order by a.starts_at limit 1")
    pcode, pphone = pc.split("|")
    g, _, e = rpc("public_request_change", {"slug": "bella", "code": pcode, "phone": "(00) 11111-1111", "type": "cancel"})
    check("protocolo com telefone errado → não encontrado", not g and "Não encontramos" in e, e)
    g, r, e = rpc("public_request_change", {"slug": "bella", "code": pcode.lower(), "phone": pphone, "type": "cancel", "reason": "Viagem"})
    check("cliente solicita cancelamento com protocolo + telefone", g and r["ok"], e)
    g, _, e = rpc("public_request_change", {"slug": "bella", "code": pcode, "phone": pphone, "type": "reschedule"})
    check("segunda solicitação em aberto → recusada", not g and "em análise" in e, e)
    g, rq, e = rpc("admin_requests", {"tenant_id": TB}, "authenticated", UB)
    mine = [x for x in rq["requests"] if x["appointment"]["code"] == pcode] if g else []
    check("solicitação aparece no painel com o motivo", mine and mine[0]["reason"] == "Viagem" and mine[0]["status"] == "open", e)
    g, _, e = rpc("admin_resolve_request", {"tenant_id": TB, "id": mine[0]["id"], "status": "accepted", "response": "Ok"}, "authenticated", UB)
    _, st, _ = psql(f"select status from appointments where tenant_id='{TB}' and code='{pcode}'")
    check("aceitar solicitação NÃO cancela nem retém sinal sozinho (a profissional decide)", g and st == "confirmed", (e, st))
    g, rq, e = rpc("admin_requests", {"tenant_id": TL}, "authenticated", UL)
    check("Lumi não vê solicitações da Bella", g and all(x["appointment"]["code"] != pcode for x in rq["requests"]))

    print("\nProcedimentos e horários refletem no site público")
    g, r, e = rpc("admin_save_service", {"tenant_id": TB, "service": {"name": "Tintura de cílios", "description": "Teste", "price": 50, "duration_min": 30}}, "authenticated", UB)
    g2, site2, _ = rpc("public_site", {"slug": "bella"})
    check("novo procedimento aparece no site público", g and any(s["name"] == "Tintura de cílios" for s in site2["services"]), e)
    new_id = r["id"]
    g, _, e = rpc("admin_save_service", {"tenant_id": TB, "service": {"id": new_id, "name": "Tintura de cílios", "price": 55, "duration_min": 30, "active": False}}, "authenticated", UB)
    g2, site2, _ = rpc("public_site", {"slug": "bella"})
    check("procedimento desativado some do site", g and not any(s["name"] == "Tintura de cílios" for s in site2["services"]), e)
    g, _, e = rpc("admin_save_service", {"tenant_id": TB, "service": {"name": "X", "price": 10, "duration_min": 30}}, "authenticated", UB)
    check("validação: nome curto recusado", not g, e)
    g, _, e = rpc("admin_delete_service", {"tenant_id": TB, "id": new_id}, "authenticated", UL)
    _, n, _ = psql(f"select count(*) from services where id='{new_id}'")
    check("Lumi não exclui procedimento da Bella", n == "1")
    g, _, e = rpc("admin_delete_service", {"tenant_id": TB, "id": new_id}, "authenticated", UB)
    check("Bella exclui o próprio procedimento", g)
    weekly = [{"weekday": w, "start": "09:00", "end": "12:00"} for w in (1, 2, 3, 4, 5)] + [{"weekday": w, "start": "13:00", "end": "18:00"} for w in (1, 2, 3, 4, 5)]
    g, _, e = rpc("admin_save_hours", {"tenant_id": TB, "weekly": weekly, "settings": {"buffer_min": 15, "deposit_percent": 30}}, "authenticated", UB)
    g2, site3, _ = rpc("public_site", {"slug": "bella"})
    check("novos horários e regras chegam ao site", g and not any(w["weekday"] == 6 for w in site3["agenda"]["weekly"]) and site3["agenda"]["deposit_percent"] == 30, e)
    sat = next_open_day({6}, skip=2)
    g, _, e = rpc("public_book", {**base, "date": sat, "start": "09:00", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("sábado fechado passa a recusar reservas", not g and "fora do expediente" in e, e)
    g, _, e = rpc("admin_save_hours", {"tenant_id": TB, "weekly": [{"weekday": 1, "start": "09:00", "end": "12:00"}, {"weekday": 1, "start": "11:00", "end": "13:00"}]}, "authenticated", UB)
    check("períodos sobrepostos são recusados", not g and "sobrepostos" in e, e)
    g, _, e = rpc("admin_save_special_day", {"tenant_id": TB, "date": sat, "periods": [{"start": "08:00", "end": "12:00"}], "note": "Sábado especial"}, "authenticated", UB)
    g2, _, e2 = rpc("public_book", {**base, "date": sat, "start": "09:00", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("data especial abre um sábado excepcional", g and g2, (e, e2))
    g, r, e = rpc("admin_add_time_off", {"tenant_id": TB, "start": sat + " 00:00", "end": sat + " 23:59", "kind": "ferias", "reason": "Férias"}, "authenticated", UB)
    check("férias avisam sobre agendamentos já existentes no período", g and r["conflicting_appointments"] == 1, r or e)
    g2, _, e2 = rpc("public_book", {**base, "phone": "(65) 94444-0000", "date": sat, "start": "10:30", "service_ids": [sv["Design simples de sobrancelha"]]})
    check("férias bloqueiam novas reservas", not g2 and "bloqueado" in e2, e2)
    g, _, e = rpc("admin_save_profile", {"tenant_id": TB, "profile": {"name": "Bella Brows & Lashes", "tagline": "Nova frase", "theme": {"primary": "#aa5566"}}}, "authenticated", UB)
    g2, site4, _ = rpc("public_site", {"slug": "bella"})
    check("personalização (frase e cores) chega ao site", g and site4["tenant"]["tagline"] == "Nova frase" and site4["tenant"]["theme"]["primary"] == "#aa5566", e)

    psql("select app.seed_demo('');")
    print(f"\n{ok} testes passaram, {len(fails)} falharam.")
    if fails:
        print("Falhas:", *fails, sep="\n - ")
        sys.exit(1)


if __name__ == "__main__":
    main()
