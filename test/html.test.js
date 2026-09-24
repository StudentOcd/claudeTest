import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeEntities, extractIngredients, htmlToText, parseEuro, parseNutrition, parsePackSize, parseProductPage,
  parseProductTiles, parseUnitPrice,
} from '../server/connectors/html.js';
import { STORE_SITES, priceEntryFromProduct } from '../server/connectors/stores.js';
import { isAllowed, parseRobots } from '../server/connectors/robots.js';

test('euro and unit prices in Portuguese formats', () => {
  assert.equal(parseEuro('1,99 €'), 1.99);
  assert.equal(parseEuro('€ 12.49'), 12.49);
  assert.equal(parseEuro('1.234,56 €'), 1234.56);
  assert.equal(parseEuro('sem preço'), null);
  assert.deepEqual(parseUnitPrice('Preço: 6,29 €/Kg'), { eur: 6.29, per: 'kg' });
  assert.deepEqual(parseUnitPrice('0,26 € / un'), { eur: 0.26, per: 'unit' });
  assert.deepEqual(parseUnitPrice('€1.45/Kg'), { eur: 1.45, per: 'kg' });
  assert.deepEqual(parseUnitPrice('5,99 €/L'), { eur: 5.99, per: 'l' });
  assert.equal(parseUnitPrice('nada'), null);
});

test('pack sizes from product names', () => {
  assert.deepEqual(parsePackSize('ATUM POSTA AUCHAN AO NATURAL 120(84)G'), { grams: 120, drainedG: 84 });
  assert.deepEqual(parsePackSize('Iogurte Natural Auchan Sem Lactose 4x125g'), { grams: 500 });
  assert.deepEqual(parsePackSize('Batata Para Cozer Auchan Saco 3kg'), { grams: 3000 });
  assert.deepEqual(parsePackSize('Azeite Virgem Extra Auchan 0,75 L'), { grams: 750 });
  assert.deepEqual(parsePackSize('Ovos Auchan Galinhas Solo Classe M Uma Dúzia'), { units: 12 });
  assert.deepEqual(parsePackSize('Ovos Polegar Classe M Meia Dúzia'), { units: 6 });
  assert.deepEqual(parsePackSize('Peito De Frango Auchan Kg'), { perKg: true });
});

test('entities and text', () => {
  assert.equal(decodeEntities('P&atilde;o &amp; a&ccedil;&uacute;car &#8364;1'), 'Pão & açúcar €1');
  assert.equal(htmlToText('<p>Olá</p><script>x()</script><div>mundo</div>'), 'Olá\nmundo');
});

const AUCHAN_GRID = `
<div class="product" data-pid="2696458">
  <div class="product-tile" data-gtm='{"id":"2696458","name":"Peito De Frango Auchan Kg","price":"6.29","brand":"AUCHAN"}'>
    <div class="image-container"><a href="/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-auchan-kg/2696458.html"><img class="tile-image" src="/dw/image/peito.jpg" alt="Peito De Frango Auchan Kg"></a></div>
    <div class="pdp-link"><a class="link" href="/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-auchan-kg/2696458.html">Peito De Frango Auchan Kg</a></div>
    <div class="price"><span class="sales"><span class="value" content="6.29">6,29 €</span></span></div>
    <div class="auc-measures--price-per-unit">6,29 €/Kg</div>
  </div>
</div>
<div class="product" data-pid="1071642">
  <div class="product-tile">
    <div class="pdp-link"><a class="link" href="/pt/alimentacao/mercearia/conservas/atum/atum-posta-auchan-ao-natural-120(84)g/1071642.html">ATUM POSTA AUCHAN AO NATURAL 120(84)G</a></div>
    <div class="price"><span class="strike-through list"><span class="value" content="1.49">1,49 €</span></span><span class="sales"><span class="value" content="1.19">1,19 €</span></span></div>
    <span class="unit">14,17 €/Kg</span><span class="badge">Promo -20%</span>
  </div>
</div>`;

test('SFCC product tiles (Auchan style)', () => {
  const tiles = parseProductTiles(AUCHAN_GRID, STORE_SITES.auchan);
  assert.equal(tiles.length, 2);
  const [chicken, tuna] = tiles;
  assert.equal(chicken.id, '2696458');
  assert.equal(chicken.name, 'Peito De Frango Auchan Kg');
  assert.equal(chicken.price, 6.29);
  assert.equal(chicken.brand, 'AUCHAN');
  assert.deepEqual(chicken.unitPrice, { eur: 6.29, per: 'kg' });
  assert.equal(chicken.url, 'https://www.auchan.pt/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-auchan-kg/2696458.html');
  assert.equal(chicken.image, 'https://www.auchan.pt/dw/image/peito.jpg');
  assert.equal(tuna.price, 1.19, 'sale price, not the struck-through one');
  assert.equal(tuna.promo, true);
  assert.deepEqual(tuna.pack, { grams: 120, drainedG: 84 });
});

