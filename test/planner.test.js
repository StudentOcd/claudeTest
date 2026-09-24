import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTargets } from '../src/core/nutrition.js';
import { adherence, candidateRecipes, intakeFromLog, mealSnapshot, planDay, planRange, recipeAllowed, roundAmount, scaleRecipe } from '../src/core/planner.js';
import { RECIPES, getRecipe } from '../src/core/recipes.js';
import { FOOD_BY_ID } from '../src/core/foods.js';

const profile = { sex: 'male', age: 26, heightCm: 167, weightKg: 95, lifestyle: 'sedentary', trainingDaysPerWeek: 3, pace: 'standard' };

test('every recipe ingredient exists in the food catalogue', () => {
  for (const r of RECIPES) {
    for (const i of r.ingredients) assert.ok(FOOD_BY_ID[i.food], `${r.id}: unknown food ${i.food}`);
    assert.ok(r.steps.length > 0, `${r.id} has no steps`);
  }
});

test('phase and exclusions filter recipes', () => {
  assert.equal(recipeAllowed(getRecipe('salmon_potatoes_spinach'), { phase: 1 }), false);
  assert.equal(recipeAllowed(getRecipe('salmon_potatoes_spinach'), { phase: 2 }), true);
  assert.equal(recipeAllowed(getRecipe('salmon_potatoes_spinach'), { phase: 2, exclusions: ['fish'] }), false);
  assert.equal(recipeAllowed(getRecipe('lf_yogurt_bowl'), { phase: 3 }), false, 'lactose-free dairy is opt-in');
  assert.equal(recipeAllowed(getRecipe('lf_yogurt_bowl'), { phase: 3, exclusions: [] }), true);
  assert.ok(candidateRecipes('breakfast', { phase: 1 }).every((r) => r.phase === 1));
});

test('rounding respects units, steps and gut caps', () => {
  assert.equal(roundAmount(FOOD_BY_ID.eggs, 130), 156); // 2.5 eggs -> 3
  assert.equal(roundAmount(FOOD_BY_ID.eggs, 300), 156); // capped at 3 eggs
  assert.equal(roundAmount(FOOD_BY_ID.chicken_breast, 173), 170);
  assert.equal(roundAmount(FOOD_BY_ID.rice_white, 72), 70);
  assert.equal(roundAmount(FOOD_BY_ID.sweet_potato, 180), 100);
  assert.equal(roundAmount(FOOD_BY_ID.bread, 70), 84); // whole slices
});

test('scaled recipes land close to their budget', () => {
  for (const r of RECIPES.filter((x) => x.slots.includes('lunch'))) {
    const s = scaleRecipe(r, { kcal: 560, protein: 44 }, { phase: 3 });
    assert.ok(Math.abs(s.macros.kcal - 560) / 560 < 0.12, `${r.id}: ${Math.round(s.macros.kcal)} kcal`);
  }
});

test('a planned day hits calories and protein', () => {
  for (const phase of [1, 2, 3]) {
    const targets = computeTargets(profile, { phase });
    for (const day of planRange('2026-09-28', 14, { targets, phase, mealsPerDay: 4, batchMode: true, exclusions: ['dairy_lf'] })) {
      const k = day.totals.kcal;
      const p = day.totals.p;
      assert.ok(Math.abs(k - targets.kcal) / targets.kcal < 0.08, `phase ${phase} ${day.date}: ${Math.round(k)} vs ${targets.kcal} kcal`);
      assert.ok(p >= targets.protein * 0.9, `phase ${phase} ${day.date}: ${Math.round(p)} g protein`);
      assert.equal(day.meals.length, 4);
    }
  }
});

test('lunch and dinner differ; batch mode repeats for two days', () => {
  const targets = computeTargets(profile, { phase: 2 });
  const [d1, d2] = planRange('2026-09-28', 2, { targets, phase: 2, batchMode: true });
  const get = (d, slot) => d.meals.find((m) => m.slot === slot).recipe.id;
  assert.notEqual(get(d1, 'lunch'), get(d1, 'dinner'));
  const pairStart = planRange('2026-09-28', 3, { targets, phase: 2, batchMode: true });
  const lunches = pairStart.map((d) => get(d, 'lunch'));
  assert.ok(lunches[0] === lunches[1] || lunches[1] === lunches[2]);
});

test('overrides and favourites are respected', () => {
  const targets = computeTargets(profile, { phase: 1 });
  const day = planDay('2026-09-28', { targets, phase: 1, overrides: { '2026-09-28': { dinner: 'cod_potatoes_egg' } } });
  assert.equal(day.meals.find((m) => m.slot === 'dinner').recipe.id, 'cod_potatoes_egg');
  const fav = planDay('2026-09-29', { targets, phase: 1, favorites: ['turkey_egg_toast'] });
  assert.equal(fav.meals.find((m) => m.slot === 'breakfast').recipe.id, 'turkey_egg_toast');
});

test('one favourite lunch does not take over lunch and dinner', () => {
  const targets = computeTargets(profile, { phase: 2 });
  for (const day of planRange('2026-09-28', 14, { targets, phase: 2, batchMode: true, favorites: ['hake_potatoes_beans'] })) {
    const lunch = day.meals.find((m) => m.slot === 'lunch').recipe.id;
    const dinner = day.meals.find((m) => m.slot === 'dinner').recipe.id;
    assert.notEqual(lunch, dinner, day.date);
  }
  const days = planRange('2026-09-28', 14, { targets, phase: 2, batchMode: false, favorites: ['hake_potatoes_beans'] });
  const hake = days.flatMap((d) => d.meals).filter((m) => m.recipe.id === 'hake_potatoes_beans').length;
  assert.ok(hake >= 3 && hake <= 14, `hake planned ${hake} times in 2 weeks`);
});

test('three meals a day', () => {
  const targets = computeTargets(profile, { phase: 2 });
  const day = planDay('2026-09-28', { targets, phase: 2, mealsPerDay: 3 });
  assert.deepEqual(day.meals.map((m) => m.slot), ['breakfast', 'lunch', 'dinner']);
});

test('intake and adherence from the log', () => {
  const targets = computeTargets(profile, { phase: 2 });
  const day = planDay('2026-09-28', { targets, phase: 2 });
  const snap = mealSnapshot(day.meals[1]);
  assert.equal(snap.eaten, true);
  assert.ok(snap.foods.length > 0);
  const log = { meals: { lunch: snap }, extras: [{ name: 'coffee with milk', kcal: 40, protein: 2 }] };
  const intake = intakeFromLog(log);
  assert.equal(intake.kcal, snap.kcal + 40);
  assert.equal(intakeFromLog({}), null);
  const days = {};
  const dates = [];
  for (let i = 1; i <= 7; i++) {
    const d = `2026-10-0${i}`;
    dates.push(d);
    days[d] = { meals: { breakfast: snap, lunch: snap, snack: snap } };
  }
  assert.equal(adherence(days, dates, 4), 0.75);
  assert.equal(adherence({}, dates, 4), null);
});
