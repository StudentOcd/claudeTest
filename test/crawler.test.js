import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HttpClient } from '../server/connectors/http.js';
import { catalogPrices, crawlStores, emptyCatalog, saveCatalog, loadCatalog } from '../server/crawler.js';
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

test('Mercadona: only products from the food\'s own aisle (real names and categories)', () => {
  const ps = [
    ['Pimientos del piquillo rellenos de bacalao Hacendado ultracongelados', 'Congelados › Fruta y verdura'],
    ['Migas de bacalao desaladas Hacendado', 'Marisco y pescado › Salazones y ahumados'],
    ['Lomo de bacalao MareDeus ultracongelado', 'Marisco y pescado › Pescado congelado'],
    ['Bacalao al punto de sal descongelado', 'Marisco y pescado › Pescado fresco'],
    ['Placas para canelones El Pavo', 'Arroz, legumbres y pasta › Pasta y fideos'],
    ['Filetes pechuga de pavo', 'Carne › Aves y pollo'],
    ['Queso rulo con piña y almendra Liptana', 'Charcutería y quesos › Queso untable, fresco y especialidades'],
    ['Piña en su jugo Hacendado rodajas', 'Conservas, caldos y cremas › Conservas de verdura y frutas'],
    ['Piña', 'Fruta y verdura › Fruta'],
    ['Bolsita puré fresa y plátano Hacendado +8 meses', 'Conservas, caldos y cremas › Conservas de verdura y frutas'],
    ['Fresas', 'Fruta y verdura › Fruta'],
    ['Judías verdes redondas Hacendado', 'Conservas, caldos y cremas › Conservas de verdura y frutas'],
    ['Judía verde redonda Hacendado ultracongelada', 'Congelados › Fruta y verdura'],
    ['Spaghetti al huevo Hacendado', 'Arroz, legumbres y pasta › Pasta y fideos'],
    ['Spaghetti Hacendado', 'Arroz, legumbres y pasta › Pasta y fideos'],
    ['Batata', 'Fruta y verdura › Verdura'],
    ['Yogur natural Hacendado sin lactosa', 'Postres y yogures › Yogures naturales y sabores'],
  ].map(([name, category], i) => ({ id: String(i), store: 'mercadona', name, category }));
  const first = (foodId) => matchMercadona(ps, foodId)[0]?.name;
  assert.equal(first('cod_desalted'), 'Bacalao al punto de sal descongelado');
  assert.ok(!matchMercadona(ps, 'cod_desalted').some((p) => /piquillo|migas/i.test(p.name)));
  assert.deepEqual(matchMercadona(ps, 'turkey_steaks').map((p) => p.name), ['Filetes pechuga de pavo']);
  assert.deepEqual(matchMercadona(ps, 'pineapple').map((p) => p.name), ['Piña']);
  assert.deepEqual(matchMercadona(ps, 'strawberries').map((p) => p.name), ['Fresas']);
  assert.equal(first('green_beans'), 'Judía verde redonda Hacendado ultracongelada');
  assert.deepEqual(matchMercadona(ps, 'pasta').map((p) => p.name), ['Spaghetti Hacendado']);
  assert.equal(first('sweet_potato'), 'Batata');
  assert.equal(first('lf_yogurt'), 'Yogur natural Hacendado sin lactosa');
});

