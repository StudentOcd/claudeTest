// Auchan and Pingo Doce online shops (both run on Salesforce Commerce Cloud).
// Unofficial: reads the same public pages your browser does, slowly, with
// caching and a robots.txt check. Mercadona has no online shop in Portugal.

import { decodeEntities, parseProductPage, parseProductTiles } from './html.js';
import { normalizeText } from '../../src/core/gut.js';
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
// Search the store's own product list (its sitemaps). The stores' search pages are closed to
// crawlers in their robots.txt, so Leve never calls them.
export async function searchStore(http, store, query) {
  const site = siteFor(store);
  const q = String(query || '').trim();
  if (q.length < 2) return { items: [], tried: [], browserUrl: null };
  const words = normalizeText(q).split(' ').filter((w) => w.length > 1);
  try {
    const all = await sitemapProducts(http, store);
    const items = all
      .filter((p) => {
        const t = ` ${normalizeText(p.name)} `;
        return words.every((w) => t.includes(` ${w}`));
      })
      .sort((a, b) => a.name.length - b.name.length)
      .slice(0, 40);
    return { items, tried: [{ url: 'sitemap', ok: true, count: items.length }], browserUrl: site.browserSearch(q) };
  } catch (err) {
    return { items: [], tried: [{ url: 'sitemap', ok: false, error: err.message, code: err.code || null }], browserUrl: site.browserSearch(q) };
  }
}

/** List the products on a category page. */
export async function browseCategory(http, store, url) {
  const site = siteFor(store);
  const safe = assertStoreUrl(store, url);
  const html = await http.get(safe, { ...FETCH_OPTS, rateKey: `store-${store}` });
  return withStore(store, parseProductTiles(html, site));
}

/** Details of one product page: price, unit price, pack size, nutrition, ingredients. */
// Auchan answers removed products with a normal-looking "404" page (HTTP 200).
const REMOVED = /auc-404error|class="[^"]*\bpage-not-found\b|produto n[aã]o (?:est[aá] )?dispon[ií]vel online|p[aá]gina n[aã]o encontrada/i;

export async function fetchStoreProduct(http, store, url) {
  const site = siteFor(store);
  const safe = assertStoreUrl(store, url);
  const html = await http.get(safe, { ...FETCH_OPTS, rateKey: `store-${store}` });
  const page = parseProductPage(html, safe);
  if (REMOVED.test(html) || (!page.price && !page.image && !page.per100)) {
    throw new HttpError('This product is no longer in the online shop', { url: safe, code: 'NOT_FOUND' });
  }
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
  const perUnit = product.unitPrice?.per === 'unit' && product.unitPrice.eur > 0 ? Math.round(product.price / product.unitPrice.eur) : null;
  const packUnits = mapped.packUnits || product.pack?.units || (perUnit > 1 ? perUnit : null);
  if (packUnits) return { ...base, sold: 'pack', eur: product.price, packUnits };
  let packG = mapped.packG || product.pack?.drainedG || product.pack?.grams;
  if (!packG && product.unitPrice?.per === 'kg' && product.unitPrice.eur > 0) {
    packG = Math.round((product.price / product.unitPrice.eur) * 1000);
  }
  return { ...base, sold: 'pack', eur: product.price, packG: packG || undefined };
}


// ───────────── Sitemaps: the full, current product list each store publishes for crawlers ─────────────

const SITEMAP_INDEX = {
  pingodoce: 'https://www.pingodoce.pt/home/sitemap_index.xml',
  auchan: 'https://www.auchan.pt/sitemap_index.xml',
};
const NOT_FOOD = /\/(animais|animal|higiene|limpeza|beleza|perfumaria|bebe|mundo-bebe|puericultura|casa|bricolage|electrodomesticos|papelaria|brinquedos|jardim|saude|parafarmacia|drogaria|tabacaria)(?:[-/]|$)/i;

function nameFromUrl(url) {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  let last = (parts.pop() || '').replace(/\.html$/, '');
  if (/^\d+$/.test(last)) last = parts.pop() || '';
  return decodeURIComponent(last).replace(/-\d{3,12}$/, '').replace(/[-_]+/g, ' ').trim();
}

/** Smaller product photo (400 px) from the store's image service. */
export function photoUrl(store, url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (store === 'auchan' && !u.pathname.startsWith('/dw/image/') && u.pathname.includes('/on/demandware.static/')) {
      return `https://www.auchan.pt/dw/image/v2/BFRC_PRD${u.pathname.slice(u.pathname.indexOf('/on/demandware.static/'))}?sw=400&sh=400&sm=fit`;
    }
    if (u.pathname.startsWith('/dw/image/')) return `${u.origin}${u.pathname}?sw=400&sh=400&sm=fit`;
  } catch {
    // not a URL we can resize
  }
  return url;
}

/**
 * Every food product a store lists in its sitemaps: [{ store, id, url, name, image }].
 * Names come from the image sitemaps (or the product's URL slug), photos too.
 */
export async function sitemapProducts(http, store) {
  const site = siteFor(store);
  const opts = { ...FETCH_OPTS, cacheTtlMs: 24 * 3600 * 1000, rateKey: `store-${store}`, timeoutMs: 60000 };
  const index = await http.get(SITEMAP_INDEX[store], opts);
  const maps = [...String(index).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).filter((u) => /-(product|image)\.xml$/.test(u));
  const byUrl = new Map();
  for (const map of maps) {
    const xml = String(await http.get(map, opts));
    for (const block of xml.split('<url>').slice(1)) {
      const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
      if (!loc) continue;
      let host;
      try {
        host = new URL(loc).hostname;
      } catch {
        continue;
      }
      const id = loc.match(/[-/](\d{3,12})\.html/)?.[1];
      if (!site.hosts.includes(host) || !id || NOT_FOOD.test(new URL(loc).pathname)) continue;
      const entry = byUrl.get(loc) || { store, id, url: loc, name: null, image: null };
      const title = block.match(/<image:title>([\s\S]*?)<\/image:title>/)?.[1];
      const image = block.match(/<image:loc>\s*([^<\s]+)\s*<\/image:loc>/)?.[1];
      if (title && !entry.name) entry.name = decodeEntities(title.replace(/^<!\[CDATA\[|\]\]>$/g, '')).replace(/\s+/g, ' ').trim();
      if (image && !entry.image) entry.image = photoUrl(store, image);
      byUrl.set(loc, entry);
    }
  }
  const out = [...byUrl.values()];
  for (const p of out) if (!p.name) p.name = nameFromUrl(p.url);
  return out;
}
