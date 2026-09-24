import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bmrMifflin, computeTargets, estimateTDEE, proteinTarget, referenceWeight, slotBudgets } from '../src/core/nutrition.js';

const profile = { sex: 'male', age: 26, heightCm: 167, weightKg: 95, lifestyle: 'sedentary', trainingDaysPerWeek: 3, sessionMinutes: 60, pace: 'standard' };

test('Mifflin-St Jeor BMR for the default profile', () => {
  assert.equal(bmrMifflin(profile), 1868.75);
  assert.equal(bmrMifflin({ ...profile, sex: 'female' }), 1868.75 - 166);
});

test('maintenance estimate includes lifestyle and training', () => {
  const t = estimateTDEE(profile);
  assert.equal(Math.round(t.base), 2243);
  assert.equal(Math.round(t.training), 102);
  assert.equal(Math.round(t.tdee), 2344);
});

test('protein uses adjusted body weight above BMI 25', () => {
  assert.equal(Math.round(referenceWeight(95, 167) * 10) / 10, 79.8);
  assert.equal(proteinTarget(95, 167), 140);
  assert.equal(referenceWeight(60, 180), 60);
});

test('phase 1 is a gentle deficit, phase 2 the standard pace', () => {
  const p1 = computeTargets(profile, { phase: 1 });
  const p2 = computeTargets(profile, { phase: 2 });
  assert.equal(p1.kcal, 2050);
  assert.equal(p2.kcal, 1800);
  assert.equal(p2.protein, 140);
  assert.equal(p2.fat, 56);
  assert.equal(p2.carbs, 172); // (1800 − 140×4 − 56×9 − 24×2) / 4, carbs without fibre as on EU labels
  assert.equal(p1.fibre, 18);
  assert.equal(p2.fibre, 24);
  // macros add up to the calorie target (within rounding), fibre at 2 kcal/g
  assert.ok(Math.abs(p2.protein * 4 + p2.fat * 9 + p2.carbs * 4 + p2.fibre * 2 - p2.kcal) <= 4);
});

test('adjustments, overrides and the calorie floor', () => {
  assert.equal(computeTargets({ ...profile, calorieAdjustment: -100 }, { phase: 2 }).kcal, 1700);
  assert.equal(computeTargets({ ...profile, calorieOverride: 1900 }, { phase: 2 }).kcal, 1900);
  assert.equal(computeTargets({ ...profile, calorieAdjustment: -900 }, { phase: 2 }).kcal, 1500);
  assert.equal(computeTargets({ ...profile, proteinOverride: 150 }, { phase: 2 }).protein, 150);
});

test('the deficit never exceeds 30% of maintenance', () => {
  const t = computeTargets({ ...profile, pace: 'faster' }, { phase: 2, tdee: 1800 });
  assert.ok(t.deficit <= 1800 * 0.3 + 25);
});

test('meal budgets split the day', () => {
  const t = computeTargets(profile, { phase: 2 });
  const b = slotBudgets(t, 4);
  assert.deepEqual(b.map((s) => s.id), ['breakfast', 'lunch', 'snack', 'dinner']);
  assert.equal(Math.round(b.reduce((a, s) => a + s.kcalTarget, 0)), t.kcal);
  assert.equal(Math.round(b.reduce((a, s) => a + s.proteinTarget, 0)), t.protein);
  assert.equal(slotBudgets(t, 3).length, 3);
});

test('every food has nutrition from the CIQUAL reference table, in EU label terms', async () => {
  const { FOODS } = await import('../src/core/foods.js');
  const { REFERENCE } = await import('../src/core/reference-nutrition.js');
  for (const f of FOODS) {
    if (f.id === 'garlic_for_oil') continue; // removed from the oil before eating
    const r = REFERENCE[f.id];
    assert.ok(r, `${f.id} has a reference`);
    assert.equal(f.source.code, r.code);
    for (const k of ['kcal', 'p', 'c', 'f', 'fib']) assert.equal(f.per100[k], r[k], `${f.id}.${k}`);
    // Energy as on EU labels: 4 kcal/g protein and carbohydrate, 9 fat, 2 fibre, 3 organic acids.
    const eu = 4 * r.p + 4 * r.c + 9 * r.f + 2 * r.fib + 3 * (r.organic || 0) + 2.4 * (r.polyols || 0) + 7 * (r.alcohol || 0);
    assert.ok(Math.abs(eu - r.kcal) <= Math.max(5, r.kcal * 0.05), `${f.id}: ${r.kcal} kcal vs ${eu.toFixed(1)} from its macros`);
    assert.ok(f.edible > 0 && f.edible <= 1, `${f.id} edible fraction`);
    if (f.cookedRatio) assert.ok(f.cookedRatio > 0.6 && f.cookedRatio < 3, `${f.id} cooked ratio`);
  }
});
