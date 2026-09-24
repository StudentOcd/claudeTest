// Store crawler: for every food in the plan, collect real products from
// Pingo Doce, Auchan (their online shops) and Mercadona (Spanish online shop,
// same Hacendado products): photo, name, price, price per kg, nutrition and
// ingredients. Photos are downloaded so the app shows them offline.
//
// Output: <dir>/catalog.json and <dir>/img/<store>-<id>.<ext>

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FOOD_BY_ID } from '../src/core/foods.js';
import { keywordScore, matchesFood, PT_QUERIES } from '../src/core/match.js';
import { STORE_PRODUCTS, categoryUrl, productsFor } from '../src/core/products.js';
import { browseCategory, fetchStoreProduct, photoUrl, priceEntryFromProduct, sitemapProducts } from './connectors/stores.js';
import { matchMercadona, mercadonaProduct, mercadonaProducts } from './connectors/mercadona.js';
import { offProduct } from './connectors/openfoodfacts.js';
import { isCompleteLabel } from '../src/core/labels.js';

/**
 * The nutrition label of this exact product: from the store's page, else from Open Food Facts
 * by barcode (label values transcribed from photos of the pack).
 */
export async function labelFor(http, { per100 = null, ean = null } = {}, { useOff = true } = {}) {
  if (isCompleteLabel(per100)) return { per100, labelFrom: 'store' };
  // Barcodes starting with 2 are the store's own codes for weighed items: never in Open Food Facts.
  if (useOff && /^\d{8,14}$/.test(String(ean || '')) && !/^2/.test(String(ean).padStart(13, '0'))) {
    const off = await offProduct(http, ean);
    if (off && isCompleteLabel(off.per100)) {
      return { per100: off.per100, labelFrom: 'openfoodfacts', offUrl: off.url, offIngredients: off.ingredientsText || null };
    }
  }
  return { per100: per100 || null, labelFrom: per100 ? 'store' : null };
}

export const CATALOG_VERSION = 1;

export function emptyCatalog() {
  return { version: CATALOG_VERSION, updatedAt: null, products: {}, foods: {}, errors: [] };
}

export async function loadCatalog(dir) {
  try {
    const c = JSON.parse(await readFile(path.join(dir, 'catalog.json'), 'utf8'));
    return { ...emptyCatalog(), ...c };
  } catch {
    return emptyCatalog();
  }
}

export async function saveCatalog(dir, catalog) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'catalog.json');
  await writeFile(`${file}.tmp`, JSON.stringify(catalog, null, 1));
  await rename(`${file}.tmp`, file);
}

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.slice(4, 12).toString().includes('ftypavif')) return 'avif';
  if (buf.slice(0, 3).toString() === 'GIF') return 'gif';
  return null;
}

const safeId = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

