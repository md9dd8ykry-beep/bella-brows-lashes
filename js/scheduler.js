/**
 * MOTOR DE DISPONIBILIDADE (puro, sem DOM)
 * ------------------------------------------------------------------
 * Calcula datas e horários livres a partir de:
 *  - dias e períodos de atendimento,
 *  - duração total dos procedimentos escolhidos,
 *  - intervalo (buffer) entre atendimentos,
 *  - agendamentos já existentes,
 *  - datas e faixas bloqueadas,
 *  - antecedência mínima e janela de agendamento.
 *
 * As funções não têm efeitos colaterais, por isso podem ser reaproveitadas
 * no futuro backend (Node.js) para validar a reserva no servidor.
 * Testes: `node tests/scheduler.test.js`.
 */
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------- tempo */
  function pad(n) { return String(n).padStart(2, "0"); }

  /** "07:30" → 450 */
  function toMin(hhmm) {
    var p = String(hhmm).split(":");
    return Number(p[0]) * 60 + Number(p[1] || 0);
  }

  /** 450 → "07:30" */
  function fromMin(min) { return pad(Math.floor(min / 60)) + ":" + pad(min % 60); }

  /** Date → "AAAA-MM-DD" no fuso local */
  function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  /** "AAAA-MM-DD" → Date (meia‑noite local) */
  function parseKey(key) {
    var p = key.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function addDays(d, n) { var r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() + n); return r; }

  function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && aEnd > bStart; }

  /* ------------------------------------------------------- procedimentos */
  /**
   * Soma duração e valor dos procedimentos escolhidos.
   * @returns {{items:Array, totalDuration:number, totalPrice:number, deposit:number}}
   */
  function summarize(services, ids, depositPercent) {
    var items = services.filter(function (s) { return ids.indexOf(s.id) !== -1; });
    var totalDuration = items.reduce(function (a, s) { return a + s.durationMin; }, 0);
    var totalPrice = items.reduce(function (a, s) { return a + s.price; }, 0);
    var pct = depositPercent == null ? 50 : depositPercent;
    return {
      items: items,
      totalDuration: totalDuration,
      totalPrice: totalPrice,
      deposit: Math.round(totalPrice * pct) / 100
    };
  }

  /* ------------------------------------------------------------ regras */
  function blockedDateInfo(key, agenda) {
    var list = agenda.blockedDates || [];
    for (var i = 0; i < list.length; i++) if (list[i].date === key) return list[i];
    return null;
  }

  /**
   * Situação básica de um dia, independente da duração.
   * @returns {"past"|"beyond"|"closed"|"blocked"|"open"}
   */
  function dayRule(key, agenda, now) {
    var today = dateKey(now);
    if (key < today) return "past";
    var last = dateKey(addDays(now, agenda.bookingWindowDays || 60));
    if (key > last) return "beyond";
    if (agenda.workDays.indexOf(parseKey(key).getDay()) === -1) return "closed";
    if (blockedDateInfo(key, agenda)) return "blocked";
    return "open";
  }

  /**
   * Horários de início livres em uma data para uma duração.
   * Um horário é válido quando:
   *  1. cabe inteiro dentro de um único período (não atravessa o intervalo do almoço);
   *  2. respeita a antecedência mínima (se for hoje);
   *  3. não toca faixas bloqueadas;
   *  4. não se sobrepõe a nenhum agendamento ativo, considerando o buffer
   *     antes e depois de cada atendimento.
   * @param {string} key  data "AAAA-MM-DD"
   * @param {number} duration minutos
   * @param {object} agenda config.agenda
   * @param {Array}  bookings [{date, start:"HH:MM", durationMin, status}]
   * @param {Date}   now
   * @returns {Array<{start:string,end:string,period:string}>}
   */
  function getAvailableSlots(key, duration, agenda, bookings, now) {
    if (!duration || duration <= 0) return [];
    if (dayRule(key, agenda, now) !== "open") return [];

    var step = agenda.slotStepMin || 15;
    var buffer = agenda.bufferMin || 0;
    var isToday = key === dateKey(now);
    var earliest = isToday ? now.getHours() * 60 + now.getMinutes() + (agenda.minNoticeMin || 0) : -1;

    var busy = (bookings || [])
      .filter(function (b) { return b.date === key && b.status !== "cancelled"; })
      .map(function (b) { var s = toMin(b.start); return [s - buffer, s + b.durationMin + buffer]; });

    (agenda.blockedRanges || []).forEach(function (r) {
      if (r.date === key) busy.push([toMin(r.start), toMin(r.end)]);
    });

    var slots = [];
    agenda.periods.forEach(function (p) {
      var pStart = toMin(p.start), pEnd = toMin(p.end);
      for (var t = pStart; t + duration <= pEnd; t += step) {
        if (t < earliest) continue;
        var end = t + duration;
        var clash = busy.some(function (b) { return overlaps(t, end, b[0], b[1]); });
        if (!clash) slots.push({ start: fromMin(t), end: fromMin(end), period: p.label });
      }
    });
    return slots;
  }

  /**
   * Situação de um dia para o calendário, já considerando a duração escolhida.
   * @returns {"past"|"beyond"|"closed"|"blocked"|"full"|"available"}
   */
  function dayStatus(key, duration, agenda, bookings, now) {
    var rule = dayRule(key, agenda, now);
    if (rule !== "open") return rule;
    return getAvailableSlots(key, duration, agenda, bookings, now).length ? "available" : "full";
  }

  /** true se a reserva pretendida ainda está livre (checagem final antes de gravar). */
  function isSlotStillFree(key, start, duration, agenda, bookings, now) {
    return getAvailableSlots(key, duration, agenda, bookings, now).some(function (s) { return s.start === start; });
  }

  var api = {
    pad: pad, toMin: toMin, fromMin: fromMin, dateKey: dateKey, parseKey: parseKey, addDays: addDays,
    overlaps: overlaps, summarize: summarize, dayRule: dayRule, blockedDateInfo: blockedDateInfo,
    getAvailableSlots: getAvailableSlots, dayStatus: dayStatus, isSlotStillFree: isSlotStillFree
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Bella = root.Bella || {};
  root.Bella.scheduler = api;
})(typeof window !== "undefined" ? window : globalThis);
