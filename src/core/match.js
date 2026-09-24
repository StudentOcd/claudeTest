// Does a store product name plausibly match a catalogue food? (word overlap)

import { normalizeText } from './gut.js';

const STOP = new Set([
  'de', 'do', 'da', 'dos', 'das', 'e', 'com', 'sem', 'ao', 'em', 'kg', 'g', 'gr', 'pack', 'emb', 'embalado', 'embalada',
  'auchan', 'pingo', 'doce', 'nosso', 'nossa', 'talho', 'os', 'as', 'o', 'a', 'el', 'la', 'los', 'las', 'y', 'con', 'hacendado',
]);

export const words = (s) => normalizeText(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w) && !/^\d/.test(w));
const stem = (w) => w.replace(/(oes|aes|es|s)$/, '');

export function looksLike(productName, food) {
  const product = new Set(words(productName).map(stem));
  const reference = [...words(food.name), ...words(food.buy?.search || ''), ...words(food.en)].map(stem);
  return reference.some((w) => product.has(w));
}

// Score a product name against keywords (matched at word starts, so 'ovo' finds 'ovos'):
// every `all` must appear, at least one `some` (when given), no `none`; `any` adds points;
// `avoid` still matches but ranks last (an alternative, never the default).
export function keywordScore(productName, { all = [], some = [], any = [], none = [], avoid = [] }) {
  const text = ` ${normalizeText(productName)} `;
  const has = (k) => text.includes(` ${normalizeText(k)}`);
  if (!all.every(has) || (some.length && !some.some(has)) || none.some(has)) return 0;
  if (avoid.some(has)) return 0.25;
  return 1 + all.length + some.filter(has).length + any.filter(has).length;
}

// ───────────── Aisles ─────────────
// Where each store shelves a food: fragments of the product's aisle (its category path at
// Pingo Doce and Auchan, the shop's own category at Mercadona). A product from another
// aisle is not this food, however its name reads: lemon iced tea, a pineapple infusion,
// banana chips, a book called "O Hospital de Alfaces".
const MEAT = ['talho', 'carne/'];
const FISH = ['peixaria', 'peixe', 'pescado'];
// '^' anchors a fragment to the start of the aisle ('congelados/frutas e vegetais/vegetais
// congelados' is not the fresh vegetable aisle).
const FRUIT = ['^frutas e vegetais/frutas', '^produtos frescos/fruta/', 'produtos frescos/frutas e legumes', '^fruta y verdura/fruta'];
const VEG = ['^frutas e vegetais/vegetais', '^produtos frescos/legumes', 'produtos frescos/frutas e legumes', '^fruta y verdura/verdura', '^fruta y verdura/lechuga'];
const FROZEN_VEG = ['vegetais congelados', 'congelados/legumes', 'congelados/frutas e vegetais', 'congelados/fruta y verdura'];
const NOT_FRESH = ['frutos secos', 'desidratad', 'saladas e legumes preparados', 'fruta cortada'];
// Fresh produce is always shelved in its aisle, so an unknown aisle (a promotion, an
// own-brand showcase) is not good enough: that is where lemon dishwasher tablets turn up.
const fresh = (aisles, more = {}) => ({ in: aisles, out: NOT_FRESH, strict: true, ...more });