const PINGO_LIST = `
<ul class="grid">
 <li><a href="https://www.pingodoce.pt/home/produtos/as-nossas-marcas/pingo-doce/ovos-de-solo-classe-m-pingo-doce-889028.html" title="Ovos de Solo Classe M Pingo Doce">
   <img data-src="https://www.pingodoce.pt/img/ovos.jpg" alt="Ovos de Solo Classe M Pingo Doce"></a>
   <span class="product-name">Ovos de Solo Classe M Pingo Doce</span> <span class="price">3,09 €</span> <span class="ppu">0,26 €/un</span></li>
 <li><a href="/home/produtos/frutas-e-vegetais/frutas/fruta-da-epoca/banana-importada-nossa-fruta-e-legumes-43218.html">
   <span class="product-name">Banana Importada Nossa Fruta e Legumes</span></a> <span>1,29 €/kg</span> <span>0,26 €</span></li>
</ul>`;

test('product links without data-pid (Pingo Doce style)', () => {
  const tiles = parseProductTiles(PINGO_LIST, STORE_SITES.pingodoce);
  assert.equal(tiles.length, 2);
  assert.equal(tiles[0].id, '889028');
  assert.equal(tiles[0].name, 'Ovos de Solo Classe M Pingo Doce');
  assert.equal(tiles[0].price, 3.09);
  assert.deepEqual(tiles[0].unitPrice, { eur: 0.26, per: 'unit' });
  assert.equal(tiles[1].id, '43218');
  assert.equal(tiles[1].url, 'https://www.pingodoce.pt/home/produtos/frutas-e-vegetais/frutas/fruta-da-epoca/banana-importada-nossa-fruta-e-legumes-43218.html');
  assert.deepEqual(tiles[1].unitPrice, { eur: 1.29, per: 'kg' });
});

test('a photo placed before the product link stays with that product', () => {
  const list = `<ul>
    <li class="tile"><div class="img"><img src="https://www.pingodoce.pt/img/peru.jpg" alt=""></div>
      <a href="/home/produtos/talho/peito-bife-de-peru-442057.html"><span class="product-name">Peito/Bife de Peru</span></a> <span class="price">8,99 €</span></li>
    <li class="tile"><div class="img"><img src="https://www.pingodoce.pt/img/batata.jpg" alt=""></div>
      <a href="/home/produtos/frescos/batata-para-cozer-454634.html"><span class="product-name">Batata para Cozer</span></a> <span class="price">3,69 €</span></li>
  </ul>`;
  const tiles = parseProductTiles(list, STORE_SITES.pingodoce);
  assert.equal(tiles.length, 2);
  assert.equal(tiles[0].id, '442057');
  assert.equal(tiles[0].image, 'https://www.pingodoce.pt/img/peru.jpg');
  assert.equal(tiles[1].id, '454634');
  assert.equal(tiles[1].image, 'https://www.pingodoce.pt/img/batata.jpg');
  assert.equal(tiles[1].price, 3.69);
});

const PRODUCT_PAGE = `<html><head>
<meta property="og:title" content="Atum Ao Natural Auchan 185(130)g | Auchan">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Atum Ao Natural Auchan 185(130)g","brand":{"@type":"Brand","name":"AUCHAN"},"gtin13":"5601234567890","offers":{"@type":"Offer","price":"1.79","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script>
</head><body>
<h1 class="product-name">Atum Ao Natural Auchan 185(130)g</h1>
<div class="price">1,79 €</div><div class="ppu">13,77 €/Kg</div>
<h3>Ingredientes</h3><p>Atum (Katsuwonus pelamis), água e sal.</p>
<h3>Informação Nutricional</h3>
<table>
<tr><th></th><th>Por 100 g</th></tr>
<tr><td>Energia</td><td>417 kJ / 98 kcal</td></tr>
<tr><td>Lípidos</td><td>0,8 g</td></tr>
<tr><td>dos quais saturados</td><td>0,2 g</td></tr>
<tr><td>Hidratos de carbono</td><td>0 g</td></tr>
<tr><td>dos quais açúcares</td><td>0 g</td></tr>
<tr><td>Proteínas</td><td>23 g</td></tr>
<tr><td>Sal</td><td>1,2 g</td></tr>
</table>
<h3>Conservação</h3><p>Local fresco e seco.</p>
</body></html>`;

