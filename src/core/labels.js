// Nutrition from the label of the product you actually buy. A label beats the reference
// table (it is that exact product), but only once it passes basic checks, because store
// pages are read automatically and a misread column must never reach your plan.

import { FOODS } from './foods.js';
import { STORE_PRODUCTS } from './products.js';

const round1 = (x) => Math.round(x * 10) / 10;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Energy, protein, carbohydrate and fat all present: enough to plan with. */
export function isCompleteLabel(per100) {
  return Boolean(per100) && ['kcal', 'p', 'c', 'f'].every((k) => isNum(per100[k]));
}

// How far a label's energy may be from its own macros: label values are rounded
// (energy to 1 kcal, macros to 0.1 g or 1 g) and fibre is not always declared.
const slack = (kcal) => Math.max(8, kcal * 0.12);

/**
 * Store pages sometimes leave a row out of the table: Pingo Doce drops rows that are 0 (no
 * carbohydrate row for fish, no fat row for egg white), and some Auchan pages have no
 * carbohydrate row at all. When only carbohydrate or only fat is missing, the label's own
 * energy gives it (EU factors: 4 kcal/g protein and carbohydrate, 9 fat, 2 fibre).
 * Returns { per100, derived: 'c' | 'f' | null }: per100 unchanged when it can't be worked out.
 */
export function completeLabel(per100) {
  if (!per100 || isCompleteLabel(per100)) return { per100, derived: null };
  const { kcal, p } = per100;
  const missing = ['c', 'f'].filter((k) => !isNum(per100[k]));
  if (!isNum(kcal) || !isNum(p) || missing.length !== 1) return { per100, derived: null };
  const k = missing[0];
  const fib = isNum(per100.fib) ? per100.fib : 0;
  const factor = k === 'c' ? 4 : 9;
  const v = (kcal - 4 * p - 2 * fib - (k === 'c' ? 9 * per100.f : 4 * per100.c)) / factor;
  // A small negative is rounding on the label: the row was 0. A big one: the label doesn't add up.
  if (v < -slack(kcal) / factor) return { per100, derived: null };
  const sugar = per100.sugars ?? per100.sugar;
  if (k === 'c' && isNum(sugar) && v < sugar - slack(kcal) / 4) return { per100, derived: null };
  const value = Math.max(0, k === 'c' && isNum(sugar) ? sugar : 0, Math.round(v * 10) / 10);
  return { per100: { ...per100, [k]: value }, derived: k };
}

/**
 * Is this per-100 g label complete and self-consistent?
 * Energy must match its own macros (EU label factors: 4 kcal/g protein and carbohydrate,
 * 9 fat, 2 fibre) and must not be wildly off the reference food (a per-portion column
 * or the wrong product).
 */
export function checkLabel(per100, reference = null) {
  if (!per100) return { ok: false, why: 'no nutrition table' };
  const { kcal, p, f, c } = per100;
  const fib = per100.fib ?? 0;
  for (const [k, v] of Object.entries({ kcal, p, f, c })) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, why: `no ${k === 'c' ? 'carbohydrate' : k === 'p' ? 'protein' : k === 'f' ? 'fat' : 'energy'} value` };
  }
  if (kcal < 0 || kcal > 900 || [p, f, c, fib].some((v) => v < 0 || v > 100) || p + f + c + fib > 101) return { ok: false, why: 'values out of range' };
  const formula = 4 * p + 4 * c + 9 * f + 2 * fib;
  if (Math.abs(formula - kcal) > slack(kcal)) {
    return { ok: false, why: `energy (${kcal} kcal) does not match its macros (${Math.round(formula)} kcal)` };
  }
  // Far from the reference food: a per-portion column, or not this food. Low-energy foods get
  // 25 kcal of room (unsweetened almond drinks here are 13–16 kcal, the reference 36).
  if (reference && reference.kcal > 20) {
    const ratio = kcal / reference.kcal;
    if ((ratio < 0.6 || ratio > 1.6) && Math.abs(kcal - reference.kcal) > 25) {
      return { ok: false, why: `${Math.round((ratio - 1) * 100)}% away from the reference: check the pack` };
    }
  }
  return { ok: true, why: '' };
}

function labelOf(product) {
  const n = completeLabel(product?.per100).per100;
  if (!n) return null;
  return { kcal: n.kcal, p: n.p, f: n.f, c: n.c, fib: n.fib, sugar: n.sugars ?? n.sugar, salt: n.salt };
}

/**
 * Nutrition to use per food: the label of the product your list uses at your main store (your
 * pick, else the first product on the list), when that label passes the checks. Never another
 * product's label: no label for that product means the reference table.
 * catalog: /api/catalog, choices: productChoice, stores: settings.stores
 * Returns { [foodId]: { per100, source: { kind: 'label', store, name, url, from } } }
 */
export function labelNutrition({ catalog = {}, choices = {}, stores = [] } = {}) {
  const out = {};
  const products = catalog.products || {};
  const byUrl = new Map(Object.values(products).filter((p) => p.url).map((p) => [p.url, p]));
  const store = stores[0];
  if (!store) return out;
  for (const food of FOODS) {
    if (!food.source) continue;
    const choice = choices?.[food.id]?.[store];
    let product = null;
    if (choice?.url) {
      product = { ...(STORE_PRODUCTS[food.id]?.[store] || []).find((r) => r.url === choice.url), ...(byUrl.get(choice.url) || {}), ...choice, store };
    } else {
      const first = (catalog.foods?.[food.id]?.[store] || []).map((k) => products[k]).find((p) => p?.detail);
      product = first || (STORE_PRODUCTS[food.id]?.[store] || []).find((r) => r.per100) || null;
    }
    const per100 = labelOf(product);
    if (!per100 || !checkLabel(per100, food.per100).ok) continue;
    out[food.id] = {
      per100: {
        ...per100,
        fib: per100.fib ?? food.per100.fib,
        sugar: per100.sugar ?? food.per100.sugar,
        salt: per100.salt ?? food.per100.salt,
      },
      source: {
        kind: 'label', store, name: product.name, url: product.url || null, from: product.labelFrom || 'store', offUrl: product.offUrl || null,
        derived: completeLabel(product.per100).derived,
      },
    };
  }
  return out;
}

/** Label vs reference, for display: { key, label, ref, diffPct }[] */
export function compareToReference(per100, food) {
  const keys = [['kcal', 'Energy', 'kcal'], ['p', 'Protein', 'g'], ['c', 'Carbohydrate', 'g'], ['f', 'Fat', 'g'], ['fib', 'Fibre', 'g'], ['salt', 'Salt', 'g']];
  return keys.map(([key, name, unit]) => {
    const label = per100?.[key];
    const ref = food.per100[key];
    const diffPct = typeof label === 'number' && ref ? Math.round(((label - ref) / ref) * 100) : null;
    return { key, name, unit, label: typeof label === 'number' ? round1(label) : null, ref: round1(ref ?? 0), diffPct };
  });
}
