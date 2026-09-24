// Crawl Pingo Doce, Auchan and Mercadona for every food in the plan and save
// real product photos, prices, nutrition and ingredients into the app.
//
//   npm run crawl                         -> data/products (used by your Leve server)
//   npm run crawl -- --out public/products  (ship the photos with the app)
//   npm run crawl -- --store auchan --food chicken_breast --no-discover
//
// Polite by default: one request every ~1.5 s per store, robots.txt respected,
// pages cached for 12 h, photos downloaded only once.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from '../server/connectors/http.js';
import { crawlStores, loadCatalog, saveCatalog } from '../server/crawler.js';
import { STORE_PRODUCTS } from '../src/core/products.js';
import { PT_QUERIES } from '../src/core/match.js';
import { FOOD_BY_ID } from '../src/core/foods.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const out = path.resolve(ROOT, opt('out', 'data/products'));
const stores = opt('store', 'pingodoce,auchan,mercadona').split(',');
const foods = opt('food', '') ? opt('food').split(',') : [...new Set([...Object.keys(STORE_PRODUCTS), ...Object.keys(PT_QUERIES)])];
const unknown = foods.filter((f) => !FOOD_BY_ID[f]);
if (unknown.length) {
  console.error(`Unknown food(s): ${unknown.join(', ')}`);
  process.exit(1);
}

const http = new HttpClient({
  userAgent: 'Mozilla/5.0 (compatible; Leve/1.0; personal grocery list)',
  cacheDir: path.join(ROOT, 'data', 'cache'),
  intervals: {
    'store-auchan': Number(opt('delay', 1500)),
    'store-pingodoce': Number(opt('delay', 1500)),
    mercadona: 700,
    'off-product': 4200,
    'img-auchan': 300,
    'img-pingodoce': 300,
    'img-mercadona': 200,
  },
});

console.log(`Crawling ${foods.length} foods at ${stores.join(', ')} → ${out}\n`);
const started = Date.now();
const catalog = await loadCatalog(out);
const { stats, errors } = await crawlStores(http, {
  stores,
  foodIds: foods,
  discover: !flag('no-discover'),
  imgDir: path.join(out, 'img'),
  catalog,
  forceImages: flag('force-images'),
  maxPerFood: Number(opt('max', 8)),
  detailPerFood: Number(opt('detail', 3)),
  onProgress: ({ step, total, message }) => process.stdout.write(`\r[${step}/${total}] ${message}`.padEnd(100).slice(0, 100)),
});
await saveCatalog(out, catalog);

console.log('\n\nPer food: products (with photo) · the product the list uses · price · label per 100 g');
const euro = (x) => (typeof x === 'number' ? `€${x.toFixed(2)}` : '–');
for (const f of foods) {
  const lists = catalog.foods[f] || {};
  console.log(`\n  ${FOOD_BY_ID[f].name}`);
  for (const s of stores) {
    const keys = lists[s] || [];
    const withPhoto = keys.filter((k) => catalog.products[k]?.image).length;
    const top = keys.map((k) => catalog.products[k]).find((p) => p?.detail) || catalog.products[keys[0]];
    const n = top?.per100;
    const label = n?.kcal !== undefined ? `${n.kcal} kcal, P ${n.p ?? '?'} C ${n.c ?? '?'} F ${n.f ?? '?'} (${top.labelFrom || 'store'})` : 'no label';
    const unit = top?.unitPrice ? ` (${euro(top.unitPrice.eur)}/${top.unitPrice.per})` : '';
    console.log(`    ${s.padEnd(10)} ${String(keys.length).padStart(2)} (${withPhoto}) · ${top ? `${top.name.slice(0, 48)} · ${euro(top.price)}${unit} · ${label}` : 'nothing found'}`);
  }
}
console.log(`\n${stats.products} products, ${stats.photos} photos, ${stats.prices} prices, ${stats.removed} researched links no longer sold, ${stats.errors} errors in ${Math.round((Date.now() - started) / 1000)} s`);
if (errors.length) {
  console.log('\nFirst errors:');
  for (const e of errors.slice(0, 12)) console.log(`  ${e.where}: ${e.error}`);
}
console.log(`\nSaved ${path.join(out, 'catalog.json')}`);
