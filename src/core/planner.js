// Meal planner: picks recipes for each meal and rescales portions so each
// meal hits its calorie/protein budget, then balances protein across the day.

import { FOOD_BY_ID, macrosFor } from './foods.js';
import { RECIPES, RECIPE_BY_ID } from './recipes.js';
import { slotBudgets, sumMacros } from './nutrition.js';
import { addDays, dayIndex } from './dates.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const SCALED = new Set(['protein', 'carb']);
const ADJUSTABLE = new Set(['protein', 'carb', 'fruit']);

// Foods tagged with these are excluded by default (lactose-free dairy is a phase-3 test).
export const DEFAULT_EXCLUSIONS = ['dairy_lf'];

export function activeIngredients(recipe, phase) {
  return recipe.ingredients.filter((i) => (i.minPhase || 1) <= phase);
}

export function recipeAllowed(recipe, { phase = 1, exclusions = DEFAULT_EXCLUSIONS, hidden = [] } = {}) {
  if (!recipe || recipe.phase > phase || hidden.includes(recipe.id)) return false;
  return activeIngredients(recipe, phase).every((i) => {
    const f = FOOD_BY_ID[i.food];
    return f && (f.minPhase || 1) <= phase && !f.tags.some((t) => exclusions.includes(t));
  });
}

export function candidateRecipes(slot, ctx) {
  return RECIPES.filter((r) => r.slots.includes(slot) && recipeAllowed(r, ctx));
}

export function stepFor(food, grams) {
  if (food.unit) return food.unit.grams * (food.unit.step || 1);
  if (food.id === 'olive_oil' || food.id === 'peanut_butter') return 1;
  if (grams >= 150) return 10;
  if (grams >= 30) return 5;
  return 1;
}

export function roundAmount(food, grams) {
  if (grams <= 0) return 0;
  const st = stepFor(food, grams);
  let r = Math.round(grams / st) * st;
  if (r <= 0) r = st;
  const cap = food.gut?.maxG;
  if (cap && r > cap) r = Math.max(st, Math.floor(cap / st) * st);
  return Math.round(r * 100) / 100;
}

const macrosOfItems = (items) => sumMacros(items.map((it) => macrosFor(it.food, it.g)));

function objective(m, target) {
  const dk = (m.kcal - target.kcal) / Math.max(target.kcal, 50);
  const dp = (m.p - target.protein) / Math.max(target.protein, 10);
  return dk * dk + (dp < 0 ? 1.5 : 0.4) * dp * dp;
}

// Greedy local search on the rounded amounts (one step up/down at a time).
function refine(items, target) {
  let best = objective(macrosOfItems(items), target);
  for (let iter = 0; iter < 16; iter++) {
    let move = null;
    items.forEach((it, idx) => {
      if (!ADJUSTABLE.has(it.role) || it.baseG <= 0) return;
      const f = FOOD_BY_ID[it.food];
      const st = stepFor(f, it.g);
      for (const dir of [1, -1]) {
        const g = Math.round((it.g + dir * st) * 100) / 100;
        if (g < st - 1e-9) continue;
        if (dir > 0 && (g > it.baseG * 2.4 + 1e-9 || (f.gut?.maxG && g > f.gut.maxG))) continue;
        if (dir < 0 && g < it.baseG * 0.4 - 1e-9) continue;
        const trial = items.map((x, j) => (j === idx ? { ...x, g } : x));
        const o = objective(macrosOfItems(trial), target);
        if (o < best - 1e-9 && (!move || o < move.o)) move = { idx, g, o };
      }
    });
    if (!move) break;
    items = items.map((x, j) => (j === move.idx ? { ...x, g: move.g } : x));
    best = move.o;
  }
  return items;
}

/**
 * Rescale one recipe to a { kcal, protein } target.
 * Solves  p·P.prot + c·C.prot = T.prot − O.prot
 *         p·P.kcal + c·C.kcal = T.kcal − O.kcal
 * for the protein (p) and carb (c) factors, clamps them, rounds to
 * practical amounts and polishes with a small local search.
 */
export function scaleRecipe(recipe, target, { phase = 2 } = {}) {
  const ings = activeIngredients(recipe, phase).filter((i) => FOOD_BY_ID[i.food]);
  const pick = (fn) => macrosOfItems(ings.filter(fn));
  const P = pick((i) => i.role === 'protein');
  const C = pick((i) => i.role === 'carb');
  const O = pick((i) => !SCALED.has(i.role));
  let p = 1;
  if (P.kcal > 0 && C.kcal > 0) {
    const det = P.p * C.kcal - C.p * P.kcal;
    if (Math.abs(det) > 1e-9) {
      p = ((target.protein - O.p) * C.kcal - C.p * (target.kcal - O.kcal)) / det;
    }
    p = clamp(p, 0.5, 1.8);
  } else if (P.kcal > 0) {
    p = clamp((target.kcal - O.kcal) / P.kcal, 0.5, 1.8);
  }

  const build = (i, factor) => ({
    food: i.food,
    role: i.role,
    baseG: i.g,
    g: i.g > 0 ? roundAmount(FOOD_BY_ID[i.food], i.g * factor) : 0,
  });
  // Protein portions first (after rounding and caps), then carbs fill the calories.
  const proteinBuilt = ings.map((i) => (i.role === 'protein' ? build(i, p) : null));
  const proteinKcal = macrosOfItems(proteinBuilt.filter(Boolean)).kcal;
  const c = C.kcal > 0 ? clamp((target.kcal - O.kcal - proteinKcal) / C.kcal, 0.55, 2.2) : 1;

  let items = ings.map((i, idx) => proteinBuilt[idx] || build(i, i.role === 'carb' ? c : 1));
  items = refine(items, target);
  const macros = macrosOfItems(items);
  return { recipeId: recipe.id, items, macros };
}

