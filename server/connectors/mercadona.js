// Mercadona has no online shop in Portugal, but its Spanish shop
// (tienda.mercadona.es) has a public JSON API with photos of the same
// Hacendado products. Prices there are Spanish prices, so they are only used
// as estimates for Portugal.

import { aisleFit, keywordScore } from '../../src/core/match.js';

export const MERCADONA_API = 'https://tienda.mercadona.es/api';
const QS = '?lang=es&wh=vlc1';

// Spanish search words per catalogue food.
export const MERCADONA_QUERIES = {
  chicken_breast: { all: ['pechuga', 'pollo'], any: ['filetes', 'entera'], none: ['empanad', 'cocid', 'asad', 'lonchas', 'fiambre', 'adobad', 'marinad', 'rellen', 'pincho', 'kebab', 'hamburguesa', 'burger', 'churrasco', 'finas hierbas', 'limon'] },
  turkey_steaks: { all: ['pavo'], some: ['filetes', 'pechuga', 'solomillo'], any: ['pechuga'], none: ['lonchas', 'fiambre', 'cocid', 'hamburguesa', 'burger', 'salchicha', 'marinad', 'contramuslo', 'nuggets'] },
  pork_loin: { all: ['lomo', 'cerdo'], any: ['filetes', 'cinta'], none: ['embuchado', 'adobado', 'curado'] },
  beef_mince_lean: { all: ['picada'], any: ['vacuno', 'ternera'], none: ['cerdo', 'mixta', 'pollo'] },
  hake: { all: ['merluza'], some: ['filetes', 'lomos', 'rodajas'], any: ['filetes', 'lomos'], none: ['rebozad', 'empanad', 'varitas', 'surimi', 'huevo', 'libro', 'pieza'] },
  cod_desalted: { all: ['bacalao'], some: ['lomo', 'porciones', 'filetes', 'al punto de sal', 'desalad'], any: ['al punto de sal', 'desalad', 'lomo'], none: ['rebozad', 'empanad', 'ahumado', 'migas', 'albondiga', 'pimientos', 'rellen', 'bunuelo', 'croqueta', 'rodajas', 'libro', 'pieza'] },
  salmon: { all: ['salmon'], any: ['lomos', 'rodaja', 'fresco'], none: ['ahumado', 'surimi', 'sushi', 'marinado', 'al natural', 'pate'] },
  tuna_water: { all: ['atun', 'natural'], any: ['claro'], none: ['aceite', 'escabeche'] },
  eggs: { all: ['huevos'], any: ['frescos', 'docena', 'medianos'], none: ['codorniz', 'chocolate', 'cocidos', 'claras', 'yemas', 'liquido'] },
  egg_whites: { all: ['clara'], any: ['huevo', 'liquida'] },
  turkey_ham: { all: ['pavo'], any: ['lonchas', 'pechuga', 'finas'], none: ['filetes', 'salchicha', 'hamburguesa'] },
  rice_white: { all: ['arroz'], some: ['largo', 'basmati', 'vaporizado'], any: ['largo'], none: ['integral', 'vasitos', 'vasito', 'preparado', 'bebida', 'tortitas', 'hinchado', 'cocido', 'microondas', 'sabroz', 'precocinado', 'listo', 'tres delicias', 'con ', 'redondo'] },
  potatoes: { all: ['patata'], none: ['frita', 'prefrita', 'chips', 'congelad', 'tortilla', 'boniato', 'microondas', 'cocida', 'pure', 'troceada', 'salteado'] },
  sweet_potato: { some: ['boniato', 'batata'], none: ['frito', 'chips', 'bastones', 'microondas'] },
  pasta: { some: ['spaghetti', 'espagueti', 'penne', 'macarron'], any: ['spaghetti', 'espagueti', 'penne'], none: ['integral', 'arroz', 'huevo', 'fino', 'grueso', 'rayado', 'vegetal', 'fresca', 'rellen'], avoid: ['sin gluten'] },
  oats: { all: ['avena'], some: ['copos'], none: ['bebida', 'galleta', 'barrita', 'chocolate', 'cereales', 'crunchy', 'pan '], avoid: ['sin gluten'] },
  bread: { all: ['pan', 'molde'], any: ['blanco'], none: ['integral', 'semillas', 'brioche', 'cereales', 'espelta', 'avena'], avoid: ['sin gluten'] },
  rice_cakes: { all: ['tortitas', 'arroz'], none: ['chocolate', 'yogur'] },
  olive_oil: { all: ['aceite', 'oliva', 'virgen', 'extra'], none: ['spray', 'girasol'] },
  peanut_butter: { some: ['crema de cacahuete', 'mantequilla de cacahuete'], any: ['100'], none: ['chocolate', 'barrita', 'helado', 'polvo'] },
  carrots: { all: ['zanahoria'], none: ['rallada', 'baby', 'zumo'] },
  courgette: { all: ['calabacin'], none: ['crema', 'espirales'] },
  green_beans: { all: ['judia', 'verde'], any: ['redonda', 'ultracongelad'] },
  spinach: { all: ['espinaca'], any: ['ultracongelad'], none: ['crema', 'bebe', 'queso', 'ravioli', 'burger', 'rellena'] },
  broccoli: { all: ['brocoli'], any: ['ultracongelad'], none: ['crema', 'mezcla', 'coliflor', 'zanahoria', 'microondas'] },
  red_pepper: { all: ['pimiento', 'rojo'], none: ['asado', 'piquillo', 'conserva'] },
  tomato: { all: ['tomate'], any: ['ensalada', 'pera', 'rama'], none: ['frito', 'triturado', 'cherry', 'salsa', 'seco'] },
  cucumber: { all: ['pepino'], none: ['pepinillo'] },
  lettuce: { all: ['lechuga'], any: ['iceberg'], none: ['bolsa', 'cortada'] },
  passata: { all: ['tomate', 'triturado'], none: ['frito', 'cebolla', 'ajo'] },
  lemon: { all: ['limon'], none: ['zumo', 'refresco', 'galleta'] },
  banana: { all: ['platano'], any: ['canarias'], none: ['macho', 'chips', 'deshidratado'] },
  orange: { all: ['naranja'], any: ['mesa'], none: ['zumo', 'mermelada'] },
  kiwi: { all: ['kiwi'], any: ['verde'], none: ['zumo', 'amarillo'] },
  tangerine: { all: ['mandarina'], none: ['zumo', 'conserva'] },
  strawberries: { all: ['fresa'], none: ['yogur', 'mermelada', 'batido', 'helado', 'congelad'] },
  blueberries: { all: ['arandano'], none: ['deshidratado', 'yogur', 'rojo'] },
  pineapple: { all: ['pina'], none: ['conserva', 'zumo', 'almibar', 'rodajas', 'jugo', 'queso'] },
  lf_yogurt: { all: ['yogur', 'sin lactosa'], any: ['natural'], none: ['sabor', 'frutas', 'azucar'] },
  almond_drink: { all: ['bebida', 'almendra'], any: ['sin azucar', '0% azucar'], none: ['chocolate', 'avena', 'arroz', 'coco'] },
};

