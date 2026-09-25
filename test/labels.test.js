import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLabel, compareToReference, completeLabel, labelNutrition } from '../src/core/labels.js';
import { FOOD_BY_ID, macrosFor, nutritionOf, nutritionSource, setNutritionOverrides } from '../src/core/foods.js';

const chicken = FOOD_BY_ID.chicken_breast;

test('labels are checked before they reach the plan', () => {
  assert.equal(checkLabel({ kcal: 108, p: 23.5, c: 0, f: 1.6 }, chicken.per100).ok, true);
  assert.match(checkLabel({ kcal: 98, p: 23 }, chicken.per100).why, /no fat/);
  // energy that doesn't match its own macros = misread table
  assert.match(checkLabel({ kcal: 250, p: 23.5, c: 0, f: 1.6 }, chicken.per100).why, /does not match/);
  // per-portion column (e.g. 300 g tray) instead of per 100 g
  assert.match(checkLabel({ kcal: 330, p: 70.5, c: 0, f: 5 }, chicken.per100).why, /away from the reference/);
  assert.equal(checkLabel(null).ok, false);
});

test('the label of the product you chose replaces the reference values', () => {
  const url = 'https://www.pingodoce.pt/home/produtos/talho/frango-123.html';
  const catalog = {
    products: { 'pingodoce:123': { key: 'pingodoce:123', store: 'pingodoce', id: '123', url, name: 'Peito de Frango', mapped: true, per100: { kcal: 105, p: 24, c: 0, f: 1, fib: 0, salt: 0.2 } } },
    foods: { chicken_breast: { pingodoce: ['pingodoce:123'] } },
  };
  const labels = labelNutrition({ catalog, choices: { chicken_breast: { pingodoce: { url, name: 'Peito de Frango' } } }, stores: ['pingodoce'] });
  assert.equal(labels.chicken_breast.per100.kcal, 105);
  assert.equal(labels.chicken_breast.source.kind, 'label');
  try {
    setNutritionOverrides(labels);
    assert.equal(nutritionOf('chicken_breast').p, 24);
    assert.equal(nutritionSource('chicken_breast').name, 'Peito de Frango');
    assert.ok(Math.abs(macrosFor('chicken_breast', 200).kcal - 210) < 1e-9);
    // foods without a label keep the reference
    assert.equal(nutritionSource('rice_white').kind, 'reference');
    assert.equal(nutritionOf('rice_white').kcal, FOOD_BY_ID.rice_white.per100.kcal);
  } finally {
    setNutritionOverrides({});
  }
  assert.equal(nutritionOf('chicken_breast').kcal, chicken.per100.kcal);
});

test('a bad label is ignored and the reference stays', () => {
  const catalog = {
    products: { 'auchan:9': { key: 'auchan:9', store: 'auchan', id: '9', url: 'https://www.auchan.pt/x/9.html', mapped: true, per100: { kcal: 900, p: 23, c: 0, f: 2 } } },
    foods: { chicken_breast: { auchan: ['auchan:9'] } },
  };
  assert.equal(labelNutrition({ catalog, stores: ['auchan'] }).chicken_breast, undefined);
});

