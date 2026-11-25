/**
 * REPOSITÓRIO DE AGENDAMENTOS (protótipo com localStorage)
 * ------------------------------------------------------------------
 * Interface pensada para ser trocada por uma API real sem mexer na tela:
 *
 *   list()            → todos os agendamentos
 *   create(dados)     → grava, com checagem final de conflito
 *   cancel(id)        → cancela
 *   resetDemo()       → restaura os dados de demonstração
 *
 * IMPORTANTE — limites desta demonstração:
 *  - Os dados ficam APENAS no navegador de quem está usando (localStorage).
 *    Outra pessoa, em outro aparelho, não verá as reservas feitas aqui.
 *  - A checagem de conflito impede reservas duplicadas no mesmo navegador
 *    (inclusive entre abas), mas não substitui um backend com banco de dados
 *    e controle de concorrência (ex.: transação/lock no servidor).
 *
 * Futuro: implementar `ApiBookingRepository` com os mesmos métodos chamando
 * POST /api/agendamentos etc., e o servidor revalidando com scheduler.js.
 */
(function (root) {
  "use strict";
  var B = root.Bella;
  var S = B.scheduler;

  var STORAGE_KEY = "bella.demo.v1";
  var SEED_VERSION = 2;
  var memoryFallback = null; // usado se o navegador bloquear o localStorage

  function readRaw() {
    try {
      var txt = root.localStorage.getItem(STORAGE_KEY);
      return txt ? JSON.parse(txt) : null;
    } catch (e) { return memoryFallback; }
  }

  function writeRaw(data) {
    memoryFallback = data;
    try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* segue em memória */ }
  }

  function uid() { return "ag_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function code() { return "BB-" + Math.random().toString(36).slice(2, 6).toUpperCase(); }

  /* ----------------------------------------------------- dados de demonstração */
  /**
   * Gera agendamentos e bloqueios fictícios RELATIVOS à data de hoje,
   * para que a demonstração sempre mostre horários ocupados, um dia lotado,
   * um dia bloqueado e uma tarde bloqueada.
   */
  function buildSeed(now) {
    var agenda = B.config.agenda;
    var services = B.config.services;
    if (agenda._baseBlockedDates) { // ignora bloqueios de uma demonstração anterior
      agenda.blockedDates = agenda._baseBlockedDates.slice();
      agenda.blockedRanges = agenda._baseBlockedRanges.slice();
    }
    var days = [];
    for (var i = 1; days.length < 7 && i < 40; i++) {
      var k = S.dateKey(S.addDays(now, i));
      if (S.dayRule(k, agenda, now) === "open") days.push(k);
    }
    function svc(ids) { return S.summarize(services, ids, agenda.depositPercent); }
    function mk(date, start, ids, name) {
      var sm = svc(ids);
      return {
        id: uid(), code: "DEMO", date: date, start: start,
        end: S.fromMin(S.toMin(start) + sm.totalDuration), durationMin: sm.totalDuration,
        serviceIds: ids, serviceNames: sm.items.map(function (s) { return s.name; }),
        totalPrice: sm.totalPrice, deposit: sm.deposit,
        client: { name: name, phone: "(00) 00000-0000" },
        status: "confirmed", payment: { status: "demo" }, source: "demo-seed",
        createdAt: new Date().toISOString()
      };
    }
    var bookings = [
      // Dia 1: parcialmente ocupado
      mk(days[0], "07:00", ["extensao-cilios"], "Cliente demonstração A"),
      mk(days[0], "09:30", ["design-simples"], "Cliente demonstração B"),
      mk(days[0], "14:00", ["design-henna"], "Cliente demonstração C"),
      // Dia 2: lotado
      mk(days[1], "07:00", ["extensao-cilios"], "Cliente demonstração D"),
      mk(days[1], "09:15", ["extensao-cilios"], "Cliente demonstração F"),
      mk(days[1], "13:30", ["extensao-cilios"], "Cliente demonstração G"),
      mk(days[1], "15:45", ["brow-lamination"], "Cliente demonstração H"),
      // Dia 3: alguns horários
      mk(days[2], "08:00", ["design-henna"], "Cliente demonstração I"),
      mk(days[2], "13:30", ["extensao-cilios"], "Cliente demonstração J"),
      // Dia 6
      mk(days[5], "10:00", ["design-simples"], "Cliente demonstração K")
    ];
    return {
      seedVersion: SEED_VERSION,
      seededFor: S.dateKey(now),
      bookings: bookings,
      blocks: {
        dates: [{ date: days[3], reason: "Curso de atualização (demonstração)" }],
        ranges: [{ date: days[4], start: "13:30", end: "17:30", reason: "Compromisso (demonstração)" }]
      }
    };
  }

  function daysBetween(a, b) { return Math.round((S.parseKey(b) - S.parseKey(a)) / 864e5); }

  /** Carrega os dados; renova a demonstração se ela ficou velha (> 7 dias). */
  function load(now) {
    now = now || new Date();
    var data = readRaw();
    var stale = !data || data.seedVersion !== SEED_VERSION || daysBetween(data.seededFor, S.dateKey(now)) > 7;
    if (stale) {
      var fresh = buildSeed(now);
      if (data && data.bookings) {
        // mantém reservas feitas pela usuária na demo
        fresh.bookings = fresh.bookings.concat(data.bookings.filter(function (b) { return b.source === "site"; }));
      }
      data = fresh;
      writeRaw(data);
    }
    applyBlocks(data);
    return data;
  }

  /** Mescla os bloqueios de demonstração às regras da agenda. */
  function applyBlocks(data) {
    var a = B.config.agenda;
    a._baseBlockedDates = a._baseBlockedDates || a.blockedDates.slice();
    a._baseBlockedRanges = a._baseBlockedRanges || a.blockedRanges.slice();
    a.blockedDates = a._baseBlockedDates.concat(data.blocks.dates);
    a.blockedRanges = a._baseBlockedRanges.concat(data.blocks.ranges);
  }

  var repo = {
    STORAGE_KEY: STORAGE_KEY,

    list: function () { return load().bookings.slice(); },

    /**
     * Grava um agendamento. Relê o armazenamento imediatamente antes de gravar
     * e recusa se o horário tiver sido ocupado (ex.: em outra aba).
     * @throws {Error} code = "SLOT_TAKEN"
     */
    create: function (input) {
      var now = new Date();
      var data = load(now);
      var free = S.isSlotStillFree(input.date, input.start, input.durationMin, B.config.agenda, data.bookings, now);
      if (!free) {
        var err = new Error("Este horário acabou de ser reservado. Escolha outro, por favor.");
        err.code = "SLOT_TAKEN";
        throw err;
      }
      var booking = Object.assign({
        id: uid(), code: code(), status: "confirmed", source: "site", createdAt: now.toISOString()
      }, input, { end: S.fromMin(S.toMin(input.start) + input.durationMin) });
      data.bookings.push(booking);
      writeRaw(data);
      return booking;
    },

    cancel: function (id) {
      var data = load();
      data.bookings.forEach(function (b) { if (b.id === id) b.status = "cancelled"; });
      writeRaw(data);
    },

    resetDemo: function () {
      try { root.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      memoryFallback = null;
      return load();
    },

    load: load,
    buildSeed: buildSeed
  };

  B.bookingRepository = repo;
})(typeof window !== "undefined" ? window : globalThis);
