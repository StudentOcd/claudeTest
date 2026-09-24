// Open Food Facts: nutrition, ingredients and additives by barcode or text search.
// Free, open data (ODbL). Limits: 15 product reads/min and 10 searches/min per IP.

export const OFF_BASE = 'https://world.openfoodfacts.org';
export const OFF_SEARCH = 'https://search.openfoodfacts.org';

const FIELDS = [
  'code', 'product_name', 'product_name_pt', 'generic_name_pt', 'brands', 'quantity', 'stores', 'stores_tags',
  'countries_tags', 'nutriments', 'ingredients_text', 'ingredients_text_pt', 'additives_tags', 'allergens_tags',
  'traces_tags', 'image_front_small_url', 'nutriscore_grade', 'nova_group', 'serving_size',
].join(',');

const num = (x) => (x === undefined || x === null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));
// Rounded as on a label (OFF works some values out from a serving: 228.571428571429 kcal).
const round = (x, d) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

// Maps an OFF product to the app's shape (nutrition per 100 g).
export function normalizeOffProduct(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null && num(n['energy-kj_100g']) !== null) kcal = Math.round(num(n['energy-kj_100g']) / 4.184);
  if (kcal === null && num(n.energy_100g) !== null) kcal = Math.round(num(n.energy_100g) / 4.184);
  return {
    code: p.code || null,
    name: p.product_name_pt || p.product_name || p.generic_name_pt || '',
    brand: (p.brands || '').split(',')[0].trim(),
    quantity: p.quantity || '',
    stores: p.stores_tags || [],
    per100: {
      kcal: round(kcal, 0),
      p: round(num(n.proteins_100g), 1),
      f: round(num(n.fat_100g), 1),
      satFat: round(num(n['saturated-fat_100g']), 1),
      c: round(num(n.carbohydrates_100g), 1),
      sugars: round(num(n.sugars_100g), 1),
      fib: round(num(n.fiber_100g), 1),
      salt: round(num(n.salt_100g), 2),
    },
    ingredientsText: p.ingredients_text_pt || p.ingredients_text || '',
    additivesTags: p.additives_tags || [],
    allergensTags: p.allergens_tags || [],
    image: p.image_front_small_url || null,
    nutriscore: p.nutriscore_grade || null,
    source: 'openfoodfacts',
    url: p.code ? `${OFF_BASE}/product/${p.code}` : null,
  };
}

export async function offProduct(http, code) {
  if (!/^\d{6,14}$/.test(String(code))) throw new Error('Barcode must be 6–14 digits');
  let data;
  try {
    data = await http.get(`${OFF_BASE}/api/v2/product/${code}?fields=${FIELDS}`, {
      rateKey: 'off-product',
      cacheTtlMs: 7 * 24 * 3600 * 1000,
    });
  } catch (err) {
    if (err.status === 404) return null; // not in Open Food Facts (yet)
    throw err;
  }
  if (!data || (data.status !== 1 && data.status !== 'success') || !data.product) return null;
  return normalizeOffProduct({ code, ...data.product });
}

const STORE_TAGS = { mercadona: 'mercadona', pingodoce: 'pingo-doce', auchan: 'auchan' };

/**
 * Text search, optionally limited to products sold at a store.
 * Uses Search-a-licious and falls back to the legacy search.
 */
export async function offSearch(http, query, { store = null, pageSize = 20 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const storeTag = store ? STORE_TAGS[store] : null;
  try {
    const lucene = [q, storeTag ? `stores_tags:"${storeTag}"` : null, 'countries_tags:"en:portugal"'].filter(Boolean).join(' ');
    const url = `${OFF_SEARCH}/search?q=${encodeURIComponent(lucene)}&langs=pt,en&page_size=${pageSize}&fields=${FIELDS}`;
    const data = await http.get(url, { rateKey: 'off-search', cacheTtlMs: 24 * 3600 * 1000 });
    const hits = data?.hits || [];
    if (hits.length) return hits.map(normalizeOffProduct);
  } catch {
    // fall through to the legacy endpoint
  }
  const params = new URLSearchParams({
    search_terms: q,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(pageSize),
    fields: FIELDS,
    tagtype_0: 'countries',
    tag_contains_0: 'contains',
    tag_0: 'portugal',
  });
  if (storeTag) {
    params.set('tagtype_1', 'stores');
    params.set('tag_contains_1', 'contains');
    params.set('tag_1', storeTag);
  }
  const data = await http.get(`${OFF_BASE}/cgi/search.pl?${params}`, { rateKey: 'off-search', cacheTtlMs: 24 * 3600 * 1000 });
  return (data?.products || []).map(normalizeOffProduct);
}