test('a row the store page leaves out is worked out from the label\'s own energy', () => {
  // Real store pages: Pingo Doce leaves out rows that are 0, Auchan's turkey ham has no carbohydrate row.
  const hake = { kcal: 71, f: 0.8, satFat: 0.3, p: 16, salt: 0.225 };
  assert.deepEqual(completeLabel(hake), { per100: { ...hake, c: 0 }, derived: ['c'] });
  const eggWhite = { kcal: 46, c: 0.7, p: 11, salt: 0.48 };
  assert.deepEqual(completeLabel(eggWhite), { per100: { ...eggWhite, f: 0 }, derived: ['f'] });
  // Olive oil: only energy and fat on the page
  assert.deepEqual(completeLabel({ kcal: 821, f: 91.3, satFat: 13.6, salt: 0 }).derived, ['p', 'c']);
  const turkeyHam = { kcal: 79, f: 0.5, satFat: 0.2, sugars: 1.5, p: 15, salt: 1.3 };
  assert.equal(completeLabel(turkeyHam).per100.c, 3.6); // (79 − 4×15 − 9×0.5) / 4
  // Not when two rows are missing, or when the numbers can't add up
  assert.deepEqual(completeLabel({ kcal: 98, p: 23 }).derived, [], 'two rows missing and energy left over');
  assert.deepEqual(completeLabel({ kcal: 40, p: 16, f: 0.8 }).derived, []);
  assert.deepEqual(completeLabel({ kcal: 20, p: 3, f: 0.5, sugars: 12 }).derived, [], 'fewer carbohydrates than sugars');
  assert.deepEqual(completeLabel({ kcal: 350, c: 70, f: 1 }).derived, [], 'protein is never worked out');
  // Complete labels are left alone
  assert.deepEqual(completeLabel({ kcal: 135, p: 13, c: 1, f: 9.3 }), { per100: { kcal: 135, p: 13, c: 1, f: 9.3 }, derived: [] });

  const url = 'https://www.pingodoce.pt/home/produtos/peixaria/peixe/pescada/medalhoes-de-pescada-congelados-pingo-doce-38364.html';
  const catalog = {
    products: { 'pingodoce:38364': { key: 'pingodoce:38364', store: 'pingodoce', url, name: 'Medalhões de Pescada Congelados', detail: true, per100: hake } },
    foods: { hake: { pingodoce: ['pingodoce:38364'] } },
  };
  const labels = labelNutrition({ catalog, stores: ['pingodoce'] });
  assert.equal(labels.hake.per100.kcal, 71);
  assert.equal(labels.hake.per100.c, 0);
  assert.deepEqual(labels.hake.source.derived, ['c']);
});

test('low-energy foods: a label far in % but close in kcal is still that food', () => {
  // Unsweetened almond drinks sold here are 13–16 kcal; the CIQUAL almond drink is 36 kcal.
  const almond = FOOD_BY_ID.almond_drink.per100;
  assert.equal(checkLabel({ kcal: 13, p: 0.4, c: 0, f: 1.1 }, almond).ok, true);
  // A per-serving value copied into Open Food Facts is still caught (rice cakes: 113 vs 381 kcal)
  assert.equal(checkLabel({ kcal: 113, p: 2.6, c: 23.3, f: 0.9 }, FOOD_BY_ID.rice_cakes.per100).ok, false);
  // Banana chips are not bananas
  assert.equal(checkLabel({ kcal: 538, p: 1.8, c: 63, f: 30 }, FOOD_BY_ID.banana.per100).ok, false);
});

test("another product's label is never borrowed", () => {
  const catalog = {
    products: {
      'pingodoce:1': { key: 'pingodoce:1', store: 'pingodoce', id: '1', url: 'https://www.pingodoce.pt/home/produtos/a-1.html', name: 'Peito de Frango Embalado', detail: true, mapped: true },
      'pingodoce:2': { key: 'pingodoce:2', store: 'pingodoce', id: '2', url: 'https://www.pingodoce.pt/home/produtos/b-2.html', name: 'Peito de Frango Bio', detail: true, mapped: true, per100: { kcal: 108, p: 24, c: 0, f: 1.3 } },
    },
    foods: { chicken_breast: { pingodoce: ['pingodoce:1', 'pingodoce:2'] } },
  };
  // the list uses product 1 (no label): the reference stays, product 2's label is not used
  assert.equal(labelNutrition({ catalog, stores: ['pingodoce'] }).chicken_breast, undefined);
  // pick product 2 and its label is used
  const picked = labelNutrition({ catalog, stores: ['pingodoce'], choices: { chicken_breast: { pingodoce: { url: 'https://www.pingodoce.pt/home/produtos/b-2.html' } } } });
  assert.equal(picked.chicken_breast.per100.kcal, 108);
});

test('label vs reference: only differences that matter in absolute terms', () => {
  const rows = Object.fromEntries(compareToReference({ kcal: 89, p: 15, c: 5.1, f: 1, salt: 2.6 }, FOOD_BY_ID.turkey_ham).map((r) => [r.key, r.diffPct]));
  assert.equal(rows.c, null, 'no percentage against a reference of ~0 g');
  assert.equal(rows.p, -28);
  assert.equal(rows.kcal, -10);
  assert.equal(rows.f, null, '1 g vs 1.7 g of fat is too small to flag');
  assert.equal(rows.salt, 37);
});
