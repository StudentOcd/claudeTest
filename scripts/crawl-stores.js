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
const foods = opt('food', '') ? opt('food').split(',') : Object.keys(STORE_PRODUCTS);
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
  onProgress: ({ step, total, message }) => process.stdout.write(`\r[${step}/${total}] ${message}`.padEnd(100).slice(0, 100)),
});
await saveCatalog(out, catalog);

console.log('\n\nPer food (products found / with photo):');
for (const f of foods) {
  const lists = catalog.foods[f] || {};
  const cells = stores.map((s) => {
    const keys = lists[s] || [];
    const withPhoto = keys.filter((k) => catalog.products[k]?.image).length;
    return `${s} ${keys.length}/${withPhoto}`;
  });
  console.log(`  ${FOOD_BY_ID[f].name.slice(0, 40).padEnd(40)} ${cells.join('   ')}`);
}
console.log(`\n${stats.products} products, ${stats.photos} photos, ${stats.prices} prices, ${stats.errors} errors in ${Math.round((Date.now() - started) / 1000)} s`);
if (errors.length) {
  console.log('\nFirst errors:');
  for (const e of errors.slice(0, 12)) console.log(`  ${e.where}: ${e.error}`);
}
console.log(`\nSaved ${path.join(out, 'catalog.json')}`);