export const AISLES = {
  chicken_breast: { in: MEAT },
  turkey_steaks: { in: MEAT },
  pork_loin: { in: MEAT },
  beef_mince_lean: { in: MEAT },
  hake: { in: FISH },
  cod_desalted: { in: FISH },
  salmon: { in: FISH },
  tuna_water: { in: ['conservas'] },
  eggs: { in: ['ovo', 'huevo'] },
  egg_whites: { in: ['ovo', 'huevo', 'nutricao desportiva', 'preparado para bolos'] },
  turkey_ham: { in: ['charcutaria', 'charcuteria'] },
  rice_white: { in: ['arroz'] },
  potatoes: fresh(VEG),
  sweet_potato: fresh(VEG),
  pasta: { in: ['massa', 'pasta y fideos'] },
  oats: { in: ['cereais', 'cereales', 'aveia'] },
  bread: { in: ['pao embalado', 'pao de forma', 'pan de molde'] },
  rice_cakes: { in: ['tortitas', 'bolachas', 'galletas', 'galetes'] },
  olive_oil: { in: ['azeite', 'aceite'] },
  peanut_butter: { in: ['barrar', 'mermelada', 'frutos secos'] },
  carrots: fresh(VEG),
  courgette: fresh(VEG),
  green_beans: fresh([...FROZEN_VEG, ...VEG], { prefer: FROZEN_VEG }),
  spinach: fresh([...FROZEN_VEG, ...VEG], { prefer: FROZEN_VEG, out: [] }),
  broccoli: fresh([...FROZEN_VEG, ...VEG], { prefer: FROZEN_VEG }),
  red_pepper: fresh(VEG),
  tomato: fresh(VEG),
  cucumber: fresh(VEG),
  lettuce: fresh(VEG, { out: [] }),
  passata: { in: ['polpa', 'molhos', 'conservas caldos y cremas/tomate'] },
  lemon: fresh(FRUIT),
  banana: fresh(FRUIT),
  orange: fresh(FRUIT),
  kiwi: fresh(FRUIT),
  tangerine: fresh(FRUIT),
  strawberries: fresh(FRUIT),
  blueberries: fresh(FRUIT),
  pineapple: fresh(FRUIT),
  lf_yogurt: { in: ['iogurte', 'yogur', 'sem lactose'] },
  almond_drink: { in: ['bebidas vegetais', 'bebidas vegetales'] },
};

// Aisles that say nothing about what a product is (own-brand showcases, promotions).
const ANY_AISLE = /^(as nossas marcas|promocoes|novidades|destaques|campanhas)(\/|$)/;

const aisleText = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f\u200b-\u200d\ufeff]/g, '')
  .replace(/\s*›\s*/g, '/')
  .replace(/[-_,]+/g, ' ')
  .replace(/ +/g, ' ')
  .split('/')
  .map((x) => x.trim())
  .filter(Boolean)
  .join('/');

/** The product's aisle, e.g. 'frutas e vegetais/frutas/fruta da epoca' ('' when unknown). */
export function aisleOf(product) {
  if (!product) return '';
  if (product.category) return aisleText(product.category);
  try {
    const u = new URL(product.url);
    let parts = u.pathname.split('/').filter(Boolean).map((x) => {
      try {
        return decodeURIComponent(x);
      } catch {
        return x;
      }
    });
    if (/pingodoce\.pt$/.test(u.hostname)) {
      const i = parts.indexOf('produtos');
      parts = i >= 0 ? parts.slice(i + 1, -1) : [];
    } else if (/auchan\.pt$/.test(u.hostname)) {
      parts = parts[0] === 'pt' ? parts.slice(1, -2) : [];
    } else return '';
    const aisle = aisleText(parts.join('/'));
    return ANY_AISLE.test(aisle) ? '' : aisle;
  } catch {
    return '';
  }
}

/** 1: the preferred aisle, 0: a right aisle or unknown, -1: the wrong aisle for this food. */
export function aisleFit(foodId, product) {
  const rule = AISLES[foodId];
  const aisle = aisleOf(product);
  if (!rule) return 0;
  if (!aisle) return rule.strict && product?.url ? -1 : 0;
  const at = (list = []) => list.some((frag) => (frag.startsWith('^') ? `${aisle}/`.startsWith(frag.slice(1)) : `${aisle}/`.includes(frag)));
  if (at(rule.out) || !at(rule.in)) return -1;
  return at(rule.prefer) ? 1 : 0;
}

