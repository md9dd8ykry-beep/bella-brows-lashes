/**
 * FONTE DE DADOS DO SITE PÚBLICO
 * ------------------------------------------------------------------
 * Dois modos, com a mesma interface para o resto do site:
 *
 *  • PLATAFORMA (Supabase configurado em js/platform.config.js)
 *      - perfil, serviços, galeria e regras vêm do banco (public_site)
 *      - horários ocupados vêm de public_busy (sem dados pessoais)
 *      - a reserva é gravada por public_book, que revalida TUDO no servidor
 *        e usa uma restrição do banco contra reservas sobrepostas
 *
 *  • DEMONSTRAÇÃO LOCAL (sem servidor)
 *      - usa js/config.js + js/storage.js (localStorage, só neste navegador)
 *
 * Interface exposta em Bella.repo:
 *   list()                 → agendamentos/ocupações conhecidos (síncrono, cache)
 *   refresh()              → Promise: atualiza o cache
 *   create(dados)          → Promise<agendamento>  (erro code=SLOT_TAKEN se ocupado)
 *   requestChange(dados)   → Promise (cancelamento/remarcação pela cliente)
 */
(function (root) {
  "use strict";
  var B = root.Bella, S = B.scheduler;
  var params = new URLSearchParams(root.location.search);
  var slug = (params.get("p") || (B.platform && B.platform.defaultSlug) || "bella").toLowerCase();

  /* ----------------------------------------------------------- relógio */
  // No modo plataforma usamos o "agora" no fuso da profissional (vem do servidor).
  var clockBase = null;
  B.now = function () {
    if (!clockBase) return new Date();
    var elapsed = Date.now() - clockBase.fetched;
    var d = S.parseKey(clockBase.today);
    d.setMinutes(clockBase.nowMin);
    return new Date(d.getTime() + elapsed);
  };

  /* ----------------------------------------------------- identidade visual */
  B.applyTheme = function (theme) {
    if (!theme) return;
    var map = { primary: "--rose", primaryDeep: "--rose-deep", soft: "--rose-soft", accent: "--gold", bg: "--cream", ink: "--ink" };
    Object.keys(map).forEach(function (k) {
      if (theme[k] && /^#[0-9a-f]{3,8}$/i.test(theme[k])) document.documentElement.style.setProperty(map[k], theme[k]);
    });
    if (theme.bg) {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", theme.bg);
    }
  };

  /* ================================================== MODO PLATAFORMA */
  function toConfig(site) {
    var t = site.tenant, a = site.agenda, cfg = B.config, th = t.theme || {};
    cfg.professionalId = t.slug;
    cfg.brand = {
      name: t.name, shortName: th.wordmark || t.name.split(" ")[0], tagline: t.tagline,
      logo: t.logo_url || "", heroImage: t.hero_url || "assets/img/placeholder.svg", heroFallback: "assets/img/placeholder.svg",
      wordmark: th.wordmark || t.name, subtitle: th.subtitle || "", theme: th, year: new Date().getFullYear()
    };
    cfg.contact = {
      whatsapp: t.whatsapp || "", whatsappDisplay: formatPhone(t.whatsapp),
      whatsappMessage: "Olá! Vim pelo site da " + t.name + " e gostaria de tirar uma dúvida.",
      instagramUrl: t.instagram_url || "https://www.instagram.com/", instagramHandle: ""
    };
    cfg.location = {
      isDemo: !!t.address_is_demo, line1: t.address_line1, line2: t.address_line2,
      hours: describeHours(a.weekly), mapsUrl: t.maps_url || "https://www.google.com/maps", mapsEmbedUrl: ""
    };
    cfg.services = site.services.map(function (s) {
      return { id: s.id, name: s.name, description: s.description, durationMin: s.duration_min, price: Number(s.price),
               image: s.image_url || "assets/img/placeholder.svg", fallback: "assets/img/placeholder.svg" };
    });
    var special = {};
    (a.special_days || []).forEach(function (d) { special[d.date] = d.periods || []; });
    cfg.agenda = {
      weekly: a.weekly, specialDays: special, periods: [], workDays: [],
      slotStepMin: a.slot_step_min, bufferMin: a.buffer_min, minNoticeMin: a.min_notice_min,
      bookingWindowDays: a.window_days, depositPercent: a.deposit_percent,
      blockedDates: [], blockedRanges: []
    };
    cfg.payment = { provider: "manual-pix", pixKeyDisplay: t.pix_key || "" };
    cfg.policy = { text: a.cancel_policy_text || "", deadlineHours: a.cancel_deadline_hours, retention: a.deposit_retention };
    cfg.gallery = site.gallery || [];
    cfg.isDemoTenant = !!t.is_demo;
    clockBase = { today: a.today, nowMin: a.now_min, fetched: Date.now() };
  }

  function formatPhone(d) {
    d = String(d || "").replace(/\D/g, "");
    if (d.length >= 12 && d.indexOf("55") === 0) d = d.slice(2);
    if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return d;
  }

  var WD = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  function describeHours(weekly) {
    if (!weekly || !weekly.length) return "";
    var byDay = {};
    weekly.forEach(function (w) {
      (byDay[w.weekday] = byDay[w.weekday] || []).push(w.start.replace(":00", "h").replace(":", "h") + " às " + w.end.replace(":00", "h").replace(":", "h"));
    });
    var groups = [];
    Object.keys(byDay).map(Number).sort().forEach(function (d) {
      var txt = byDay[d].join(" e "), last = groups[groups.length - 1];
      if (last && last.txt === txt && last.to === d - 1) last.to = d; else groups.push({ from: d, to: d, txt: txt });
    });
    return groups.map(function (g) {
      var days = g.from === g.to ? WD[g.from] : WD[g.from] + " a " + WD[g.to].toLowerCase();
      return days + " · " + g.txt;
    }).join(" | ");
  }

  function remoteRepo(api) {
    var cache = [];
    function applyBusy(busy) {
      cache = busy.bookings.map(function (b) { return { date: b.date, start: b.start, durationMin: b.durationMin, status: "confirmed" }; });
      var full = [], ranges = [];
      busy.blocks.forEach(function (k) {
        if (k.start === "00:00" && k.end === "24:00") full.push({ date: k.date, reason: "Indisponível" });
        else ranges.push({ date: k.date, start: k.start, end: k.end });
      });
      B.config.agenda.blockedDates = full;
      B.config.agenda.blockedRanges = ranges;
    }
    var repo = {
      mode: "platform",
      list: function () { return cache.slice(); },
      refresh: function () {
        return api.rpc("public_busy", { slug: slug }).then(applyBusy);
      },
      create: function (input) {
        return api.rpc("public_book", {
          slug: slug, date: input.date, start: input.start, service_ids: input.serviceIds,
          name: input.client.name, phone: input.client.phone, accept_policy: !!input.acceptPolicy
        }).then(function (r) {
          return Object.assign({}, input, { code: r.code, status: r.status, end: r.end, totalPrice: Number(r.total),
                                            deposit: Number(r.deposit_due), durationMin: r.duration_min });
        }, function (err) {
          if (err.code === "SLOT_TAKEN" || err.code === "BLOCKED" || err.code === "TOO_SOON") {
            err.code = "SLOT_TAKEN";
            return repo.refresh().then(function () { throw err; });
          }
          throw err;
        });
      },
      requestChange: function (d) {
        return api.rpc("public_request_change", { slug: slug, code: d.code, phone: d.phone, type: d.type, reason: d.reason, preferred: d.preferred });
      }
    };
    return repo;
  }

  /* ================================================== MODO LOCAL */
  function localRepo() {
    var r = B.bookingRepository;
    return {
      mode: "local",
      list: function () { return r.list(); },
      refresh: function () { r.load(); return Promise.resolve(); },
      create: function (input) {
        try { return Promise.resolve(r.create(input)); } catch (e) { return Promise.reject(e); }
      },
      requestChange: function (d) {
        var found = r.list().filter(function (b) {
          return b.code === String(d.code).toUpperCase().trim() && String(b.client.phone).replace(/\D/g, "") === String(d.phone).replace(/\D/g, "");
        })[0];
        if (!found) { var e = new Error("Não encontramos agendamento com esse protocolo e telefone."); e.code = "NOT_FOUND"; return Promise.reject(e); }
        return Promise.resolve({ ok: true, date: found.date, start: found.start, local: true });
      }
    };
  }

  /* ================================================== INICIALIZAÇÃO */
  B.slug = slug;
  B.ready = (function () {
    if (!B.api) {
      B.repo = localRepo();
      B.bookingRepository.load();
      return Promise.resolve("local");
    }
    var repo = remoteRepo(B.api);
    B.repo = repo;
    return B.api.rpc("public_site", { slug: slug })
      .then(function (site) { toConfig(site); return repo.refresh(); })
      .then(function () { return "platform"; });
  })();
})(window);