/** Download a product photo once. Returns the file name, or null. */
export async function downloadPhoto(http, imgDir, store, id, imageUrl, { force = false } = {}) {
  if (!imageUrl || !/^https:\/\//.test(imageUrl)) return null;
  const base = `${store}-${safeId(id)}`;
  if (!force) {
    for (const ext of ['jpg', 'png', 'webp', 'avif', 'gif']) if (existsSync(path.join(imgDir, `${base}.${ext}`))) return `${base}.${ext}`;
  }
  const { buffer, contentType } = await http.getBuffer(imageUrl, { rateKey: `img-${store}` });
  const ext = sniff(buffer) || EXT[contentType];
  if (!ext) throw new Error(`not an image (${contentType || 'unknown type'})`);
  await mkdir(imgDir, { recursive: true });
  await writeFile(path.join(imgDir, `${base}.${ext}`), buffer);
  return `${base}.${ext}`;
}

// Remove a product the store no longer sells from every food list.
function forget(catalog, store, url) {
  for (const [key, p] of Object.entries(catalog.products)) {
    if (p.store !== store || p.url !== url) continue;
    delete catalog.products[key];
    for (const lists of Object.values(catalog.foods)) {
      if (lists[store]) lists[store] = lists[store].filter((k) => k !== key);
    }
  }
}

// How a product is sold, for its price entry: what we researched, else what its page says.
function soldFor(candidate, page) {
  if (candidate.sold) return candidate;
  if (page.pack?.grams || page.pack?.units) return { sold: 'pack', packG: page.pack.drainedG || page.pack.grams, packUnits: page.pack.units };
  if (page.unitPrice?.per === 'kg') return { sold: 'weight' };
  return {};
}

// The store's own brands first (usually the cheapest), then the closest name, photos preferred.
const OWN_BRAND = {
  pingodoce: /\b(pingo doce|nosso talho|nossa peixaria|nossos frescos|nossa fruta|go active|pura vida)\b/i,
  auchan: /\b(auchan|cultivamos o bom|cuida-te|polegar)\b/i,
};
export function rankForFood(products, food, store) {
  const q = PT_QUERIES[food.id];
  if (!q) return [];
  return products
    .map((p) => ({ p, s: keywordScore(p.name, q) }))
    .filter((x) => x.s > 0)
    .map((x) => ({ ...x, s: x.s + (OWN_BRAND[store]?.test(x.p.name) ? 1.5 : 0) + (x.p.image ? 0.5 : 0) }))
    .sort((a, b) => b.s - a.s || a.p.name.length - b.p.name.length)
    .map((x) => x.p);
}

function keyOf(p) {
  return `${p.store}:${p.id || createHash('sha1').update(p.url || p.name).digest('hex').slice(0, 10)}`;
}

function record(catalog, foodId, p, { mapped = false } = {}) {
  const key = keyOf(p);
  const prev = catalog.products[key] || {};
  const merged = { ...prev, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined && v !== '')) };
  merged.key = key;
  merged.foods = [...new Set([...(prev.foods || []), foodId])];
  merged.mapped = Boolean(prev.mapped || mapped);
  catalog.products[key] = merged;
  const lists = (catalog.foods[foodId] ||= {});
  const list = (lists[p.store] ||= []);
  if (!list.includes(key)) {
    // Known products stay first, in the order they were researched; discoveries follow.
    const firstDiscovered = list.findIndex((k) => !catalog.products[k]?.mapped);
    if (mapped && firstDiscovered >= 0) list.splice(firstDiscovered, 0, key);
    else list.push(key);
  }
  return merged;
}

/**
 * Shopping-list prices from a saved catalogue: for each food and store, the product the list
 * uses (first on the list with a price). Mercadona prices are Spanish, kept as a guide.
 */
export function catalogPrices(catalog) {
  const out = {};
  for (const [foodId, byStore] of Object.entries(catalog?.foods || {})) {
    for (const [store, keys] of Object.entries(byStore || {})) {
      const p = keys.map((k) => catalog.products[k]).find((x) => x?.detail && x.price > 0);
      if (!p) continue;
      const date = (p.fetchedAt || '').slice(0, 10) || undefined;
      let entry;
      if (store === 'mercadona') {
        const byKg = p.unitPrice?.per === 'kg' && !p.pack?.grams;
        entry = { store, sold: byKg ? 'weight' : 'pack', eur: byKg ? p.unitPrice.eur : p.price, packG: p.pack?.grams || undefined, source: 'mercadona-es', productName: p.name, url: p.url };
      } else {
        const researched = productsFor(foodId, store).find((r) => r.url === p.url) || {};
        entry = priceEntryFromProduct({ ...p, store }, soldFor(researched, p));
      }
      if (entry && entry.eur > 0) (out[foodId] ||= []).push({ ...entry, date });
    }
  }
  return out;
}

/**
 * Crawl the given foods.
 * options: { stores, foodIds, discover, imgDir, catalog, choices, onProgress, maxPerFood }
 *   choices: the user's product choices ({ [foodId]: { [store]: { url } } }) are crawled first
 * Returns { catalog, prices: { [foodId]: priceEntry[] }, stats }
 */
