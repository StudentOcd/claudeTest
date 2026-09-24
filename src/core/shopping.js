// Shopping list: sums a set of planned days into what to buy, per store, with
// estimated cost. Prices come from (newest first): your own entries, Open
// Prices / store websites, then the catalogue estimates.

import { FOOD_BY_ID, SECTIONS, STORES, formatCount } from './foods.js';

export const STORE_IDS = Object.keys(STORES);

// Need per food over the given day plans (edible grams).
export function aggregateNeeds(dayPlans) {
  const needs = new Map();
  for (const day of dayPlans) {
    for (const meal of day.meals) {
      for (const it of meal.items) {
        const f = FOOD_BY_ID[it.food];
        if (!f) continue;
        if (!needs.has(it.food)) needs.set(it.food, { grams: 0, usedIn: new Set() });
        const n = needs.get(it.food);
        n.grams += it.g;
        if (meal.recipe) n.usedIn.add(meal.recipe.name);
      }
    }
  }
  return needs;
}

// Latest known price for a food at a store, or null.
// entry: { store, sold: 'pack'|'weight'|'unit', eur, packG?, packUnits?, date, source, productName?, url? }
export function latestPrice(prices, foodId, store) {
  const list = (prices?.[foodId] || []).filter((p) => p.store === store && Number(p.eur) > 0);
  if (!list.length) return null;
  return list.reduce((a, b) => ((b.date || '') > (a.date || '') ? b : a));
}

function defaultOffer(f) {
  return {
    sold: f.buy.sold,
    eur: f.buy.priceEur,
    packG: f.buy.packG,
    packUnits: f.buy.packUnits,
    packLabel: f.buy.packLabel,
    estimated: true,
    source: 'estimate',
    date: f.buy.priceDate,
  };
}

function offerFor(f, prices, store) {
  const p = latestPrice(prices, f.id, store);
  if (!p) return defaultOffer(f);
  return {
    sold: p.sold || f.buy.sold,
    eur: Number(p.eur),
    packG: p.packG ?? (p.sold === 'pack' || !p.sold ? f.buy.packG : undefined),
    packUnits: p.packUnits ?? (f.unit && f.buy.packUnits ? f.buy.packUnits : undefined),
    packLabel: p.packLabel || p.productName || f.buy.packLabel,
    estimated: p.source === 'mercadona-es',
    source: p.source || 'manual',
    date: p.date,
    productName: p.productName,
    url: p.url,
  };
}

/**
 * How much to buy and what it costs for one offer.
 * need: { grams } edible grams; purchase grams are grams / edible.
 */
export function costFor(f, needGrams, offer) {
  const purchaseG = needGrams / (f.edible || 1);
  const units = f.unit ? needGrams / f.unit.grams : null;
  if (offer.sold === 'weight') {
    const kg = purchaseG / 1000;
    const approx = units ? `${formatCount(Math.ceil(units * 2) / 2)} ${units <= 1 ? f.unit.name : f.unit.plural} (~${Math.round(purchaseG / 50) * 50 || 50} g)` : `~${Math.max(50, Math.round(purchaseG / 50) * 50)} g`;
    return { text: approx, packs: null, costEur: kg * offer.eur, usedEur: kg * offer.eur, leftoverText: '' };
  }
  if (offer.sold === 'unit') {
    const exact = units ?? purchaseG / 100;
    const n = Math.max(1, Math.ceil(exact - 1e-9));
    return { text: `${n} × ${f.unit?.name || 'un.'}`, packs: n, costEur: n * offer.eur, usedEur: exact * offer.eur, leftoverText: '' };
  }
  // pack
  if (offer.packUnits && units !== null) {
    const packs = Math.max(1, Math.ceil(units / offer.packUnits - 1e-9));
    const left = packs * offer.packUnits - Math.ceil(units - 1e-9);
    return {
      text: `${packs} × ${offer.packLabel || `${offer.packUnits} un.`}`,
      packs,
      costEur: packs * offer.eur,
      usedEur: (units / offer.packUnits) * offer.eur,
      leftoverText: left > 0 ? `${left} ${f.unit.plural} left over` : '',
    };
  }
  const packG = offer.packG || 1000;
  const packs = Math.max(1, Math.ceil(purchaseG / packG - 1e-9));
  const left = packs * packG - purchaseG;
  return {
    text: `${packs} × ${offer.packLabel || `${packG} g`}`,
    packs,
    costEur: packs * offer.eur,
    usedEur: (purchaseG / packG) * offer.eur,
    leftoverText: left >= 50 ? `~${Math.round(left / 10) * 10} g left over` : '',
  };
}

/**
 * options:
 *   prices: { [foodId]: priceEntry[] }
 *   stores: store ids to consider (first = main store)
 *   mode: 'main' (everything at the first store) | 'cheapest'
 *   pantryHave: { [foodId]: true } for pantry items already at home
 */
export function buildShoppingList(dayPlans, { prices = {}, stores = STORE_IDS, mode = 'cheapest', pantryHave = {} } = {}) {
  const needs = aggregateNeeds(dayPlans);
  const storeList = stores.length ? stores : STORE_IDS;
  const main = storeList[0];
  const items = [];
  const pantry = [];

  for (const [foodId, need] of needs) {
    const f = FOOD_BY_ID[foodId];
    if (f.buy.pantry) {
      pantry.push({ foodId, name: f.name, en: f.en, have: Boolean(pantryHave[foodId]), usedIn: [...need.usedIn] });
      continue;
    }
    if (need.grams <= 0) continue;
    const perStore = {};
    for (const s of storeList) {
      const offer = offerFor(f, prices, s);
      perStore[s] = { ...costFor(f, need.grams, offer), offer };
    }
    let store = main;
    if (mode === 'cheapest') {
      const real = storeList.filter((s) => !perStore[s].offer.estimated);
      if (real.length) {
        // Only move away from the main store for a meaningful saving.
        const cheapest = real.reduce((a, b) => (perStore[b].costEur < perStore[a].costEur ? b : a));
        const mainCost = perStore[main].costEur;
        const saving = mainCost - perStore[cheapest].costEur;
        if (cheapest !== main && saving > 0.3 && saving / mainCost > 0.1) store = cheapest;
      }
    }
    const chosen = perStore[store];
    items.push({
      foodId,
      name: f.name,
      en: f.en,
      section: f.section,
      sectionLabel: SECTIONS[f.section] || f.section,
      needGrams: Math.round(need.grams),
      needUnits: f.unit ? need.grams / f.unit.grams : null,
      store,
      buyText: chosen.text,
      leftoverText: chosen.leftoverText,
      costEur: chosen.costEur,
      usedEur: chosen.usedEur,
      estimated: chosen.offer.estimated,
      offer: chosen.offer,
      perStore,
      usedIn: [...need.usedIn],
      search: f.buy.search || f.name,
      gutNote: f.gut?.note || '',
    });
  }

  const sectionOrder = Object.keys(SECTIONS);
  items.sort((a, b) => sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section) || a.name.localeCompare(b.name));
  pantry.sort((a, b) => a.name.localeCompare(b.name));

  const totalsByStore = {};
  for (const it of items) totalsByStore[it.store] = (totalsByStore[it.store] || 0) + it.costEur;
  const total = items.reduce((a, it) => a + it.costEur, 0);
  const usedTotal = items.reduce((a, it) => a + it.usedEur, 0);
  const estimatedCost = items.filter((it) => it.estimated).reduce((a, it) => a + it.costEur, 0);

  return {
    items,
    pantry,
    totalsByStore,
    total,
    usedTotal,
    estimatedShare: total > 0 ? estimatedCost / total : 1,
  };
}
