// Dependency-free HTML helpers for store pages: text extraction, prices,
// pack sizes, JSON-LD, nutrition tables, ingredient lists and product tiles.
// Written defensively: store markup changes, so every field has fallbacks.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', ordm: 'º', ordf: 'ª', deg: '°',
  ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ', aacute: 'á', Aacute: 'Á',
  eacute: 'é', Eacute: 'É', iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú',
  acirc: 'â', Acirc: 'Â', ecirc: 'ê', Ecirc: 'Ê', ocirc: 'ô', Ocirc: 'Ô', agrave: 'à', Agrave: 'À',
  uuml: 'ü', ntilde: 'ñ', middot: '·', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', times: '×', frac12: '½', frac14: '¼', frac34: '¾', le: '≤', ge: '≥',
};

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export function htmlToText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/dt|\/dd|\/section|\/table|\/ul)\b[^>]*>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' \t ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[  ​]+/g, ' ')
    .replace(/ ?\t ?/g, '\t')
    .replace(/ *\n[ \t]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

const clean = (s) => decodeEntities(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "1,99 €", "€ 1.99", "1.234,56" -> number
export function parseEuro(str) {
  if (str === null || str === undefined) return null;
  if (typeof str === 'number') return Number.isFinite(str) ? str : null;
  const s = String(str).replace(/[\s ]/g, '');
  const m = s.match(/\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+,\d{1,2}|\d+(?:\.\d{1,2})?/);
  if (!m) return null;
  let t = m[0];
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

const UNIT_MAP = { kg: 'kg', kilo: 'kg', k: 'kg', l: 'l', lt: 'l', litro: 'l', un: 'unit', und: 'unit', unid: 'unit', unidade: 'unit', dz: 'dozen', duzia: 'dozen' };

// "6,29 €/Kg", "€0.26/un", "1.45€ / Kg" -> { eur, per }
export function parseUnitPrice(text) {
  const t = String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const res = [
    /(\d+(?:[.,]\d{1,3})?)\s*(?:€|eur)\s*\/\s*(kg|kilo|k|lt|litro|l|unidade|unid|und|un|dz|duzia)\b/i,
    /(?:€|eur)\s*(\d+(?:[.,]\d{1,3})?)\s*\/\s*(kg|kilo|k|lt|litro|l|unidade|unid|und|un|dz|duzia)\b/i,
  ];
  for (const re of res) {
    const m = t.match(re);
    if (m) return { eur: parseEuro(m[1]), per: UNIT_MAP[m[2].toLowerCase()] || m[2].toLowerCase() };
  }
  return null;
}

function toGrams(v, unit) {
  const u = unit.toLowerCase();
  if (u === 'kg' || u === 'l' || u === 'lt') return v * 1000;
  if (u === 'cl') return v * 10;
  return v; // g, gr, grs, ml
}

// Pack size from a product name: "Atum 120(84)g", "4x125g", "3 Kg", "Uma Dúzia", "Peito Kg".
export function parsePackSize(name) {
  const s = String(name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/(\d),(\d)/g, '$1.$2');
  let m = s.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|grs|gr|g|ml|cl|lt|l)\b/);
  if (m) return { grams: toGrams(Number(m[1]) * Number(m[2]), m[3]) };
  m = s.match(/(\d+(?:\.\d+)?)\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*(kg|grs|gr|g)\b/);
  if (m) return { grams: toGrams(Number(m[1]), m[3]), drainedG: toGrams(Number(m[2]), m[3]) };
  m = s.match(/(\d+(?:\.\d+)?)\s*(kg|grs|gr|g|ml|cl|lt|l)\b/);
  if (m) return { grams: toGrams(Number(m[1]), m[2]) };
  if (/duas\s+duzias/.test(s)) return { units: 24 };
  if (/meia\s+duzia/.test(s)) return { units: 6 };
  if (/\bduzia\b/.test(s)) return { units: 12 };
  m = s.match(/(\d+)\s*(un|unid|unidades|ovos)\b/);
  if (m) return { units: Number(m[1]) };
  if (/\bkg\b/.test(s)) return { perKg: true };
  return {};
}

// ───────────── JSON-LD ─────────────

function flatten(d, out) {
  if (Array.isArray(d)) d.forEach((x) => flatten(x, out));
  else if (d && typeof d === 'object') {
    out.push(d);
    if (d['@graph']) flatten(d['@graph'], out);
  }
}

export function jsonLdObjects(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html ?? '')))) {
    try {
      flatten(JSON.parse(m[1].trim()), out);
    } catch {
      // ignore malformed blocks
    }
  }
  return out;
}