// Top-level groups that never contain food we plan (yogurts are under "Postres y yogures",
// peanut butter would be under "Aperitivos" or with the jams).
const SKIP_GROUPS = /limpieza|hogar|mascota|cuidado|maquillaje|fitoterapia|parafarmacia|beb[eé]|higiene|cabello|facial|corporal|perfume|papel|bodega|refresco|agua|cerveza|vino|zumo|cacao|caf[eé]|pizza/i;

// Pack size: kg or litres, a count ("12 ud" of eggs), and the drained weight of tins.
function packOf(pi) {
  const size = Number(pi.unit_size);
  if (!(size > 0)) return {};
  if (pi.size_format === 'ud') return { units: size };
  if (pi.size_format !== 'kg' && pi.size_format !== 'l') return {};
  const drained = Number(pi.drained_weight);
  return { grams: Math.round(size * 1000), ...(drained > 0 ? { drainedG: Math.round(drained * 1000) } : {}) };
}

export function toProduct(p) {
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
    pack: packOf(pi),
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

/** Best Mercadona matches for a food (in the food's aisle), highest score first. */
export function matchMercadona(products, foodId, limit = 8) {
  const q = MERCADONA_QUERIES[foodId];
  if (!q) return [];
  return products
    .map((p) => ({ p, s: keywordScore(p.name, q), fit: aisleFit(foodId, p) }))
    .filter((x) => x.s > 0 && x.fit >= 0)
    // Hacendado (Mercadona's own brand) first, like the other stores' own brands.
    .map((x) => ({ ...x, s: x.s + x.fit * 2 + (/hacendado/i.test(x.p.name) ? 1 : 0) }))
    .sort((a, b) => b.s - a.s || a.p.name.length - b.p.name.length || (a.p.price ?? 99) - (b.p.price ?? 99))
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
