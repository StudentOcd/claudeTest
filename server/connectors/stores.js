// Auchan and Pingo Doce online shops (both run on Salesforce Commerce Cloud).
// Unofficial: reads the same public pages your browser does, slowly, with
// caching and a robots.txt check. Mercadona has no online shop in Portugal.

import { parseProductPage, parseProductTiles } from './html.js';
import { HttpError } from './http.js';

const enc = encodeURIComponent;

export const STORE_SITES = {
  auchan: {
    name: 'Auchan',
    origin: 'https://www.auchan.pt',
    hosts: ['www.auchan.pt', 'auchan.pt'],
    // Product pages look like /pt/<category path>/<slug>/<id>.html
    productHref: /href=["']((?:https?:\/\/(?:www\.)?auchan\.pt)?\/(?:pt|en|default)\/[^"'?#]+?\/(\d{3,9})\.html)(?:[?#][^"']*)?["']/gi,
    searchUrls: (q) => [
      `https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Search-UpdateGrid?q=${enc(q)}&start=0&sz=24`,
      `https://www.auchan.pt/pt/pesquisa?q=${enc(q)}`,
    ],
    browserSearch: (q) => `https://www.auchan.pt/pt/pesquisa?q=${enc(q)}`,
  },
  pingodoce: {
    name: 'Pingo Doce',
    origin: 'https://www.pingodoce.pt',
    hosts: ['www.pingodoce.pt', 'pingodoce.pt'],
    // Product pages look like /home/produtos/<category path>/<slug>-<id>.html
    productHref: /href=["']((?:https?:\/\/(?:www\.)?pingodoce\.pt)?\/home\/[^"'?#]+?[-/](\d{3,12})\.html)(?:[?#][^"']*)?["']/gi,
    searchUrls: (q) => [
      `https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/default/Search-UpdateGrid?q=${enc(q)}&start=0&sz=24`,
      `https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/default/Search-Show?q=${enc(q)}`,
    ],
    browserSearch: (q) => `https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/default/Search-Show?q=${enc(q)}`,
  },
};

const FETCH_OPTS = {
  as: 'text',
  headers: { 'accept-language': 'pt-PT,pt;q=0.9,en;q=0.5' },
  cacheTtlMs: 12 * 3600 * 1000,
  respectRobots: true,
  timeoutMs: 20000,
};

export function siteFor(store) {
  const site = STORE_SITES[store];
  if (!site) throw new HttpError(`No online shop connector for "${store}"`, { code: 'NO_STORE' });
  return site;
}

// Only fetch pages on the store's own domain.
export function assertStoreUrl(store, url) {
  const site = siteFor(store);
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new HttpError('Invalid URL', { code: 'BAD_URL' });
  }
  if (u.protocol !== 'https:' || !site.hosts.includes(u.hostname)) {
    throw new HttpError(`Only ${site.hosts[0]} pages can be fetched for ${site.name}`, { code: 'BAD_URL' });
  }
  return u.toString();
}

function withStore(store, items) {
  return items.map((it) => ({ ...it, store }));
}

/** Search a store. Tries the grid endpoint, then the normal search page. */
export async function searchStore(http, store, query) {
  const site = siteFor(store);
  const q = String(query || '').trim();
  if (q.length < 2) return { items: [], tried: [], browserUrl: null };
  const tried = [];
  for (const url of site.searchUrls(q)) {
    try {
      const html = await http.get(url, { ...FETCH_OPTS, rateKey: `store-${store}` });
      const items = parseProductTiles(html, site);
      tried.push({ url, ok: true, count: items.length });
      if (items.length) return { items: withStore(store, items), tried, browserUrl: site.browserSearch(q) };
    } catch (err) {
      tried.push({ url, ok: false, error: err.message, code: err.code || null });
    }
  }
  return { items: [], tried, browserUrl: site.browserSearch(q) };
}

/** List the products on a category page. */
export async function browseCategory(http, store, url) {
  const site = siteFor(store);
  const safe = assertStoreUrl(store, url);
  const html = await http.get(safe, { ...FETCH_OPTS, rateKey: `store-${store}` });
  return withStore(store, parseProductTiles(html, site));
}

/** Details of one product page: price, unit price, pack size, nutrition, ingredients. */
export async function fetchStoreProduct(http, store, url) {
  const site = siteFor(store);
  const safe = assertStoreUrl(store, url);
  const html = await http.get(safe, { ...FETCH_OPTS, rateKey: `store-${store}` });
  const page = parseProductPage(html, safe);
  const idMatch = [...html.matchAll(site.productHref)].find((m) => safe.includes(m[2]));
  const id = safe.match(/[-/](\d{3,12})\.html/)?.[1] || idMatch?.[2] || null;
  return { store, id, ...page, fetchedAt: new Date().toISOString() };
}

/**
 * Turn a fetched product into a price entry for the shopping list.
 * mapped: the catalogue product ({ sold, packG, packUnits }) when known.
 */
export function priceEntryFromProduct(product, mapped = {}) {
  const sold = mapped.sold || (product.pack?.perKg ? 'weight' : 'pack');
  const date = (product.fetchedAt || new Date().toISOString()).slice(0, 10);
  const base = { store: product.store, date, source: 'store', productName: product.name, url: product.url };
  if (sold === 'weight') {
    const perKg = product.unitPrice?.per === 'kg' ? product.unitPrice.eur : product.pack?.perKg ? product.price : null;
    if (!(perKg > 0)) return null;
    return { ...base, sold: 'weight', eur: perKg };
  }
  if (!(product.price > 0)) return null;
  const packUnits = mapped.packUnits || product.pack?.units;
  if (packUnits) return { ...base, sold: 'pack', eur: product.price, packUnits };
  let packG = mapped.packG || product.pack?.drainedG || product.pack?.grams;
  if (!packG && product.unitPrice?.per === 'kg' && product.unitPrice.eur > 0) {
    packG = Math.round((product.price / product.unitPrice.eur) * 1000);
  }
  return { ...base, sold: 'pack', eur: product.price, packG: packG || undefined };
}