const isType = (o, t) => o['@type'] === t || (Array.isArray(o['@type']) && o['@type'].includes(t));

function ldProduct(objs) {
  const prod = objs.find((o) => isType(o, 'Product'));
  if (!prod) return null;
  let offers = prod.offers;
  if (Array.isArray(offers)) offers = offers[0];
  if (offers && isType(offers, 'AggregateOffer')) offers = { ...offers, price: offers.lowPrice ?? offers.price };
  const img = Array.isArray(prod.image) ? prod.image[0] : prod.image;
  return {
    name: prod.name ? clean(prod.name) : null,
    brand: typeof prod.brand === 'string' ? prod.brand : prod.brand?.name || null,
    ean: prod.gtin13 || prod.gtin || prod.gtin8 || prod.gtin14 || prod.ean || null,
    sku: prod.sku || prod.productID || null,
    price: parseEuro(offers?.price ?? offers?.priceSpecification?.price),
    currency: offers?.priceCurrency || 'EUR',
    available: offers?.availability ? /InStock|LimitedAvailability|OnlineOnly/i.test(offers.availability) : null,
    image: typeof img === 'string' ? img : img?.url || null,
  };
}

// ───────────── Nutrition & ingredients ─────────────

const NUTRIENTS = [
  { key: 'kcal', re: /(energia|valor energ[eé]tico|energy)/i },
  { key: 'satFat', re: /(saturad|saturated)/i },
  { key: 'sugars', re: /(a[cç][uú]car|sugar)/i },
  { key: 'f', re: /(l[ií]pidos|gordura|mat[eé]ria gorda|\bfat\b)/i },
  { key: 'c', re: /(hidratos de carbono|carboidratos|carbohydrate)/i },
  { key: 'fib', re: /(fibra|fibre|fiber)/i },
  { key: 'p', re: /(prote[ií]na|protein)/i },
  { key: 'salt', re: /(\bsal\b|\bsalt\b)/i },
];

