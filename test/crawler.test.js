import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HttpClient } from '../server/connectors/http.js';
import { crawlStores, emptyCatalog, saveCatalog, loadCatalog } from '../server/crawler.js';
import { matchMercadona } from '../server/connectors/mercadona.js';

// 1x1 JPEG and PNG
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function fake() {
  const calls = [];
  const fn = async (url) => {
    const u = String(url);
    calls.push(u);
    const html = (s) => new Response(s, { status: 200, headers: { 'content-type': 'text/html' } });
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/robots.txt')) return html('User-agent: *\nDisallow: /checkout\n');
    if (u.includes('/img/')) return new Response(u.includes('png') ? PNG : JPEG, { status: 200, headers: { 'content-type': u.includes('png') ? 'image/png' : 'image/jpeg' } });
    if (u.includes('peito-de-frango-auchan-kg/2696458.html')) {
      return html(`<script type="application/ld+json">{"@type":"Product","name":"Peito De Frango Auchan Kg","image":"https://www.auchan.pt/img/2696458.jpg","offers":{"price":"6.29"}}</script><span>6,29 €/Kg</span>`);
    }
    if (u.endsWith('/pt/produtos-frescos/talho/frango-e-galinha/')) {
      return html(`
        <div class="product" data-pid="555"><a class="link" href="/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-do-campo/555.html">Peito De Frango Do Campo Kg</a>
          <img src="data:image/gif;base64,R0lGOD" data-src="https://www.auchan.pt/img/555.png"><span class="value" content="8.69">8,69 €</span></div>
        <div class="product" data-pid="556"><a class="link" href="/pt/x/coxas-de-frango/556.html">Asas De Peru Kg</a><img src="https://www.auchan.pt/img/556.jpg"></div>`);
    }
    if (u.includes('tienda.mercadona.es/api/categories/?')) {
      return json({ results: [
        { id: 1, name: 'Carne', categories: [{ id: 10, name: 'Aves y pollo' }] },
        { id: 2, name: 'Limpieza y hogar', categories: [{ id: 20, name: 'Detergente' }] },
      ] });
    }
    if (u.includes('tienda.mercadona.es/api/categories/10/')) {
      return json({ categories: [{ products: [
        { id: '3401', display_name: 'Filetes pechuga de pollo', packaging: 'Bandeja', thumbnail: 'https://prod-mercadona.imgix.net/img/3401.jpg?fit=crop&h=300&w=300', price_instructions: { unit_price: '5.10', reference_price: '6.80', reference_format: 'kg' } },
        { id: '3402', display_name: 'Pechuga de pollo empanada', thumbnail: 'https://prod-mercadona.imgix.net/img/3402.jpg', price_instructions: { unit_price: '3.00' } },
      ] }] });
    }
    if (u.includes('tienda.mercadona.es/api/products/3401/')) {
      return json({ id: '3401', display_name: 'Filetes pechuga de pollo', photos: [{ regular: 'https://prod-mercadona.imgix.net/img/3401-big.jpg' }], ean: '8480000123456', price_instructions: { unit_price: '5.10', reference_price: '6.80', reference_format: 'kg' } });
    }
    return new Response('nope', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

test('crawler collects real products, prices and photos from all three stores', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'leve-crawl-'));
  const f = fake();
  const http = new HttpClient({ fetchImpl: f });
  const catalog = emptyCatalog();
  const { stats, prices } = await crawlStores(http, {
    stores: ['auchan', 'mercadona'],
    foodIds: ['chicken_breast'],
    imgDir: path.join(dir, 'img'),
    catalog,
  });
  const auchan = catalog.foods.chicken_breast.auchan.map((k) => catalog.products[k]);
  assert.equal(auchan[0].id, '2696458', 'mapped product first');
  assert.equal(auchan[0].price, 6.29);
  assert.match(auchan[0].image, /^auchan-2696458\.jpg$/);
  assert.ok(existsSync(path.join(dir, 'img', auchan[0].image)));
  const discovered = auchan.find((p) => p.id === '555');
  assert.equal(discovered.image, 'auchan-555.png', 'lazy-load placeholder skipped, real photo saved');
  assert.ok(!auchan.some((p) => p.id === '556'), 'turkey wings are not chicken breast');
  const merc = catalog.foods.chicken_breast.mercadona.map((k) => catalog.products[k]);
  assert.equal(merc[0].name, 'Filetes pechuga de pollo');
  assert.equal(merc[0].image, 'mercadona-3401.jpg');
  assert.equal(merc[0].ean, '8480000123456');
  assert.ok(!merc.some((p) => /empanada/.test(p.name)), 'breaded chicken excluded');
  assert.ok(f.calls.every((u) => !u.includes('/api/categories/20/')), 'cleaning products never crawled');
  assert.deepEqual(prices.chicken_breast.map((p) => [p.store, p.sold, p.eur, p.source]), [
    ['auchan', 'weight', 6.29, 'store'],
    ['mercadona', 'weight', 6.8, 'mercadona-es'],
  ]);
  assert.equal(stats.photos, 3);
  assert.equal(catalog.products['auchan:506066'], undefined, 'a page that failed to load adds nothing');
  // Save, reload, and photos are not downloaded twice.
  await saveCatalog(dir, catalog);
  const again = await loadCatalog(dir);
  const before = f.calls.filter((u) => u.includes('/img/')).length;
  await crawlStores(http, { stores: ['auchan'], foodIds: ['chicken_breast'], imgDir: path.join(dir, 'img'), catalog: again });
  assert.equal(f.calls.filter((u) => u.includes('/img/')).length, before);
  assert.ok(readFileSync(path.join(dir, 'catalog.json'), 'utf8').includes('Peito De Frango Auchan Kg'));
});