test('product page: JSON-LD, unit price, nutrition and ingredients', () => {
  const p = parseProductPage(PRODUCT_PAGE, 'https://www.auchan.pt/pt/x/2960052.html');
  assert.equal(p.name, 'Atum Ao Natural Auchan 185(130)g');
  assert.equal(p.brand, 'AUCHAN');
  assert.equal(p.ean, '5601234567890');
  assert.equal(p.price, 1.79);
  assert.equal(p.available, true);
  assert.deepEqual(p.unitPrice, { eur: 13.77, per: 'kg' });
  assert.deepEqual(p.pack, { grams: 185, drainedG: 130 });
  assert.deepEqual(p.per100, { kcal: 98, f: 0.8, satFat: 0.2, c: 0, sugars: 0, p: 23, salt: 1.2 });
  assert.equal(p.ingredientsText, 'Atum (Katsuwonus pelamis), água e sal.');
  const entry = priceEntryFromProduct({ ...p, store: 'auchan', fetchedAt: '2026-09-24T10:00:00Z' }, {});
  assert.deepEqual(
    { sold: entry.sold, eur: entry.eur, packG: entry.packG, date: entry.date },
    { sold: 'pack', eur: 1.79, packG: 130, date: '2026-09-24' },
  );
});

test('product page without JSON-LD falls back to markup and text', () => {
  const html = `<h1>Peito De Frango Auchan Kg</h1><div class="prices"><span class="sales"><span class="value" content="6.29">6,29 €</span></span></div><span>6,29 €/Kg</span>`;
  const p = parseProductPage(html, 'https://www.auchan.pt/pt/x/2696458.html');
  assert.equal(p.price, 6.29);
  const entry = priceEntryFromProduct({ ...p, store: 'auchan' }, { sold: 'weight' });
  assert.equal(entry.sold, 'weight');
  assert.equal(entry.eur, 6.29);
});

test('product photo: own gallery or id match, never a related product', () => {
  const related = '<h1>Atum</h1><div class="related"><img src="https://www.auchan.pt/img/999.jpg"></div>';
  assert.equal(parseProductPage(related, 'https://www.auchan.pt/pt/x/1071642.html').image, null);
  const gallery = '<div class="primary-image"><img src="data:image/gif;base64,xx" data-src="/dw/image/big.jpg"></div><img src="/img/999.jpg">';
  assert.equal(parseProductPage(gallery, 'https://www.auchan.pt/pt/x/1071642.html').image, 'https://www.auchan.pt/dw/image/big.jpg');
  const byId = '<img src="/logo.png"><img src="https://cdn.example/p/1071642_1.jpg">';
  assert.equal(parseProductPage(byId, 'https://www.auchan.pt/pt/x/1071642.html').image, 'https://cdn.example/p/1071642_1.jpg');
});

test('nutrition text in kJ only and ingredient cut-off', () => {
  assert.deepEqual(parseNutrition('Valor energético 1000 kJ\nProteína 12,5 g'), { kcal: 239, p: 12.5 });
  assert.equal(parseNutrition('Sem tabela'), null);
  assert.equal(extractIngredients('Ingredientes: farinha, água\nAlergénios: glúten'), 'farinha, água');
});

test('robots.txt rules', () => {
  const groups = parseRobots(`
User-agent: *
Disallow: /on/demandware.store/
Allow: /on/demandware.store/Sites-X-Site/default/Product-Show
Disallow: /*?q=
Disallow: /checkout$

User-agent: BadBot
Disallow: /
`);
  const ua = 'Mozilla/5.0 (compatible; Leve/1.0)';
  assert.equal(isAllowed(groups, ua, '/pt/produtos/1.html'), true);
  assert.equal(isAllowed(groups, ua, '/on/demandware.store/Sites-X-Site/default/Search-Show?q=a'), false);
  assert.equal(isAllowed(groups, ua, '/on/demandware.store/Sites-X-Site/default/Product-Show?pid=1'), true);
  assert.equal(isAllowed(groups, ua, '/pt/pesquisa?q=frango'), false);
  assert.equal(isAllowed(groups, ua, '/checkout'), false);
  assert.equal(isAllowed(groups, ua, '/checkout/step'), true);
  assert.equal(isAllowed(groups, 'BadBot/2', '/anything'), false);
  assert.equal(isAllowed(parseRobots(''), ua, '/x'), true);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:'), ua, '/x'), true);
});