const numberIn = (s) => {
  const m = String(s).match(/<?\s*(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(',', '.')) : null;
};

// Per-100 g values from a nutrition table rendered as text lines.
export function parseNutrition(text) {
  const t = String(text ?? '');
  const anchor = t.search(/(informa[cç][aã]o nutricional|valores? nutricion|declara[cç][aã]o nutricional|tabela nutricional|nutrition)/i);
  const zone = anchor >= 0 ? t.slice(anchor, anchor + 2500) : t;
  const out = {};
  for (const rawLine of zone.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const nut = NUTRIENTS.find((n) => n.re.test(line));
    if (!nut || out[nut.key] !== undefined) continue;
    const after = line.slice(line.search(nut.re));
    if (nut.key === 'kcal') {
      const kcal = after.match(/(\d+(?:[.,]\d+)?)\s*kcal/i);
      if (kcal) out.kcal = Number(kcal[1].replace(',', '.'));
      else {
        const kj = after.match(/(\d+(?:[.,]\d+)?)\s*kj/i);
        if (kj) out.kcal = Math.round(Number(kj[1].replace(',', '.')) / 4.184);
      }
      continue;
    }
    const v = numberIn(after.replace(nut.re, ''));
    if (v !== null) out[nut.key] = v;
  }
  return out.kcal !== undefined || out.p !== undefined ? out : null;
}

const INGREDIENT_STOP = /\n\s*(al[eé]rg|informa[cç][aã]o nutricional|valores? nutricion|declara[cç][aã]o nutricional|conserva[cç][aã]o|modo de|prepara[cç][aã]o|origem|pa[ií]s de|peso|validade|caracter[ií]sticas|descri[cç][aã]o|utiliza[cç][aã]o|dicas)/i;

export function extractIngredients(text) {
  const t = String(text ?? '');
  const m = t.match(/ingredientes?\s*[:\n]\s*/i);
  if (!m) return '';
  const rest = t.slice(m.index + m[0].length, m.index + m[0].length + 1500);
  const stop = rest.search(INGREDIENT_STOP);
  return (stop >= 0 ? rest.slice(0, stop) : rest.slice(0, 800)).replace(/\s+/g, ' ').trim();
}

// ───────────── Product page ─────────────

function metaContent(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${prop}["']`, 'i');
  const m = html.match(re) || html.match(re2);
  return m ? decodeEntities(m[1]) : null;
}

function sfccPrice(html) {
  const pats = [
    /class=["'][^"']*\bsales\b[^"']*["'][\s\S]{0,300}?class=["'][^"']*\bvalue\b[^"']*["'][^>]*content=["'](\d+(?:\.\d+)?)["']/i,
    /class=["'][^"']*\bvalue\b[^"']*["'][^>]*content=["'](\d+(?:\.\d+)?)["']/i,
    /content=["'](\d+(?:\.\d+)?)["'][^>]*class=["'][^"']*\bvalue\b/i,
    /itemprop=["']price["'][^>]*content=["'](\d+(?:[.,]\d+)?)["']/i,
    /data-price=["'](\d+(?:[.,]\d+)?)["']/i,
  ];
  for (const re of pats) {
    const m = html.match(re);
    if (m) return parseEuro(m[1]);
  }
  return null;
}

function absolute(u, base) {
  if (!u) return null;
  try {
    return new URL(decodeEntities(u), base || undefined).toString();
  } catch {
    return null;
  }
}

// The product's own photo when there is no og:image / JSON-LD: an image in the
// main gallery, or an image whose URL contains the product id. Never "any image
// on the page" (that could be a related product or a logo).
function ownProductImage(html, url) {
  const i = html.search(/class=["'][^"']*(primary-image|product-image|pdp-image|product-gallery|main-image)/i);
  if (i >= 0) {
    const img = pickImage(html.slice(i, i + 4000));
    if (img) return img;
  }
  const id = String(url).match(/[-/](\d{3,12})\.html/)?.[1];
  if (!id) return null;
  for (const m of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const img = pickImage(m[0]);
    if (img && img.includes(id)) return img;
  }
  return null;
}

export function parseProductPage(html, url = '') {
  const src = String(html ?? '');
  const ld = ldProduct(jsonLdObjects(src));
  const text = htmlToText(src);
  const h1 = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name = ld?.name || metaContent(src, 'og:title') || (h1 ? clean(h1[1]) : null);
  let price = ld?.price ?? parseEuro(metaContent(src, 'product:price:amount')) ?? sfccPrice(src);
  const unitPrice = parseUnitPrice(text);
  if (price === null) {
    const m = text.match(/(\d+,\d{2})\s*€(?!\s*\/)/);
    if (m) price = parseEuro(m[1]);
  }
  const eanText = text.match(/\b(?:EAN|C[oó]digo de barras)\s*:?\s*(\d{8,14})\b/i);
  return {
    url,
    name: name ? name.replace(/\s*\|\s*(Auchan|Pingo Doce).*$/i, '').trim() : null,
    brand: ld?.brand || null,
    ean: ld?.ean || (eanText ? eanText[1] : null),
    sku: ld?.sku || null,
    price,
    currency: ld?.currency || 'EUR',
    unitPrice,
    available: ld?.available ?? null,
    image: absolute(ld?.image || metaContent(src, 'og:image') || ownProductImage(src, url), url),
    pack: parsePackSize(name || ''),
    per100: parseNutrition(text),
    ingredientsText: extractIngredients(text),
  };
}

// ───────────── Product tiles (search / category pages) ─────────────

function jsonAttributes(chunk) {
  const out = [];
  const re = /data-[\w-]+=(["'])(\{[\s\S]*?\})\1/g;
  let m;
  while ((m = re.exec(chunk))) {
    try {
      out.push(JSON.parse(decodeEntities(m[2])));
    } catch {
      // not JSON
    }
  }
  return out;
}

function pickField(objs, keys) {
  for (const o of objs) {
    const stack = [o];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object') continue;
      for (const k of keys) if (cur[k] !== undefined && cur[k] !== null && cur[k] !== '') return cur[k];
      for (const v of Object.values(cur)) if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

function firstPrice(chunkText) {
  const re = /(\d+,\d{2})\s*€|€\s*(\d+[.,]\d{2})/g;
  let m;
  while ((m = re.exec(chunkText))) {
    const after = chunkText.slice(m.index + m[0].length, m.index + m[0].length + 4);
    if (/^\s*\//.test(after)) continue; // unit price such as "6,29 €/kg"
    return parseEuro(m[1] || m[2]);
  }
  return null;
}

// Best real image URL in a chunk of HTML (skips lazy-load placeholders).
export function pickImage(chunk) {
  const candidates = [];
  for (const m of String(chunk).matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const tag = m[0];
    for (const attr of ['data-src', 'data-lazy', 'data-original', 'data-srcset', 'srcset', 'src']) {
      const a = tag.match(new RegExp(`\\s${attr}=["']([^"']+)["']`, 'i'));
      if (!a) continue;
      const first = a[1].trim().split(/\s*,\s*/)[0].split(/\s+/)[0];
      if (!first || first.startsWith('data:') || /\.svg(\?|$)|placeholder|spinner|blank\.|loading/i.test(first)) continue;
      candidates.push(first);
    }
  }
  return candidates[0] || null;
}

function tileFromChunk(chunk, { origin, productHref }, expectedId) {
  const attrs = jsonAttributes(chunk);
  const text = htmlToText(chunk);
  let name = pickField(attrs, ['name', 'item_name', 'productName', 'product_name']);
  if (!name) {
    const m =
      chunk.match(/class=["'][^"']*(?:pdp-link|product-name|product-title|tile-name|product-tile__name)[^"']*["'][^>]*>\s*(?:<a[^>]*>)?\s*([^<]{3,200})/i) ||
      chunk.match(/<a[^>]+class=["'][^"']*\blink\b[^"']*["'][^>]*>\s*([^<]{3,200})<\/a>/i) ||
      chunk.match(/<img[^>]+alt=["']([^"']{3,200})["']/i);
    name = m ? m[1] : null;
  }
  let price = parseEuro(pickField(attrs, ['price', 'item_price', 'salePrice', 'sale_price', 'unit_sale_price']));
  if (price === null) price = sfccPrice(chunk) ?? firstPrice(text);
  const hrefs = [...chunk.matchAll(productHref)];
  const own = hrefs.find((h) => h[2] === expectedId) || hrefs[0];
  const href = own ? own[1] : null;
  const img = pickImage(chunk);
  const brand = pickField(attrs, ['brand', 'item_brand', 'productBrand']);
  const nameClean = name ? clean(name) : null;
  return {
    id: own ? own[2] : pickField(attrs, ['id', 'item_id', 'sku', 'productId']),
    name: nameClean,
    brand: typeof brand === 'string' ? brand : null,
    price,
    unitPrice: parseUnitPrice(text),
    url: href ? new URL(decodeEntities(href), origin).toString() : null,
    image: img ? new URL(decodeEntities(img), origin).toString() : null,
    promo: /promo|desconto|poupe|-\s?\d{1,2}\s?%/i.test(text),
    pack: parsePackSize(nameClean || ''),
  };
}

/**
 * Product tiles from a search/category page.
 * options: { origin, productHref } where productHref is a global regex whose
 * group 1 is the href and group 2 the product id.
 */
// Where the tile around a product link starts: the last list item / product box opened
// between the previous product and this link (so a photo placed before the link stays with it).
const TILE_OPEN = /<(?:li|article)\b|<div\b[^>]*class=["'][^"']*(?:product|tile|card|item)[^"']*["']/gi;
function tileStart(src, index, floor) {
  const from = Math.max(floor, index - 4000);
  let last = -1;
  for (const m of src.slice(from, index).matchAll(TILE_OPEN)) last = m.index;
  return last >= 0 ? from + last : index;
}

export function parseProductTiles(html, options) {
  const src = String(html ?? '');
  const marks = [];
  for (const m of src.matchAll(/data-pid=["']([^"']+)["']/g)) marks.push({ id: m[1], index: m.index });
  const byLink = !marks.length;
  if (byLink) for (const m of src.matchAll(options.productHref)) marks.push({ id: m[2], index: m.index });
  const starts = [];
  const seen = new Set();
  for (const mk of marks) {
    if (seen.has(mk.id)) continue;
    seen.add(mk.id);
    starts.push(mk);
  }
  if (byLink) {
    for (let i = 0; i < starts.length; i++) {
      const floor = i ? starts[i - 1].index + 1 : 0;
      starts[i] = { ...starts[i], index: tileStart(src, starts[i].index, floor) };
    }
  }
  const tiles = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].index;
    const to = i + 1 < starts.length ? starts[i + 1].index : starts[i].index + 8000;
    const tile = tileFromChunk(src.slice(from, to), options, starts[i].id);
    if (!tile.name && !tile.url) continue;
    tiles.push({ ...tile, id: String(starts[i].id || tile.id) });
  }
  return tiles;
}
