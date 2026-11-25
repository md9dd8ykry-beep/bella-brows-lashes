/**
 * CONTEÚDO DO SITE — preenche textos, links, procedimentos, resultados e mapa
 * a partir de `Bella.config`. Quando existir o painel administrativo, basta
 * a configuração vir da API para o site refletir as alterações.
 */
(function (root) {
  "use strict";
  var B = root.Bella, ui = B.ui, cfg = B.config;

  /* --------------------------------------------- textos e links da config */
  function get(path) { return path.split(".").reduce(function (o, k) { return o && o[k]; }, cfg); }

  function bindTexts() {
    document.querySelectorAll("[data-bind]").forEach(function (el) { el.textContent = get(el.dataset.bind); });
    document.querySelectorAll("[data-bind-src]").forEach(function (el) { el.src = get(el.dataset.bindSrc); });
  }

  function bindLinks() {
    var links = {
      whatsapp: ui.waLink(cfg.contact.whatsappMessage),
      instagram: cfg.contact.instagramUrl,
      maps: cfg.location.mapsUrl
    };
    document.querySelectorAll("[data-link]").forEach(function (a) { a.href = links[a.dataset.link]; });
  }

  /* ------------------------------------------------------- procedimentos */
  function renderServices() {
    var box = document.getElementById("services-list");
    box.innerHTML = cfg.services.map(function (s) {
      return '<article class="service">' +
        '<div class="service-img"><img src="' + ui.esc(s.image) + '" alt="" loading="lazy" width="800" height="600"><span class="img-tag">Ilustração</span></div>' +
        '<div class="service-body">' +
          '<h3>' + ui.esc(s.name) + '</h3>' +
          '<p>' + ui.esc(s.description) + '</p>' +
          '<div class="service-meta"><span><svg aria-hidden="true"><use href="#i-clock"/></svg>' + ui.duration(s.durationMin) + '</span>' +
          '<strong>' + ui.money(s.price) + '</strong></div>' +
          '<button class="btn-primary btn-sm" type="button" data-book="' + ui.esc(s.id) + '">Selecionar e agendar</button>' +
        '</div></article>';
    }).join("");
    box.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-book]");
      if (btn) B.booking.open([btn.dataset.book]);
    });
  }

  /* ------------------------------------------------------ resultados */
  // Para usar fotos reais: troque os arquivos (mesmo nome) ou edite esta lista.
  var RESULTS = [
    { title: "Design de sobrancelha", before: "assets/img/resultado-design-antes.svg", after: "assets/img/resultado-design-depois.svg" },
    { title: "Design com henna", before: "assets/img/resultado-henna-antes.svg", after: "assets/img/resultado-henna-depois.svg" },
    { title: "Brow Lamination", before: "assets/img/resultado-lamination-antes.svg", after: "assets/img/resultado-lamination-depois.svg" },
    { title: "Extensão de cílios", before: "assets/img/resultado-cilios-antes.svg", after: "assets/img/resultado-cilios-depois.svg" }
  ];

  function renderResults() {
    var box = document.getElementById("results-list");
    box.innerHTML = RESULTS.map(function (r, i) {
      return '<figure class="result">' +
        '<div class="compare" style="--pos:50%">' +
          '<img class="cmp-after" src="' + ui.esc(r.after) + '" alt="Ilustração depois: ' + ui.esc(r.title) + '" loading="lazy" width="600" height="600">' +
          '<div class="cmp-before"><img src="' + ui.esc(r.before) + '" alt="Ilustração antes: ' + ui.esc(r.title) + '" loading="lazy" width="600" height="600"></div>' +
          '<span class="cmp-line" aria-hidden="true"><i></i></span>' +
          '<span class="cmp-label l">Antes</span><span class="cmp-label r">Depois</span>' +
          '<input class="cmp-range" type="range" min="0" max="100" value="50" aria-label="Comparar antes e depois — ' + ui.esc(r.title) + '">' +
        '</div>' +
        '<figcaption>' + ui.esc(r.title) + '<small>Imagem ilustrativa</small></figcaption>' +
      '</figure>';
    }).join("");

    box.addEventListener("input", function (e) {
      if (e.target.classList.contains("cmp-range")) e.target.parentNode.style.setProperty("--pos", e.target.value + "%");
    });

    var items = box.children, count = document.getElementById("results-count");
    function current() {
      var w = items[0].getBoundingClientRect().width || 1;
      return Math.round(box.scrollLeft / (w + 16));
    }
    function go(i) {
      i = Math.max(0, Math.min(items.length - 1, i));
      box.scrollTo({ left: items[i].offsetLeft - box.offsetLeft, behavior: "smooth" });
    }
    box.addEventListener("scroll", function () { count.textContent = (current() + 1) + " / " + items.length; }, { passive: true });
    document.querySelectorAll("[data-results]").forEach(function (b) {
      b.addEventListener("click", function () { go(current() + (b.dataset.results === "next" ? 1 : -1)); });
    });
    box.addEventListener("keydown", function (e) {
      if (e.target.classList.contains("cmp-range")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(current() + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(current() - 1); }
    });
  }

  /* --------------------------------------------------------------- mapa */
  function renderMap() {
    var url = cfg.location.mapsEmbedUrl;
    if (!url) return; // mantém o mapa ilustrativo
    var box = document.getElementById("map-box");
    box.innerHTML = '<iframe title="Mapa" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="' + ui.esc(url) + '"></iframe>';
  }

  /* ---------------------------------------- prévia do painel (demonstração) */
  function renderPanel() {
    var list = B.bookingRepository.list()
      .filter(function (b) { return b.date >= B.scheduler.dateKey(new Date()); })
      .sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
    var box = document.getElementById("panel-list");
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

  function initPanel() {
    var dlg = document.getElementById("panel");
    document.getElementById("open-panel").addEventListener("click", function () { renderPanel(); ui.openDialog(dlg); });
    dlg.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]") || e.target === dlg) ui.closeDialog(dlg);
      var c = e.target.closest("[data-cancel]");
      if (c) { B.bookingRepository.cancel(c.dataset.cancel); renderPanel(); ui.toast("Agendamento cancelado — o horário voltou a ficar livre."); }
    });
    dlg.addEventListener("close", function () { document.documentElement.classList.remove("no-scroll"); });
    document.getElementById("reset-demo").addEventListener("click", function () {
      B.bookingRepository.resetDemo(); renderPanel(); ui.toast("Demonstração restaurada.");
    });
  }

  B.site = { renderPanel: renderPanel };

  B.bookingRepository.load();
  bindTexts();
  bindLinks();
  renderServices();
  renderResults();
  renderMap();
  initPanel();
})(window);
