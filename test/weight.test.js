import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../src/core/dates.js';
import { estimateTdeeFromData, trendSeries, weeklyAverages, weeklyCheckIn, weeklyRate } from '../src/core/weight.js';
import { computeTargets } from '../src/core/nutrition.js';

// Deterministic "noise" so the tests are stable.
const wobble = (i) => [0.4, -0.3, 0.1, -0.5, 0.2, 0.3, -0.2][i % 7];

function series(start, days, startKg, kgPerWeek, { every = 1 } = {}) {
  const out = [];
  for (let i = 0; i < days; i += every) out.push({ date: addDays(start, i), kg: Math.round((startKg + (kgPerWeek / 7) * i + wobble(i)) * 10) / 10 });
  return out;
}

test('trend smooths noise and handles gaps', () => {
  const s = trendSeries([
    { date: '2026-01-01', kg: 95 },
    { date: '2026-01-02', kg: 96 },
    { date: '2026-01-10', kg: 94 },
  ]);
  assert.equal(s[0].trend, 95);
  assert.equal(s[1].trend, 95.1);
  // after an 8-day gap the trend moves much more than 10%
  assert.ok(s[2].trend < 94.7 && s[2].trend > 94);
});

test('weekly rate recovers the real slope from noisy data', () => {
  const data = series('2026-01-01', 28, 95, -0.7);
  const r = weeklyRate(data, { endDate: '2026-01-28', windowDays: 21 });
  assert.ok(Math.abs(r.kgPerWeek - -0.7) < 0.15, `got ${r.kgPerWeek}`);
  assert.ok(r.pctPerWeek < 0);
});

test('weekly rate needs enough weigh-ins', () => {
  assert.equal(weeklyRate([{ date: '2026-01-01', kg: 95 }, { date: '2026-01-02', kg: 94.8 }]), null);
  assert.equal(weeklyRate(series('2026-01-01', 4, 95, -1)), null);
});

test('weekly averages group by Monday', () => {
  const w = weeklyAverages([
    { date: '2026-09-28', kg: 95 }, // Monday
    { date: '2026-10-04', kg: 94 }, // Sunday, same week
    { date: '2026-10-05', kg: 93 }, // next Monday
  ]);
  assert.deepEqual(w.map((x) => [x.week, x.avgKg, x.count]), [['2026-09-28', 94.5, 2], ['2026-10-05', 93, 1]]);
});

test('maintenance from data: 1800 kcal eaten while losing 0.5 kg/week', () => {
  const weights = series('2026-01-01', 21, 95, -0.5);
  const intake = Object.fromEntries(weights.map((w) => [w.date, 1800]));
  const est = estimateTdeeFromData({ weights, intakeByDate: intake, endDate: '2026-01-21' });
  // 0.5 kg/week ≈ 550 kcal/day deficit
  assert.ok(Math.abs(est.tdee - 2350) < 150, `got ${est.tdee}`);
});

const profile = { sex: 'male', age: 26, heightCm: 167, weightKg: 95, lifestyle: 'sedentary', trainingDaysPerWeek: 3, pace: 'standard' };
const targets = computeTargets(profile, { phase: 2 });

function checkIn(kgPerWeek, extra = {}) {
  const start = '2026-01-01';
  const today = '2026-02-10';
  return weeklyCheckIn({
    today,
    startDate: start,
    phase: 2,
    phaseSince: '2026-01-15',
    targets,
    weights: series(start, 41, 95, kgPerWeek),
    adherence: 0.9,
    gut: { avgScore: 0.4, looseDays: 0, days: 14 },
    training: { sessions14d: 6, target14d: 6, strengthChangePct: 1 },
    wellbeing: { energyAvg: 3.5, hungerAvg: 3 },
    ...extra,
  });
}

const ids = (r) => r.recommendations.map((x) => x.id);

test('check-in: on track', () => {
  assert.ok(ids(checkIn(-0.6)).includes('on-track'));
});

test('check-in: too fast adds calories', () => {
  const r = checkIn(-1.3);
  const rec = r.recommendations.find((x) => x.id === 'too-fast');
  assert.deepEqual(rec.action, { type: 'calories', delta: 150 });
});

test('check-in: too slow cuts only with good adherence', () => {
  assert.ok(ids(checkIn(-0.1)).includes('too-slow'));
  assert.ok(ids(checkIn(-0.1, { adherence: 0.6 })).includes('adherence'));
});

test('check-in: first two weeks never change calories', () => {
  const r = weeklyCheckIn({
    today: '2026-01-10', startDate: '2026-01-01', phase: 1, phaseSince: '2026-01-01', targets,
    weights: series('2026-01-01', 10, 95, -2), adherence: 1, gut: null, training: null, wellbeing: null,
  });
  assert.ok(ids(r).includes('too-early'));
  assert.ok(!r.recommendations.some((x) => x.kind === 'calories'));
});

test('check-in: gut trouble holds the phase; calm gut moves on', () => {
  assert.ok(ids(checkIn(-0.6, { gut: { avgScore: 2, looseDays: 4, days: 10 } })).includes('gut-hold'));
  const calm = weeklyCheckIn({
    today: '2026-01-20', startDate: '2026-01-01', phase: 1, phaseSince: '2026-01-01', targets,
    weights: series('2026-01-01', 20, 95, -0.8), adherence: 0.9, gut: { avgScore: 0.3, looseDays: 0, days: 12 }, training: null, wellbeing: null,
  });
  const rec = calm.recommendations.find((x) => x.id === 'phase-2');
  assert.deepEqual(rec.action, { type: 'phase', to: 2 });
});

test('check-in: strength drop and missed sessions', () => {
  const r = checkIn(-0.6, { training: { sessions14d: 2, target14d: 6, strengthChangePct: -9 } });
  assert.ok(ids(r).includes('train-more'));
  assert.ok(ids(r).includes('strength-drop'));
});