test('store products are filed under the right food only', async () => {
  const { aisleFit, matchesFood, PT_QUERIES } = await import('../src/core/match.js');
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
  // Real catalogue names that used to slip through
  assert.equal(matchesFood('Ovos de Solo Classe M', f('eggs')), true);
  assert.equal(matchesFood('Ovos Moles', f('eggs')), false);
  assert.equal(matchesFood('Fios de Ovos', f('eggs')), false);
  assert.equal(matchesFood('Kefir Aveia', f('oats')), false);
  assert.equal(matchesFood('Flocos de Aveia', f('oats')), true);
  assert.equal(matchesFood('Ice Tea Limão', f('lemon')), false);
  assert.equal(matchesFood('Pudim de Morango', f('strawberries')), false);
  assert.equal(matchesFood('Morango Embalado', f('strawberries')), true);
  assert.equal(matchesFood('LOMBO DE SALMÃO PORÇÕES 150G', f('pork_loin')), false);
  assert.equal(matchesFood('Tomate Pingo Doce', f('tomato')), true);
  assert.equal(matchesFood('Pepino Doce', f('cucumber')), false);
  assert.equal(matchesFood('Fécula de Batata', f('potatoes')), false);
  // The store's aisle decides when the name alone can't (real names and addresses)
  const AU = 'https://www.auchan.pt/pt';
  const PD = 'https://www.pingodoce.pt/home/produtos';
  assert.equal(matchesFood('ICED TEA AUCHAN LIMÃO 2L', f('lemon'), { url: `${AU}/bebidas-e-garrafeira/refrigerantes/ice-tea-e-tisanas/iced-tea-auchan-limao-2l/3314.html` }), false);
  assert.equal(matchesFood('LIMÃO KG', f('lemon'), { url: `${AU}/produtos-frescos/fruta/laranjas-clementinas-e-limoes/limao-kg/21998.html` }), true);
  assert.equal(matchesFood('Pastilhas Loiça All in One Limão', f('lemon'), { url: `${PD}/as-nossas-marcas/pingo-doce/pastilhas-loica-all-in-one-limao-pingo-doce-1.html` }), false, 'fresh fruit needs its own aisle');
  assert.equal(matchesFood('Infusão Ananás H20', f('pineapple'), { url: `${PD}/alternativas-alimentares/nutricao-desportiva/bebidas-iogurtes-e-pudins-proteicos/infusao-ananas-h20-1.html` }), false);
  assert.equal(matchesFood('Ananás dos Açores', f('pineapple'), { url: `${PD}/frutas-e-vegetais/frutas/fruta-da-epoca/ananas-dos-acores-2.html` }), true);
  assert.equal(matchesFood('BANANA RODELAS AUCHAN 200 G', f('banana'), { url: `${AU}/produtos-frescos/fruta/frutos-secos-e-sementes/banana-rodelas-auchan-200-g/3.html` }), false);
  assert.equal(matchesFood('Ervilhas e Cenouras Congeladas', f('carrots'), { url: `${PD}/congelados/frutas-e-vegetais/vegetais-congelados/ervilhas-e-cenouras-congeladas-4.html` }), false);
  assert.equal(matchesFood('O Hospital de Alfaces', f('lettuce'), { url: `${PD}/livraria-e-papelaria/livraria/literatura/o-hospital-de-alfaces-5.html` }), false);
  assert.equal(matchesFood('Lombo de Porco Duroc Fatiado', f('pork_loin'), { url: `${PD}/charcutaria-e-queijos/charcutaria/outros-enchidos-e-fumeiro%E2%80%8B/lombo-de-porco-duroc-fatiado-6.html` }), false, 'cured, from the deli');
  assert.equal(matchesFood('Ovos de Solo Classe M', f('eggs'), { url: `${PD}/as-nossas-marcas/pingo-doce/ovos-de-solo-classe-m-pingo-doce-7.html` }), true, 'own-brand shelf: the name decides');
  assert.equal(aisleFit('green_beans', { url: `${PD}/congelados/frutas-e-vegetais/vegetais-congelados/feijao-verde-cortado-8.html` }), 1, 'frozen green beans preferred');
  // Every researched product matches its own food (name and aisle) and no other.
  for (const [foodId, byStore] of Object.entries(STORE_PRODUCTS)) {
    for (const p of [...(byStore.auchan || []), ...(byStore.pingodoce || [])]) {
      assert.ok(matchesFood(p.name, f(foodId), p), `${p.name} should match ${foodId}`);
      for (const other of Object.keys(PT_QUERIES)) if (other !== foodId) assert.ok(!matchesFood(p.name, f(other)), `${p.name} should not match ${other}`);
    }
  }
});