test('Mercadona matching uses Spanish names and exclusions', () => {
  const ps = [
    { name: 'Atún claro al natural Hacendado pack 3', price: 2.1 },
    { name: 'Atún claro en aceite de oliva', price: 2.5 },
    { name: 'Huevos frescos L docena', price: 2.9 },
    { name: 'Huevos de codorniz', price: 1.9 },
  ].map((p, i) => ({ ...p, id: String(i), store: 'mercadona' }));
  assert.deepEqual(matchMercadona(ps, 'tuna_water').map((p) => p.id), ['0']);
  assert.deepEqual(matchMercadona(ps, 'eggs').map((p) => p.id), ['2']);
});

test('store products are filed under the right food only', async () => {
  const { matchesFood, PT_QUERIES } = await import('../src/core/match.js');
  const { FOOD_BY_ID } = await import('../src/core/foods.js');
  const { STORE_PRODUCTS } = await import('../src/core/products.js');
  const f = (id) => FOOD_BY_ID[id];
  assert.equal(matchesFood('Peito/Bife de Peru Embalado Nosso Talho', f('chicken_breast')), false);
  assert.equal(matchesFood('Peito/Bife de Peru Embalado Nosso Talho', f('turkey_steaks')), true);
  assert.equal(matchesFood('Batata para Cozer e Assar Embalada Pingo Doce 3 kg', f('potatoes')), true);
  assert.equal(matchesFood('Batata para Cozer e Assar Embalada Pingo Doce 3 kg', f('sweet_potato')), false);
  assert.equal(matchesFood('Batata Doce Kg', f('potatoes')), false);
  assert.equal(matchesFood('Atum Posta em Azeite', f('tuna_water')), false);
  assert.equal(matchesFood('Arroz Agulha Pingo Doce 1 kg', f('rice_white')), true);
  assert.equal(matchesFood('Nuggets de Frango', f('chicken_breast')), false);
  // Every researched product matches its own food and no other.
  for (const [foodId, byStore] of Object.entries(STORE_PRODUCTS)) {
    for (const p of [...(byStore.auchan || []), ...(byStore.pingodoce || [])]) {
      assert.ok(matchesFood(p.name, f(foodId)), `${p.name} should match ${foodId}`);
      for (const other of Object.keys(PT_QUERIES)) if (other !== foodId) assert.ok(!matchesFood(p.name, f(other)), `${p.name} should not match ${other}`);
    }
  }
});
