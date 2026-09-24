import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShoppingList, costFor, latestPrice } from '../src/core/shopping.js';
import { FOOD_BY_ID } from '../src/core/foods.js';
import { seenPriceEntries } from '../src/core/products.js';

const plan = (items) => [{ date: '2026-09-28', meals: [{ slot: 'lunch', recipe: { name: 'Test' }, items }] }];

test('pack items round up to whole packs', () => {
  const list = buildShoppingList(plan([{ food: 'rice_white', g: 1200 }]), { stores: ['pingodoce'] });
  const rice = list.items.find((i) => i.foodId === 'rice_white');
  assert.equal(rice.perStore.pingodoce.packs, 2);
  assert.equal(rice.costEur, 2 * FOOD_BY_ID.rice_white.buy.priceEur);
  assert.ok(rice.usedEur < rice.costEur);
  assert.ok(rice.estimated);
});

test('eggs are bought by the dozen', () => {
  const c = costFor(FOOD_BY_ID.eggs, FOOD_BY_ID.eggs.unit.grams * 13, { sold: 'pack', eur: 3.09, packUnits: 12, packLabel: 'dúzia' });
  assert.equal(c.packs, 2);
  assert.ok(Math.abs(c.costEur - 6.18) < 1e-9);
  assert.match(c.leftoverText, /1[01] eggs left over/);
});

test('loose produce is priced by weight including the peel', () => {
  const b = FOOD_BY_ID.banana;
  const c = costFor(b, 240, { sold: 'weight', eur: 1.39 });
  // 240 g of banana = 2 medium bananas; you pay for them with their peel (36%)
  assert.match(c.text, /^2 bananas/);
  assert.ok(Math.abs(c.costEur - ((2 * b.unit.grams) / b.edible / 1000) * 1.39) < 1e-9);
  assert.ok(Math.abs(c.usedEur - (240 / b.edible / 1000) * 1.39) < 1e-9);
  // Counter items are rounded up, never below what the plan needs
  const mince = costFor(FOOD_BY_ID.beef_mince_lean, 360, { sold: 'weight', eur: 9 });
  assert.equal(mince.text, '~400 g');
  assert.ok(Math.abs(mince.costEur - 3.6) < 1e-9);
});

test('your own prices beat estimates and the newest wins', () => {
  const prices = {
    chicken_breast: [
      { store: 'auchan', sold: 'weight', eur: 7.2, date: '2026-09-01' },
      { store: 'auchan', sold: 'weight', eur: 6.29, date: '2026-09-20' },
    ],
  };
  assert.equal(latestPrice(prices, 'chicken_breast', 'auchan').eur, 6.29);
  const list = buildShoppingList(plan([{ food: 'chicken_breast', g: 1000 }]), { prices, stores: ['auchan'] });
  const item = list.items[0];
  assert.equal(item.estimated, false);
  assert.ok(Math.abs(item.costEur - 6.29) < 1e-9);
});

test('cheapest mode only switches store for a real saving', () => {
  const prices = {
    chicken_breast: [
      { store: 'pingodoce', sold: 'weight', eur: 7.99, date: '2026-09-20' },
      { store: 'auchan', sold: 'weight', eur: 6.29, date: '2026-09-20' },
    ],
    rice_white: [
      { store: 'pingodoce', sold: 'pack', eur: 1.45, packG: 1000, date: '2026-09-20' },
      { store: 'auchan', sold: 'pack', eur: 1.39, packG: 1000, date: '2026-09-20' },
    ],
  };
  const list = buildShoppingList(plan([{ food: 'chicken_breast', g: 1000 }, { food: 'rice_white', g: 500 }]), {
    prices,
    stores: ['pingodoce', 'auchan'],
    mode: 'cheapest',
  });
  assert.equal(list.items.find((i) => i.foodId === 'chicken_breast').store, 'auchan');
  assert.equal(list.items.find((i) => i.foodId === 'rice_white').store, 'pingodoce', '6 cents is not worth a second shop');
  const main = buildShoppingList(plan([{ food: 'chicken_breast', g: 1000 }]), { prices, stores: ['pingodoce', 'auchan'], mode: 'main' });
  assert.equal(main.items[0].store, 'pingodoce');
});

test('pantry items are listed separately', () => {
  const list = buildShoppingList(plan([{ food: 'olive_oil', g: 30 }, { food: 'paprika', g: 1 }, { food: 'carrots', g: 300 }]), {
    pantryHave: { olive_oil: true },
  });
  assert.deepEqual(list.items.map((i) => i.foodId), ['carrots']);
  assert.equal(list.pantry.find((p) => p.foodId === 'olive_oil').have, true);
  assert.equal(list.pantry.find((p) => p.foodId === 'paprika').have, false);
});

test('prices seen on the store websites become store-specific offers', () => {
  const seen = seenPriceEntries();
  assert.equal(seen.eggs.find((p) => p.store === 'pingodoce').eur, 3.09);
  const list = buildShoppingList(plan([{ food: 'eggs', g: 52 * 6 }]), { prices: seen, stores: ['pingodoce'] });
  assert.equal(list.items[0].estimated, false);
  assert.equal(list.items[0].costEur, 3.09);
});
