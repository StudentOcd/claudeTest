import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLabel, labelNutrition } from '../src/core/labels.js';
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
  assert.deepEqual(labelNutrition({ catalog, stores: ['auchan'] }), {});
});
