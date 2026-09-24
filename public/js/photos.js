// Real product photos from the store catalogue (downloaded by the crawler).
// Every food resolves to one product per store: your choice, else the
// researched product, else the first one found on the shelf online.

import { app } from './app.js';
import { html } from './ui.js';
import { icon } from './icons.js';
import { FOOD_BY_ID } from '/core/foods.js';
import { productsFor } from '/core/products.js';

const SECTION_ICON = {
  talho: 'beef',
  peixaria: 'fish',
  congelados: 'fish',
  refrigerados: 'egg',
  frescos: 'leaf',
  mercearia: 'package',
  padaria: 'wheat',
  temperos: 'leaf',
};

// Downloaded photos are served by Leve; live search results still point at the store.
export const imgSrc = (file) => (!file ? null : /^https:\/\//.test(file) ? file : `/product-img/${encodeURIComponent(file)}`);

const idFromUrl = (url) => url?.match(/[-/](\d{3,12})(?:\.html)?(?:[?#].*)?$/)?.[1] || null;

function catalogProducts(foodId, store) {
  const c = app.catalog;
  return (c?.foods?.[foodId]?.[store] || []).map((k) => c.products[k]).filter(Boolean);
}

function findInCatalog(store, url) {
  if (!url || !app.catalog) return null;
  const id = idFromUrl(url);
  return Object.values(app.catalog.products).find((p) => p.store === store && (p.url === url || (id && p.id === id))) || null;
}

/** All known products for a food at a store (catalogue first, then the researched list). */
export function productsOf(foodId, store) {
  const out = [...catalogProducts(foodId, store)];
  for (const p of productsFor(foodId, store)) {
    if (!out.some((x) => x.url === p.url || (p.id && x.id === p.id))) out.push({ ...p, price: p.seen?.eur ?? null });
  }
  return out;
}

/** The product the list uses for a food at a store, with its photo when we have one. */
export function productFor(foodId, store) {
  const choice = app.state.productChoice?.[foodId]?.[store];
  if (choice?.url) return { ...(findInCatalog(store, choice.url) || {}), ...choice, store, chosen: true };
  const list = productsOf(foodId, store);
  return list.find((p) => p.mapped && p.image) || list.find((p) => p.mapped) || list.find((p) => p.image) || list[0] || null;
}

/** A photo for a food: from the preferred store, else any store. */
export function photoFor(foodId, preferStore) {
  const stores = [...new Set([preferStore, ...(app.settings.stores || []), 'pingodoce', 'auchan', 'mercadona'].filter(Boolean))];
  for (const s of stores) {
    const p = productFor(foodId, s);
    if (p?.image) return { src: imgSrc(p.image), store: s, name: p.name };
  }
  for (const s of stores) {
    const p = catalogProducts(foodId, s).find((x) => x.image);
    if (p) return { src: imgSrc(p.image), store: s, name: p.name };
  }
  return null;
}

export function hasPhotos() {
  return Boolean(app.catalog && Object.values(app.catalog.products).some((p) => p.image));
}

/** Photo tile for a product record (or a neutral tile when there is no photo yet). */
export function productTile(p, { size = '', foodId = null, storeTag = false } = {}) {
  const f = FOOD_BY_ID[foodId || p?.foods?.[0]];
  if (p?.image) {
    return html`<div class="ph ${size}"><img src="${imgSrc(p.image)}" alt="${p.name || ''}" loading="lazy" decoding="async">${storeTag && p.store ? html`<i class="store-tag store-${p.store}"></i>` : ''}</div>`;
  }
  return blankTile(f, size);
}

export function blankTile(f, size = '') {
  return html`<div class="ph none ${size} tint-${f?.section || 'mercearia'}" title="No photo yet">${icon(SECTION_ICON[f?.section] || 'package')}</div>`;
}

/** Photo tile for a food. */
export function foodTile(foodId, { size = '', store = null, storeTag = false } = {}) {
  const ph = photoFor(foodId, store);
  const f = FOOD_BY_ID[foodId];
  if (!ph) return blankTile(f, size);
  return html`<div class="ph ${size}"><img src="${ph.src}" alt="${ph.name || f?.name || ''}" loading="lazy" decoding="async">${storeTag ? html`<i class="store-tag store-${ph.store}"></i>` : ''}</div>`;
}

/** Up to four ingredient photos for a meal (biggest ingredients first, photos preferred). */
export function mealCollage(items, { size = '' } = {}) {
  const ranked = items
    .filter((i) => i.g > 0 && FOOD_BY_ID[i.food]?.per100.kcal > 0)
    .sort((a, b) => b.g * (FOOD_BY_ID[b.food].per100.kcal + 50) - a.g * (FOOD_BY_ID[a.food].per100.kcal + 50))
    .map((i) => ({ i, ph: photoFor(i.food) }));
  const main = [...ranked.filter((x) => x.ph), ...ranked.filter((x) => !x.ph)].slice(0, 4);
  if (!main.length) return html`<div class="collage n1 ${size}"><span class="blank tint-mercearia">${icon('utensils')}</span></div>`;
  const cells = main.map(({ i, ph }) => {
    const f = FOOD_BY_ID[i.food];
    return ph
      ? html`<span class="pc"><img src="${ph.src}" alt="${f.name}" loading="lazy" decoding="async"></span>`
      : html`<span class="blank tint-${f.section}">${icon(SECTION_ICON[f.section] || 'package')}</span>`;
  });
  return html`<div class="collage n${cells.length} ${size}">${cells}</div>`;
}

/** Foods ordered for a photo strip: biggest first, the ones with photos ahead. */
export function withPhotosFirst(items) {
  const ranked = items
    .filter((i) => i.g > 0 && FOOD_BY_ID[i.food]?.per100.kcal > 0)
    .sort((a, b) => b.g * (FOOD_BY_ID[b.food].per100.kcal + 50) - a.g * (FOOD_BY_ID[a.food].per100.kcal + 50));
  return [...ranked.filter((i) => photoFor(i.food)), ...ranked.filter((i) => !photoFor(i.food))];
}

/** Progress card for the product crawl. */
export function crawlCard(job) {
  if (job?.status !== 'running') return '';
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  return html`<div class="card">
    <div class="row"><span class="spinner"></span><b class="grow">Getting products and photos from the stores…</b><span class="small muted">${pct}%</span></div>
    <div class="bar mt"><div style="width:${pct}%"></div></div>
    <p class="tiny muted mt">${job.message || ''} · ${job.photos || 0} photos so far</p>
  </div>`;
}
