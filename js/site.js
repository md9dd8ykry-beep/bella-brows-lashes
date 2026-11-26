/**
 * SITE PÚBLICO — conteúdo e navegação por telas
 * ------------------------------------------------------------------
 * A página inicial mostra logo, apresentação e os botões. Cada botão abre
 * SOMENTE a sua tela (Procedimentos e Valores, Resultados, Localização,
 * Fale Conosco); a Agenda Inteligente abre em tela cheia.
 * A navegação usa o endereço (#procedimentos, #resultados…), então o botão
 * "voltar" do celular funciona e não há recarregamento de página.
 */
(function (root) {
  "use strict";
  var B = root.Bella, ui = B.ui;
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["inicio", "procedimentos", "resultados", "localizacao", "contato"];

  function cfg() { return B.config; }
  function get(path) { return path.split(".").reduce(function (o, k) { return o && o[k]; }, cfg()); }

  /** Imagem com alternativa local caso a foto externa não carregue */
  function setImg(img, src, fallback) {
    img.onerror = function () { img.onerror = null; if (fallback) img.src = fallback; else img.style.visibility = "hidden"; };
    img.src = src || fallback || "";
  }
  B.imgTag = function (src, fallback, alt, extra) {
    return '<img src="' + ui.esc(src || fallback || "") + '" alt="' + ui.esc(alt || "") + '"' + (extra || "") +
      (fallback ? ' onerror="this.onerror=null;this.src=\'' + ui.esc(fallback) + '\'"' : "") + ">";
  };

  /* ---------------------------------------------------------- textos */
  function bindTexts() {
    document.querySelectorAll("[data-bind]").forEach(function (el) { el.textContent = get(el.dataset.bind) || ""; });
    var c = cfg();
    document.title = c.brand.name + (c.isDemoTenant !== false ? " — demonstração" : "");
    setImg($("hero-img"), c.brand.heroImage, c.brand.heroFallback);
    setImg($("brand-logo"), c.brand.logo, "assets/img/logo-marca.svg");
    var fav = document.querySelector('link[rel="icon"]');
    if (fav && c.brand.logo) fav.href = c.brand.logo;
    $("addr-demo").hidden = !c.location.isDemo;
    $("wa-label").textContent = (B.repo.mode === "local" || c.isDemoTenant) ? "Número demonstrativo" : "WhatsApp";
    $("admin-link").href = "admin/?p=" + encodeURIComponent(B.slug);
    var strip = $("mode-strip");
    if (B.repo.mode === "local") strip.textContent = "Demonstração local · reservas ficam só neste navegador";
    else if (c.isDemoTenant) strip.textContent = "Site de demonstração · profissional e dados fictícios";
    else strip.hidden = true;
    $("open-panel").hidden = B.repo.mode !== "local";
    $("services-note").hidden = !(B.repo.mode === "local" || c.isDemoTenant);
  }

  function bindLinks() {
    var links = {
      whatsapp: ui.waLink(cfg().contact.whatsappMessage),
      instagram: cfg().contact.instagramUrl || "https://www.instagram.com/",
      maps: cfg().location.mapsUrl || "https://www.google.com/maps"
    };
    document.querySelectorAll("[data-link]").forEach(function (a) { a.href = links[a.dataset.link]; });
  }

  /* --------------------------------------------------- procedimentos */
  function renderServices() {
    var box = $("services-list");
    if (!cfg().services.length) { box.innerHTML = '<p class="empty">Nenhum procedimento disponível no momento.</p>'; return; }
    box.innerHTML = cfg().services.map(function (s) {
      return '<article class="service">' +
        '<div class="service-img">' + B.imgTag(s.image, s.fallback || "assets/img/placeholder.svg", "", ' loading="lazy" width="800" height="600"') +
        '<span class="img-tag">Foto ilustrativa</span></div>' +
        '<div class="service-body">' +
          '<h3>' + ui.esc(s.name) + '</h3>' +
          '<p>' + ui.esc(s.description) + '</p>' +
          '<div class="service-meta"><span><svg aria-hidden="true"><use href="#i-clock"/></svg>' + ui.duration(s.durationMin) + '</span>' +
          '<strong>' + ui.money(s.price) + '</strong></div>' +
          '<button class="btn-primary btn-sm" type="button" data-book="' + ui.esc(s.id) + '">Selecionar e agendar</button>' +
        '</div></article>';
    }).join("");
  }
  $("services-list").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-book]");
    if (btn) B.booking.open([btn.dataset.book]);
  });

  /* ------------------------------------------------------ resultados */
  function renderResults() {
    var items = cfg().gallery || [];
    var box = $("results-list");
    var anyBefore = items.some(function (r) { return r.before_url; });
    $("results-help").textContent = anyBefore ? "Arraste a linha central para comparar o antes e o depois." : "Deslize para ver mais fotos.";
    $("results-notice").hidden = !items.some(function (r) { return r.is_illustrative; });
    if (!items.length) { box.innerHTML = '<p class="empty">Em breve, fotos dos nossos trabalhos.</p>'; $("results-count").textContent = ""; return; }
    box.innerHTML = items.map(function (r) {
      var tag = r.is_illustrative ? '<span class="cmp-label r">Foto ilustrativa</span>' : "";
      var inner = r.before_url
        ? '<div class="compare" style="--pos:50%">' +
            B.imgTag(r.after_url, "", "Depois: " + r.title, ' class="cmp-after" loading="lazy" width="600" height="600"') +
            '<div class="cmp-before">' + B.imgTag(r.before_url, "", "Antes: " + r.title, ' loading="lazy" width="600" height="600"') + '</div>' +
            '<span class="cmp-line" aria-hidden="true"><i></i></span>' +
            '<span class="cmp-label l">Antes</span><span class="cmp-label r">Depois</span>' +
            '<input class="cmp-range" type="range" min="0" max="100" value="50" aria-label="Comparar antes e depois — ' + ui.esc(r.title) + '">' +
          '</div>'
        : '<div class="compare single">' + B.imgTag(r.after_url, "assets/img/placeholder.svg", r.title, ' loading="lazy" width="600" height="600"') + tag + '</div>';
      return '<figure class="result">' + inner + '<figcaption>' + ui.esc(r.title) +
        (r.is_illustrative ? '<small>Imagem ilustrativa</small>' : "") + '</figcaption></figure>';
    }).join("");
    updateCount();
  }
  var resBox = $("results-list");
  resBox.addEventListener("input", function (e) {
    if (e.target.classList.contains("cmp-range")) e.target.parentNode.style.setProperty("--pos", e.target.value + "%");
  });
  function currentResult() {
    var it = resBox.children[0];
    var w = it ? it.getBoundingClientRect().width : 1;
    return Math.round(resBox.scrollLeft / ((w || 1) + 16));
  }
  function updateCount() { $("results-count").textContent = resBox.children.length ? (currentResult() + 1) + " / " + resBox.children.length : ""; }
  function goResult(i) {
    var items = resBox.children;
    if (!items.length) return;
    i = Math.max(0, Math.min(items.length - 1, i));
    resBox.scrollTo({ left: items[i].offsetLeft - resBox.offsetLeft, behavior: "smooth" });
  }
  resBox.addEventListener("scroll", updateCount, { passive: true });
  document.querySelectorAll("[data-results]").forEach(function (b) {
    b.addEventListener("click", function () { goResult(currentResult() + (b.dataset.results === "next" ? 1 : -1)); });
  });
  resBox.addEventListener("keydown", function (e) {
    if (e.target.classList.contains("cmp-range")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); goResult(currentResult() + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goResult(currentResult() - 1); }
  });

  /* ------------------------------------------------------------ mapa */
  function renderMap() {
    var url = cfg().location.mapsEmbedUrl;
    if (!url) return;
    $("map-box").innerHTML = '<iframe title="Mapa" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="' + ui.esc(url) + '"></iframe>';
  }

  /* ---------------------------------------------- navegação por telas */
  function currentView() {
    var h = root.location.hash.replace("#", "");
    return VIEWS.indexOf(h) !== -1 ? h : "inicio";
  }
  function showView(name, focus) {
    document.querySelectorAll(".view").forEach(function (v) {
      var on = v.dataset.view === name;
      v.hidden = !on;
      if (on) { v.classList.remove("enter"); void v.offsetWidth; v.classList.add("enter"); }
    });
    root.scrollTo(0, 0);
    if (name === "resultados") updateCount();
    if (focus && name !== "inicio") {
      var h = document.querySelector('.view[data-view="' + name + '"] h2');
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
  }
  B.showView = showView;
  root.addEventListener("hashchange", function () {
    if (root.location.hash === "#agenda") return; // tratado pela agenda
    showView(currentView(), true);
  });
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-go]");
    if (!a) return;
    e.preventDefault();
    var target = a.dataset.go;
    if (target === "inicio") {
      // volta no histórico quando possível (gesto natural no celular)
      if (B._cameFromHome && currentView() !== "inicio") root.history.back();
      else { root.history.pushState(null, "", root.location.pathname + root.location.search); showView("inicio"); }
      B._cameFromHome = false;
      return;
    }
    B._cameFromHome = currentView() === "inicio";
    if (currentView() === target) { showView(target, true); return; }
    root.location.hash = target;
  });

  /* --------------------------------------- cancelar / remarcar (cliente) */
  var mg = $("manage");
  function mgType() { return (document.querySelector('input[name="mg-type"]:checked') || {}).value; }
  function mgSync() {
    $("mg-pref-wrap").hidden = mgType() !== "reschedule";
    var p = cfg().policy || {};
    $("mg-policy").textContent = p.text ? "Política: " + p.text : "";
  }
  $("open-manage").addEventListener("click", function (e) { e.preventDefault(); B.openManage(); });
  B.openManage = function (code, phone) {
    $("manage-form").hidden = false; $("mg-done").hidden = true; $("mg-error").hidden = true;
    if (code) $("mg-code").value = code;
    if (phone) $("mg-phone").value = phone;
    mgSync();
    ui.openDialog(mg);
  };
  document.querySelectorAll('input[name="mg-type"]').forEach(function (r) { r.addEventListener("change", mgSync); });
  $("mg-phone").addEventListener("input", function () { this.value = ui.maskPhone(this.value); });
  $("manage-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = $("mg-code").value.trim(), phone = $("mg-phone").value;
    var err = $("mg-error");
    if (code.length < 4 || phone.replace(/\D/g, "").length < 10) { err.textContent = "Informe o protocolo e o WhatsApp com DDD."; err.hidden = false; return; }
    var btn = $("mg-submit"); btn.disabled = true; btn.textContent = "Enviando…";
    B.repo.requestChange({ code: code, phone: phone, type: mgType(), reason: $("mg-reason").value, preferred: $("mg-pref").value })
      .then(function (r) {
        var what = mgType() === "cancel" ? "cancelamento" : "remarcação";
        $("mg-done-text").textContent = r.local
          ? "Pedido conferido nesta demonstração local. Com o servidor conectado, ele aparece no painel da profissional."
          : "Pedido de " + what + " enviado. A profissional vai analisar e responder pelo WhatsApp." +
            (r.within_deadline && cfg().policy.text ? " Atenção: o pedido foi feito com menos antecedência do que pede a política de cancelamento." : "");
        $("mg-wa").href = ui.waLink("Olá! Enviei pelo site um pedido de " + what + " do agendamento " + code.toUpperCase() + ".");
        $("manage-form").hidden = true; $("mg-done").hidden = false;
      }, function (er) { err.textContent = er.message; err.hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = "Enviar pedido"; });
  });
  mg.addEventListener("click", function (e) { if (e.target.closest("[data-close]") || e.target === mg) ui.closeDialog(mg); });
  mg.addEventListener("close", function () { document.documentElement.classList.remove("no-scroll"); });

  /* --------------------------------- painel local (só no modo demonstração) */
  function renderPanel() {
    var list = B.bookingRepository.list()
      .filter(function (b) { return b.date >= B.scheduler.dateKey(new Date()); })
      .sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
    var box = $("panel-list");
    if (!list.length) { box.innerHTML = '<p class="empty">Nenhum agendamento futuro.</p>'; return; }
    var html = "", last = "";
    list.forEach(function (b) {
      if (b.date !== last) { html += '<h4 class="pn-day">' + ui.esc(ui.longDate(b.date).replace(/^./, function (c) { return c.toUpperCase(); })) + '</h4>'; last = b.date; }
      var cancelled = b.status === "cancelled";
      html += '<div class="pn-item' + (cancelled ? " is-cancelled" : "") + (b.source === "site" ? " is-mine" : "") + '">' +
        '<span class="pn-time">' + ui.esc(b.start) + '<small>' + ui.esc(b.end) + '</small></span>' +
        '<span class="pn-info"><strong>' + ui.esc(b.client.name) + '</strong><small>' + ui.esc(b.serviceNames.join(" + ")) + '</small>' +
        (b.source === "site" ? '<em>Feito por você</em>' : "") + (cancelled ? '<em>Cancelado</em>' : "") + '</span>' +
        (cancelled ? "" : '<button class="btn-ghost btn-xs" type="button" data-cancel="' + ui.esc(b.id) + '">Cancelar</button>') +
      '</div>';
    });
    box.innerHTML = html;
  }
  var panel = $("panel");
  $("open-panel").addEventListener("click", function () { renderPanel(); ui.openDialog(panel); });
  panel.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]") || e.target === panel) ui.closeDialog(panel);
    var c = e.target.closest("[data-cancel]");
    if (c) { B.bookingRepository.cancel(c.dataset.cancel); renderPanel(); ui.toast("Agendamento cancelado — o horário voltou a ficar livre."); }
  });
  panel.addEventListener("close", function () { document.documentElement.classList.remove("no-scroll"); });
  $("reset-demo").addEventListener("click", function () { B.bookingRepository.resetDemo(); renderPanel(); ui.toast("Demonstração restaurada."); });

  /* ------------------------------------------------------------ início */
  showView(currentView());
  B.ready.then(function () {
    B.applyTheme(cfg().brand.theme);
    bindTexts();
    bindLinks();
    renderServices();
    renderResults();
    renderMap();
    document.body.classList.add("is-ready");
    $("loading").hidden = true;
    if (root.location.hash === "#agenda") B.booking.open([]);
  }, function (err) {
    $("loading").hidden = true;
    var box = $("load-error");
    box.hidden = false;
    box.innerHTML = "<strong>Não foi possível carregar este site.</strong><br>" + ui.esc(err.message) +
      '<br><button class="btn-outline" type="button" onclick="location.reload()">Tentar de novo</button>';
  });
})(window);
