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
// every `all` must appear, at least one `some` (when given), no `none`; `any` adds points.
export function keywordScore(productName, { all = [], some = [], any = [], none = [] }) {
  const text = ` ${normalizeText(productName)} `;
  const has = (k) => text.includes(` ${normalizeText(k)}`);
  if (!all.every(has) || (some.length && !some.some(has)) || none.some(has)) return 0;
  return 1 + all.length + some.filter(has).length + any.filter(has).length;
}

// What a Pingo Doce / Auchan product name must say to count as each food. Stricter
// than looksLike: the crawler files products (and their photos) under these foods.
export const PT_QUERIES = {
  chicken_breast: { all: ['frango'], some: ['peito', 'bife', 'filete'], none: ['panad', 'nugget', 'hamburg', 'salsich', 'fiambre', 'cozid', 'assad', 'coxa', 'perna', 'asa', 'inteiro', 'recheado', 'marinad', 'churrasco', 'fumad'] },
  turkey_steaks: { all: ['peru'], some: ['bife', 'peito', 'escalop'], none: ['fiambre', 'fatias', 'salsich', 'hamburg', 'panad', 'fumad', 'frango'] },
  pork_loin: { all: ['lombo', 'porco'], none: ['fumad', 'panad', 'assad', 'presunto', 'paio', 'fiambre', 'recheado', 'marinad'] },
  beef_mince_lean: { all: ['picada'], some: ['novilho', 'bovino', 'vaca', 'vitela', 'angus'], none: ['porco', 'frango', 'peru', 'mista', 'hamburg'] },
  hake: { all: ['pescada'], some: ['filete', 'medalh', 'lombo', 'posta'], none: ['panad', 'douradinh', 'croquete', 'pasteis', 'rissol', 'nugget'] },
  cod_desalted: { all: ['bacalhau'], some: ['demolhad', 'posta', 'lombo', 'congelad'], none: ['pasteis', 'pastel', 'bolinho', 'desfiado', 'seco', 'bras', 'croquete', 'pataniscas', 'natas'] },
  salmon: { all: ['salmao'], some: ['posta', 'lombo', 'file', 'fresco', 'congelad', 'polegar'], none: ['fumad', 'sushi', 'pate', 'hamburg', 'panad'] },
  tuna_water: { all: ['atum', 'natural'], none: ['azeite', 'oleo', 'escabeche', 'salada', 'pate', 'tomate'] },
  eggs: { all: ['ovos'], none: ['codorniz', 'chocolate', 'cozidos', 'clara', 'gema', 'pascoa', 'liquid'] },
  egg_whites: { all: ['clara'], some: ['ovo', 'liquida', 'pasteurizada'] },
  turkey_ham: { all: ['fiambre', 'peru'], none: ['frango', 'porco'] },
  rice_white: { all: ['arroz'], some: ['agulha', 'carolino', 'basmati', 'vaporizado', 'longo', 'jasmin'], none: ['integral', 'tortitas', 'bolach', 'bebida', 'arroz doce', 'pudim', 'cozido', 'caril', 'risotto', 'preparado', 'galetes'] },
  potatoes: { all: ['batata'], none: ['batata doce', 'frita', 'chips', 'palha', 'congelad', 'pure', 'flocos', 'noisette', 'gomos', 'rustica', 'aperitivo'] },
  sweet_potato: { all: ['batata doce'], none: ['frita', 'chips', 'pure', 'congelad'] },
  pasta: { some: ['esparguete', 'penne', 'massa', 'macarrao', 'fusilli', 'espirais', 'tagliatelle'], none: ['integral', 'arroz', 'lasanha', 'recheada', 'fresca', 'instant', 'noodles', 'sopa', 'molho'] },
  oats: { all: ['aveia'], none: ['bebida', 'bolach', 'barra', 'granola', 'muesli', 'iogurte', 'papa', 'chocolate'] },
  bread: { all: ['pao', 'forma'], none: ['integral', 'cereais', 'sementes', 'centeio', 'brioche', 'hamburg', 'cachorro', 'milho', 'espelta'] },
  rice_cakes: { all: ['arroz'], some: ['tortitas', 'galetes', 'bolachas de arroz'], none: ['chocolate', 'iogurte', 'caramel', 'milho'] },
  carrots: { all: ['cenoura'], none: ['ralada', 'baby', 'sumo', 'bebe', 'sopa', 'bolo', 'mistura'] },
  courgette: { some: ['curgete', 'courgette'], none: ['espirais', 'creme', 'sopa', 'esparguete'] },
  green_beans: { all: ['feijao verde'], none: ['salteado', 'mistura', 'sopa'] },
  spinach: { all: ['espinafre'], none: ['creme', 'esparregado', 'lasanha', 'queijo', 'sopa', 'mistura', 'bebe'] },
  broccoli: { all: ['brocolo'], none: ['creme', 'sopa', 'mistura', 'salteado'] },
  red_pepper: { all: ['pimento'], some: ['vermelho'], none: ['assado', 'conserva', 'padron', 'piquillo', 'recheado', 'tiras'] },
  tomato: { all: ['tomate'], none: ['polpa', 'pelado', 'concentrado', 'ketchup', 'molho', 'cherry', 'seco', 'sumo', 'triturado', 'frito', 'passata', 'salada', 'sopa'] },
  cucumber: { all: ['pepino'], none: ['pickle', 'conserva', 'vinagre'] },
  lettuce: { all: ['alface'], none: ['mistura', 'salada'] },
  passata: { some: ['polpa de tomate', 'tomate triturado', 'passata'], none: ['cebola', 'alho', 'manjericao', 'molho', 'oregaos'] },
  lemon: { all: ['limao'], none: ['sumo', 'refrigerante', 'bolach', 'gelado', 'cha', 'iogurte', 'raspas'] },
  banana: { all: ['banana'], none: ['chips', 'seca', 'desidratad', 'bolo', 'iogurte', 'batido', 'pao', 'papa'] },
  orange: { all: ['laranja'], none: ['sumo', 'doce de', 'compota', 'refrigerante', 'bolo', 'iogurte', 'nectar', 'bolach'] },
  kiwi: { all: ['kiwi'], none: ['sumo', 'iogurte', 'nectar'] },
  tangerine: { some: ['tangerina', 'clementina', 'mandarina'], none: ['sumo', 'conserva', 'nectar'] },
  strawberries: { all: ['morango'], none: ['iogurte', 'doce de', 'compota', 'gelado', 'batido', 'congelad', 'bolo', 'gomas', 'aroma', 'sabor'] },
  blueberries: { all: ['mirtilo'], none: ['iogurte', 'desidratad', 'compota', 'bolo', 'muffin', 'seco', 'sumo'] },
  pineapple: { all: ['ananas'], none: ['lata', 'calda', 'sumo', 'conserva', 'rodelas', 'nectar', 'desidratad'] },
  lf_yogurt: { all: ['iogurte', 'natural'], some: ['sem lactose', 'lactose free', '0% lactose', 'zero lactose'], none: ['aroma', 'sabor', 'morango', 'frutos', 'pedacos', 'liquido', 'grego', 'acucarad']  },
  almond_drink: { all: ['amendoa'], some: ['bebida'], none: ['chocolate', 'baunilha', 'cafe', 'iogurte'] },
  olive_oil: { all: ['azeite'], some: ['virgem'], none: ['spray', 'aromatizado', 'alho', 'malagueta', 'oregaos', 'atum', 'sardinha'] },
  peanut_butter: { all: ['amendoim'], some: ['manteiga', 'creme', 'pasta'], none: ['chocolate', 'barra', 'bolach', 'mel', 'snack'] },
};

/** Does this store product belong to the food? Strict when rules exist, else word overlap. */
export function matchesFood(productName, food) {
  const q = PT_QUERIES[food.id];
  return q ? keywordScore(productName, q) > 0 : looksLike(productName, food);
}
