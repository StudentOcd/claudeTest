import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient } from '../server/connectors/http.js';
import { HevyClient, createProgram, syncWorkouts } from '../server/connectors/hevy.js';
import { normalizeOffProduct, offProduct, offSearch } from '../server/connectors/openfoodfacts.js';
import { latestByStore, recentPrices, storeFromLocation } from '../server/connectors/openprices.js';
import { searchStore, fetchStoreProduct, assertStoreUrl, photoUrl } from '../server/connectors/stores.js';

// A fake fetch: routes are [predicate(url, init), responder(url, init)].
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    for (const [match, respond] of routes) {
      if (match(String(url), init)) {
        const r = await respond(String(url), init);
        const status = r.status ?? 200;
        const body = r.json !== undefined ? JSON.stringify(r.json) : r.text ?? '';
        return new Response(body, { status, headers: { 'content-type': r.json !== undefined ? 'application/json' : 'text/html' } });
      }
    }
    return new Response('not found', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

const hevyWorkout = (id, day) => ({
  id,
  title: 'Full Body',
  start_time: `2026-09-${day}T18:00:00Z`,
  end_time: `2026-09-${day}T19:00:00Z`,
  exercises: [{ title: 'Leg Press (Machine)', exercise_template_id: 'LP', sets: [{ type: 'normal', weight_kg: 100, reps: 10 }] }],
});

test('Hevy: full sync walks every page, then applies events', async () => {
  const fetch = fakeFetch([
    [(u) => u.includes('/v1/workouts?') && u.includes('page=1'), () => ({ json: { page: 1, page_count: 2, workouts: [hevyWorkout('w1', '01'), hevyWorkout('w2', '03')] } })],
    [(u) => u.includes('/v1/workouts?') && u.includes('page=2'), () => ({ json: { page: 2, page_count: 2, workouts: [hevyWorkout('w3', '05')] } })],
    [(u) => u.includes('/v1/workouts/events'), () => ({
      json: { page: 1, page_count: 1, events: [{ type: 'updated', workout: hevyWorkout('w4', '10') }, { type: 'deleted', id: 'w1', deleted_at: '2026-09-09' }] },
    })],
  ]);
  const client = new HevyClient(new HttpClient({ fetchImpl: fetch }), '11111111-2222-3333-4444-555555555555');
  const store = { workouts: {}, lastSyncAt: null };
  const first = await syncWorkouts(client, store, { now: new Date('2026-09-06T00:00:00Z') });
  assert.deepEqual(first, { added: 3, deleted: 0, total: 3 });
  assert.equal(store.lastSyncAt, '2026-09-06T00:00:00.000Z');
  assert.equal(fetch.calls[0].headers['api-key'], '11111111-2222-3333-4444-555555555555');
  const second = await syncWorkouts(client, store, { now: new Date('2026-09-11T00:00:00Z') });
  assert.deepEqual(second, { added: 1, deleted: 1, total: 3 });
  assert.ok(store.workouts.w4 && !store.workouts.w1);
  assert.ok(fetch.calls.at(-1).url.includes('since=2026-09-06T00%3A00%3A00.000Z'));
});

test('Hevy: weight upsert keeps other measurements', async () => {
  const fetch = fakeFetch([
    [(u, i) => u.endsWith('/v1/body_measurements/2026-09-28') && (!i.method || i.method === 'GET'), () => ({ json: { date: '2026-09-28', weight_kg: 96, chest_cm: 110, waist: 111, created_at: 'x' } })],
    [(u, i) => u.endsWith('/v1/body_measurements/2026-09-28') && i.method === 'PUT', () => ({ json: {} })],
    [(u) => u.endsWith('/v1/body_measurements/2026-09-29'), () => ({ status: 404, json: { error: 'not found' } })],
    [(u, i) => u.endsWith('/v1/body_measurements') && i.method === 'POST', () => ({ json: {} })],
  ]);
  const client = new HevyClient(new HttpClient({ fetchImpl: fetch }), 'k'.repeat(36));
  assert.equal(await client.upsertWeight('2026-09-28', { kg: 95.2 }), 'updated');
  const put = fetch.calls.find((c) => c.method === 'PUT');
  assert.deepEqual(put.body, { weight_kg: 95.2, chest_cm: 110, waist: 111 });
  assert.equal(await client.upsertWeight('2026-09-29', { kg: 95.0, waistCm: 110 }), 'created');
  const post = fetch.calls.find((c) => c.method === 'POST');
  assert.deepEqual(post.body, { date: '2026-09-29', weight_kg: 95, waist: 110 });
});

test('Hevy: bad key gives a clear message', async () => {
  const fetch = fakeFetch([[() => true, () => ({ status: 401, json: { error: 'Unauthorized' } })]]);
  const client = new HevyClient(new HttpClient({ fetchImpl: fetch }), 'bad');
  await assert.rejects(client.userInfo(), /Hevy Pro/);
});

test('Hevy: programme creation makes a folder and two routines', async () => {
  let routineN = 0;
  const fetch = fakeFetch([
    [(u) => u.endsWith('/v1/routine_folders'), () => ({ status: 201, json: { routine_folder: { id: 77, title: 'x' } } })],
    [(u) => u.endsWith('/v1/routines'), () => ({ status: 201, json: { routine: [{ id: `r${++routineN}` }] } })],
  ]);
  const templates = Object.fromEntries(
    ['Leg Press (Machine)', 'Chest Press (Machine)', 'Lat Pulldown (Cable)', 'Plank', 'Goblet Squat'].map((t, i) => [`T${i}`, { id: `T${i}`, title: t, type: t === 'Plank' ? 'duration' : 'weight_reps' }]),
  );
  const res = await createProgram(new HevyClient(new HttpClient({ fetchImpl: fetch }), 'k'.repeat(36)), templates);
  assert.equal(res.folderId, 77);
  assert.deepEqual(res.created.map((c) => c.id), ['r1', 'r2']);
  assert.ok(res.missing.length > 0);
  const bodies = fetch.calls.filter((c) => c.url.endsWith('/v1/routines')).map((c) => c.body);
  assert.equal(bodies[0].routine.folder_id, 77);
  assert.ok(bodies[0].routine.exercises.every((e) => e.exercise_template_id.startsWith('T')));
});

test('Open Food Facts: product and search fallback', async () => {
  const product = {
    code: '5601009943685',
    product_name_pt: 'Atum posta ao natural',
    brands: 'Pingo Doce',
    nutriments: { 'energy-kj_100g': 460, proteins_100g: 25, fat_100g: 1, carbohydrates_100g: 0, salt_100g: 1.1 },
    ingredients_text_pt: 'Atum, água, sal',
  };
  const fetch = fakeFetch([
    [(u) => u.includes('/api/v2/product/5601009943685'), () => ({ json: { status: 1, product } })],
    [(u) => u.includes('search.openfoodfacts.org'), () => ({ status: 503, text: 'busy' })],
    [(u) => u.includes('/cgi/search.pl'), () => ({ json: { products: [product] } })],
  ]);
  const http = new HttpClient({ fetchImpl: fetch, userAgent: 'Leve/1.0 (test)' });
  const p = await offProduct(http, '5601009943685');
  assert.equal(p.name, 'Atum posta ao natural');
  assert.equal(p.per100.kcal, 110);
  assert.equal(p.brand, 'Pingo Doce');
  const results = await offSearch(http, 'atum', { store: 'pingodoce' });
  assert.equal(results.length, 1);
  const legacy = fetch.calls.find((c) => c.url.includes('/cgi/search.pl'));
  assert.ok(legacy.url.includes('tag_1=pingo-doce'));
  await assert.rejects(offProduct(http, 'abc'), /Barcode/);
  assert.equal(normalizeOffProduct(null), null);
});

test('Open Prices: nearby prices mapped to stores', async () => {
  const fetch = fakeFetch([
    [(u) => u.includes('prices.openfoodfacts.org'), () => ({
      json: {
        items: [
          { id: 1, price: '1.09', currency: 'EUR', date: '2026-09-10', product_code: '8480000180582', location: { osm_brand: 'Mercadona', osm_name: 'Mercadona', osm_address_city: 'Lisboa' } },
          { id: 2, price: '1.19', currency: 'EUR', date: '2026-08-01', product_code: '8480000180582', location: { osm_name: 'Mercadona Alvalade' } },
          { id: 3, price: '1.25', currency: 'EUR', date: '2026-09-01', product_code: '8480000180582', location: { osm_name: 'Pingo Doce Saldanha' } },
        ],
      },
    })],
  ]);
  const prices = await recentPrices(new HttpClient({ fetchImpl: fetch }), { code: '8480000180582' });
  assert.equal(prices.length, 3);
  const latest = latestByStore(prices);
  assert.equal(latest.mercadona.eur, 1.09);
  assert.equal(latest.pingodoce.eur, 1.25);
  assert.ok(fetch.calls[0].url.includes('lat=38.7223'));
  assert.equal(storeFromLocation({ osm_name: 'Jumbo Alfragide' }), 'auchan');
  assert.equal(storeFromLocation({ osm_name: 'Mercearia do Dia' }), 'other');
});

const GRID = `<div class="product" data-pid="2696458"><a class="link" href="/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-auchan-kg/2696458.html">Peito De Frango Auchan Kg</a><span class="value" content="6.29">6,29 €</span></div>`;

test('store search reads the sitemap the store publishes, never its search pages', async () => {
  const index = `<sitemapindex><sitemap><loc>https://www.auchan.pt/sitemap_0-product.xml</loc></sitemap><sitemap><loc>https://www.auchan.pt/sitemap_2-image.xml</loc></sitemap><sitemap><loc>https://www.auchan.pt/sitemap_8-category.xml</loc></sitemap></sitemapindex>`;
  const products = `<urlset>
    <url><loc>https://www.auchan.pt/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-auchan-kg/2696458.html</loc></url>
    <url><loc>https://www.auchan.pt/pt/produtos-frescos/talho/frango-e-galinha/coxas-de-frango-kg/100.html</loc></url>
    <url><loc>https://www.auchan.pt/pt/animais/cao/snack-peito-de-frango/200.html</loc></url></urlset>`;
  const images = `<urlset><url><loc>https://www.auchan.pt/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-auchan-kg/2696458.html</loc>
    <image:image><image:loc>https://bfrc-prd.my.commercecloud.salesforce.com/on/demandware.static/-/Sites-auchan-pt-master-catalog/default/dw1/images/hi-res/002696458.jpg</image:loc>
    <image:title>PEITO DE FRANGO AUCHAN KG</image:title></image:image></url></urlset>`;
  const fetch = fakeFetch([
    [(u) => u.endsWith('/robots.txt'), () => ({ text: 'User-agent: *\nDisallow: /pesquisa?q=*\n' })],
    [(u) => u.endsWith('/sitemap_index.xml'), () => ({ text: index })],
    [(u) => u.endsWith('/sitemap_0-product.xml'), () => ({ text: products })],
    [(u) => u.endsWith('/sitemap_2-image.xml'), () => ({ text: images })],
  ]);
  const res = await searchStore(new HttpClient({ fetchImpl: fetch }), 'auchan', 'peito de frango');
  assert.equal(res.items.length, 1, 'pet food and other cuts are left out');
  assert.equal(res.items[0].name, 'PEITO DE FRANGO AUCHAN KG');
  assert.equal(res.items[0].id, '2696458');
  assert.equal(res.items[0].image, 'https://www.auchan.pt/dw/image/v2/BFRC_PRD/on/demandware.static/-/Sites-auchan-pt-master-catalog/default/dw1/images/hi-res/002696458.jpg?sw=400&sh=400&sm=fit');
  assert.ok(!fetch.calls.some((c) => /pesquisa|Search-|category\.xml/.test(c.url)), 'no search page or unneeded sitemap requested');
});

test('store product fetch is limited to the store domain', async () => {
  assert.throws(() => assertStoreUrl('auchan', 'https://evil.example/pt/x/1.html'), /Only www.auchan.pt/);
  assert.throws(() => assertStoreUrl('auchan', 'http://www.auchan.pt/pt/x/1.html'), /Only/);
  const fetch = fakeFetch([
    [(u) => u.endsWith('/robots.txt'), () => ({ text: '' })],
    [(u) => u.includes('/2696458.html'), () => ({ text: `<h1>Peito De Frango Auchan Kg</h1>${GRID}<span>6,29 €/Kg</span>` })],
  ]);
  const p = await fetchStoreProduct(new HttpClient({ fetchImpl: fetch }), 'auchan', 'https://www.auchan.pt/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-auchan-kg/2696458.html');
  assert.equal(p.id, '2696458');
  assert.equal(p.price, 6.29);
  assert.deepEqual(p.unitPrice, { eur: 6.29, per: 'kg' });
});

test('http client caches and throttles', async () => {
  const fetch = fakeFetch([[() => true, () => ({ json: { ok: 1 } })]]);
  const http = new HttpClient({ fetchImpl: fetch, intervals: { k: 50 } });
  const t0 = Date.now();
  await http.get('https://x.example/a', { rateKey: 'k', cacheTtlMs: 10000 });
  await http.get('https://x.example/a', { rateKey: 'k', cacheTtlMs: 10000 });
  await http.get('https://x.example/b', { rateKey: 'k' });
  await http.get('https://x.example/c', { rateKey: 'k' });
  assert.equal(fetch.calls.length, 3, 'second /a came from the cache');
  assert.ok(Date.now() - t0 >= 90, 'requests were spaced out');
});

test('store photos are requested at 400 px from the stores\' image service', () => {
  assert.equal(
    photoUrl('auchan', 'https://www.auchan.pt/on/demandware.static/-/Sites-auchan-pt-master-catalog/default/dwb6/images/hi-res/000446856.jpg'),
    'https://www.auchan.pt/dw/image/v2/BFRC_PRD/on/demandware.static/-/Sites-auchan-pt-master-catalog/default/dwb6/images/hi-res/000446856.jpg?sw=400&sh=400&sm=fit',
  );
  assert.equal(
    photoUrl('pingodoce', 'https://static.pingodoce.pt/dw/image/v2/BLJJ_PRD/on/demandware.static/-/Sites-pingo-doce-master/default/dw8c/images/large/889028_6f.jpg'),
    'https://static.pingodoce.pt/dw/image/v2/BLJJ_PRD/on/demandware.static/-/Sites-pingo-doce-master/default/dw8c/images/large/889028_6f.jpg?sw=400&sh=400&sm=fit',
  );
  assert.equal(photoUrl('mercadona', 'https://prod-mercadona.imgix.net/images/a.jpg?fit=crop&h=400&w=400'), 'https://prod-mercadona.imgix.net/images/a.jpg?fit=crop&h=400&w=400');
});
