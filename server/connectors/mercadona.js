// Mercadona has no online shop in Portugal, but its Spanish shop
// (tienda.mercadona.es) has a public JSON API with photos of the same
// Hacendado products. Prices there are Spanish prices, so they are only used
// as estimates for Portugal.

import { keywordScore } from '../../src/core/match.js';

export const MERCADONA_API = 'https://tienda.mercadona.es/api';
const QS = '?lang=es&wh=vlc1';

// Spanish search words per catalogue food.
export const MERCADONA_QUERIES = {
  chicken_breast: { all: ['pechuga', 'pollo'], any: ['filetes', 'entera'], none: ['empanad', 'cocid', 'asad', 'lonchas', 'fiambre', 'adobad', 'marinad', 'rellen', 'pincho', 'kebab', 'hamburguesa', 'burger', 'churrasco', 'finas hierbas', 'limon'] },
  turkey_steaks: { all: ['pavo'], any: ['filetes', 'pechuga'], none: ['lonchas', 'fiambre', 'cocid', 'hamburguesa', 'salchicha'] },
  pork_loin: { all: ['lomo', 'cerdo'], any: ['filetes', 'cinta'], none: ['embuchado', 'adobado', 'curado'] },
  beef_mince_lean: { all: ['picada'], any: ['vacuno', 'ternera'], none: ['cerdo', 'mixta', 'pollo'] },
  hake: { all: ['merluza'], any: ['filetes', 'lomos'], none: ['rebozad', 'empanad', 'varitas', 'surimi'] },
  cod_desalted: { all: ['bacalao'], any: ['desalado', 'lomos'], none: ['rebozad', 'empanad', 'ahumado'] },
  salmon: { all: ['salmon'], any: ['lomos', 'rodaja', 'fresco'], none: ['ahumado', 'surimi', 'sushi'] },
  tuna_water: { all: ['atun', 'natural'], any: ['claro'], none: ['aceite', 'escabeche'] },
  eggs: { all: ['huevos'], any: ['frescos', 'docena', 'medianos'], none: ['codorniz', 'chocolate', 'cocidos', 'claras', 'yemas', 'liquido'] },
  egg_whites: { all: ['clara'], any: ['huevo', 'liquida'] },
  turkey_ham: { all: ['pavo'], any: ['lonchas', 'pechuga', 'finas'], none: ['filetes', 'salchicha', 'hamburguesa'] },
  rice_white: { all: ['arroz'], any: ['largo', 'redondo', 'basmati'], none: ['integral', 'vasitos', 'vasito', 'preparado', 'bebida', 'tortitas', 'hinchado', 'cocido', 'microondas', 'sabroz', 'precocinado', 'listo', 'tres delicias', 'con '] },
  potatoes: { all: ['patata'], any: ['malla', 'lavada', 'nueva'], none: ['frita', 'chips', 'congelad', 'tortilla', 'boniato'] },
  sweet_potato: { all: ['boniato'], none: ['frito', 'chips'] },
  pasta: { all: ['espagueti'], any: ['pasta'], none: ['integral', 'arroz'] },
  oats: { all: ['avena'], any: ['copos', 'finos', 'integrales'], none: ['bebida', 'galleta', 'barrita'] },
  bread: { all: ['pan', 'molde'], any: ['blanco', 'sin corteza'], none: ['integral', 'semillas', 'brioche'] },
  rice_cakes: { all: ['tortitas', 'arroz'], none: ['chocolate', 'yogur'] },
  olive_oil: { all: ['aceite', 'oliva', 'virgen', 'extra'], none: ['spray', 'girasol'] },
  peanut_butter: { all: ['cacahuete'], any: ['crema', '100'], none: ['chocolate', 'barrita'] },
  carrots: { all: ['zanahoria'], none: ['rallada', 'baby', 'zumo'] },
  courgette: { all: ['calabacin'], none: ['crema', 'espirales'] },
  green_beans: { all: ['judia', 'verde'], any: ['redonda', 'plana', 'congelad'] },
  spinach: { all: ['espinaca'], none: ['crema', 'bebe', 'queso'] },
  broccoli: { all: ['brocoli'], none: ['crema', 'mezcla'] },
  red_pepper: { all: ['pimiento', 'rojo'], none: ['asado', 'piquillo', 'conserva'] },
  tomato: { all: ['tomate'], any: ['ensalada', 'pera', 'rama'], none: ['frito', 'triturado', 'cherry', 'salsa', 'seco'] },
  cucumber: { all: ['pepino'], none: ['pepinillo'] },
  lettuce: { all: ['lechuga'], none: ['bolsa'] },
  passata: { all: ['tomate', 'triturado'], none: ['frito', 'cebolla', 'ajo'] },
  lemon: { all: ['limon'], none: ['zumo', 'refresco', 'galleta'] },
  banana: { all: ['platano'], any: ['canarias'], none: ['macho', 'chips', 'deshidratado'] },
  orange: { all: ['naranja'], any: ['mesa'], none: ['zumo', 'mermelada'] },
  kiwi: { all: ['kiwi'], none: ['zumo'] },
  tangerine: { all: ['mandarina'], none: ['zumo', 'conserva'] },
  strawberries: { all: ['fresa'], none: ['yogur', 'mermelada', 'batido', 'helado', 'congelad'] },
  blueberries: { all: ['arandano'], none: ['deshidratado', 'yogur', 'rojo'] },
  pineapple: { all: ['pina'], none: ['conserva', 'zumo', 'almibar'] },
  lf_yogurt: { all: ['yogur', 'sin lactosa'], any: ['natural'], none: ['sabor', 'frutas', 'azucar'] },
  almond_drink: { all: ['bebida', 'almendra'], any: ['sin azucar'], none: ['chocolate'] },
};