test('products come from the store sitemap; removed ones are dropped; the best match is used', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'leve-sitemap-'));
  const PD = 'https://www.pingodoce.pt/home/produtos';
  const page = (name, price, extra = '') => `<html><head><script type="application/ld+json">{"@type":"Product","name":"${name}","image":"https://static.pingodoce.pt/dw/image/v2/BLJJ_PRD/on/demandware.static/-/x/img/${price}.png","offers":{"price":"${price}"}}</script></head><body><h1>${name}</h1>${extra}</body></html>`;
  const label = '<div>Composição Nutricional</div><table><tr><td>Energia (kcal)</td><td>352.0</td></tr><tr><td>Lípidos (g)</td><td>0.8</td></tr><tr><td>Hidratos de Carbono (g)</td><td>78.2</td></tr><tr><td>Proteínas (g)</td><td>7.7</td></tr></table>';
  const calls = [];
  const fetchImpl = async (url) => {
    const u = String(url);
    calls.push(u);
    const text = (s) => new Response(s, { status: 200, headers: { 'content-type': 'text/html' } });
    if (u.endsWith('/robots.txt')) return text('User-agent: *\nDisallow: /on/demandware.store/\n');
    if (u.endsWith('/home/sitemap_index.xml')) return text('<sitemapindex><sitemap><loc>https://www.pingodoce.pt/home/sitemap_0-product.xml</loc></sitemap></sitemapindex>');
    if (u.endsWith('/sitemap_0-product.xml')) {
      const item = (slug, id, title) => `<url><loc>${PD}/mercearia/arroz/${slug}-${id}.html</loc><image:image><image:loc>https://static.pingodoce.pt/dw/image/v2/BLJJ_PRD/on/demandware.static/-/x/img/${id}.png</image:loc><image:title>${title}</image:title></image:image></url>`;
      return text(`<urlset>${item('arroz-agulha', '111', 'Arroz Agulha')}${item('arroz-vaporizado', '222', 'Arroz Vaporizado')}${item('arroz-doce', '333', 'Arroz Doce')}${item('arroz-cozido-copo', '444', 'Arroz Agulha Cozido Copo')}</urlset>`);
    }
    if (u.endsWith('arroz-agulha-111.html')) return text(page('Arroz Agulha', '1.57', `<span>1,57 €/kg</span>${label}`));
    if (u.endsWith('arroz-vaporizado-222.html')) return text(page('Arroz Vaporizado', '1.35', '<span>1,35 €/kg</span>'));
    if (u.includes('arroz-vaporizado-pingo-doce-651179.html')) return text('<html><body><h1>Página não encontrada</h1></body></html>');
    if (u.includes('/img/')) return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
    return new Response('nope', { status: 404 });
  };
  const http = new HttpClient({ fetchImpl });
  const catalog = emptyCatalog();
  const { prices, stats } = await crawlStores(http, { stores: ['pingodoce'], foodIds: ['rice_white'], imgDir: path.join(dir, 'img'), catalog });
  const list = catalog.foods.rice_white.pingodoce.map((k) => catalog.products[k]);
  assert.equal(list[0].name, 'Arroz Agulha', 'the best real match leads');
  assert.deepEqual(list[0].per100, { kcal: 352, f: 0.8, c: 78.2, p: 7.7 });
  assert.equal(list[0].labelFrom, 'store');
  assert.ok(!list.some((p) => /Doce|Cozido/.test(p.name)), 'rice pudding and cooked rice cups are not rice');
  assert.equal(stats.removed, 1, 'the researched link that left the shop is dropped');
  assert.deepEqual(prices.rice_white.map((p) => [p.eur, p.productName]), [[1.57, 'Arroz Agulha']]);
  // A saved catalogue gives the same shopping-list price (bundled catalogues work without an Update)
  assert.deepEqual(catalogPrices(catalog).rice_white.map((p) => [p.store, p.sold, p.eur, p.productName]), [['pingodoce', 'weight', 1.57, 'Arroz Agulha']]);
  assert.ok(list[0].image?.startsWith('pingodoce-111.'), 'photo saved');
  assert.ok(calls.some((u) => u.includes('sw=400')), 'small photos are requested');
  assert.ok(!calls.some((u) => /demandware\.store|Search-/.test(u)), 'no search endpoints');
});