export async function crawlStores(http, {
  stores = ['pingodoce', 'auchan', 'mercadona'],
  foodIds = [...new Set([...Object.keys(STORE_PRODUCTS), ...Object.keys(PT_QUERIES)])],
  discover = true,
  imgDir,
  catalog = emptyCatalog(),
  choices = {},
  onProgress = () => {},
  maxPerFood = 8,
  detailPerFood = 3,
  forceImages = false,
  offLabels = true,
} = {}) {
  const prices = {};
  const stats = { products: 0, photos: 0, prices: 0, errors: 0, removed: 0 };
  const errors = [];
  const fail = (where, err) => {
    stats.errors++;
    errors.push({ where, error: err.message || String(err), code: err.code || null });
  };
  const addPrice = (foodId, entry) => {
    if (!entry) return;
    (prices[foodId] ||= []).push(entry);
    stats.prices++;
  };
  // page: the photo comes from the product's own page (a listing thumbnail never replaces it).
  const photo = async (rec, imageUrl, { page = false } = {}) => {
    if (!imgDir || !imageUrl) return;
    const cur = catalog.products[rec.key];
    if (!page && cur.imageFrom === 'page' && cur.image) return;
    const changed = Boolean(cur.sourceImage && cur.sourceImage !== imageUrl);
    try {
      const file = await downloadPhoto(http, imgDir, rec.store, rec.id || rec.key, imageUrl, { force: forceImages || changed });
      if (file) {
        cur.image = file;
        cur.sourceImage = imageUrl;
        cur.imageFrom = page ? 'page' : 'listing';
        stats.photos++;
      }
    } catch (err) {
      fail(`photo ${rec.key}`, err);
    }
  };

  const webStores = stores.filter((s) => s === 'pingodoce' || s === 'auchan');
  const total = foodIds.length * webStores.length + (stores.includes('mercadona') ? 1 : 0);
  let step = 0;

  // Everything each store sells online, from the sitemaps it publishes for crawlers (read once).
  const listings = {};
  const listed = async (store) => {
    if (!(store in listings)) {
      try {
        listings[store] = await sitemapProducts(http, store);
      } catch (err) {
        fail(`${store} sitemap`, err);
        listings[store] = null;
      }
    }
    return listings[store];
  };

  for (const foodId of foodIds) {
    const food = FOOD_BY_ID[foodId];
    if (!food) continue;
    for (const store of webStores) {
      onProgress({ step: ++step, total, message: `${food.name} @ ${store}`, ...stats });
      const seen = new Set();
      const alive = []; // { page, candidate, key }

      // A product's own page: price, price per kg, label, barcode, photo.
      const detail = async (candidate) => {
        if (seen.has(candidate.url)) return;
        seen.add(candidate.url);
        const page = await fetchStoreProduct(http, store, candidate.url);
        let label = { per100: page.per100, labelFrom: page.per100 ? 'store' : null };
        try {
          label = await labelFor(http, page, { useOff: offLabels });
        } catch (err) {
          fail(`openfoodfacts ${page.ean}`, err);
        }
        const rec = record(
          catalog,
          foodId,
          {
            store,
            id: page.id || candidate.id,
            name: page.name || candidate.name,
            brand: page.brand,
            url: page.url,
            price: page.price,
            unitPrice: page.unitPrice,
            pack: page.pack,
            per100: label.per100,
            labelFrom: label.labelFrom,
            offUrl: label.offUrl,
            ingredientsText: page.ingredientsText || label.offIngredients,
            ean: page.ean,
            available: page.available,
            fetchedAt: page.fetchedAt,
            detail: true,
          },
          { mapped: true },
        );
        stats.products++;
        alive.push({ page, candidate, key: rec.key });
        await photo(rec, photoUrl(store, page.image), { page: true });
      };
      const tryDetail = async (candidate) => {
        try {
          await detail(candidate);
        } catch (err) {
          if (err.code === 'NOT_FOUND') {
            stats.removed++;
            forget(catalog, store, candidate.url);
          } else fail(`${store} ${candidate.url}`, err);
        }
      };

      // 1. Your pick, then the researched products (some may have left the shop since).
      const known = [];
      const choice = choices?.[foodId]?.[store];
      if (choice?.url) known.push({ ...choice, store });
      for (const p of productsFor(foodId, store)) if (p.url && !known.some((k) => k.url === p.url)) known.push(p);
      for (const k of known.slice(0, 3)) await tryDetail(k);
      const settle = () => {
        // The product the list uses: your pick, else the best match on sale (store brands first).
        const q = PT_QUERIES[food.id];
        const score = ({ page, candidate }) => (candidate === known[0] && choice?.url ? 1000 : 0)
          + (q ? keywordScore(page.name || '', q) : 0)
          + (OWN_BRAND[store]?.test(page.name || '') ? 1.5 : 0)
          + (page.price > 0 ? 0.5 : -5);
        const best = [...alive].sort((a, b) => score(b) - score(a))[0];
        if (!best) return;
        addPrice(foodId, priceEntryFromProduct(best.page, soldFor(best.candidate, best.page)));
        const list = catalog.foods[foodId]?.[store];
        if (list) catalog.foods[foodId][store] = [best.key, ...list.filter((k) => k !== best.key)];
      };
      if (!discover) {
        settle();
        continue;
      }

      // 2. What else the store sells that is this food: best matches get their page read,
      //    the rest are kept as alternatives with their photo.
      const all = await listed(store);
      if (all) {
        const ranked = rankForFood(all, food, store).slice(0, maxPerFood);
        for (const p of ranked.slice(0, detailPerFood)) await tryDetail(p);
        settle();
        for (const p of ranked) {
          if (seen.has(p.url)) continue;
          const rec = record(catalog, foodId, { store, id: p.id, name: p.name, url: p.url, fetchedAt: new Date().toISOString() });
          stats.products++;
          await photo(rec, p.image);
        }
        continue;
      }
      // Sitemap unavailable: the food's category page, when we know one.
      settle();
      try {
        const url = categoryUrl(foodId, store);
        const tiles = url ? await browseCategory(http, store, url) : [];
        for (const t of tiles.filter((x) => x.name && matchesFood(x.name, food)).slice(0, maxPerFood)) {
          const rec = record(catalog, foodId, {
            store, id: t.id, name: t.name, brand: t.brand, url: t.url, price: t.price, unitPrice: t.unitPrice, pack: t.pack, promo: t.promo,
            fetchedAt: new Date().toISOString(),
          });
          stats.products++;
          await photo(rec, photoUrl(store, t.image));
        }
      } catch (err) {
        fail(`${store} discover ${foodId}`, err);
      }
    }
  }

  if (stores.includes('mercadona')) {
    onProgress({ step: ++step, total, message: 'Mercadona catalogue', ...stats });
    try {
      const all = await mercadonaProducts(http, { onProgress: (m) => onProgress({ step, total, message: m, ...stats }) });
      for (const foodId of foodIds) {
        const food = FOOD_BY_ID[foodId];
        if (!food) continue;
        const matches = matchMercadona(all, foodId, maxPerFood);
        for (const [i, m] of matches.entries()) {
          let p = m;
          if (i === 0) {
            try {
              p = { ...m, ...(await mercadonaProduct(http, m.id)) };
            } catch {
              p = m;
            }
            // Mercadona's shop has no nutrition table: the label comes from Open Food Facts.
            try {
              const label = await labelFor(http, { ean: p.ean }, { useOff: offLabels });
              if (label.per100) p = { ...p, per100: label.per100, labelFrom: label.labelFrom, offUrl: label.offUrl, ingredientsText: p.ingredientsText || label.offIngredients };
            } catch (err) {
              fail(`openfoodfacts ${p.ean}`, err);
            }
          }
          const rec = record(catalog, foodId, { ...p, fetchedAt: new Date().toISOString(), detail: i === 0 }, { mapped: i === 0 });
          stats.products++;
          await photo(rec, p.imageUrl, { page: i === 0 });
          if (i === 0 && p.price > 0) {
            addPrice(foodId, {
              store: 'mercadona',
              sold: p.unitPrice?.per === 'kg' && !p.pack?.grams ? 'weight' : 'pack',
              eur: p.unitPrice?.per === 'kg' && !p.pack?.grams ? p.unitPrice.eur : p.price,
              packG: p.pack?.grams || undefined,
              date: new Date().toISOString().slice(0, 10),
              source: 'mercadona-es',
              productName: p.name,
              url: p.url,
            });
          }
        }
      }
    } catch (err) {
      fail('mercadona catalogue', err);
    }
  }

  catalog.updatedAt = new Date().toISOString();
  catalog.errors = errors.slice(-200);
  return { catalog, prices, stats, errors };
}
