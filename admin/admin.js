/**
 * PAINEL DA PROFISSIONAL
 * ------------------------------------------------------------------
 * Toda leitura/escrita passa por funções do banco (admin_*), que exigem
 * login real (Supabase Auth) e verificam, no servidor, se a usuária é
 * membro da conta. O JavaScript daqui NÃO é a proteção dos dados — as
 * políticas de Row Level Security do banco é que são.
 */
(function (root) {
  "use strict";
  var B = root.Bella, S = B.scheduler, ui = B.ui, api = B.api;
  var $ = function (id) { return document.getElementById(id); };
  var esc = ui.esc, money = ui.money;
  var params = new URLSearchParams(root.location.search);
  var slug = (params.get("p") || (B.platform && B.platform.defaultSlug) || "bella").toLowerCase();

  var state = { me: null, tenant: null, settings: null, page: "overview", agenda: { view: "day", date: null, filter: "all" } };

  var STATUS = { pending: "Aguardando sinal", confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado", no_show: "Não compareceu" };
  var PAY = { unpaid: "Sem pagamento", partial: "Pagamento parcial", deposit_paid: "Sinal pago", paid: "Pago" };
  var METHOD = { pix: "Pix", card: "Cartão", cash: "Dinheiro", transfer: "Transferência", other: "Outro" };
  var KIND = { deposit: "Sinal", balance: "Restante", full: "Valor total", refund: "Devolução" };
  var EVENT = {
    created: "Agendamento feito pela cliente", status_changed: "Situação alterada", rescheduled: "Remarcado",
    payment_confirmed: "Pagamento registrado", payment_voided: "Pagamento estornado",
    cancel_requested: "Cliente pediu cancelamento", reschedule_requested: "Cliente pediu remarcação",
    request_accepted: "Solicitação aceita", request_declined: "Solicitação recusada"
  };
  var WD = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  var WDS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var PAGES = [
    { id: "overview", label: "Visão geral", short: "Início", icon: "i-home", main: true },
    { id: "agenda", label: "Minha agenda", short: "Agenda", icon: "i-cal", main: true },
    { id: "clients", label: "Clientes", short: "Clientes", icon: "i-users", main: true },
    { id: "payments", label: "Pagamentos", short: "Pagamentos", icon: "i-money", main: true },
    { id: "requests", label: "Solicitações", short: "Pedidos", icon: "i-bell" },
    { id: "services", label: "Procedimentos e valores", short: "Procedimentos", icon: "i-list" },
    { id: "hours", label: "Horários de atendimento", short: "Horários", icon: "i-clock" },
    { id: "site", label: "Personalização do site", short: "Meu site", icon: "i-brush" }
  ];

  /* ============================================================ utilidades */
  function rpc(fn, p) {
    var body = Object.assign({ tenant_id: state.tenant && state.tenant.id }, p || {});
    return api.rpc(fn, body).catch(function (e) {
      if (e.code === "AUTH" || e.status === 401) { logout(true); }
      throw e;
    });
  }
  function toast(msg, isErr) {
    var t = $("toast"); t.textContent = msg; t.classList.toggle("err", !!isErr); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, isErr ? 4200 : 2600);
  }
  function fail(e) { toast(e && e.message ? e.message : "Algo deu errado.", true); }
  function todayKey() { return state.today || S.dateKey(new Date()); }
  function addDays(key, n) { return S.dateKey(S.addDays(S.parseKey(key), n)); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function shortDate(key) { var d = S.parseKey(key); return WDS[d.getDay()] + ", " + d.getDate() + "/" + S.pad(d.getMonth() + 1); }
  function dateTime(iso) {
    var d = new Date(iso);
    return S.pad(d.getDate()) + "/" + S.pad(d.getMonth() + 1) + " " + S.pad(d.getHours()) + ":" + S.pad(d.getMinutes());
  }
  function asset(u) { if (!u) return ""; return /^(https?:|data:|blob:)/.test(u) ? u : "../" + u.replace(/^\.?\//, ""); }
  function imgTag(src, cls) {
    return '<img ' + (cls ? 'class="' + cls + '" ' : "") + 'src="' + esc(asset(src) || "../assets/img/placeholder.svg") +
      '" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'../assets/img/placeholder.svg\'">';
  }
  function waClient(phone, msg) {
    var d = String(phone || "").replace(/\D/g, "");
    if (d.length <= 11) d = "55" + d;
    return "https://wa.me/" + d + (msg ? "?text=" + encodeURIComponent(msg) : "");
  }
  function initials(name) { return String(name || "?").split(" ").filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase(); }
  function badge(kind, value, map) { return '<span class="badge b-' + esc(value) + '">' + esc((map || {})[value] || value) + "</span>"; }
  function svcNames(a) { return (a.services || []).map(function (s) { return s.name; }).join(" + "); }
  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label || "Salvando…"; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  /* ============================================================ tema */
  function applyTheme(th, logo, hero) {
    th = th || {};
    var map = { primary: "--p", primaryDeep: "--p-deep", soft: "--p-soft", accent: "--accent", bg: "--bg", ink: "--ink" };
    Object.keys(map).forEach(function (k) {
      if (th[k] && /^#[0-9a-f]{3,8}$/i.test(th[k])) document.documentElement.style.setProperty(map[k], th[k]);
    });
    if (th.bg) document.querySelector('meta[name="theme-color"]').setAttribute("content", th.bg);
    var lg = asset(logo) || "../assets/img/logo-marca.svg";
    ["auth-logo", "side-logo", "top-logo"].forEach(function (id) { $(id).src = lg; $(id).onerror = function () { this.src = "../assets/img/logo-marca.svg"; }; });
    document.querySelector('link[rel="icon"]').href = lg;
    var h = $("auth-hero");
    $("auth").classList.toggle("no-art", !hero);
    if (hero) { h.src = asset(hero); h.onerror = function () { $("auth").classList.add("no-art"); }; }
  }

  /* ============================================================ LOGIN */
  function showAuth(view) {
    $("app").hidden = true; $("auth").hidden = false;
    document.querySelectorAll("[data-auth]").forEach(function (v) { v.hidden = v.dataset.auth !== view; });
    document.body.classList.remove("is-loading");
    var f = document.querySelector('[data-auth="' + view + '"] input');
    if (f) setTimeout(function () { f.focus(); }, 50);
  }

  function loadBranding() {
    $("auth-site").href = "../?p=" + encodeURIComponent(slug);
    $("offline-site").href = "../?p=" + encodeURIComponent(slug);
    if (!api) { applyTheme({}, null, null); return Promise.resolve(); }
    return api.rpc("public_site", { slug: slug }).then(function (site) {
      var t = site.tenant, th = t.theme || {};
      state.brand = t;
      applyTheme(th, t.logo_url, t.hero_url);
      $("auth-name").textContent = th.wordmark || t.name;
      $("auth-sub").textContent = th.subtitle || "Área da profissional";
      document.title = "Entrar · " + t.name;
    }).catch(function () {
      // perfil inexistente: login neutro (a conta é identificada pelo login)
      $("auth-sub").textContent = "Área da profissional";
    });
  }

  function resolveEmail(id) {
    id = id.trim();
    if (id.indexOf("@") !== -1) return Promise.resolve(id.toLowerCase());
    if (id.replace(/\D/g, "").length < 10) return Promise.reject(new Error("Informe o e-mail ou o telefone com DDD."));
    return api.rpc("public_login_email", { slug: slug, phone: id }).then(function (r) {
      if (!r || !r.email) throw new Error("Não encontramos acesso com esse telefone nesta conta.");
      return r.email;
    });
  }

  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("login-error"), btn = $("login-btn");
    err.hidden = true;
    var id = $("login-id").value, pw = $("login-pass").value;
    if (!id.trim() || !pw) { err.textContent = "Preencha o acesso e a senha."; err.hidden = false; return; }
    setBusy(btn, true, "Entrando…");
    resolveEmail(id).then(function (email) { return api.auth.signIn(email, pw); })
      .then(function () { $("login-pass").value = ""; return enter(); })
      .catch(function (e2) { err.textContent = e2.message; err.hidden = false; })
      .then(function () { setBusy(btn, false); });
  });

  $("forgot-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("forgot-error"), ok = $("forgot-ok"), btn = $("forgot-btn");
    err.hidden = true; ok.hidden = true;
    setBusy(btn, true, "Enviando…");
    var back = root.location.origin + root.location.pathname + "?p=" + encodeURIComponent(slug);
    resolveEmail($("forgot-id").value)
      .then(function (email) { return api.auth.recover(email, back); })
      .then(function () {
        ok.textContent = "Se houver uma conta com esse acesso, você receberá um e-mail com o link para criar uma nova senha. Confira também a caixa de spam.";
        ok.hidden = false;
      })
      .catch(function (e2) { err.textContent = e2.message; err.hidden = false; })
      .then(function () { setBusy(btn, false); });
  });

  $("reset-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("reset-error"), btn = $("reset-btn");
    var a = $("reset-pass").value, b = $("reset-pass2").value;
    err.hidden = true;
    if (a.length < 8) { err.textContent = "A senha precisa ter pelo menos 8 caracteres."; err.hidden = false; return; }
    if (a !== b) { err.textContent = "As senhas não são iguais."; err.hidden = false; return; }
    setBusy(btn, true);
    api.auth.updatePassword(a).then(function () { toast("Senha alterada."); return enter(); })
      .catch(function (e2) { err.textContent = e2.message; err.hidden = false; })
      .then(function () { setBusy(btn, false); });
  });

  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-auth-go]");
    if (g) { showAuth(g.dataset.authGo); return; }
    var t = e.target.closest("[data-toggle-pass]");
    if (t) { var inp = $(t.dataset.togglePass); inp.type = inp.type === "password" ? "text" : "password"; return; }
    if (e.target.closest("[data-logout]")) logout();
  });
  $("nolink-out").addEventListener("click", function () { logout(); });

  function logout(expired) {
    api.auth.signOut();
    state.me = state.tenant = state.settings = null;
    closeModal();
    showAuth("login");
    if (expired) toast("Sessão expirada. Entre novamente.", true);
  }

  /* ============================================================ ENTRADA */
  function enter() {
    return api.rpc("admin_me", {}).then(function (me) {
      state.me = me;
      var list = me.tenants || [];
      var t = list.filter(function (x) { return x.slug === slug; })[0] || list[0];
      if (!t) { showAuth("nolink"); return; }
      if (t.status !== "active") { $("nolink-text").textContent = "Esta conta está " + (t.status === "pending" ? "aguardando aprovação" : "suspensa") + ". Fale com o suporte da plataforma."; showAuth("nolink"); return; }
      if (t.slug !== slug) { slug = t.slug; try { root.history.replaceState(null, "", "?p=" + slug); } catch (e) { /* ignore */ } }
      state.tenant = t;
      return loadSettings().then(function () { startApp(); });
    });
  }

  function loadSettings() {
    return rpc("admin_settings").then(function (s) {
      state.settings = s;
      var t = s.tenant;
      applyTheme(t.theme, t.logo_url, t.hero_url);
      $("side-name").textContent = t.name; $("top-name").textContent = t.name;
      $("side-plan").textContent = s.plan ? "Plano " + s.plan.name : "";
      var site = "../?p=" + encodeURIComponent(t.slug);
      $("side-site").href = site; $("top-site").href = site;
      $("demo-note").hidden = !t.is_demo;
      state.today = S.dateKey(nowInTz(t.timezone));
      return s;
    });
  }

  function nowInTz(tz) {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
        .formatToParts(new Date()).reduce(function (o, p) { o[p.type] = p.value; return o; }, {});
      return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute));
    } catch (e) { return new Date(); }
  }

  function startApp() {
    $("auth").hidden = true; $("app").hidden = false;
    document.body.classList.remove("is-loading");
    document.title = "Painel · " + state.settings.tenant.name;
    renderNav();
    var h = root.location.hash.replace("#", "");
    go(PAGES.some(function (p) { return p.id === h; }) ? h : "overview");
    refreshBadges();
  }

  /* ============================================================ navegação */
  function renderNav() {
    $("side-nav").innerHTML = PAGES.map(function (p) {
      return '<button class="side-item" type="button" data-page="' + p.id + '"><svg><use href="#' + p.icon + '"/></svg>' + esc(p.label) + '<span class="dot" data-dot="' + p.id + '" hidden></span></button>';
    }).join("");
    $("tabbar").innerHTML = PAGES.filter(function (p) { return p.main; }).map(function (p) {
      return '<button class="tab" type="button" data-page="' + p.id + '"><svg><use href="#' + p.icon + '"/></svg>' + esc(p.short) + '<span class="dot" data-dot="' + p.id + '" hidden></span></button>';
    }).join("") + '<button class="tab" type="button" data-more><svg><use href="#i-more"/></svg>Mais<span class="dot" data-dot="more" hidden></span></button>';
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-page]");
    if (b) { closeModal(); go(b.dataset.page); return; }
    if (e.target.closest("[data-more]")) openMore();
  });
  function openMore() {
    var items = PAGES.filter(function (p) { return !p.main; });
    openModal("Mais opções", '<div class="rows">' + items.map(function (p) {
      return '<button class="row" type="button" data-page="' + p.id + '"><span class="avatar"><svg><use href="#' + p.icon + '"/></svg></span><span class="grow"><strong>' + esc(p.label) + '</strong></span><span class="dot" data-dot="' + p.id + '" hidden></span><svg><use href="#i-chev"/></svg></button>';
    }).join("") +
      '<a class="row" href="' + esc($("side-site").href) + '" target="_blank" rel="noopener"><span class="avatar"><svg><use href="#i-ext"/></svg></span><span class="grow"><strong>Ver meu site</strong><small>Abre o site público</small></span></a>' +
      '<button class="row" type="button" data-logout><span class="avatar"><svg><use href="#i-out"/></svg></span><span class="grow"><strong>Sair</strong><small>' + esc((api.auth.session() || {}).user ? api.auth.session().user.email || "" : "") + '</small></span></button></div>');
    refreshBadges();
  }

  function go(page) {
    state.page = page;
    var p = PAGES.filter(function (x) { return x.id === page; })[0] || PAGES[0];
    $("page-title").textContent = p.label;
    document.querySelectorAll("[data-page]").forEach(function (b) { b.classList.toggle("is-on", b.dataset.page === page); });
    var more = document.querySelector("[data-more]");
    if (more) more.classList.toggle("is-on", !p.main);
    try { root.history.replaceState(null, "", "#" + page); } catch (e) { /* ignore */ }
    var el = $("page");
    el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter");
    el.innerHTML = '<div class="empty">Carregando…</div>';
    root.scrollTo(0, 0);
    ({ overview: renderOverview, agenda: renderAgenda, clients: renderClients, payments: renderPayments,
       requests: renderRequests, services: renderServices, hours: renderHours, site: renderSite })[p.id]();
  }

  function refreshBadges() {
    rpc("admin_overview").then(function (o) {
      state.overview = o;
      var n = o.open_requests;
      document.querySelectorAll('[data-dot="requests"],[data-dot="more"]').forEach(function (d) { d.hidden = !n; d.textContent = n; });
      document.querySelectorAll('[data-dot="agenda"]').forEach(function (d) { d.hidden = !o.pending_count; d.textContent = o.pending_count; });
    }).catch(function () {});
  }

  /* ============================================================ MODAL */
  var modal = $("modal"), modalStack = [];
  function openModal(title, html, mount, opts) {
    if (!modal.open) { modalStack = []; if (modal.showModal) modal.showModal(); else modal.setAttribute("open", ""); document.documentElement.classList.add("no-scroll"); }
    if (opts && opts.push) modalStack.push(modal._current); else if (!opts || !opts.keep) modalStack = [];
    modal._current = { title: title, html: html, mount: mount };
    $("modal-title").textContent = title;
    $("modal-body").innerHTML = html;
    $("modal-body").scrollTop = 0;
    $("modal-back").hidden = !modalStack.length;
    if (mount) mount($("modal-body"));
  }
  function backModal() {
    var prev = modalStack.pop();
    if (!prev) return closeModal();
    if (prev.reopen) return prev.reopen();
    openModal(prev.title, prev.html, prev.mount, { keep: true });
  }
  function closeModal() {
    if (modal.open && modal.close) modal.close(); else modal.removeAttribute("open");
    document.documentElement.classList.remove("no-scroll");
    modalStack = [];
  }
  $("modal-back").addEventListener("click", backModal);
  modal.addEventListener("click", function (e) { if (e.target.closest("[data-close-modal]") || e.target === modal) closeModal(); });
  modal.addEventListener("close", function () { document.documentElement.classList.remove("no-scroll"); });

  function confirmBox(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var prev = modal.open ? modal._current : null;
      openModal(title, '<p class="note' + (danger ? " warn" : "") + '">' + esc(text) + '</p><div class="actions"><button class="btn ghost" type="button" data-no>Voltar</button><button class="btn ' + (danger ? "danger" : "primary") + '" type="button" data-yes>' + esc(okLabel || "Confirmar") + "</button></div>", function (b) {
        b.querySelector("[data-yes]").onclick = function () { if (prev) openModal(prev.title, prev.html, prev.mount, { keep: true }); else closeModal(); resolve(true); };
        b.querySelector("[data-no]").onclick = function () { if (prev) openModal(prev.title, prev.html, prev.mount, { keep: true }); else closeModal(); resolve(false); };
      }, { keep: true });
    });
  }

  /* ============================================================ VISÃO GERAL */
  function renderOverview() {
    rpc("admin_overview").then(function (o) {
      state.overview = o;
      var html = '<div class="page-head"><h2>' + esc(greeting()) + '</h2><p>' + esc(cap(ui.longDate(o.today))) + "</p></div>" +
        '<div class="stats">' +
          stat("Atendimentos hoje", o.today_count, "agenda-today") +
          stat("Agendamentos na semana", o.week_count, "agenda-week") +
          stat("Clientes atendidas no mês", o.month_clients, "clients") +
          stat("Aguardando confirmação", o.pending_count, "agenda-pending", o.pending_count ? "alert" : "") +
          stat("Sinais recebidos no mês", money(o.deposits_received), "payments", "money good") +
          stat("Recebido no mês", money(o.received_month), "payments", "money good") +
          stat("Valores pendentes", money(o.pending_amount), "payments-open", "money" + (Number(o.pending_amount) ? " alert" : "")) +
          stat("Pedidos de clientes", o.open_requests, "requests", o.open_requests ? "alert" : "") +
        "</div>" +
        '<h3 class="section-title">Próximos atendimentos</h3>' +
        (o.upcoming.length ? '<div>' + o.upcoming.map(apptRow).join("") + "</div>" : '<p class="empty">Nenhum atendimento futuro.</p>');
      $("page").innerHTML = html;
      bindApptRows($("page"));
      $("page").querySelectorAll("[data-jump]").forEach(function (b) {
        b.addEventListener("click", function () {
          var j = b.dataset.jump;
          if (j === "agenda-today") { state.agenda = { view: "day", date: o.today, filter: "all" }; go("agenda"); }
          else if (j === "agenda-week") { state.agenda = { view: "week", date: o.today, filter: "all" }; go("agenda"); }
          else if (j === "agenda-pending") { state.agenda = { view: "week", date: o.today, filter: "pending" }; go("agenda"); }
          else if (j === "payments-open") { state.payTab = "open"; go("payments"); }
          else go(j);
        });
      });
    }).catch(pageError);
  }
  function stat(label, value, jump, cls) {
    return '<button class="stat ' + (cls || "") + '" type="button" data-jump="' + jump + '"><small>' + esc(label) + "</small><strong>" + esc(value) + "</strong></button>";
  }
  function greeting() { var h = new Date().getHours(); return h < 12 ? "Bom dia!" : h < 18 ? "Boa tarde!" : "Boa noite!"; }
  function pageError(e) { $("page").innerHTML = '<div class="empty">Não foi possível carregar. ' + esc(e.message) + '<br><br><button class="btn ghost" type="button" onclick="location.reload()">Recarregar</button></div>'; }

  function apptRow(a) {
    return '<button class="appt s-' + esc(a.status) + '" type="button" data-appt="' + esc(a.id) + '">' +
      '<span class="appt-time">' + esc(a.start) + '<small>' + esc(shortDate(a.date)) + "</small></span>" +
      '<span class="appt-main"><strong>' + esc(a.client.name) + '</strong><span>' + esc(svcNames(a)) + " · " + ui.duration(a.duration_min) + "</span>" +
      '<span>' + esc(a.client.phone) + "</span></span>" +
      '<span class="appt-side">' + badge("s", a.status, STATUS) + badge("p", a.payment_status, PAY) + "<b>" + money(a.total) + "</b>" +
      (a.open_requests ? '<span class="badge b-open">Pedido</span>' : "") + "</span></button>";
  }
  function bindApptRows(scope) {
    scope.querySelectorAll("[data-appt]").forEach(function (b) { b.addEventListener("click", function () { openAppointment(b.dataset.appt); }); });
  }

  /* ============================================================ AGENDA */
  function renderAgenda() {
    var ag = state.agenda;
    ag.date = ag.date || todayKey();
    var range = agendaRange();
    $("page").innerHTML =
      '<div class="agenda-bar"><div class="seg" role="tablist">' +
        ["day", "week", "month"].map(function (v) { return '<button type="button" data-view="' + v + '" class="' + (ag.view === v ? "is-on" : "") + '">' + { day: "Dia", week: "Semana", month: "Mês" }[v] + "</button>"; }).join("") +
      '</div><button class="btn ghost sm today-btn" type="button" data-today>Hoje</button></div>' +
      '<div class="agenda-bar"><div class="date-nav"><button class="icon-btn" type="button" data-step="-1" aria-label="Anterior"><svg><use href="#i-back"/></svg></button>' +
        "<strong>" + esc(rangeTitle()) + '</strong><button class="icon-btn" type="button" data-step="1" aria-label="Próximo"><svg><use href="#i-chev"/></svg></button></div></div>' +
      '<div class="chips">' + [["all", "Todos"], ["pending", "Aguardando sinal"], ["confirmed", "Confirmados"], ["completed", "Concluídos"], ["cancelled", "Cancelados"]].map(function (c) {
        return '<button class="chip ' + (ag.filter === c[0] ? "is-on" : "") + '" type="button" data-filter="' + c[0] + '">' + c[1] + "</button>";
      }).join("") + "</div>" +
      '<div id="agenda-body"><div class="empty">Carregando…</div></div>';
    var p = $("page");
    p.querySelectorAll("[data-view]").forEach(function (b) { b.onclick = function () { ag.view = b.dataset.view; renderAgenda(); }; });
    p.querySelector("[data-today]").onclick = function () { ag.date = todayKey(); renderAgenda(); };
    p.querySelectorAll("[data-step]").forEach(function (b) {
      b.onclick = function () {
        var n = Number(b.dataset.step), d = S.parseKey(ag.date);
        if (ag.view === "day") ag.date = addDays(ag.date, n);
        else if (ag.view === "week") ag.date = addDays(ag.date, 7 * n);
        else ag.date = S.dateKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
        renderAgenda();
      };
    });
    p.querySelectorAll("[data-filter]").forEach(function (b) { b.onclick = function () { ag.filter = b.dataset.filter; renderAgenda(); }; });

    rpc("admin_appointments", { from: range[0], to: range[1] }).then(function (list) {
      state.agendaList = list;
      var shown = list.filter(function (a) { return ag.filter === "all" || a.status === ag.filter; });
      var body = $("agenda-body");
      if (!body) return;
      if (ag.view === "day") body.innerHTML = dayHtml(ag.date, list, shown);
      else if (ag.view === "week") body.innerHTML = weekHtml(range[0], list, shown);
      else body.innerHTML = monthHtml(ag.date, list, shown);
      bindApptRows(body);
      body.querySelectorAll("[data-day]").forEach(function (b) { b.onclick = function () { ag.view = "day"; ag.date = b.dataset.day; renderAgenda(); }; });
    }).catch(pageError);
  }
  function weekStart(key) { var d = S.parseKey(key); return addDays(key, -((d.getDay() + 6) % 7)); } // segunda-feira
  function agendaRange() {
    var ag = state.agenda;
    if (ag.view === "day") return [ag.date, ag.date];
    if (ag.view === "week") { var s = weekStart(ag.date); return [s, addDays(s, 6)]; }
    var d = S.parseKey(ag.date);
    return [S.dateKey(new Date(d.getFullYear(), d.getMonth(), 1)), S.dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }
  function rangeTitle() {
    var ag = state.agenda, r = agendaRange();
    if (ag.view === "day") return cap(ui.longDate(ag.date)) + (ag.date === todayKey() ? " · hoje" : "");
    if (ag.view === "week") return shortDate(r[0]) + " – " + shortDate(r[1]);
    var d = S.parseKey(ag.date);
    return cap(ui.MONTHS[d.getMonth()]) + " " + d.getFullYear();
  }

  /** Regras da agenda no formato do scheduler, a partir das configurações */
  function agendaRules() {
    var s = state.settings, t = s.tenant, special = {};
    (s.special_days || []).forEach(function (d) { special[d.date] = d.periods || []; });
    return { weekly: s.weekly, specialDays: special, slotStepMin: t.slot_step_min, bufferMin: t.buffer_min,
             minNoticeMin: 0, bookingWindowDays: 3650, blockedDates: [], blockedRanges: [] };
  }
  /** Intervalos livres de um dia (descontando atendimentos e bloqueios) */
  function freeGaps(key, list) {
    var rules = agendaRules(), buf = rules.bufferMin || 0;
    if (key < todayKey()) return [];          // dias que já passaram não têm horário livre
    var nowMin = -1;
    if (key === todayKey()) { var n = nowInTz(state.settings.tenant.timezone); nowMin = n.getHours() * 60 + n.getMinutes(); }
    var busy = list.filter(function (a) { return a.date === key && a.status !== "cancelled" && a.status !== "no_show"; })
      .map(function (a) { return [S.toMin(a.start), S.toMin(a.end) + buf]; });
    blocksOn(key).forEach(function (b) { busy.push([b.s, b.e]); });
    busy.sort(function (a, b) { return a[0] - b[0]; });
    var gaps = [];
    S.periodsFor(key, rules).forEach(function (p) {
      var cur = Math.max(S.toMin(p.start), nowMin), end = S.toMin(p.end);
      busy.forEach(function (b) {
        if (b[1] <= cur || b[0] >= end) return;
        if (b[0] > cur) gaps.push([cur, Math.min(b[0], end)]);
        cur = Math.max(cur, b[1]);
      });
      if (cur < end) gaps.push([cur, end]);
    });
    return gaps.filter(function (g) { return g[1] - g[0] >= 15; });
  }
  function blocksOn(key) {
    var out = [];
    (state.settings.time_off || []).forEach(function (o) {
      var sd = o.start.slice(0, 10), ed = o.end.slice(0, 10);
      if (key < sd || key > ed) return;
      var s = sd === key ? S.toMin(o.start.slice(11, 16)) : 0;
      var e = ed === key ? S.toMin(o.end.slice(11, 16)) : 1440;
      if (e > s) out.push({ s: s, e: e, reason: o.reason || kindLabel(o.kind), kind: o.kind });
    });
    return out;
  }
  function kindLabel(k) { return { folga: "Folga", ferias: "Férias", feriado: "Feriado", bloqueio: "Bloqueio", pausa: "Pausa" }[k] || k; }

  function dayHtml(key, list, shown) {
    var rules = agendaRules();
    var items = shown.filter(function (a) { return a.date === key; }).map(function (a) { return { t: S.toMin(a.start), html: apptRow(a) }; });
    var periods = S.periodsFor(key, rules);
    if (state.agenda.filter === "all") {
      freeGaps(key, list).forEach(function (g) {
        items.push({ t: g[0], html: '<div class="free"><svg><use href="#i-clock"/></svg><span>Horário livre</span><b>' + S.fromMin(g[0]) + " – " + S.fromMin(g[1]) + "</b></div>" });
      });
      blocksOn(key).forEach(function (b) {
        items.push({ t: b.s, html: '<div class="blocked"><span>' + esc(b.reason) + "</span><b>" + (b.s === 0 && b.e === 1440 ? "dia todo" : S.fromMin(b.s) + " – " + S.fromMin(Math.min(b.e, 1439))) + "</b></div>" });
      });
    }
    items.sort(function (a, b) { return a.t - b.t; });
    var head = periods.length ? '<p class="legend">Expediente: ' + periods.map(function (p) { return p.start + "–" + p.end; }).join(" · ") + "</p>" : '<p class="legend">Sem expediente neste dia.</p>';
    return head + (items.length ? items.map(function (i) { return i.html; }).join("") : '<p class="empty">Nenhum atendimento.</p>');
  }

  function weekHtml(start, list, shown) {
    var html = "";
    for (var i = 0; i < 7; i++) {
      var key = addDays(start, i), day = shown.filter(function (a) { return a.date === key; });
      var free = freeGaps(key, list).reduce(function (s, g) { return s + g[1] - g[0]; }, 0);
      var active = list.filter(function (a) { return a.date === key && a.status !== "cancelled" && a.status !== "no_show"; }).length;
      html += '<section class="week-day"><h4><button type="button" data-day="' + key + '">' + esc(cap(shortDate(key))) + (key === todayKey() ? " · hoje" : "") +
        "</button><small>" + active + (active === 1 ? " atendimento" : " atendimentos") + (free ? " · " + ui.duration(free) + " livres" : "") + "</small></h4>" +
        (day.length ? day.map(apptRow).join("") : '<p class="empty">' + (S.periodsFor(key, agendaRules()).length ? "Nada agendado." : "Sem expediente.") + "</p>") + "</section>";
    }
    return html;
  }

  function monthHtml(key, list, shown) {
    var d = S.parseKey(key), first = new Date(d.getFullYear(), d.getMonth(), 1), last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    var lead = (first.getDay() + 6) % 7, html = '<div class="month">' + ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(function (w) { return '<span class="wd">' + w + "</span>"; }).join("");
    for (var i = 0; i < lead; i++) html += '<span class="mday off"></span>';
    for (var n = 1; n <= last.getDate(); n++) {
      var k = S.dateKey(new Date(d.getFullYear(), d.getMonth(), n));
      var day = shown.filter(function (a) { return a.date === k; });
      var open = S.periodsFor(k, agendaRules()).length && !blocksOn(k).some(function (b) { return b.s === 0 && b.e >= 1440; });
      html += '<button type="button" class="mday' + (open ? "" : " off") + (k === todayKey() ? " today" : "") + '" data-day="' + k + '"><span class="n">' + n + '</span><span class="c">' +
        day.slice(0, 8).map(function (a) { return '<i class="ci-' + esc(a.status) + '"></i>'; }).join("") + "</span>" +
        (day.length ? '<span class="t">' + day.length + "</span>" : "") + "</button>";
    }
    html += "</div>" + '<p class="legend"><span><i class="ci-pending"></i>Aguardando sinal</span><span><i class="ci-confirmed"></i>Confirmado</span><span><i class="ci-completed"></i>Concluído</span><span><i class="ci-cancelled"></i>Cancelado</span></p>';
    return html;
  }

  /* ------------------------------------------------ detalhes do atendimento */
  function openAppointment(id, opts) {
    openModal("Atendimento", '<div class="empty">Carregando…</div>', null, opts);
    rpc("admin_appointment", { id: id }).then(function (a) {
      state.current = a;
      var reopen = function () { modalStack.pop(); openAppointment(id, { keep: true }); };
      var html =
        '<div class="page-head"><h2>' + esc(a.client.name) + "</h2><p>" + badge("s", a.status, STATUS) + " " + badge("p", a.payment_status, PAY) + " · protocolo <b>" + esc(a.code) + "</b></p></div>" +
        '<dl class="kv">' +
          kv("Telefone", '<a href="' + esc(waClient(a.client.phone)) + '" target="_blank" rel="noopener">' + esc(a.client.phone) + "</a>", true) +
          kv("Procedimento(s)", svcNames(a)) +
          kv("Data", cap(ui.longDate(a.date))) +
          kv("Horário", a.start + " às " + a.end) +
          kv("Duração", ui.duration(a.duration_min)) +
          kv("Valor total", money(a.total)) +
          kv("Sinal previsto", money(a.deposit_due)) +
          kv("Já pago", money(a.paid)) +
          kv("Restante", money(Math.max(0, a.remaining))) +
          kv("Origem", a.source === "site" ? "Site (cliente)" : "Painel") +
        "</dl>" +
        requestsHtml(a) +
        '<div class="actions">' +
          '<a class="btn soft" href="' + esc(waClient(a.client.phone, "Olá, " + a.client.name.split(" ")[0] + "! Sobre o seu horário de " + shortDate(a.date) + " às " + a.start + "…")) + '" target="_blank" rel="noopener"><svg><use href="#i-wa"/></svg>WhatsApp</a>' +
          '<button class="btn primary" type="button" data-act="pay">Registrar pagamento</button>' +
          (a.status === "pending" ? '<button class="btn ok" type="button" data-act="confirm">Confirmar</button>' : "") +
          (a.status === "pending" || a.status === "confirmed" ? '<button class="btn ghost" type="button" data-act="complete">Concluído</button>' +
            '<button class="btn ghost" type="button" data-act="noshow">Não compareceu</button>' +
            '<button class="btn ghost" type="button" data-act="reschedule">Remarcar</button>' +
            '<button class="btn danger wide2" type="button" data-act="cancel">Cancelar atendimento</button>' : "") +
          (a.status === "cancelled" || a.status === "no_show" ? '<button class="btn ghost wide2" type="button" data-act="reactivate">Reativar agendamento</button>' : "") +
        "</div>" +
        '<h3 class="section-title">Pagamentos</h3>' +
        (a.payments.length ? '<div class="rows">' + a.payments.map(function (y) {
          return '<div class="row"><span class="grow"><strong>' + esc(KIND[y.kind]) + " · " + esc(METHOD[y.method]) + (y.status === "voided" ? " (estornado)" : "") + "</strong><small>" +
            esc(dateTime(y.created_at)) + " · confirmado " + (y.confirmation === "manual" ? "manualmente" : "pelo provedor") + (y.note ? " · " + esc(y.note) : "") + '</small></span><span class="amt">' +
            (y.kind === "refund" ? "−" : "") + money(y.amount) + "</span>" +
            (y.status === "confirmed" ? '<button class="btn ghost sm" type="button" data-void="' + esc(y.id) + '">Estornar</button>' : "") + "</div>";
        }).join("") + "</div>" : '<p class="empty">Nenhum pagamento registrado. Registre o sinal quando conferir o comprovante.</p>') +
        '<h3 class="section-title">Histórico</h3><ul class="timeline">' + a.events.map(function (ev) {
          return "<li><strong>" + esc(eventText(ev)) + "</strong>" + (ev.reason ? " — " + esc(ev.reason) : "") + "<small>" + esc(dateTime(ev.created_at)) + " · " +
            esc({ client: "cliente", professional: "profissional", system: "sistema" }[ev.actor]) + "</small></li>";
        }).join("") + "</ul>";
      openModal(a.client.name, html, function (b) {
        b.querySelectorAll("[data-act]").forEach(function (btn) {
          btn.onclick = function () {
            var act = btn.dataset.act;
            if (act === "pay") return paymentForm(a, reopen);
            if (act === "confirm") return setStatus(a, "confirmed", "Confirmado pela profissional");
            if (act === "complete") return setStatus(a, "completed", "");
            if (act === "noshow") return confirmBox("Não compareceu", "Marcar que " + a.client.name + " não compareceu? O sinal não é retido automaticamente; registre uma devolução se for o caso.", "Marcar").then(function (ok) { if (ok) setStatus(a, "no_show", "Cliente não compareceu"); });
            if (act === "cancel") return cancelForm(a, reopen);
            if (act === "reschedule") return rescheduleForm(a, reopen);
            if (act === "reactivate") return setStatus(a, "pending", "Reativado pela profissional");
          };
        });
        b.querySelectorAll("[data-void]").forEach(function (btn) {
          btn.onclick = function () {
            confirmBox("Estornar pagamento", "O registro deixa de contar como recebido (o histórico é mantido).", "Estornar", true).then(function (ok) {
              if (!ok) return;
              rpc("admin_void_payment", { id: btn.dataset.void, reason: "Estornado pela profissional" }).then(function () { toast("Pagamento estornado."); reopen(); afterChange(); }).catch(fail);
            });
          };
        });
        b.querySelectorAll("[data-req]").forEach(function (btn) {
          btn.onclick = function () { resolveRequest(btn.dataset.req, btn.dataset.status, reopen); };
        });
      }, { keep: true });
    }).catch(function (e) { fail(e); closeModal(); });
  }
  function kv(k, v, raw) { return "<div><dt>" + esc(k) + "</dt><dd>" + (raw ? v : esc(v)) + "</dd></div>"; }
  function eventText(ev) {
    var t = EVENT[ev.type] || ev.type;
    if (ev.type === "status_changed" && ev.data && ev.data.to) t = "Situação: " + (STATUS[ev.data.from] || ev.data.from) + " → " + (STATUS[ev.data.to] || ev.data.to);
    if (ev.type === "rescheduled" && ev.data) t = "Remarcado de " + ev.data.from + " para " + ev.data.to;
    if (ev.type === "payment_confirmed" && ev.data) t = "Pagamento registrado: " + (KIND[ev.data.kind] || "") + " " + money(ev.data.amount) + " (" + (METHOD[ev.data.method] || "") + ")";
    if ((ev.type === "reschedule_requested") && ev.data && ev.data.preferred) t += " (prefere: " + ev.data.preferred + ")";
    return t;
  }
  function requestsHtml(a) {
    var open = a.requests.filter(function (r) { return r.status === "open"; });
    if (!open.length) return "";
    return open.map(function (r) {
      return '<div class="card req"><h3>' + (r.type === "cancel" ? "Cliente pediu cancelamento" : "Cliente pediu remarcação") + "</h3>" +
        (r.reason ? "<p><b>Motivo:</b> " + esc(r.reason) + "</p>" : "") + (r.preferred ? "<p><b>Preferência:</b> " + esc(r.preferred) + "</p>" : "") +
        '<p class="muted" style="font-size:13px;margin:6px 0 10px">Enviado em ' + esc(dateTime(r.created_at)) + ". " + policyHint(a) + "</p>" +
        '<div class="actions"><button class="btn ok" type="button" data-req="' + esc(r.id) + '" data-status="accepted">Aceitar</button><button class="btn ghost" type="button" data-req="' + esc(r.id) + '" data-status="declined">Recusar</button></div></div>';
    }).join("");
  }
  function policyHint(a) {
    var p = a.policy;
    if (!p || !p.text) return "Nenhuma política de cancelamento configurada.";
    return (p.within_deadline ? "Faltam menos de " + p.deadline_hours + "h para o atendimento." : "Pedido feito dentro do prazo de " + p.deadline_hours + "h.") +
      (p.deposit_retention ? " Sua política prevê possível retenção do sinal — a decisão é sua; nada é retido automaticamente." : "");
  }
  function resolveRequest(id, status, reopen) {
    var html = '<label class="field"><span>Resposta para registro (opcional)</span><textarea id="rq-resp" maxlength="300"></textarea></label>' +
      '<p class="note">Aceitar apenas registra sua decisão. Depois, use "Remarcar" ou "Cancelar" no atendimento e avise a cliente pelo WhatsApp.</p>' +
      '<button class="btn ' + (status === "accepted" ? "ok" : "primary") + ' wide" type="button" id="rq-go">' + (status === "accepted" ? "Aceitar pedido" : "Recusar pedido") + "</button>";
    openModal(status === "accepted" ? "Aceitar pedido" : "Recusar pedido", html, function (b) {
      b.querySelector("#rq-go").onclick = function () {
        var btn = this; setBusy(btn, true);
        rpc("admin_resolve_request", { id: id, status: status, response: b.querySelector("#rq-resp").value })
          .then(function () { toast("Pedido " + (status === "accepted" ? "aceito." : "recusado.")); afterChange(); if (reopen) reopen(); else closeModal(); })
          .catch(function (e) { fail(e); setBusy(btn, false); });
      };
    }, { push: true });
  }

  function setStatus(a, status, reason) {
    return rpc("admin_set_status", { id: a.id, status: status, reason: reason }).then(function () {
      toast("Situação atualizada: " + STATUS[status] + ".");
      afterChange(); openAppointment(a.id, { keep: true });
    }).catch(fail);
  }

  function paymentForm(a, reopen) {
    var remaining = Math.max(0, Number(a.remaining));
    var depositLeft = Math.max(0, Number(a.deposit_due) - Number(a.paid));
    var suggested = depositLeft > 0 ? depositLeft : remaining;
    var html = '<p class="note">Registre apenas pagamentos que você conferiu (comprovante do Pix, maquininha, dinheiro). Nada é marcado como pago automaticamente.</p>' +
      '<div class="grid2"><label class="field"><span>Tipo</span><select id="py-kind">' +
        '<option value="deposit"' + (depositLeft > 0 ? " selected" : "") + '>Sinal</option><option value="balance"' + (depositLeft > 0 ? "" : " selected") + '>Restante</option><option value="full">Valor total</option><option value="refund">Devolução à cliente</option></select></label>' +
      '<label class="field"><span>Forma</span><select id="py-method"><option value="pix">Pix</option><option value="card">Cartão</option><option value="cash">Dinheiro</option><option value="transfer">Transferência</option><option value="other">Outro</option></select></label></div>' +
      '<label class="field"><span>Valor (R$)</span><input id="py-amount" type="number" inputmode="decimal" min="0.01" step="0.01" value="' + suggested.toFixed(2) + '"></label>' +
      '<label class="field"><span>Observação</span><input id="py-note" type="text" maxlength="200" placeholder="Ex.: comprovante conferido no app do banco"></label>' +
      '<p class="hint">Total ' + money(a.total) + " · já pago " + money(a.paid) + " · restante " + money(remaining) + "</p>" +
      '<button class="btn primary wide" type="button" id="py-save">Registrar pagamento confirmado</button>';
    openModal("Registrar pagamento", html, function (b) {
      b.querySelector("#py-kind").onchange = function () {
        var v = this.value, amt = b.querySelector("#py-amount");
        amt.value = (v === "deposit" ? depositLeft || Number(a.deposit_due) : v === "full" ? Number(a.total) : v === "refund" ? Number(a.paid) : remaining).toFixed(2);
      };
      b.querySelector("#py-save").onclick = function () {
        var btn = this, amount = Number(b.querySelector("#py-amount").value.replace(",", "."));
        if (!(amount > 0)) return toast("Informe um valor maior que zero.", true);
        setBusy(btn, true);
        rpc("admin_record_payment", { appointment_id: a.id, kind: b.querySelector("#py-kind").value, method: b.querySelector("#py-method").value, amount: amount, note: b.querySelector("#py-note").value })
          .then(function () { toast("Pagamento registrado."); afterChange(); reopen(); })
          .catch(function (e) { fail(e); setBusy(btn, false); });
      };
    }, { push: true });
  }

  function cancelForm(a, reopen) {
    var paid = Number(a.paid);
    var html = '<p class="note warn">' + esc(policyHint(a)) + "</p>" +
      '<label class="field"><span>Motivo do cancelamento (obrigatório)</span><textarea id="cx-reason" maxlength="300" placeholder="Ex.: cliente pediu por mensagem"></textarea></label>' +
      (paid > 0 ? '<label class="check"><input type="checkbox" id="cx-refund"> Registrar devolução de ' + money(paid) + ' à cliente</label><p class="hint">Deixe desmarcado se o sinal ficará retido conforme a política combinada, ou se será usado em outra data.</p>' : "") +
      '<button class="btn danger wide" type="button" id="cx-go">Cancelar atendimento</button>';
    openModal("Cancelar atendimento", html, function (b) {
      b.querySelector("#cx-go").onclick = function () {
        var btn = this, reason = b.querySelector("#cx-reason").value.trim();
        if (reason.length < 3) return toast("Informe o motivo do cancelamento.", true);
        setBusy(btn, true);
        rpc("admin_set_status", { id: a.id, status: "cancelled", reason: reason }).then(function () {
          var rf = b.querySelector("#cx-refund");
          if (rf && rf.checked) return rpc("admin_record_payment", { appointment_id: a.id, kind: "refund", method: "pix", amount: paid, note: "Devolução no cancelamento" });
        }).then(function () { toast("Atendimento cancelado. O horário voltou a ficar livre."); afterChange(); reopen(); })
          .catch(function (e) { fail(e); setBusy(btn, false); });
      };
    }, { push: true });
  }

  function rescheduleForm(a, reopen) {
    var html = '<p class="note">Duração: ' + ui.duration(a.duration_min) + ". Mostramos só horários livres no expediente; o banco confere de novo ao salvar.</p>" +
      '<label class="field"><span>Nova data</span><input id="rs-date" type="date" value="' + esc(a.date) + '" min="' + esc(todayKey()) + '"></label>' +
      '<div id="rs-slots"></div>' +
      '<label class="field"><span>Ou digite um horário</span><input id="rs-time" type="time" step="300"></label>' +
      '<label class="field"><span>Motivo</span><input id="rs-reason" type="text" maxlength="200" placeholder="Ex.: pedido da cliente"></label>' +
      '<button class="btn primary wide" type="button" id="rs-go">Remarcar</button>';
    openModal("Remarcar", html, function (b) {
      function loadSlots() {
        var d = b.querySelector("#rs-date").value, box = b.querySelector("#rs-slots");
        if (!d) return;
        box.innerHTML = '<p class="hint">Calculando horários…</p>';
        rpc("admin_appointments", { from: d, to: d }).then(function (list) {
          var others = list.filter(function (x) { return x.id !== a.id && x.status !== "cancelled" && x.status !== "no_show"; })
            .map(function (x) { return { date: x.date, start: x.start, durationMin: x.duration_min, status: x.status }; });
          var rules = agendaRules();
          rules.blockedRanges = blocksOn(d).map(function (k) { return { date: d, start: S.fromMin(k.s), end: S.fromMin(Math.min(k.e, 1440)) }; });
          var slots = S.getAvailableSlots(d, a.duration_min, rules, others, nowInTz(state.settings.tenant.timezone));
          box.innerHTML = slots.length ? '<div class="chips" style="flex-wrap:wrap">' + slots.map(function (s) {
            return '<button class="chip" type="button" data-t="' + s.start + '">' + s.start + "</button>";
          }).join("") + "</div>" : '<p class="hint">Sem horários livres para essa duração nesta data.</p>';
          box.querySelectorAll("[data-t]").forEach(function (c) {
            c.onclick = function () { box.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("is-on"); }); c.classList.add("is-on"); b.querySelector("#rs-time").value = c.dataset.t; };
          });
        }).catch(fail);
      }
      b.querySelector("#rs-date").onchange = loadSlots;
      loadSlots();
      b.querySelector("#rs-go").onclick = function () {
        var btn = this, d = b.querySelector("#rs-date").value, t = b.querySelector("#rs-time").value;
        if (!d || !t) return toast("Escolha a data e o horário.", true);
        setBusy(btn, true);
        rpc("admin_reschedule", { id: a.id, date: d, start: t, reason: b.querySelector("#rs-reason").value })
          .then(function () { toast("Atendimento remarcado. Avise a cliente pelo WhatsApp."); afterChange(); reopen(); })
          .catch(function (e) { fail(e); setBusy(btn, false); });
      };
    }, { push: true });
  }

  function afterChange() {
    refreshBadges();
    if (state.page === "agenda") renderAgenda();
    else if (state.page === "overview") renderOverview();
    else if (state.page === "payments") renderPayments();
    else if (state.page === "requests") renderRequests();
  }

  /* ============================================================ CLIENTES */
  function renderClients() {
    $("page").innerHTML = '<div class="search"><svg><use href="#i-search"/></svg><input class="input" id="cl-q" type="search" placeholder="Buscar por nome ou telefone" autocomplete="off"></div><div id="cl-list" class="rows"><div class="empty">Carregando…</div></div>';
    var q = $("cl-q"), timer;
    function load() {
      rpc("admin_clients", { q: q.value }).then(function (list) {
        var box = $("cl-list"); if (!box) return;
        box.innerHTML = list.length ? list.map(function (c) {
          return '<button class="row" type="button" data-client="' + esc(c.id) + '"><span class="avatar">' + esc(initials(c.name)) + '</span><span class="grow"><strong>' + esc(c.name) +
            "</strong><small>" + esc(c.phone) + " · " + c.total_appointments + (c.total_appointments === 1 ? " agendamento" : " agendamentos") + (c.next ? " · próximo " + esc(shortDate(c.next.slice(0, 10))) + " " + esc(c.next.slice(11)) : "") +
            '</small></span><span class="amt">' + money(c.paid) + "<small>pago</small></span></button>";
        }).join("") : '<p class="empty">' + (q.value ? "Nenhuma cliente encontrada." : "Nenhuma cliente ainda. Elas aparecem aqui após o primeiro agendamento.") + "</p>";
        box.querySelectorAll("[data-client]").forEach(function (b) { b.onclick = function () { openClient(b.dataset.client); }; });
      }).catch(pageError);
    }
    q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(load, 250); });
    load();
  }
  function openClient(id, opts) {
    openModal("Cliente", '<div class="empty">Carregando…</div>', null, opts);
    rpc("admin_client", { id: id }).then(function (c) {
      var appts = c.appointments, now = todayKey();
      var future = appts.filter(function (a) { return a.date >= now && (a.status === "pending" || a.status === "confirmed"); });
      var past = appts.filter(function (a) { return future.indexOf(a) === -1; });
      var paid = appts.reduce(function (s, a) { return s + Number(a.paid); }, 0);
      var done = {};
      appts.filter(function (a) { return a.status === "completed"; }).forEach(function (a) { (a.services || []).forEach(function (s) { done[s.name] = (done[s.name] || 0) + 1; }); });
      var html = '<div class="page-head"><h2>' + esc(c.name) + '</h2><p><a href="' + esc(waClient(c.phone)) + '" target="_blank" rel="noopener">' + esc(c.phone) + "</a> · cliente desde " + esc(dateTime(c.since).slice(0, 5)) + "</p></div>" +
        '<div class="stats">' + '<div class="stat"><small>Agendamentos</small><strong>' + appts.length + '</strong></div><div class="stat money good"><small>Valores pagos</small><strong>' + money(paid) + "</strong></div></div>" +
        '<h3 class="section-title">Procedimentos realizados</h3>' + (Object.keys(done).length ? '<p>' + Object.keys(done).map(function (k) { return esc(k) + " (" + done[k] + "×)"; }).join(" · ") + "</p>" : '<p class="muted">Nenhum concluído ainda.</p>') +
        '<h3 class="section-title">Próximos agendamentos</h3>' + (future.length ? future.map(apptRow).join("") : '<p class="muted">Nenhum.</p>') +
        '<h3 class="section-title">Histórico</h3>' + (past.length ? past.map(apptRow).join("") : '<p class="muted">Sem histórico.</p>') +
        '<h3 class="section-title">Anotações</h3><label class="field"><textarea id="cl-notes" maxlength="2000" placeholder="Preferências, alergias informadas, observações…">' + esc(c.notes) + '</textarea></label><button class="btn ghost wide" type="button" id="cl-save">Salvar anotações</button>';
      openModal(c.name, html, function (b) {
        b.querySelectorAll("[data-appt]").forEach(function (x) { x.onclick = function () { modalStack.push({ reopen: function () { openClient(id, { keep: true }); } }); openAppointment(x.dataset.appt, { keep: true }); $("modal-back").hidden = false; }; });
        b.querySelector("#cl-save").onclick = function () {
          var btn = this; setBusy(btn, true);
          rpc("admin_save_client_notes", { id: id, notes: b.querySelector("#cl-notes").value }).then(function () { toast("Anotações salvas."); }).catch(fail).then(function () { setBusy(btn, false); });
        };
      }, { keep: true });
    }).catch(function (e) { fail(e); closeModal(); });
  }

  /* ============================================================ PAGAMENTOS */
  function renderPayments() {
    var t = todayKey(), d = S.parseKey(t);
    state.payFilter = state.payFilter || { from: S.dateKey(new Date(d.getFullYear(), d.getMonth(), 1)), to: S.dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)), method: "", status: "" };
    var f = state.payFilter, tab = state.payTab || "received";
    $("page").innerHTML =
      '<div class="filters">' +
        '<label class="field"><span>De</span><input id="pf-from" type="date" value="' + esc(f.from) + '"></label>' +
        '<label class="field"><span>Até</span><input id="pf-to" type="date" value="' + esc(f.to) + '"></label>' +
        '<label class="field"><span>Forma</span><select id="pf-method"><option value="">Todas</option>' + Object.keys(METHOD).map(function (k) { return '<option value="' + k + '"' + (f.method === k ? " selected" : "") + ">" + METHOD[k] + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Situação</span><select id="pf-status"><option value="">Todas</option><option value="confirmed"' + (f.status === "confirmed" ? " selected" : "") + '>Recebidos</option><option value="voided"' + (f.status === "voided" ? " selected" : "") + ">Estornados</option></select></label>" +
      "</div>" +
      '<div id="pay-stats" class="stats"></div>' +
      '<div class="agenda-bar" style="margin-top:16px"><div class="seg"><button type="button" data-ptab="received" class="' + (tab === "received" ? "is-on" : "") + '">Histórico</button><button type="button" data-ptab="open" class="' + (tab === "open" ? "is-on" : "") + '">Valores pendentes</button></div></div>' +
      '<div id="pay-list" class="rows"><div class="empty">Carregando…</div></div>';
    ["from", "to", "method", "status"].forEach(function (k) {
      $("pf-" + k).onchange = function () { f[k] = this.value; renderPayments(); };
    });
    $("page").querySelectorAll("[data-ptab]").forEach(function (b) { b.onclick = function () { state.payTab = b.dataset.ptab; renderPayments(); }; });
    rpc("admin_payments", { from: f.from || null, to: f.to || null, method: f.method || null }).then(function (r) {
      var pays = r.payments.filter(function (y) { return !f.status || y.status === f.status; });
      var ok = r.payments.filter(function (y) { return y.status === "confirmed"; });
      var sum = function (arr) { return arr.reduce(function (s, y) { return s + (y.kind === "refund" ? -Number(y.amount) : Number(y.amount)); }, 0); };
      var pend = r.open.reduce(function (s, a) { return s + Math.max(0, Number(a.remaining)); }, 0);
      $("pay-stats").innerHTML =
        '<div class="stat money good"><small>Recebido no período</small><strong>' + money(sum(ok)) + "</strong></div>" +
        '<div class="stat money"><small>Sinais pagos</small><strong>' + money(sum(ok.filter(function (y) { return y.kind === "deposit"; }))) + "</strong></div>" +
        '<div class="stat money"><small>Via Pix</small><strong>' + money(sum(ok.filter(function (y) { return y.method === "pix"; }))) + "</strong></div>" +
        '<div class="stat money"><small>Via cartão</small><strong>' + money(sum(ok.filter(function (y) { return y.method === "card"; }))) + "</strong></div>" +
        '<div class="stat money' + (pend ? " alert" : "") + '"><small>Pendente (atendimentos do período)</small><strong>' + money(pend) + "</strong></div>";
      var box = $("pay-list");
      if (tab === "received") {
        box.innerHTML = pays.length ? pays.map(function (y) {
          return '<button class="row" type="button" data-appt="' + esc(y.appointment_id) + '"><span class="grow"><strong>' + esc(y.client) + " · " + esc(KIND[y.kind]) + "</strong><small>" +
            esc(METHOD[y.method]) + " · " + esc(dateTime(y.created_at)) + " · atendimento " + esc(shortDate(y.appt_date)) + (y.status === "voided" ? " · ESTORNADO" : "") + (y.note ? " · " + esc(y.note) : "") +
            '</small></span><span class="amt">' + (y.kind === "refund" ? "−" : "") + money(y.amount) + "</span></button>";
        }).join("") : '<p class="empty">Nenhum pagamento no período.</p>';
      } else {
        box.innerHTML = r.open.length ? r.open.map(function (a) {
          return '<button class="row" type="button" data-appt="' + esc(a.id) + '"><span class="grow"><strong>' + esc(a.client.name) + "</strong><small>" + esc(shortDate(a.date)) + " " + esc(a.start) + " · " + esc(svcNames(a)) +
            " · " + esc(PAY[a.payment_status]) + '</small></span><span class="amt">' + money(Math.max(0, a.remaining)) + "<small>de " + money(a.total) + "</small></span></button>";
        }).join("") : '<p class="empty">Nenhum valor pendente no período.</p>';
      }
      box.querySelectorAll("[data-appt]").forEach(function (b) { b.onclick = function () { openAppointment(b.dataset.appt); }; });
    }).catch(pageError);
  }

  /* ============================================================ SOLICITAÇÕES */
  function renderRequests() {
    rpc("admin_requests").then(function (r) {
      var open = r.requests.filter(function (x) { return x.status === "open"; });
      var closed = r.requests.filter(function (x) { return x.status !== "open"; });
      var reqRow = function (x) {
        var a = x.appointment;
        return '<button class="row req" type="button" data-appt="' + esc(a.id) + '"><span class="grow"><strong>' + (x.type === "cancel" ? "Cancelamento" : "Remarcação") + " · " + esc(a.client.name) +
          "</strong><small>" + esc(shortDate(a.date)) + " " + esc(a.start) + " · " + esc(svcNames(a)) + (x.reason ? " · “" + esc(x.reason) + "”" : "") + (x.preferred ? " · prefere: " + esc(x.preferred) : "") +
          '</small></span><span class="badge b-' + (x.status === "open" ? "open" : x.status === "accepted" ? "confirmed" : "cancelled") + '">' + { open: "Aberto", accepted: "Aceito", declined: "Recusado" }[x.status] + "</span></button>";
      };
      $("page").innerHTML =
        '<div class="page-head"><h2>Pedidos das clientes</h2><p>Cancelamentos e remarcações solicitados pelo site. Abra o atendimento para responder.</p></div>' +
        (open.length ? '<div class="rows">' + open.map(reqRow).join("") + "</div>" : '<p class="empty">Nenhum pedido em aberto.</p>') +
        (closed.length ? '<h3 class="section-title">Respondidos</h3><div class="rows">' + closed.map(reqRow).join("") + "</div>" : "") +
        '<h3 class="section-title">Histórico de alterações</h3><ul class="timeline card">' + r.events.map(function (ev) {
          return '<li><strong>' + esc(eventText(ev)) + "</strong> · " + esc(ev.client) + " (" + esc(ev.code) + ")" + (ev.reason ? " — " + esc(ev.reason) : "") +
            "<small>" + esc(dateTime(ev.created_at)) + " · " + esc({ client: "cliente", professional: "profissional", system: "sistema" }[ev.actor]) + "</small></li>";
        }).join("") + "</ul>";
      bindApptRows($("page"));
    }).catch(pageError);
  }

  /* ============================================================ PROCEDIMENTOS */
  function renderServices() {
    loadSettings().then(function (s) {
      var plan = s.plan || {};
      $("page").innerHTML =
        '<div class="page-head"><h2>Procedimentos e valores</h2><button class="btn primary sm" type="button" id="sv-new"><svg><use href="#i-plus"/></svg>Novo procedimento</button>' +
        "<p>As alterações aparecem no site e na agenda imediatamente." + (plan.max_services ? " Seu plano permite até " + plan.max_services + " procedimentos." : "") + "</p></div>" +
        (s.services.length ? '<div class="rows">' + s.services.map(function (v) {
          return '<button class="row" type="button" data-sv="' + esc(v.id) + '">' + imgTag(v.image_url) + '<span class="grow"><strong>' + esc(v.name) + "</strong><small>" +
            ui.duration(v.duration_min) + " · " + (v.active ? "disponível para agendamento" : "oculto do site") + '</small></span><span class="amt">' + money(v.price) + "</span></button>";
        }).join("") + "</div>" : '<p class="empty">Nenhum procedimento cadastrado.</p>');
      $("sv-new").onclick = function () { serviceForm(null); };
      $("page").querySelectorAll("[data-sv]").forEach(function (b) {
        b.onclick = function () { serviceForm(s.services.filter(function (v) { return v.id === b.dataset.sv; })[0]); };
      });
    }).catch(pageError);
  }
  function serviceForm(v) {
    v = v || { name: "", description: "", price: "", duration_min: 60, active: true, image_url: "" };
    var html =
      '<label class="field"><span>Nome</span><input id="sv-name" type="text" maxlength="80" value="' + esc(v.name) + '"></label>' +
      '<label class="field"><span>Descrição</span><textarea id="sv-desc" maxlength="400">' + esc(v.description) + "</textarea></label>" +
      '<div class="grid2"><label class="field"><span>Preço (R$)</span><input id="sv-price" type="number" inputmode="decimal" min="0" step="0.01" value="' + esc(v.price) + '"></label>' +
      '<label class="field"><span>Duração (minutos)</span><input id="sv-dur" type="number" inputmode="numeric" min="5" max="600" step="5" value="' + esc(v.duration_min) + '"></label></div>' +
      imageField("sv-img", "Fotografia", v.image_url) +
      '<label class="check"><input type="checkbox" id="sv-active"' + (v.active ? " checked" : "") + "> Disponível para agendamento no site</label>" +
      '<div class="actions" style="margin-top:14px">' + (v.id ? '<button class="btn danger" type="button" id="sv-del">Excluir</button>' : "<span></span>") +
      '<button class="btn primary" type="button" id="sv-save">Salvar</button></div>';
    openModal(v.id ? "Editar procedimento" : "Novo procedimento", html, function (b) {
      bindImageField(b, "sv-img");
      b.querySelector("#sv-save").onclick = function () {
        var btn = this;
        var data = { id: v.id || null, name: b.querySelector("#sv-name").value.trim(), description: b.querySelector("#sv-desc").value.trim(),
          price: Number(String(b.querySelector("#sv-price").value).replace(",", ".")), duration_min: Number(b.querySelector("#sv-dur").value),
          active: b.querySelector("#sv-active").checked, image_url: b.querySelector("#sv-img").value.trim() };
        if (data.name.length < 2) return toast("Informe o nome do procedimento.", true);
        if (!(data.price >= 0) || b.querySelector("#sv-price").value === "") return toast("Informe o preço.", true);
        if (!(data.duration_min >= 5 && data.duration_min <= 600)) return toast("Duração entre 5 e 600 minutos.", true);
        if (!data.id) delete data.id;
        setBusy(btn, true);
        rpc("admin_save_service", { service: data }).then(function () { toast("Procedimento salvo."); closeModal(); renderServices(); })
          .catch(function (e) { fail(e); setBusy(btn, false); });
      };
      var del = b.querySelector("#sv-del");
      if (del) del.onclick = function () {
        confirmBox("Excluir procedimento", "Excluir “" + v.name + "”? Agendamentos já feitos continuam com o registro do procedimento. Se quiser só tirar do site, desmarque “Disponível”.", "Excluir", true).then(function (ok) {
          if (!ok) return;
          rpc("admin_delete_service", { id: v.id }).then(function () { toast("Procedimento excluído."); closeModal(); renderServices(); }).catch(fail);
        });
      };
    });
  }

  /** Campo de imagem: enviar arquivo (Supabase Storage) ou colar um link */
  function imageField(id, label, value) {
    return '<div class="field"><span>' + esc(label) + '</span><div class="img-field"><img id="' + id + '-prev" src="' + esc(asset(value) || "../assets/img/placeholder.svg") + '" alt="">' +
      '<div class="grow"><span class="btn ghost sm file-btn">Enviar foto<input type="file" accept="image/jpeg,image/png,image/webp" id="' + id + '-file"></span>' +
      '<input class="input" id="' + id + '" type="url" placeholder="ou cole o link da imagem" value="' + esc(value || "") + '"></div></div></div>';
  }
  function bindImageField(scope, id) {
    var file = scope.querySelector("#" + id + "-file"), inp = scope.querySelector("#" + id), prev = scope.querySelector("#" + id + "-prev");
    prev.onerror = function () { prev.src = "../assets/img/placeholder.svg"; };
    inp.oninput = function () { prev.src = asset(inp.value) || "../assets/img/placeholder.svg"; };
    file.onchange = function () {
      var f = file.files[0];
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) return toast("Imagem maior que 3 MB. Reduza antes de enviar.", true);
      var label = file.parentNode; label.firstChild.textContent = "Enviando…";
      api.upload(state.tenant.id, f).then(function (url) { inp.value = url; prev.src = url; toast("Imagem enviada."); })
        .catch(fail).then(function () { label.firstChild.textContent = "Enviar foto"; file.value = ""; });
    };
  }

  /* ============================================================ HORÁRIOS */
  function renderHours() {
    loadSettings().then(function (s) {
      var t = s.tenant;
      var byDay = {};
      s.weekly.forEach(function (w) { (byDay[w.weekday] = byDay[w.weekday] || []).push(w); });
      var order = [1, 2, 3, 4, 5, 6, 0];
      var html =
        '<div class="page-head"><h2>Horários de atendimento</h2><p>O intervalo de almoço e as pausas são o espaço entre um período e outro. Tudo aqui vale imediatamente na agenda do site.</p></div>' +
        '<div class="wk" id="wk">' + order.map(function (d) {
          var ps = byDay[d] || [];
          return '<div class="wk-day" data-wd="' + d + '"><div class="wk-top"><strong>' + WD[d] + '</strong><label class="switch" aria-label="Atende ' + WD[d] + '"><input type="checkbox" data-on' + (ps.length ? " checked" : "") + "><span></span></label></div>" +
            '<div class="wk-periods"' + (ps.length ? "" : " hidden") + ">" + (ps.length ? ps : [{ start: "09:00", end: "18:00" }]).map(periodRow).join("") +
            '<button class="btn ghost sm" type="button" data-addp><svg><use href="#i-plus"/></svg>Adicionar período</button></div></div>';
        }).join("") + "</div>" +
        '<h3 class="section-title">Regras da agenda</h3><div class="card"><div class="grid2">' +
          numField("st-buffer", "Intervalo entre atendimentos (min)", t.buffer_min, 0, 120) +
          numField("st-step", "Oferecer horários a cada (min)", t.slot_step_min, 5, 60) +
          numField("st-notice", "Antecedência mínima (min)", t.min_notice_min, 0, 10080) +
          numField("st-window", "Agenda aberta por (dias)", t.window_days, 1, 365) +
          numField("st-deposit", "Sinal (% do valor)", t.deposit_percent, 0, 100) +
          numField("st-deadline", "Prazo para cancelar sem perder sinal (h)", t.cancel_deadline_hours, 0, 720) +
        '</div><label class="field"><span>Política de cancelamento (mostrada à cliente antes de agendar)</span><textarea id="st-policy" maxlength="800">' + esc(t.cancel_policy_text) + "</textarea></label>" +
        '<label class="check"><input type="checkbox" id="st-retention"' + (t.deposit_retention ? " checked" : "") + "> A política prevê possível retenção do sinal (nunca é aplicada automaticamente)</label></div>" +
        '<div class="save-bar"><button class="btn primary" type="button" id="hours-save">Salvar horários e regras</button></div>' +
        '<h3 class="section-title">Folgas, férias, feriados e bloqueios</h3><button class="btn ghost sm" type="button" id="to-new"><svg><use href="#i-plus"/></svg>Adicionar bloqueio</button><div class="rows" style="margin-top:10px">' +
          (s.time_off.length ? s.time_off.map(function (o) {
            return '<div class="row"><span class="grow"><strong>' + esc(kindLabel(o.kind)) + (o.reason ? " · " + esc(o.reason) : "") + "</strong><small>" + esc(fmtRange(o.start, o.end)) + '</small></span><button class="btn ghost sm" type="button" data-del-to="' + esc(o.id) + '">Remover</button></div>';
          }).join("") : '<p class="empty">Nenhum bloqueio cadastrado.</p>') + "</div>" +
        '<h3 class="section-title">Datas especiais</h3><p class="muted" style="font-size:14px;margin-bottom:10px">Um horário diferente só naquele dia (ex.: sábado estendido, véspera de feriado). Sem períodos = fechado.</p>' +
        '<button class="btn ghost sm" type="button" id="sd-new"><svg><use href="#i-plus"/></svg>Adicionar data especial</button><div class="rows" style="margin-top:10px">' +
          (s.special_days.length ? s.special_days.map(function (d) {
            return '<div class="row"><span class="grow"><strong>' + esc(cap(ui.longDate(d.date))) + "</strong><small>" + (d.periods.length ? d.periods.map(function (p) { return p.start + "–" + p.end; }).join(" · ") : "Fechado") +
              (d.note ? " · " + esc(d.note) : "") + '</small></span><button class="btn ghost sm" type="button" data-del-sd="' + esc(d.id) + '">Remover</button></div>';
          }).join("") : '<p class="empty">Nenhuma data especial.</p>') + "</div>";
      $("page").innerHTML = html;
      var wk = $("wk");
      wk.addEventListener("change", function (e) {
        if (e.target.matches("[data-on]")) e.target.closest(".wk-day").querySelector(".wk-periods").hidden = !e.target.checked;
      });
      wk.addEventListener("click", function (e) {
        var add = e.target.closest("[data-addp]");
        if (add) { add.insertAdjacentHTML("beforebegin", periodRow({ start: "13:00", end: "18:00" })); return; }
        var rm = e.target.closest("[data-rmp]");
        if (rm) { var box = rm.closest(".wk-periods"); if (box.querySelectorAll(".wk-period").length > 1) rm.closest(".wk-period").remove(); else toast("Para não atender neste dia, desligue a chave.", true); }
      });
      $("hours-save").onclick = function () {
        var btn = this, weekly = [], bad = false;
        wk.querySelectorAll(".wk-day").forEach(function (day) {
          if (!day.querySelector("[data-on]").checked) return;
          day.querySelectorAll(".wk-period").forEach(function (p) {
            var a = p.querySelector("[data-s]").value, z = p.querySelector("[data-e]").value;
            if (!a || !z || z <= a) bad = true;
            weekly.push({ weekday: Number(day.dataset.wd), start: a, end: z });
          });
        });
        if (bad) return toast("Confira os períodos: o fim precisa ser depois do início.", true);
        var settings = {
          buffer_min: Number($("st-buffer").value), slot_step_min: Number($("st-step").value), min_notice_min: Number($("st-notice").value),
          window_days: Number($("st-window").value), deposit_percent: Number($("st-deposit").value), cancel_deadline_hours: Number($("st-deadline").value),
          cancel_policy_text: $("st-policy").value.trim(), deposit_retention: $("st-retention").checked
        };
        setBusy(btn, true);
        rpc("admin_save_hours", { weekly: weekly, settings: settings }).then(function () { toast("Horários e regras salvos. A agenda do site já foi atualizada."); renderHours(); })
          .catch(function (e) { fail(e); setBusy(btn, false); });
      };
      $("to-new").onclick = timeOffForm;
      $("sd-new").onclick = specialDayForm;
      $("page").querySelectorAll("[data-del-to]").forEach(function (b) { b.onclick = function () { rpc("admin_delete_time_off", { id: b.dataset.delTo }).then(function () { toast("Bloqueio removido."); renderHours(); }).catch(fail); }; });
      $("page").querySelectorAll("[data-del-sd]").forEach(function (b) { b.onclick = function () { rpc("admin_delete_special_day", { id: b.dataset.delSd }).then(function () { toast("Data especial removida."); renderHours(); }).catch(fail); }; });
    }).catch(pageError);
  }
  function periodRow(p) {
    return '<div class="wk-period"><input type="time" data-s value="' + esc(p.start) + '" aria-label="Início"><span class="muted">às</span><input type="time" data-e value="' + esc(p.end) +
      '" aria-label="Fim"><button class="icon-btn" type="button" data-rmp aria-label="Remover período"><svg><use href="#i-x"/></svg></button></div>';
  }
  function numField(id, label, v, min, max) {
    return '<label class="field"><span>' + esc(label) + '</span><input id="' + id + '" type="number" inputmode="numeric" min="' + min + '" max="' + max + '" value="' + esc(v) + '"></label>';
  }
  function fmtRange(s, e) {
    var sd = s.slice(0, 10), ed = e.slice(0, 10);
    if (s.slice(11) === "00:00" && (e.slice(11) === "00:00" || e.slice(11) === "23:59")) {
      var last = e.slice(11) === "00:00" ? addDays(ed, -1) : ed;
      return sd === last ? cap(ui.longDate(sd)) + " · dia todo" : shortDate(sd) + " até " + shortDate(last) + " · dias inteiros";
    }
    return sd === ed ? cap(ui.longDate(sd)) + " · " + s.slice(11) + " às " + e.slice(11) : shortDate(sd) + " " + s.slice(11) + " até " + shortDate(ed) + " " + e.slice(11);
  }
  function timeOffForm() {
    var t = todayKey();
    var html = '<label class="field"><span>Tipo</span><select id="to-kind"><option value="folga">Folga</option><option value="ferias">Férias</option><option value="feriado">Feriado</option><option value="bloqueio" selected>Bloqueio de horário</option><option value="pausa">Pausa</option></select></label>' +
      '<label class="check"><input type="checkbox" id="to-full" checked> Dias inteiros</label>' +
      '<div class="grid2"><label class="field"><span>De</span><input id="to-sd" type="date" value="' + t + '"></label><label class="field"><span>Até</span><input id="to-ed" type="date" value="' + t + '"></label></div>' +
      '<div class="grid2" id="to-times" hidden><label class="field"><span>Hora inicial</span><input id="to-st" type="time" value="12:00"></label><label class="field"><span>Hora final</span><input id="to-et" type="time" value="14:00"></label></div>' +
      '<label class="field"><span>Motivo (só você vê)</span><input id="to-reason" type="text" maxlength="120"></label>' +
      '<button class="btn primary wide" type="button" id="to-save">Bloquear</button>';
    openModal("Novo bloqueio", html, function (b) {
      b.querySelector("#to-full").onchange = function () { b.querySelector("#to-times").hidden = this.checked; };
      b.querySelector("#to-save").onclick = function () {
        var btn = this, full = b.querySelector("#to-full").checked, sd = b.querySelector("#to-sd").value, ed = b.querySelector("#to-ed").value;
        if (!sd || !ed || ed < sd) return toast("Confira as datas.", true);
        var start = sd + " " + (full ? "00:00" : b.querySelector("#to-st").value), end = full ? addDays(ed, 1) + " 00:00" : ed + " " + b.querySelector("#to-et").value;
        setBusy(btn, true);
        rpc("admin_add_time_off", { kind: b.querySelector("#to-kind").value, start: start, end: end, reason: b.querySelector("#to-reason").value })
          .then(function (r) {
            closeModal(); renderHours();
            toast(r.conflicting_appointments ? "Bloqueio salvo. Atenção: há " + r.conflicting_appointments + " agendamento(s) nesse período — reagende ou cancele pelo painel." : "Bloqueio salvo.", !!r.conflicting_appointments);
          }).catch(function (e) { fail(e); setBusy(btn, false); });
      };
    });
  }
  function specialDayForm() {
    var html = '<label class="field"><span>Data</span><input id="sd-date" type="date" value="' + todayKey() + '"></label>' +
      '<label class="check"><input type="checkbox" id="sd-closed"> Fechado neste dia</label>' +
      '<div class="wk-periods" id="sd-periods">' + periodRow({ start: "09:00", end: "13:00" }) + '<button class="btn ghost sm" type="button" data-addp><svg><use href="#i-plus"/></svg>Adicionar período</button></div>' +
      '<label class="field" style="margin-top:12px"><span>Observação</span><input id="sd-note" type="text" maxlength="120"></label>' +
      '<button class="btn primary wide" type="button" id="sd-save">Salvar</button>';
    openModal("Data especial", html, function (b) {
      var box = b.querySelector("#sd-periods");
      b.querySelector("#sd-closed").onchange = function () { box.hidden = this.checked; };
      box.addEventListener("click", function (e) {
        var add = e.target.closest("[data-addp]"); if (add) add.insertAdjacentHTML("beforebegin", periodRow({ start: "14:00", end: "18:00" }));
        var rm = e.target.closest("[data-rmp]"); if (rm && box.querySelectorAll(".wk-period").length > 1) rm.closest(".wk-period").remove();
      });
      b.querySelector("#sd-save").onclick = function () {
        var btn = this, periods = [];
        if (!b.querySelector("#sd-closed").checked) box.querySelectorAll(".wk-period").forEach(function (p) { periods.push({ start: p.querySelector("[data-s]").value, end: p.querySelector("[data-e]").value }); });
        if (periods.some(function (p) { return !p.start || !p.end || p.end <= p.start; })) return toast("Confira os períodos.", true);
        setBusy(btn, true);
        rpc("admin_save_special_day", { date: b.querySelector("#sd-date").value, periods: periods, note: b.querySelector("#sd-note").value })
          .then(function () { toast("Data especial salva."); closeModal(); renderHours(); }).catch(function (e) { fail(e); setBusy(btn, false); });
      };
    });
  }

  /* ============================================================ PERSONALIZAÇÃO */
  var PRESETS = [
    { name: "Nude rosé", primary: "#b5786a", primaryDeep: "#9a5f52", soft: "#ecd6cf", accent: "#a8845a", bg: "#f7f0ea", ink: "#4a352c" },
    { name: "Lavanda", primary: "#7d6aa8", primaryDeep: "#5f4e8a", soft: "#e6def3", accent: "#b38f5c", bg: "#f6f3f8", ink: "#3b3346" },
    { name: "Champagne", primary: "#a88a5a", primaryDeep: "#7f6640", soft: "#efe4d0", accent: "#8b6f4e", bg: "#faf6ef", ink: "#3f3428" },
    { name: "Terracota", primary: "#b8664a", primaryDeep: "#8f4a33", soft: "#f2d9cd", accent: "#a5794d", bg: "#faf2ec", ink: "#45291f" },
    { name: "Grafite", primary: "#5b5560", primaryDeep: "#3d3842", soft: "#e4e1e6", accent: "#a2876a", bg: "#f5f4f2", ink: "#2b282d" }
  ];
  var COLOR_FIELDS = [["primary", "Cor principal"], ["primaryDeep", "Principal escura"], ["soft", "Tom suave"], ["accent", "Detalhes (dourado)"], ["bg", "Fundo"], ["ink", "Texto"]];

  function renderSite() {
    loadSettings().then(function (s) {
      var t = s.tenant, th = Object.assign({}, PRESETS[0], t.theme || {});
      var html =
        '<div class="page-head"><h2>Personalização do site</h2><a class="btn ghost sm" href="' + esc($("side-site").href) + '" target="_blank" rel="noopener"><svg><use href="#i-ext"/></svg>Ver meu site</a>' +
        "<p>Estas informações aparecem no seu site público e na sua tela de login.</p></div>" +
        '<div class="card"><h3>Marca</h3>' +
          '<label class="field"><span>Nome da empresa</span><input id="pf-name" type="text" maxlength="80" value="' + esc(t.name) + '"></label>' +
          '<div class="grid2"><label class="field"><span>Nome em destaque</span><input id="pf-word" type="text" maxlength="30" value="' + esc(th.wordmark || "") + '"></label>' +
          '<label class="field"><span>Complemento</span><input id="pf-subtitle" type="text" maxlength="40" value="' + esc(th.subtitle || "") + '"></label></div>' +
          '<label class="field"><span>Descrição / frase de apresentação</span><textarea id="pf-tagline" maxlength="240">' + esc(t.tagline) + "</textarea></label>" +
          imageField("pf-logo", "Logo", t.logo_url) + imageField("pf-hero", "Foto principal", t.hero_url) + "</div>" +
        '<div class="card"><h3>Cores da identidade visual</h3><div class="swatches">' + PRESETS.map(function (p, i) {
          return '<button class="swatch" type="button" data-preset="' + i + '"><i style="background:' + p.primary + '"></i>' + esc(p.name) + "</button>";
        }).join("") + '</div><div class="grid3">' + COLOR_FIELDS.map(function (c) {
          return '<label class="field"><span>' + esc(c[1]) + '</span><input type="color" data-color="' + c[0] + '" value="' + esc(th[c[0]]) + '"></label>';
        }).join("") + "</div></div>" +
        '<div class="card"><h3>Contato e localização</h3>' +
          '<div class="grid2"><label class="field"><span>WhatsApp (com DDD)</span><input id="pf-wa" type="tel" value="' + esc(formatPhone(t.whatsapp)) + '"></label>' +
          '<label class="field"><span>Instagram (link)</span><input id="pf-ig" type="url" value="' + esc(t.instagram_url) + '"></label></div>' +
          '<label class="field"><span>Endereço</span><input id="pf-a1" type="text" maxlength="120" value="' + esc(t.address_line1) + '"></label>' +
          '<label class="field"><span>Bairro · cidade · CEP</span><input id="pf-a2" type="text" maxlength="120" value="' + esc(t.address_line2) + '"></label>' +
          '<label class="check"><input type="checkbox" id="pf-ademo"' + (t.address_is_demo ? " checked" : "") + "> Mostrar aviso de endereço fictício</label>" +
          '<label class="field"><span>Link do Google Maps</span><input id="pf-maps" type="url" value="' + esc(t.maps_url) + '"></label>' +
          '<label class="field"><span>Chave Pix (mostrada à cliente para o sinal)</span><input id="pf-pix" type="text" maxlength="120" value="' + esc(t.pix_key) + '"></label></div>' +
        '<div class="card"><h3>Galeria de resultados</h3><p class="note">Use fotos dos seus trabalhos, com autorização das clientes. Marque “ilustrativa” para imagens de banco de fotos.</p><div id="gal"></div>' +
          '<button class="btn ghost sm" type="button" id="gal-add"><svg><use href="#i-plus"/></svg>Adicionar foto</button></div>' +
        '<p class="note">Procedimentos e valores ficam em <button class="link" type="button" data-page="services">Procedimentos e valores</button>.</p>' +
        '<div class="save-bar"><button class="btn primary" type="button" id="pf-save">Salvar personalização</button></div>';
      $("page").innerHTML = html;
      var p = $("page");
      bindImageField(p, "pf-logo"); bindImageField(p, "pf-hero");
      $("pf-wa").addEventListener("input", function () { this.value = ui.maskPhone(this.value); });
      p.querySelectorAll("[data-preset]").forEach(function (b) {
        b.onclick = function () {
          var pr = PRESETS[Number(b.dataset.preset)];
          p.querySelectorAll("[data-color]").forEach(function (c) { c.value = pr[c.dataset.color]; });
          previewTheme();
        };
      });
      p.querySelectorAll("[data-color]").forEach(function (c) { c.addEventListener("input", previewTheme); });
      function readTheme() {
        var out = Object.assign({}, t.theme || {});
        p.querySelectorAll("[data-color]").forEach(function (c) { out[c.dataset.color] = c.value; });
        out.wordmark = $("pf-word").value.trim(); out.subtitle = $("pf-subtitle").value.trim();
        return out;
      }
      function previewTheme() { applyTheme(readTheme(), $("pf-logo").value, $("pf-hero").value); }

      var gal = (s.gallery || []).map(function (g) { return { title: g.title, after_url: g.after_url, before_url: g.before_url || "", is_illustrative: g.is_illustrative, credit: g.credit }; });
      function renderGal() {
        $("gal").innerHTML = gal.map(function (g, i) {
          return '<div class="gal-item" data-g="' + i + '"><label class="field"><span>Título</span><input class="input" data-gk="title" value="' + esc(g.title) + '"></label>' +
            imageField("gal-a" + i, "Foto (depois)", g.after_url) + imageField("gal-b" + i, "Foto do antes (opcional)", g.before_url) +
            '<label class="check"><input type="checkbox" data-gk="is_illustrative"' + (g.is_illustrative ? " checked" : "") + '> Foto ilustrativa (não é trabalho meu)</label>' +
            '<button class="btn danger sm" type="button" data-grm="' + i + '">Remover</button></div>';
        }).join("") || '<p class="empty">Nenhuma foto.</p>';
        gal.forEach(function (g, i) { bindImageField($("gal"), "gal-a" + i); bindImageField($("gal"), "gal-b" + i); });
        $("gal").querySelectorAll("[data-grm]").forEach(function (b) { b.onclick = function () { syncGal(); gal.splice(Number(b.dataset.grm), 1); renderGal(); }; });
      }
      function syncGal() {
        $("gal").querySelectorAll(".gal-item").forEach(function (el) {
          var i = Number(el.dataset.g);
          gal[i].title = el.querySelector('[data-gk="title"]').value.trim();
          gal[i].is_illustrative = el.querySelector('[data-gk="is_illustrative"]').checked;
          gal[i].after_url = el.querySelector("#gal-a" + i).value.trim();
          gal[i].before_url = el.querySelector("#gal-b" + i).value.trim();
        });
      }
      renderGal();
      $("gal-add").onclick = function () { syncGal(); gal.push({ title: "", after_url: "", before_url: "", is_illustrative: false }); renderGal(); };

      $("pf-save").onclick = function () {
        var btn = this;
        syncGal();
        if (gal.some(function (g) { return !g.after_url || !g.title; })) return toast("Cada foto da galeria precisa de título e imagem.", true);
        var profile = {
          name: $("pf-name").value.trim(), tagline: $("pf-tagline").value.trim(), logo_url: $("pf-logo").value.trim(), hero_url: $("pf-hero").value.trim(),
          theme: readTheme(), whatsapp: $("pf-wa").value, instagram_url: $("pf-ig").value.trim(), address_line1: $("pf-a1").value.trim(),
          address_line2: $("pf-a2").value.trim(), address_is_demo: $("pf-ademo").checked, maps_url: $("pf-maps").value.trim(), pix_key: $("pf-pix").value.trim()
        };
        if (profile.name.length < 2) return toast("Informe o nome da empresa.", true);
        var wa = profile.whatsapp.replace(/\D/g, "");
        if (wa.length && wa.length < 10) return toast("Confira o WhatsApp (com DDD).", true);
        profile.whatsapp = wa.length && wa.length <= 11 ? "55" + wa : wa;
        setBusy(btn, true);
        rpc("admin_save_profile", { profile: profile })
          .then(function () { return rpc("admin_save_gallery", { items: gal }); })
          .then(function () { toast("Personalização salva. Seu site já mostra as mudanças."); return loadSettings(); })
          .then(function () { renderSite(); })
          .catch(function (e) { fail(e); setBusy(btn, false); });
      };
    }).catch(pageError);
  }
  function formatPhone(d) {
    d = String(d || "").replace(/\D/g, "");
    if (d.length >= 12 && d.indexOf("55") === 0) d = d.slice(2);
    return ui.maskPhone(d);
  }

  /* ============================================================ INÍCIO */
  /** Link do e-mail com erro (ex.: expirado) */
  function linkError() {
    var h = root.location.hash;
    if (!/error_description=|error_code=/.test(h)) return false;
    try { root.history.replaceState(null, "", root.location.pathname + root.location.search); } catch (e) { /* ignore */ }
    showAuth("forgot");
    var err = $("forgot-error");
    err.textContent = /expired/i.test(h) ? "Este link expirou ou já foi usado. Peça um novo abaixo." : "Não foi possível validar o link. Peça um novo abaixo.";
    err.hidden = false;
    return true;
  }
  // o link de recuperação pode abrir com a página já carregada (só muda o #)
  root.addEventListener("hashchange", function () {
    if (!api) return;
    if (linkError()) return;
    if (/access_token=/.test(root.location.hash)) {
      var type = api.auth.consumeRedirect();
      if (type === "recovery") showAuth("reset"); else enter().catch(function () { showAuth("login"); });
    }
  });

  function boot() {
    if (!api) { loadBranding(); showAuth("offline"); return; }
    var redirect = api.auth.consumeRedirect();
    loadBranding().then(function () {
      if (linkError()) return;
      if (redirect === "recovery") return showAuth("reset");
      if (api.auth.session()) return enter().catch(function () { showAuth("login"); });
      showAuth("login");
    });
  }
  B.admin = { state: state, go: go };
  boot();
})(window);