/**
 * Deterministic rotation, so the plan is stable and predictable.
 * Favourite breakfasts/snacks replace the rotation; favourite lunches/dinners
 * come up twice as often (unless there are 3+ of them). avoidId: never pick it
 * (dinner avoids repeating lunch).
 */
export function pickRecipe(slot, date, ctx, avoidId = null) {
  const all = candidateRecipes(slot, ctx);
  if (!all.length) return null;
  const favs = all.filter((r) => (ctx.favorites || []).includes(r.id));
  const main = slot === 'lunch' || slot === 'dinner';
  let list = all;
  if (favs.length && (!main || favs.length >= 3)) list = favs;
  else if (favs.length) list = [...favs, ...favs, ...all.filter((r) => !favs.includes(r))];
  const idx = dayIndex(date);
  const rot = ctx.batchMode ? Math.floor(idx / 2) : idx;
  let k = ((rot % list.length) + list.length) % list.length;
  if (slot === 'dinner') k = (k + Math.ceil(list.length / 2)) % list.length;
  for (let i = 0; i < list.length; i++) {
    const r = list[(k + i) % list.length];
    if (r.id !== avoidId) return r;
  }
  return list[k];
}

/**
 * ctx: {
 *   targets, phase, mealsPerDay, exclusions, hidden, favorites, batchMode,
 *   overrides: { [date]: { [slot]: recipeId } }
 * }
 */
export function planDay(date, ctx) {
  const budgets = slotBudgets(ctx.targets, ctx.mealsPerDay || 4);
  const dayOverrides = ctx.overrides?.[date] || {};
  let lunchId = null;
  const meals = budgets.map((b) => {
    const forced = dayOverrides[b.id] && RECIPE_BY_ID[dayOverrides[b.id]];
    const recipe = forced || pickRecipe(b.id, date, ctx, b.id === 'dinner' ? lunchId : null);
    if (b.id === 'lunch') lunchId = recipe?.id || null;
    return {
      slot: b.id,
      label: b.label,
      budget: { kcal: b.kcalTarget, protein: b.proteinTarget },
      recipe,
      overridden: Boolean(forced),
    };
  });

  const scaleAll = () => meals.map((m) => (m.recipe ? scaleRecipe(m.recipe, m.budget, ctx) : null));
  let scaled = scaleAll();
  const totalP = scaled.reduce((a, s) => a + (s ? s.macros.p : 0), 0);
  const shortfall = ctx.targets.protein - totalP;
  if (shortfall > 5) {
    const main = meals.filter((m) => m.recipe && (m.slot === 'lunch' || m.slot === 'dinner'));
    for (const m of main) m.budget = { ...m.budget, protein: m.budget.protein + shortfall / main.length };
    scaled = scaleAll();
  }

  const out = meals.map((m, i) => ({
    slot: m.slot,
    label: m.label,
    budget: m.budget,
    overridden: m.overridden,
    recipe: m.recipe,
    items: scaled[i]?.items || [],
    macros: scaled[i]?.macros || { kcal: 0, p: 0, f: 0, c: 0, fib: 0 },
  }));
  return { date, meals: out, totals: sumMacros(out.map((m) => m.macros)) };
}

export function planRange(startDate, days, ctx) {
  const out = [];
  for (let i = 0; i < days; i++) out.push(planDay(addDays(startDate, i), ctx));
  return out;
}

// Snapshot stored in the day log when a meal is ticked as eaten, so later
// changes to targets or recipes do not rewrite history.
export function mealSnapshot(meal) {
  return {
    eaten: true,
    recipeId: meal.recipe?.id || null,
    kcal: Math.round(meal.macros.kcal),
    protein: Math.round(meal.macros.p),
    carbs: Math.round(meal.macros.c),
    fat: Math.round(meal.macros.f),
    foods: meal.items.filter((i) => i.g > 0).map((i) => i.food),
  };
}

// Intake from a day's log: meals ticked as eaten + extra items.
export function intakeFromLog(dayLog) {
  if (!dayLog) return null;
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let any = false;
  for (const m of [...Object.values(dayLog.meals || {}).filter((m) => m?.eaten), ...(dayLog.extras || [])]) {
    kcal += Number(m.kcal) || 0;
    protein += Number(m.protein) || 0;
    carbs += Number(m.carbs) || 0;
    fat += Number(m.fat) || 0;
    any = true;
  }
  return any ? { kcal: Math.round(kcal), protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat) } : null;
}

// Share of planned meals ticked as eaten, over the logged days among `dates`.
// Null until at least 5 days (or all of a shorter range) have been logged.
export function adherence(days, dates, mealsPerDay = 4) {
  let eaten = 0;
  let loggedDays = 0;
  for (const d of dates) {
    const log = days?.[d];
    if (!log) continue;
    const n = Object.values(log.meals || {}).filter((m) => m?.eaten).length;
    if (n === 0 && !(log.extras || []).length) continue;
    loggedDays++;
    eaten += Math.min(n, mealsPerDay);
  }
  if (loggedDays < Math.min(5, dates.length)) return null;
  return eaten / (loggedDays * mealsPerDay);
}
