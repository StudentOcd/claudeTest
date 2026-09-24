// Live check of every online connector, from your own computer:
//
//   npm run check:connectors
//   HEVY_API_KEY=xxxx npm run check:connectors     (also tests Hevy)
//
// Raw store pages are saved to data/debug/ so parsing problems can be fixed.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from '../server/connectors/http.js';
import { searchStore, fetchStoreProduct, STORE_SITES } from '../server/connectors/stores.js';
import { offProduct } from '../server/connectors/openfoodfacts.js';
import { recentPrices } from '../server/connectors/openprices.js';
import { HevyClient } from '../server/connectors/hevy.js';
import { productsFor } from '../src/core/products.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEBUG = path.join(ROOT, 'data', 'debug');
const http = new HttpClient({
  userAgent: 'Mozilla/5.0 (compatible; Leve/1.0; connector check)',
  intervals: { 'store-auchan': 1500, 'store-pingodoce': 1500, 'off-product': 4200, openprices: 1000, hevy: 300 },
});

const results = [];
const ok = (name, detail) => results.push({ ok: true, name, detail });
const fail = (name, err) => results.push({ ok: false, name, detail: err?.message || String(err) });

async function check(name, fn) {
  process.stdout.write(`… ${name}\r`);
  try {
    ok(name, await fn());
  } catch (err) {
    fail(name, err);
  }
}

await mkdir(DEBUG, { recursive: true });

for (const store of Object.keys(STORE_SITES)) {
  await check(`${store}: robots.txt`, async () => {
    const res = await fetch(`${STORE_SITES[store].origin}/robots.txt`, { headers: { 'user-agent': http.userAgent } });
    const text = await res.text();
    if (res.status >= 400 && res.status !== 404) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
    await writeFile(path.join(DEBUG, `${store}-robots.txt`), text);
    return `HTTP ${res.status}, ${text.split('\n').length} lines (saved)`;
  });
  await check(`${store}: search "peito de frango"`, async () => {
    const r = await searchStore(http, store, 'peito de frango');
    const tried = r.tried.map((t) => (t.ok ? `${t.count} tiles` : t.error)).join(' / ');
    if (!r.items.length) throw new Error(`no products parsed (${tried})`);
    return `${r.items.length} products, e.g. ${r.items.slice(0, 2).map((i) => `${i.name} ${i.price ?? '?'}€`).join('; ')}`;
  });
  for (const foodId of ['chicken_breast', 'eggs', 'tuna_water']) {
    const prod = productsFor(foodId, store).find((p) => p.url);
    if (!prod) continue;
    await check(`${store}: product page ${foodId}`, async () => {
      const html = await http.get(prod.url, { as: 'text', respectRobots: true, rateKey: `store-${store}` });
      await writeFile(path.join(DEBUG, `${store}-${foodId}.html`), html);
      const p = await fetchStoreProduct(http, store, prod.url);
      if (!(p.price > 0)) throw new Error(`page loaded but no price found (HTML saved to data/debug/${store}-${foodId}.html)`);
      return `${p.name} · ${p.price}€${p.unitPrice ? ` · ${p.unitPrice.eur}€/${p.unitPrice.per}` : ''}${p.per100 ? ' · nutrition ✓' : ''}${p.ingredientsText ? ' · ingredients ✓' : ''}`;
    });
  }
}

await check('Open Food Facts: product 5601009943685', async () => {
  const p = await offProduct(http, '5601009943685');
  if (!p) throw new Error('not found');
  return `${p.name} (${p.brand}) ${p.per100.kcal ?? '?'} kcal/100 g`;
});

await check('Open Prices: Hacendado tuna near Lisbon', async () => {
  const list = await recentPrices(http, { code: '8480000180582', radiusKm: 50 });
  return `${list.length} prices${list[0] ? `, latest ${list[0].eur}€ at ${list[0].storeName} (${list[0].date})` : ''}`;
});

if (process.env.HEVY_API_KEY) {
  await check('Hevy: user info', async () => {
    const info = await new HevyClient(http, process.env.HEVY_API_KEY).userInfo();
    return `hello ${info?.data?.name || 'there'}`;
  });
  await check('Hevy: workout count', async () => {
    const c = await new HevyClient(http, process.env.HEVY_API_KEY).workoutCount();
    return `${c?.workout_count ?? JSON.stringify(c)} workouts`;
  });
} else {
  results.push({ ok: null, name: 'Hevy', detail: 'skipped (set HEVY_API_KEY to test)' });
}

console.log('\nConnector check\n');
for (const r of results) console.log(`${r.ok === null ? '–' : r.ok ? '✓' : '✗'} ${r.name}: ${r.detail}`);
console.log(`\nRaw pages saved in ${DEBUG}`);
process.exit(results.some((r) => r.ok === false) ? 1 : 0);
