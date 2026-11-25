/**
 * Testes da lógica de disponibilidade (sem navegador).
 * Execute com:  node tests/scheduler.test.js
 */
"use strict";
const assert = require("assert");
global.window = undefined;
const S = require("../js/scheduler.js");
require("../js/config.js");
const cfg = globalThis.Bella.config;
const agenda = JSON.parse(JSON.stringify(cfg.agenda));
agenda.blockedDates = [{ date: "2026-12-02", reason: "teste" }];
agenda.blockedRanges = [];

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("  ✓ " + name); }

// Segunda-feira, 30/11/2026, 06:00 (antes da abertura)
const NOW = new Date(2026, 10, 30, 6, 0);
const MON = "2026-11-30", TUE = "2026-12-01", SUN = "2026-12-06";

console.log("Agenda — regras");

test("soma duração e valor de vários procedimentos", () => {
  const s = S.summarize(cfg.services, ["design-simples", "brow-lamination"], 50);
  assert.strictEqual(s.totalDuration, 100);
  assert.strictEqual(s.totalPrice, 165);
  assert.strictEqual(s.deposit, 82.5);
});

test("domingo fechado; segunda aberta; data bloqueada", () => {
  assert.strictEqual(S.dayRule(SUN, agenda, NOW), "closed");
  assert.strictEqual(S.dayRule(MON, agenda, NOW), "open");
  assert.strictEqual(S.dayRule("2026-12-02", agenda, NOW), "blocked");
  assert.strictEqual(S.dayRule("2026-11-29", agenda, NOW), "past");
  assert.strictEqual(S.dayRule("2027-03-30", agenda, NOW), "beyond");
});

test("40 min: primeiro 07:00, último da manhã 10:45, último da tarde 16:45", () => {
  const sl = S.getAvailableSlots(TUE, 40, agenda, [], NOW);
  assert.strictEqual(sl[0].start, "07:00");
  assert.strictEqual(sl[0].end, "07:40");
  const morning = sl.filter(s => s.period === "Manhã");
  assert.strictEqual(morning[morning.length - 1].start, "10:45"); // 10:45–11:25
  assert.strictEqual(sl[sl.length - 1].start, "16:45");           // 16:45–17:25
});

test("100 min nunca atravessa o intervalo 11:30–13:30", () => {
  const sl = S.getAvailableSlots(TUE, 100, agenda, [], NOW);
  sl.forEach(s => {
    const a = S.toMin(s.start), b = S.toMin(s.end);
    assert.ok(b - a === 100);
    assert.ok(b <= S.toMin("11:30") || a >= S.toMin("13:30"), s.start + " invade o intervalo");
    assert.ok(b <= S.toMin("17:30"));
  });
  assert.ok(!sl.some(s => s.start === "10:00")); // 10:00–11:40 não cabe
  assert.ok(sl.some(s => s.start === "09:45"));  // 09:45–11:25 cabe
});

test("não oferece horários sobrepostos a agendamento existente (com buffer de 10 min)", () => {
  const bk = [{ date: TUE, start: "09:00", durationMin: 60, status: "confirmed" }]; // 09:00–10:00
  const sl = S.getAvailableSlots(TUE, 40, agenda, bk, NOW).map(s => s.start);
  assert.ok(!sl.includes("08:15"));  // 08:15–08:55 + 10 de buffer encosta em 09:00 → conflito
  assert.ok(sl.includes("08:00"));   // 08:00–08:40, 20 min antes
  assert.ok(!sl.includes("09:30"));
  assert.ok(!sl.includes("10:00"));  // precisa de 10 min após 10:00
  assert.ok(sl.includes("10:15"));
});

test("agendamento cancelado libera o horário", () => {
  const bk = [{ date: TUE, start: "09:00", durationMin: 60, status: "cancelled" }];
  assert.ok(S.getAvailableSlots(TUE, 40, agenda, bk, NOW).some(s => s.start === "09:00"));
});

test("faixa bloqueada remove horários do período", () => {
  const a = Object.assign({}, agenda, { blockedRanges: [{ date: TUE, start: "13:30", end: "17:30" }] });
  const sl = S.getAvailableSlots(TUE, 40, a, [], NOW);
  assert.ok(sl.length > 0 && sl.every(s => s.period === "Manhã"));
});

test("hoje: respeita antecedência mínima de 60 min", () => {
  const now = new Date(2026, 11, 1, 9, 5); // terça 09:05
  const sl = S.getAvailableSlots(TUE, 40, agenda, [], now);
  assert.strictEqual(sl[0].start, "10:15"); // 09:05 + 60 = 10:05 → próximo múltiplo de 15
});

test("dia cheio aparece como lotado", () => {
  const bk = [
    { date: TUE, start: "07:00", durationMin: 120 }, { date: TUE, start: "09:15", durationMin: 120 },
    { date: TUE, start: "13:30", durationMin: 120 }, { date: TUE, start: "15:45", durationMin: 60 }
  ];
  assert.strictEqual(S.dayStatus(TUE, 40, agenda, bk, NOW), "full");
  assert.strictEqual(S.dayStatus(MON, 40, agenda, bk, NOW), "available");
});

test("checagem final impede dupla reserva do mesmo horário", () => {
  const bk = [];
  assert.ok(S.isSlotStillFree(TUE, "14:00", 100, agenda, bk, NOW));
  bk.push({ date: TUE, start: "14:00", durationMin: 100, status: "confirmed" });
  assert.ok(!S.isSlotStillFree(TUE, "14:00", 100, agenda, bk, NOW));
  assert.ok(!S.isSlotStillFree(TUE, "14:30", 40, agenda, bk, NOW)); // sobreposto
});

test("nenhum horário oferecido se sobrepõe a outro (varredura com 200 reservas aleatórias)", () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const durs = [40, 60, 100, 120, 160];
  const bk = [];
  for (let i = 0; i < 200; i++) {
    const d = durs[Math.floor(rnd() * durs.length)];
    const sl = S.getAvailableSlots(TUE, d, agenda, bk, NOW);
    if (!sl.length) continue;
    const pick = sl[Math.floor(rnd() * sl.length)];
    bk.push({ date: TUE, start: pick.start, durationMin: d, status: "confirmed" });
  }
  const iv = bk.map(b => [S.toMin(b.start), S.toMin(b.start) + b.durationMin]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < iv.length; i++) assert.ok(iv[i][0] >= iv[i - 1][1] + agenda.bufferMin, "sobreposição encontrada");
  assert.ok(bk.length >= 4);
});

console.log(`\n${passed} testes passaram.`);
