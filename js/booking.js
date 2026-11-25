/**
 * AGENDA INTELIGENTE — fluxo em 5 passos
 *   1. procedimentos  2. data  3. horário  4. dados  5. confirmação (+ sinal simulado)
 * Toda a regra de disponibilidade vem de scheduler.js; a gravação, de storage.js.
 */
(function (root) {
  "use strict";
  var B = root.Bella, S = B.scheduler, ui = B.ui, repo = B.bookingRepository, cfg = B.config;
  var $ = function (id) { return document.getElementById(id); };

  var dlg = $("agenda");
  var state;

  function reset(ids) {
    var now = new Date();
    state = {
      step: 1,
      ids: (ids || []).slice(),
      date: null,
      time: null,
      name: "",
      phone: "",
      charge: null,
      paid: false,
      paying: false,
      month: new Date(now.getFullYear(), now.getMonth(), 1),
      result: null
    };
    $("client-form").reset();
    ["e-name", "e-phone"].forEach(function (id) { $(id).textContent = ""; });
  }

  function summary() { return S.summarize(cfg.services, state.ids, cfg.agenda.depositPercent); }
  function bookings() { return repo.list(); }
  function slotsFor(date) { return S.getAvailableSlots(date, summary().totalDuration, cfg.agenda, bookings(), new Date()); }

  /** Desfaz data/horário se deixaram de servir (ex.: mudou a duração). */
  function revalidateSelection() {
    if (!state.date) return;
    var slots = slotsFor(state.date);
    if (!slots.length) { state.date = null; state.time = null; return; }
    if (state.time && !slots.some(function (s) { return s.start === state.time; })) state.time = null;
  }

  /* ============================================================ PASSO 1 */
  function renderPick() {
    $("pick-list").innerHTML = cfg.services.map(function (s) {
      var on = state.ids.indexOf(s.id) !== -1;
      return '<label class="pick' + (on ? " is-on" : "") + '">' +
        '<input type="checkbox" value="' + ui.esc(s.id) + '"' + (on ? " checked" : "") + '>' +
        '<img src="' + ui.esc(s.image) + '" alt="" width="64" height="64">' +
        '<span class="pick-txt"><strong>' + ui.esc(s.name) + '</strong>' +
        '<small><svg aria-hidden="true"><use href="#i-clock"/></svg>' + ui.duration(s.durationMin) + ' · ' + ui.money(s.price) + '</small></span>' +
        '<span class="pick-box" aria-hidden="true"><svg><use href="#i-check"/></svg></span>' +
      '</label>';
    }).join("");
  }

  $("pick-list").addEventListener("change", function (e) {
    var id = e.target.value;
    if (e.target.checked) { if (state.ids.indexOf(id) === -1) state.ids.push(id); }
    else state.ids = state.ids.filter(function (x) { return x !== id; });
    // mantém a ordem do cardápio
    state.ids = cfg.services.map(function (s) { return s.id; }).filter(function (x) { return state.ids.indexOf(x) !== -1; });
    e.target.closest(".pick").classList.toggle("is-on", e.target.checked);
    revalidateSelection();
    renderFoot();
  });

  /* ============================================================ PASSO 2 */
  function monthLimits() {
    var now = new Date();
    var last = S.addDays(now, cfg.agenda.bookingWindowDays);
    return { min: new Date(now.getFullYear(), now.getMonth(), 1), max: new Date(last.getFullYear(), last.getMonth(), 1) };
  }

  var STATUS_TXT = { available: "disponível", full: "lotado", closed: "sem atendimento", blocked: "bloqueado", past: "data passada", beyond: "fora do período de agendamento" };

  function renderCalendar() {
    var m = state.month, lim = monthLimits(), now = new Date();
    var dur = summary().totalDuration, list = bookings();
    $("dur-label").textContent = ui.duration(dur);
    $("cal-title").textContent = ui.MONTHS[m.getMonth()].replace(/^./, function (c) { return c.toUpperCase(); }) + " " + m.getFullYear();
    $("cal-prev").disabled = m <= lim.min;
    $("cal-next").disabled = m >= lim.max;

    var first = m.getDay(), daysIn = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    var html = "";
    for (var i = 0; i < first; i++) html += '<span class="cal-empty"></span>';
    for (var d = 1; d <= daysIn; d++) {
      var key = S.dateKey(new Date(m.getFullYear(), m.getMonth(), d));
      var st = S.dayStatus(key, dur, cfg.agenda, list, now);
      var blk = S.blockedDateInfo(key, cfg.agenda);
      var sel = state.date === key;
      html += '<button type="button" role="gridcell" class="day st-' + st + (sel ? " is-sel" : "") + (key === S.dateKey(now) ? " is-today" : "") + '"' +
        ' data-date="' + key + '"' + (st === "available" ? "" : " disabled") +
        ' aria-pressed="' + sel + '" aria-label="' + d + " de " + ui.MONTHS[m.getMonth()] + ", " + STATUS_TXT[st] + (blk ? " (" + ui.esc(blk.reason) + ")" : "") + '"' +
        (blk ? ' title="' + ui.esc(blk.reason) + '"' : "") + '>' + d + '</button>';
    }
    $("cal-grid").innerHTML = html;
    renderDayNote();
  }

  function renderDayNote() {
    var note = $("day-note");
    if (!state.date) { note.textContent = "Toque em uma data destacada."; return; }
    var n = slotsFor(state.date).length;
    note.textContent = ui.longDate(state.date) + " · " + n + (n === 1 ? " horário livre" : " horários livres");
  }

  $("cal-prev").addEventListener("click", function () { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
  $("cal-next").addEventListener("click", function () { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });
  $("cal-grid").addEventListener("click", function (e) {
    var b = e.target.closest(".day");
    if (!b || b.disabled) return;
    if (state.date !== b.dataset.date) state.time = null;
    state.date = b.dataset.date;
    renderCalendar();
    renderFoot();
    setTimeout(function () { if (state.step === 2 && state.date) go(3); }, 220);
  });

  /* ============================================================ PASSO 3 */
  function renderSlots() {
    var sm = summary(), slots = slotsFor(state.date);
    $("slot-help").innerHTML = ui.esc(ui.longDate(state.date)) + ". Cada horário reserva <strong>" + ui.duration(sm.totalDuration) +
      "</strong> para os procedimentos escolhidos, mais " + cfg.agenda.bufferMin + " min de preparo entre atendimentos.";
    var groups = {};
    slots.forEach(function (s) { (groups[s.period] = groups[s.period] || []).push(s); });
    var html = cfg.agenda.periods.map(function (p) {
      var g = groups[p.label] || [];
      return '<div class="slot-group"><h4>' + ui.esc(p.label) + ' <small>' + p.start + '–' + p.end + '</small></h4>' +
        (g.length ? '<div class="slots">' + g.map(function (s) {
          var on = state.time === s.start;
          return '<button type="button" class="slot' + (on ? " is-sel" : "") + '" data-time="' + s.start + '" aria-pressed="' + on + '">' +
            s.start + '<small>até ' + s.end + '</small></button>';
        }).join("") + '</div>' : '<p class="empty">Sem horários livres neste período.</p>') + '</div>';
    }).join("");
    if (!slots.length) {
      html = '<div class="empty-day"><p>Os horários deste dia acabaram de ser ocupados.</p>' +
        '<button class="btn-outline" type="button" id="pick-other-day">Escolher outra data</button></div>';
    }
    $("slot-groups").innerHTML = html;
  }

  $("slot-groups").addEventListener("click", function (e) {
    if (e.target.closest("#pick-other-day")) { state.date = null; state.time = null; go(2); return; }
    var b = e.target.closest(".slot");
    if (!b) return;
    state.time = b.dataset.time;
    renderSlots();
    renderFoot();
    setTimeout(function () { if (state.step === 3 && state.time) go(4); }, 220);
  });

  /* ============================================================ PASSO 4 */
  var fName = $("f-name"), fPhone = $("f-phone");
  function clearErr(input, errId) { $(errId).textContent = ""; input.removeAttribute("aria-invalid"); }
  fPhone.addEventListener("input", function () { fPhone.value = ui.maskPhone(fPhone.value); state.phone = fPhone.value; clearErr(fPhone, "e-phone"); renderFoot(); });
  fName.addEventListener("input", function () { state.name = fName.value; clearErr(fName, "e-name"); renderFoot(); });
  $("client-form").addEventListener("submit", function (e) { e.preventDefault(); next(); });

  function validateClient(show) {
    var name = fName.value.trim().replace(/\s+/g, " ");
    var digits = fPhone.value.replace(/\D/g, "");
    var en = name.split(" ").length < 2 || name.length < 5 ? "Informe nome e sobrenome." : "";
    var ep = digits.length < 10 || digits.length > 11 ? "Informe um WhatsApp com DDD." : "";
    if (show) {
      $("e-name").textContent = en; $("e-phone").textContent = ep;
      fName.setAttribute("aria-invalid", !!en); fPhone.setAttribute("aria-invalid", !!ep);
      if (en) fName.focus(); else if (ep) fPhone.focus();
    }
    state.name = name; state.phone = fPhone.value;
    return !en && !ep;
  }

  function renderMini() {
    var sm = summary();
    $("mini-summary").innerHTML = '<strong>' + ui.esc(sm.items.map(function (s) { return s.name; }).join(" + ")) + '</strong>' +
      '<span>' + ui.esc(ui.longDate(state.date)) + ' · ' + state.time + ' às ' + S.fromMin(S.toMin(state.time) + sm.totalDuration) + '</span>';
  }

  /* ============================================================ PASSO 5 */
  function summaryRows(b) {
    var rows = [
      ["Cliente", b.name],
      ["WhatsApp", b.phone],
      ["Procedimentos", b.services.join(" + ")],
      ["Duração total", ui.duration(b.duration)],
      ["Data", ui.longDate(b.date)],
      ["Horário", b.start + " às " + b.end],
      ["Valor total", ui.money(b.total)],
      ["Sinal (" + cfg.agenda.depositPercent + "%)", ui.money(b.deposit)],
      ["Restante no dia", ui.money(b.total - b.deposit)]
    ];
    return rows.map(function (r) { return '<div><dt>' + ui.esc(r[0]) + '</dt><dd>' + ui.esc(r[1]) + '</dd></div>'; }).join("");
  }

  function draft() {
    var sm = summary();
    return {
      name: state.name, phone: state.phone, services: sm.items.map(function (s) { return s.name; }),
      duration: sm.totalDuration, date: state.date, start: state.time,
      end: S.fromMin(S.toMin(state.time) + sm.totalDuration), total: sm.totalPrice, deposit: sm.deposit
    };
  }

  function renderConfirm() {
    var d = draft();
    $("summary").innerHTML = summaryRows(d);
    $("deposit-value").innerHTML = ui.money(d.deposit) + ' <small>de ' + ui.money(d.total) + '</small>';
    $("pix-box").hidden = !state.charge;
    if (state.charge) $("pix-code").textContent = state.charge.pixCopyPaste;
    var pay = $("pay-btn");
    pay.disabled = state.paid || state.paying;
    pay.textContent = state.paid ? "Sinal simulado" : state.paying ? "Processando…" : "Simular pagamento do sinal";
    $("pay-status").textContent = state.paid ? "Pagamento simulado com sucesso. Nenhuma cobrança foi feita." : state.paying ? "Gerando cobrança de demonstração…" : "Etapa ilustrativa: nenhum valor será cobrado.";
    $("pay-status").classList.toggle("ok", state.paid);
    $("confirm-error").hidden = true;
  }

  $("pay-btn").addEventListener("click", function () {
    if (state.paid || state.paying) return;
    state.paying = true; renderConfirm();
    var d = draft();
    B.payment.createCharge({ amount: d.deposit, reference: d.date.replace(/-/g, "") + d.start.replace(":", ""), description: "Sinal — " + d.services.join(" + ") })
      .then(function (charge) { state.charge = charge; renderConfirm(); return B.payment.confirm(charge.id); })
      .then(function () { state.paying = false; state.paid = true; renderConfirm(); renderFoot(); });
  });

  $("copy-pix").addEventListener("click", function () {
    ui.copy($("pix-code").textContent).then(function () { ui.toast("Texto copiado (ilustrativo)."); });
  });

  function confirmBooking() {
    var d = draft();
    try {
      var b = repo.create({
        date: d.date, start: d.start, durationMin: d.duration,
        serviceIds: state.ids.slice(), serviceNames: d.services,
        totalPrice: d.total, deposit: d.deposit,
        client: { name: d.name, phone: d.phone },
        payment: { status: "simulated", provider: B.payment.name, chargeId: state.charge && state.charge.id }
      });
      state.result = b;
      go(6);
    } catch (err) {
      if (err.code !== "SLOT_TAKEN") throw err;
      state.time = null;
      go(3);
      ui.toast(err.message);
    }
  }

  /* ============================================================ FINAL */
  function renderDone() {
    var b = state.result, d = draft();
    $("done-code").textContent = b.code;
    $("done-summary").innerHTML = summaryRows(d);
    var msg = "Olá! Fiz um agendamento pelo site (demonstração).\n" +
      "Protocolo: " + b.code + "\n" +
      "Nome: " + d.name + "\n" +
      "Procedimentos: " + d.services.join(" + ") + "\n" +
      "Data: " + ui.longDate(d.date) + ", das " + d.start + " às " + d.end + "\n" +
      "Valor: " + ui.money(d.total) + " (sinal " + ui.money(d.deposit) + ")";
    $("done-wa").href = ui.waLink(msg);
  }

  $("new-booking").addEventListener("click", function () { reset([]); renderPick(); go(1); });

  /* ======================================================== NAVEGAÇÃO */
  var NEXT_LABEL = { 1: "Escolher data", 2: "Continuar", 3: "Continuar", 4: "Revisar", 5: "Confirmar" };

  function canAdvance() {
    switch (state.step) {
      case 1: return state.ids.length > 0;
      case 2: return !!state.date;
      case 3: return !!state.time;
      case 4: return true; // validação detalhada no clique, com mensagens nos campos
      case 5: return state.paid;
      default: return false;
    }
  }

  function renderFoot() {
    var sm = summary(), n = sm.items.length;
    $("totals").innerHTML = n
      ? '<strong>' + ui.money(sm.totalPrice) + '</strong><span>' + n + (n === 1 ? " procedimento" : " procedimentos") + ' · ' + ui.duration(sm.totalDuration) + '</span>'
      : '<span>Nenhum procedimento selecionado</span>';
    $("btn-back").hidden = state.step === 1;
    var nx = $("btn-next");
    nx.textContent = NEXT_LABEL[state.step] || "Continuar";
    nx.disabled = !canAdvance();
    nx.setAttribute("aria-disabled", String(!canAdvance()));
    $("sheet-foot").hidden = state.step === 6;
  }

  function renderStepper() {
    document.querySelectorAll("#stepper li").forEach(function (li) {
      var n = Number(li.dataset.step);
      li.classList.toggle("is-done", n < state.step);
      li.classList.toggle("is-current", n === state.step);
      if (n === state.step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    $("stepper").hidden = state.step === 6;
  }

  function go(step) {
    // garante que o horário escolhido continua livre ao avançar
    if (step >= 4 && step <= 5) {
      revalidateSelection();
      if (!state.time) { step = state.date ? 3 : 2; ui.toast("Esse horário não está mais disponível. Escolha outro."); }
    }
    state.step = step;
    document.querySelectorAll("#agenda .step").forEach(function (p) { p.hidden = Number(p.dataset.panel) !== step; });
    if (step === 1) renderPick();
    if (step === 2) {
      if (state.date) { var dd = S.parseKey(state.date); state.month = new Date(dd.getFullYear(), dd.getMonth(), 1); }
      renderCalendar();
    }
    if (step === 3) renderSlots();
    if (step === 4) { renderMini(); fName.value = state.name; fPhone.value = state.phone; }
    if (step === 5) renderConfirm();
    if (step === 6) renderDone();
    renderStepper();
    renderFoot();
    $("sheet-body").scrollTop = 0;
    var h = document.querySelector('#agenda .step[data-panel="' + step + '"] h3');
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }

  function next() {
    if (state.step === 4 && !validateClient(true)) return;
    if (!canAdvance()) return;
    if (state.step === 5) return confirmBooking();
    go(state.step + 1);
  }

  $("btn-next").addEventListener("click", next);
  $("btn-back").addEventListener("click", function () { if (state.step > 1) go(state.step - 1); });

  dlg.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]") || e.target === dlg) ui.closeDialog(dlg);
  });
  dlg.addEventListener("close", function () { document.documentElement.classList.remove("no-scroll"); });

  // Reservas feitas em outra aba do mesmo navegador atualizam a disponibilidade
  root.addEventListener("storage", function (e) {
    if (e.key !== repo.STORAGE_KEY || !dlg.open) return;
    repo.load();
    if (state.step === 2) renderCalendar();
    if (state.step === 3) { revalidateSelection(); renderSlots(); renderFoot(); }
  });

  /* ============================================================ API */
  B.booking = {
    open: function (ids) {
      repo.load();
      reset(ids);
      ui.openDialog(dlg);
      go(1);
    }
  };

  document.querySelectorAll("[data-open-agenda]").forEach(function (b) {
    b.addEventListener("click", function () { B.booking.open([]); });
  });

  // Atalho: site.html#agenda abre a agenda direto
  if (location.hash === "#agenda") B.booking.open([]);
})(window);