// What a Pingo Doce / Auchan product name must say to count as each food. Stricter
// than looksLike: the crawler files products (and their photos) under these foods.
export const PT_QUERIES = {
  chicken_breast: { all: ['frango'], some: ['peito', 'bife', 'filete'], none: ['panad', 'nugget', 'hamburg', 'salsich', 'fiambre', 'cozid', 'assad', 'coxa', 'perna', 'asa', 'inteiro', 'recheado', 'marinad', 'churrasco', 'fumad', 'temperad', 'fatiado', 'balcao', 'croquete', 'caril', 'salada', 'sandes', 'wrap', 'pizza', 'racao', 'gato', 'cao'] },
  turkey_steaks: { all: ['peru'], some: ['bife', 'peito', 'escalop'], none: ['fiambre', 'fatias', 'fatiado', 'balcao', 'salsich', 'hamburg', 'panad', 'fumad', 'frango', 'assad', 'cozid', 'temperad', 'racao'] },
  pork_loin: { all: ['lombo', 'porco'], none: ['fumad', 'panad', 'assad', 'presunto', 'paio', 'fiambre', 'recheado', 'marinad', 'curado', 'temperad', 'salmao', 'bacalhau', 'atum', 'porcoes', 'enchido', 'costeleta'] },
  beef_mince_lean: { all: ['picada'], some: ['novilho', 'bovino', 'vaca', 'vitela', 'angus'], none: ['porco', 'frango', 'peru', 'mista', 'hamburg'] },
  hake: { all: ['pescada'], some: ['filete', 'medalh', 'lombo', 'posta'], none: ['panad', 'douradinh', 'croquete', 'pasteis', 'rissol', 'nugget'] },
  cod_desalted: { all: ['bacalhau'], some: ['demolhad', 'posta', 'lombo', 'congelad'], none: ['pasteis', 'pastel', 'bolinho', 'desfiado', 'seco', 'bras', 'croquete', 'pataniscas', 'natas'] },
  salmon: { all: ['salmao'], some: ['posta', 'lombo', 'file', 'fresco', 'congelad', 'polegar'], none: ['fumad', 'sushi', 'pate', 'hamburg', 'panad'] },
  tuna_water: { all: ['atum', 'natural'], none: ['azeite', 'oleo', 'escabeche', 'salada', 'pate', 'tomate'] },
  eggs: { all: ['ovos'], some: ['classe', 'duzia', 'solo', 'ar livre', 'campo', 'gaiola', 'biologico', 'frescos'], any: ['classe m'], none: ['codorniz', 'chocolate', 'cozidos', 'clara', 'gema', 'pascoa', 'liquid', 'moles', 'fios de ovos', 'trouxas', 'creme de ovos', 'ovos doces', 'massa', 'pao', 'bolo', 'em po'] },
  egg_whites: { all: ['clara'], some: ['ovo', 'liquida', 'pasteurizada'], none: ['em po'] },
  turkey_ham: { all: ['fiambre', 'peru'], any: ['peito'], none: ['frango', 'porco', 'cubos'] },
  rice_white: { all: ['arroz'], some: ['agulha', 'carolino', 'basmati', 'vaporizado', 'longo', 'jasmin'], any: ['agulha'], none: ['integral', 'tortitas', 'bolach', 'bebida', 'arroz doce', 'pudim', 'cozido', 'caril', 'risotto', 'preparado', 'galetes'] },
  potatoes: { all: ['batata'], none: ['batata doce', 'frita', 'chips', 'palha', 'palito', 'congelad', 'pure', 'flocos', 'noisette', 'gomos', 'rustica', 'aperitivo', 'fecula', 'rosti', 'croquete', 'pre frita', 'sopa'] },
  sweet_potato: { all: ['batata doce'], none: ['frita', 'chips', 'pure', 'congelad'] },
  pasta: { some: ['esparguete', 'penne', 'massa', 'macarrao', 'fusilli', 'espirais', 'tagliatelle'], any: ['esparguete', 'penne'], none: ['integral', 'arroz', 'lasanha', 'recheada', 'fresca', 'instant', 'noodles', 'sopa', 'molho', 'bagos', 'estrelinha', 'letras', 'aletria', 'cotovelinho', 'massinha', 'pevide', 'conchinha', 'lacinho', 'meada'], avoid: ['sem gluten'] },
  oats: { all: ['aveia'], some: ['flocos', 'aveia natural', 'quaker', 'aveia integral', 'aveia fina', 'aveia grossa'], none: ['bebida', 'bolach', 'barra', 'granola', 'muesli', 'iogurte', 'papa', 'chocolate', 'kefir', 'pao', 'champo', 'creme', 'farinha', 'mel', 'fruta'] },
  bread: { all: ['pao', 'forma'], none: ['integral', 'cereais', 'sementes', 'centeio', 'brioche', 'hamburg', 'cachorro', 'milho', 'espelta'], any: ['sem codea'], avoid: ['sem gluten', 'proteina'] },
  rice_cakes: { all: ['arroz'], some: ['tortitas', 'galetes', 'bolachas de arroz'], none: ['chocolate', 'iogurte', 'caramel', 'milho'] },
  carrots: { all: ['cenoura'], none: ['ralada', 'baby', 'sumo', 'bebe', 'sopa', 'bolo', 'mistura', 'creme', 'pure', 'palitos', 'alface', 'tiras', 'cubos', 'ervilha'] },
  courgette: { some: ['curgete', 'courgette'], none: ['espirais', 'creme', 'sopa', 'esparguete', 'caril', 'abobora', 'frango', 'mistura', 'salteado', 'ravioli'] },
  green_beans: { all: ['feijao verde'], none: ['salteado', 'mistura', 'sopa', 'cozido', 'cenoura'] },
  spinach: { all: ['espinafre'], none: ['creme', 'esparregado', 'lasanha', 'queijo', 'sopa', 'mistura', 'bebe', 'sumo', 'baby', 'massa', 'fingers', 'crepes', 'folhado', 'ravioli', 'salmao', 'natas'] },
  broccoli: { all: ['brocolo'], none: ['creme', 'sopa', 'mistura', 'salteado', 'veggie', 'couve', 'arroz'] },
  red_pepper: { all: ['pimento'], some: ['vermelho'], none: ['assado', 'asssado', 'conserva', 'padron', 'piquillo', 'recheado', 'tiras', 'inteiros', 'frasco', 'lata'] },
  tomato: { all: ['tomate'], none: ['polpa', 'pelado', 'concentrado', 'ketchup', 'molho', 'cherry', 'seco', 'sumo', 'triturado', 'frito', 'passata', 'salada', 'sopa', 'doce de', 'gaspacho', 'pure', 'semente', 'creme', 'pedacos', 'cubos', 'mini', 'cereja'] },
  cucumber: { all: ['pepino'], none: ['pickle', 'conserva', 'vinagre', 'pepino doce', 'gaspacho', 'pepininho', 'salada', 'mini'] },
  lettuce: { all: ['alface'], none: ['mistura', 'salada', 'cenoura'] },
  passata: { some: ['polpa de tomate', 'tomate triturado', 'passata'], none: ['cebola', 'alho', 'manjericao', 'molho', 'oregaos'] },
  lemon: { all: ['limao'], none: ['pudim', 'gelado', 'sorbet', 'iogurte', 'kefir', 'doce de', 'compota', 'marmelada', 'geleia', 'bolo', 'torta', 'tarte', 'mousse', 'gomas', 'gelatina', 'sumo', 'nectar', 'batido', 'bebida', 'licor', 'aroma', 'sabor', 'cereais', 'barra', 'chocolate', 'ice tea', 'refrigerante', 'agua', 'cha', 'bolach', 'raspas', 'gin', 'cerveja', 'sabonete', 'detergente', 'caviar'] },
  banana: { all: ['banana'], none: ['pudim', 'gelado', 'sorbet', 'iogurte', 'kefir', 'doce de', 'compota', 'marmelada', 'geleia', 'bolo', 'torta', 'tarte', 'mousse', 'gomas', 'gelatina', 'sumo', 'nectar', 'batido', 'bebida', 'licor', 'aroma', 'sabor', 'cereais', 'barra', 'chocolate', 'chips', 'seca', 'desidratad', 'pao', 'papa', 'assar', 'pure', 'rodelas', 'panquecas', 'fritar'] },
  orange: { all: ['laranja'], none: ['pudim', 'gelado', 'sorbet', 'iogurte', 'kefir', 'doce de', 'compota', 'marmelada', 'geleia', 'bolo', 'torta', 'tarte', 'mousse', 'gomas', 'gelatina', 'sumo', 'nectar', 'batido', 'bebida', 'licor', 'aroma', 'sabor', 'cereais', 'barra', 'chocolate', 'refrigerante', 'bolach', 'agua', 'cha', 'chupa'] },
  kiwi: { all: ['kiwi'], none: ['manga', 'papaia', 'pedacos', 'pudim', 'gelado', 'sorbet', 'iogurte', 'kefir', 'doce de', 'compota', 'marmelada', 'geleia', 'bolo', 'torta', 'tarte', 'mousse', 'gomas', 'gelatina', 'sumo', 'nectar', 'batido', 'bebida', 'licor', 'aroma', 'sabor', 'cereais', 'barra', 'chocolate'] },
  tangerine: { some: ['tangerina', 'clementina', 'mandarina'], none: ['pudim', 'gelado', 'sorbet', 'iogurte', 'kefir', 'doce de', 'compota', 'marmelada', 'geleia', 'bolo', 'torta', 'tarte', 'mousse', 'gomas', 'gelatina', 'sumo', 'nectar', 'batido', 'bebida', 'licor', 'aroma', 'sabor', 'cereais', 'barra', 'chocolate', 'conserva'] },
  strawberries: { all: ['morango'], none: ['pedacos', 'cortado', 'pudim', 'gelado', 'sorbet', 'iogurte', 'kefir', 'doce de', 'compota', 'marmelada', 'geleia', 'bolo', 'torta', 'tarte', 'mousse', 'gomas', 'gelatina', 'sumo', 'nectar', 'batido', 'bebida', 'licor', 'aroma', 'sabor', 'cereais', 'barra', 'chocolate', 'congelad', 'frubis', 'gel', 'leite', 'doony'] },
  blueberries: { all: ['mirtilo'], none: ['pudim', 'gelado', 'sorbet', 'iogurte', 'kefir', 'doce de', 'compota', 'marmelada', 'geleia', 'bolo', 'torta', 'tarte', 'mousse', 'gomas', 'gelatina', 'sumo', 'nectar', 'batido', 'bebida', 'licor', 'aroma', 'sabor', 'cereais', 'barra', 'chocolate', 'desidratad', 'seco', 'muffin', 'doony', 'vermelho', 'framboesa'] },
  pineapple: { all: ['ananas'], none: ['pudim', 'gelado', 'sorbet', 'iogurte', 'kefir', 'doce de', 'compota', 'marmelada', 'geleia', 'bolo', 'torta', 'tarte', 'mousse', 'gomas', 'gelatina', 'sumo', 'nectar', 'batido', 'bebida', 'licor', 'aroma', 'sabor', 'cereais', 'barra', 'chocolate', 'lata', 'calda', 'conserva', 'rodelas', 'pedacos', 'desidratad'] },
  lf_yogurt: { all: ['iogurte', 'natural'], some: ['sem lactose', 'lactose free', '0% lactose', 'zero lactose'], none: ['aroma', 'sabor', 'morango', 'frutos', 'pedacos', 'liquido', 'grego', 'acucarad']  },
  almond_drink: { all: ['amendoa'], some: ['bebida'], any: ['sem acucar', 'sem acucares', 'nao adocada'], none: ['chocolate', 'baunilha', 'cafe', 'iogurte', 'barista'] },
  olive_oil: { all: ['azeite'], some: ['virgem'], any: ['extra'], none: ['spray', 'aromatizado', 'alho', 'malagueta', 'oregaos', 'atum', 'sardinha', 'bolach', 'pao', 'lata'] },
  peanut_butter: { all: ['amendoim'], some: ['manteiga', 'creme', 'pasta'], none: ['chocolate', 'barra', 'bolach', 'mel', 'snack', 'gelado', 'cone'] },
};

/**
 * Does this store product belong to the food? Strict when rules exist, else word overlap.
 * product (optional): { url } or { category }, to check it is on the food's aisle.
 */
export function matchesFood(productName, food, product = null) {
  const q = PT_QUERIES[food.id];
  if (product && aisleFit(food.id, product) < 0) return false;
  return q ? keywordScore(productName, q) > 0 : looksLike(productName, food);
}
