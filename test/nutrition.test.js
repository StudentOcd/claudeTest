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
  assert.equal(p2.carbs, 184);
  assert.equal(p1.fibre, 18);
  assert.equal(p2.fibre, 24);
  // macros add up to the calorie target (within rounding)
  assert.ok(Math.abs(p2.protein * 4 + p2.fat * 9 + p2.carbs * 4 - p2.kcal) <= 4);
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