// Top-level groups that never contain food we plan.
const SKIP_GROUPS = /limpieza|hogar|mascota|cuidado|maquillaje|fitoterapia|parafarmacia|beb[eé]|higiene|cabello|facial|corporal|perfume|papel|bodega|refresco|agua|cerveza|vino|zumo|aperitivo|cacao|caf[eé]|dulce|chocolate|helado|pizza|postre/i;

function toProduct(p) {
  const pi = p.price_instructions || {};
  const unit = Number(pi.unit_price);
  const ref = Number(pi.reference_price ?? pi.bulk_price);
  return {
    store: 'mercadona',
    id: String(p.id),
    name: p.display_name,
    brand: p.brand || (/(hacendado|deliplus|bosque verde)/i.exec(p.display_name || '')?.[1] ?? null),
    url: p.share_url || `https://tienda.mercadona.es/product/${p.id}`,
    imageUrl: p.thumbnail ? p.thumbnail.replace(/([?&])(h|w)=\d+/g, '$1$2=400') : null,
    price: Number.isFinite(unit) ? unit : null,
    unitPrice: Number.isFinite(ref) && pi.reference_format ? { eur: ref, per: String(pi.reference_format).toLowerCase() === 'kg' ? 'kg' : String(pi.reference_format).toLowerCase() } : null,
    packaging: [p.packaging, pi.unit_size ? `${pi.unit_size} ${pi.size_format || ''}` : ''].filter(Boolean).join(' · '),
    pack: pi.unit_size && pi.size_format === 'kg' ? { grams: Number(pi.unit_size) * 1000 } : pi.unit_size && pi.size_format === 'l' ? { grams: Number(pi.unit_size) * 1000 } : {},
    priceCountry: 'ES',
  };
}

/** Every product in Mercadona's food categories (≈100 requests, rate limited). */
export async function mercadonaProducts(http, { onProgress } = {}) {
  const top = await http.get(`${MERCADONA_API}/categories/${QS}`, { rateKey: 'mercadona', cacheTtlMs: 24 * 3600 * 1000 });
  const leaves = [];
  for (const group of top?.results || []) {
    if (SKIP_GROUPS.test(group.name || '')) continue;
    for (const c of group.categories || []) leaves.push({ id: c.id, name: `${group.name} › ${c.name}` });
  }
  const products = new Map();
  let done = 0;
  for (const leaf of leaves) {
    try {
      const data = await http.get(`${MERCADONA_API}/categories/${leaf.id}/${QS}`, { rateKey: 'mercadona', cacheTtlMs: 24 * 3600 * 1000 });
      for (const sub of data?.categories || []) {
        for (const p of sub.products || []) if (p.published !== false) products.set(String(p.id), { ...toProduct(p), category: leaf.name });
      }
    } catch (err) {
      onProgress?.(`Mercadona category ${leaf.name}: ${err.message}`);
    }
    onProgress?.(`Mercadona categories ${++done}/${leaves.length}`);
  }
  return [...products.values()];
}

/** Best Mercadona matches for a food, highest score first. */
export function matchMercadona(products, foodId, limit = 8) {
  const q = MERCADONA_QUERIES[foodId];
  if (!q) return [];
  return products
    .map((p) => ({ p, s: keywordScore(p.name, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.p.price ?? 99) - (b.p.price ?? 99))
    .slice(0, limit)
    .map((x) => x.p);
}

/** Product details (bigger photo, EAN, ingredients). */
export async function mercadonaProduct(http, id) {
  const p = await http.get(`${MERCADONA_API}/products/${id}/${QS}`, { rateKey: 'mercadona', cacheTtlMs: 24 * 3600 * 1000 });
  const base = toProduct(p);
  const photo = p.photos?.[0]?.regular || p.photos?.[0]?.zoom || base.imageUrl;
  return {
    ...base,
    imageUrl: photo,
    ean: p.ean || null,
    ingredientsText: p.nutrition_information?.ingredients || '',
    allergensText: p.nutrition_information?.allergens || '',
  };
}
