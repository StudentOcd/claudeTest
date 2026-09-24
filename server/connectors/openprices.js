// Open Prices (prices.openfoodfacts.org): crowd-sourced shelf prices from
// receipts and price tags. The only open source of Mercadona prices, since
// Mercadona has no online shop in Portugal.

export const OPEN_PRICES = 'https://prices.openfoodfacts.org/api/v1';

const BRANDS = [
  { store: 'mercadona', re: /mercadona/i },
  { store: 'pingodoce', re: /pingo\s*doce/i },
  { store: 'auchan', re: /auchan|jumbo|pão de açúcar/i },
  { store: 'continente', re: /continente/i },
  { store: 'lidl', re: /lidl/i },
  { store: 'aldi', re: /aldi/i },
  { store: 'minipreco', re: /minipre[cç]o/i },
  { store: 'intermarche', re: /intermarch/i },
];

export function storeFromLocation(loc) {
  const label = `${loc?.osm_brand || ''} ${loc?.osm_name || ''}`;
  for (const b of BRANDS) if (b.re.test(label)) return b.store;
  return 'other';
}

export function normalizePrice(item) {
  return {
    id: item.id,
    store: storeFromLocation(item.location),
    storeName: item.location?.osm_name || item.location?.osm_brand || 'Unknown shop',
    city: item.location?.osm_address_city || '',
    eur: Number(item.price),
    currency: item.currency,
    per: item.price_per || null, // KILOGRAM | UNIT | null (per product)
    discounted: Boolean(item.price_is_discounted),
    regularEur: item.price_without_discount ? Number(item.price_without_discount) : null,
    date: item.date,
    productName: item.product?.product_name || item.product_name || '',
    quantity: item.product?.product_quantity ? `${item.product.product_quantity} ${item.product.product_quantity_unit || 'g'}` : '',
    code: item.product_code || null,
    category: item.category_tag || null,
  };
}

/**
 * Recent prices near a point (default: Lisbon) for a barcode or a raw-food
 * category tag (e.g. 'en:bananas'). Newest first.
 */
export async function recentPrices(http, { code, category, lat = 38.7223, lon = -9.1393, radiusKm = 30, size = 50 } = {}) {
  const params = new URLSearchParams({ order_by: '-date', size: String(size), currency: 'EUR' });
  if (code) params.set('product_code', String(code));
  else if (category) params.set('category_tag', category);
  else throw new Error('Need a barcode or a category');
  if (lat !== null && lon !== null) {
    params.set('lat', String(lat));
    params.set('lon', String(lon));
    params.set('radius_km', String(radiusKm));
  }
  const data = await http.get(`${OPEN_PRICES}/prices?${params}`, { rateKey: 'openprices', cacheTtlMs: 6 * 3600 * 1000 });
  return (data?.items || []).map(normalizePrice).filter((p) => Number.isFinite(p.eur));
}

// Latest price per store from a list of normalized prices.
export function latestByStore(prices) {
  const out = {};
  for (const p of prices) if (!out[p.store] || p.date > out[p.store].date) out[p.store] = p;
  return out;
}
