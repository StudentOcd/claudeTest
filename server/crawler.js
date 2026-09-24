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
import { matchesFood } from '../src/core/match.js';
import { STORE_PRODUCTS, categoryUrl, productsFor } from '../src/core/products.js';
import { browseCategory, fetchStoreProduct, priceEntryFromProduct, searchStore } from './connectors/stores.js';
import { matchMercadona, mercadonaProduct, mercadonaProducts } from './connectors/mercadona.js';
import { offProduct } from './connectors/openfoodfacts.js';
import { isCompleteLabel } from '../src/core/labels.js';

/**
 * The nutrition label of this exact product: from the store's page, else from Open Food Facts
 * by barcode (label values transcribed from photos of the pack).
 */
export async function labelFor(http, { per100 = null, ean = null } = {}, { useOff = true } = {}) {
  if (isCompleteLabel(per100)) return { per100, labelFrom: 'store' };
  if (useOff && /^\d{8,14}$/.test(String(ean || ''))) {
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
 * Crawl the given foods.
 * options: { stores, foodIds, discover, imgDir, catalog, choices, onProgress, maxPerFood }
 *   choices: the user's product choices ({ [foodId]: { [store]: { url } } }) are crawled first
 * Returns { catalog, prices: { [foodId]: priceEntry[] }, stats }
 */
export async function crawlStores(http, {
  stores = ['pingodoce', 'auchan', 'mercadona'],
  foodIds = Object.keys(STORE_PRODUCTS),
  discover = true,
  imgDir,
  catalog = emptyCatalog(),
  choices = {},
  onProgress = () => {},
  maxPerFood = 10,
  forceImages = false,
  offLabels = true,
} = {}) {
  const prices = {};
  const stats = { products: 0, photos: 0, prices: 0, errors: 0 };
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

  for (const foodId of foodIds) {
    const food = FOOD_BY_ID[foodId];
    if (!food) continue;
    for (const store of webStores) {
      onProgress({ step: ++step, total, message: `${food.name} @ ${store}`, ...stats });
      // 1. Products we know (your choice first, then the researched ones): full page.
      const known = [];
      const choice = choices?.[foodId]?.[store];
      if (choice?.url) known.push({ ...choice, store });
      for (const p of productsFor(foodId, store)) if (p.url && !known.some((k) => k.url === p.url)) known.push(p);
      for (const mapped of known.slice(0, 3)) {
        try {
          const page = await fetchStoreProduct(http, store, mapped.url);
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
              id: page.id || mapped.id,
              name: page.name || mapped.name,
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
          addPrice(foodId, priceEntryFromProduct(page, mapped));
          await photo(rec, page.image, { page: true });
        } catch (err) {
          fail(`${store} ${mapped.url}`, err);
        }
      }
      // 2. Discover more products (category page or search) with their tile photos.
      if (!discover) continue;
      try {
        const url = categoryUrl(foodId, store);
        const tiles = url ? await browseCategory(http, store, url) : (await searchStore(http, store, food.buy.search || food.name)).items;
        const matching = tiles.filter((t) => t.name && matchesFood(t.name, food)).slice(0, maxPerFood);
        for (const t of matching) {
          const rec = record(catalog, foodId, {
            store,
            id: t.id,
            name: t.name,
            brand: t.brand,
            url: t.url,
            price: t.price,
            unitPrice: t.unitPrice,
            pack: t.pack,
            promo: t.promo,
            fetchedAt: new Date().toISOString(),
          });
          stats.products++;
          await photo(rec, t.image);
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
