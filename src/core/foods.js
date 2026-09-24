import { REFERENCE, REFERENCE_DB } from './reference-nutrition.js';

// Food catalogue: nutrition per 100 g (edible, raw or dry as bought), gut notes
// and typical Lisbon supermarket packs.
//
// Prices are ESTIMATES (September 2026, Lisbon, own-brand where possible).
// They are only defaults: the app prefers prices you enter yourself or that it
// finds online (Open Prices, store websites).
//
// buy.sold: 'pack'   -> fixed pack (packG or packUnits) at priceEur
//           'weight' -> sold loose / by weight, priceEur is per kg
//           'unit'   -> sold per piece, priceEur is per piece
// edible: fraction of the purchased weight you actually eat (peel, core, stones), from the
//         refuse % in USDA SR28; unit grams are edible grams per piece (USDA SR28 portions).
// cookedRatio: cooked weight / raw weight, measured from CIQUAL raw vs cooked entries.
// gut.maxG: comfortable portion per meal for sensitive guts.

export const SECTIONS = {
  talho: 'Talho (meat)',
  peixaria: 'Peixaria (fish)',
  congelados: 'Congelados (frozen)',
  refrigerados: 'Ovos e refrigerados (eggs & chilled)',
  frescos: 'Frutas e legumes (fruit & veg)',
  mercearia: 'Mercearia (grocery)',
  padaria: 'Padaria (bread)',
  temperos: 'Temperos (spices & condiments)',
};

export const STORES = {
  mercadona: {
    name: 'Mercadona',
    brand: 'Hacendado',
    online: false,
    url: 'https://www.mercadona.pt/',
    note: 'No online shop in Portugal: prices come from Open Prices or your receipts.',
  },
  pingodoce: {
    name: 'Pingo Doce',
    brand: 'Pingo Doce',
    online: true,
    url: 'https://www.pingodoce.pt/home/produtos',
    searchUrl: (q) =>
      `https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/default/Search-Show?q=${encodeURIComponent(q)}`,
  },
  auchan: {
    name: 'Auchan',
    brand: 'Auchan',
    online: true,
    url: 'https://www.auchan.pt/',
    searchUrl: (q) => `https://www.auchan.pt/pt/pesquisa?q=${encodeURIComponent(q)}`,
  },
};

const PRICE_DATE = '2026-09';

// Nutrition per 100 g comes from the CIQUAL reference table (see reference-nutrition.js),
// never typed in by hand. REF marks a food that uses it.
const REF = Symbol('reference');

function food(id, name, en, section, per100, extra = {}) {
  const ref = per100 === REF ? REFERENCE[id] : null;
  if (per100 === REF && !ref) throw new Error(`No reference nutrition for ${id}`);
  const values = ref ? { kcal: ref.kcal, p: ref.p, f: ref.f, c: ref.c, fib: ref.fib, sugar: ref.sugar, salt: ref.salt } : per100;
  return {
    id,
    name,
    en,
    section,
    per100: { kcal: 0, p: 0, f: 0, c: 0, fib: 0, sugar: 0, salt: 0, ...values },
    source: ref ? { db: `${REFERENCE_DB.name} ${REFERENCE_DB.version.slice(0, 4)}`, code: ref.code, name: ref.name } : null,
    edible: 1,
    unit: null,
    tags: [],
    minPhase: 1,
    gut: { level: 'ok', maxG: null, note: '' },
    cookedRatio: ref?.cooked?.yield ?? null,
    ...extra,
    buy: { sold: 'pack', pantry: false, priceDate: PRICE_DATE, ...(extra.buy || {}) },
  };
}

const ZERO = { kcal: 0, p: 0, f: 0, c: 0, fib: 0 };

// Seasonings: tiny amounts, shown as "to taste" but still counted.
export const isSeasoning = (f) => Boolean(f?.tags?.includes('season'));

export const FOODS = [
  // ---- Protein ----
  food('chicken_breast', 'Peito de frango (filetes)', 'Chicken breast fillets', 'talho',
    REF,
    {
      tags: ['protein'],
      buy: { packG: 1000, packLabel: 'bandeja ~1 kg', priceEur: 6.49, range: [5.99, 7.49], search: 'peito de frango filetes' },
    }),
  food('turkey_steaks', 'Bifes de peru', 'Turkey breast steaks', 'talho',
    REF,
    {
      tags: ['protein'],
      buy: { packG: 600, packLabel: 'bandeja ~600 g', priceEur: 4.49, range: [3.79, 5.39], search: 'bifes de peru' },
    }),
  food('pork_loin', 'Lombo de porco (bifes)', 'Pork loin steaks', 'talho',
    REF,
    {
      tags: ['protein', 'pork'],
      gut: { level: 'ok', maxG: null, note: 'Trim visible fat.' },
      buy: { sold: 'weight', priceEur: 6.49, range: [5.49, 7.99], search: 'lombo de porco' },
    }),
  food('beef_mince_lean', 'Carne picada de novilho magra (≤10% gordura)', 'Lean beef mince (≤10% fat)', 'talho',
    REF,
    {
      tags: ['protein', 'beef'],
      gut: { level: 'ok', maxG: null, note: 'Choose the leanest mince; fattier mince can trigger symptoms.' },
      buy: { packG: 500, packLabel: 'embalagem 500 g', priceEur: 4.49, range: [3.99, 5.49], search: 'carne picada novilho' },
    }),
  food('hake', 'Filetes de pescada (ultracongelados)', 'Frozen hake fillets', 'congelados',
    REF,
    {
      tags: ['protein', 'fish'],
      cookedRatio: 0.83, // CIQUAL/CALNUT 2020: hake raw 26044 → cooked 26120, by protein
      offCategory: null,
      buy: { packG: 1000, packLabel: 'embalagem 1 kg', priceEur: 7.99, range: [6.49, 9.49], search: 'filetes de pescada' },
    }),
  food('cod_desalted', 'Bacalhau demolhado ultracongelado', 'Frozen desalted cod', 'congelados',
    REF,
    {
      tags: ['protein', 'fish'],
      buy: { packG: 1000, packLabel: 'embalagem 1 kg', priceEur: 11.99, range: [9.49, 14.99], search: 'bacalhau demolhado ultracongelado' },
    }),
  food('salmon', 'Salmão (postas)', 'Salmon steaks', 'peixaria',
    REF,
    {
      tags: ['protein', 'fish'],
      minPhase: 2,
      gut: { level: 'portion', maxG: 150, note: 'Oily fish: keep to ~130–150 g and add no extra oil.' },
      buy: { sold: 'weight', priceEur: 14.99, range: [11.99, 17.99], search: 'salmão postas' },
    }),
  food('tuna_water', 'Atum ao natural (escorrido)', 'Canned tuna in water (drained)', 'mercearia',
    REF,
    {
      tags: ['protein', 'fish'],
      buy: { packG: 85, packLabel: 'lata 120 g (≈85 g escorrido)', priceEur: 1.19, range: [0.99, 1.89], search: 'atum ao natural' },
    }),
  food('eggs', 'Ovos (classe M)', 'Eggs (medium)', 'refrigerados',
    REF,
    {
      tags: ['protein', 'egg'],
      unit: { name: 'egg', plural: 'eggs', pt: 'ovo', grams: 51, step: 1 }, // class M 53–63 g in shell, 12% shell (SR28 #01123)
      gut: { level: 'ok', maxG: 153, note: 'Up to 3 whole eggs per meal; use egg whites for extra protein.' },
      buy: { packUnits: 12, packLabel: 'dúzia (12)', priceEur: 3.19, range: [2.89, 3.99], search: 'ovos classe M' },
    }),
  food('egg_whites', 'Claras de ovo pasteurizadas', 'Liquid egg whites', 'refrigerados',
    REF,
    {
      tags: ['protein', 'egg'],
      gut: { level: 'ok', maxG: null, note: 'Not stocked everywhere. No egg whites? Use 1 whole egg per 100 g.' },
      buy: { packG: 500, packLabel: 'embalagem 500 g', priceEur: 2.29, range: [1.79, 2.99], search: 'claras de ovo' },
    }),
  food('turkey_ham', 'Fiambre de peru (≥90% carne)', 'Turkey ham slices', 'refrigerados',
    REF,
    {
      tags: ['protein'],
      gut: { level: 'caution', maxG: 80, note: 'Check the label: many hams contain lactose, milk powder, onion or garlic.' },
      buy: { packG: 200, packLabel: 'embalagem 200 g', priceEur: 2.19, range: [1.69, 2.99], search: 'fiambre de peru' },
    }),

  // ---- Carbohydrates ----
  food('rice_white', 'Arroz agulha', 'Long-grain white rice (dry)', 'mercearia',
    REF,
    {
      tags: ['carb'],
      buy: { packG: 1000, packLabel: 'pacote 1 kg', priceEur: 1.49, range: [0.99, 1.79], search: 'arroz agulha' },
    }),
  food('potatoes', 'Batata', 'Potatoes', 'frescos',
    REF,
    {
      tags: ['carb'],
      edible: 0.75, // peeled; USDA SR28 #11352 refuse 25%
      offCategory: 'en:potatoes',
      buy: { packG: 3000, packLabel: 'saco 3 kg', priceEur: 3.69, range: [2.49, 4.49], search: 'batata para cozer' },
    }),
  food('sweet_potato', 'Batata-doce', 'Sweet potato', 'frescos',
    REF,
    {
      tags: ['carb'],
      minPhase: 2,
      edible: 0.72, // USDA SR28 #11507 refuse 28%
      gut: { level: 'portion', maxG: 100, note: 'Contains mannitol: keep to ~100 g per meal (mix with normal potato).' },
      offCategory: 'en:sweet-potatoes',
      buy: { sold: 'weight', priceEur: 1.99, range: [1.29, 2.49], search: 'batata doce' },
    }),
  food('pasta', 'Massa (esparguete, penne)', 'Wheat pasta (dry)', 'mercearia',
    REF,
    {
      tags: ['carb', 'wheat'],
      minPhase: 2,
      gut: { level: 'portion', maxG: 80, note: 'Wheat contains fructans: moderate portions. If it bothers you, swap for rice or gluten-free pasta.' },
      buy: { packG: 500, packLabel: 'pacote 500 g', priceEur: 0.99, range: [0.69, 1.29], search: 'esparguete' },
    }),
  food('oats', 'Flocos de aveia', 'Rolled oats', 'mercearia',
    REF,
    {
      tags: ['carb'],
      minPhase: 2,
      gut: { level: 'portion', maxG: 50, note: 'Soluble fibre: start with 30–40 g and build up.' },
      buy: { packG: 500, packLabel: 'pacote 500 g', priceEur: 1.19, range: [0.89, 1.49], search: 'flocos de aveia' },
    }),
  food('bread', 'Pão de forma', 'Sliced sandwich bread', 'padaria',
    REF,
    {
      tags: ['carb', 'wheat'],
      unit: { name: 'slice of bread', plural: 'slices of bread', pt: 'fatia', grams: 28, step: 1, approx: true }, // approximate: slices vary by brand
      gut: { level: 'portion', maxG: 84, note: 'Wheat: 2–3 slices per meal. Slow-fermented/sourdough bread is often better tolerated.' },
      buy: { packG: 500, packLabel: 'pacote ~500 g', priceEur: 1.39, range: [0.99, 1.99], search: 'pão de forma' },
    }),
  food('rice_cakes', 'Tortitas de arroz', 'Rice cakes', 'mercearia',
    REF,
    {
      tags: ['carb'],
      unit: { name: 'rice cake', plural: 'rice cakes', pt: 'tortita', grams: 7.5, step: 1, approx: true }, // 130 g pack ≈ 17 cakes
      gut: { level: 'ok', maxG: 45, note: '' },
      buy: { packG: 130, packLabel: 'pacote 130 g', priceEur: 0.99, range: [0.79, 1.29], search: 'tortitas de arroz' },
    }),

  // ---- Fats ----
  food('olive_oil', 'Azeite virgem extra', 'Extra virgin olive oil', 'mercearia',
    REF,
    {
      tags: ['fat'],
      gut: { level: 'portion', maxG: 15, note: 'Measure it: 1 teaspoon = 4.5 g = 40 kcal. Big oily meals can trigger urgency and reflux.' },
      buy: { packG: 920, packLabel: 'garrafa 1 L', priceEur: 5.99, range: [4.79, 7.49], pantry: true, search: 'azeite virgem extra' },
    }),
  food('peanut_butter', 'Manteiga de amendoim 100%', 'Peanut butter (100% peanuts)', 'mercearia',
    REF,
    {
      tags: ['fat'],
      gut: { level: 'portion', maxG: 30, note: 'Calorie-dense: weigh it (1 tablespoon ≈ 15 g).' },
      buy: { packG: 350, packLabel: 'frasco 350 g', priceEur: 2.99, range: [2.29, 3.99], pantry: true, search: 'manteiga de amendoim' },
    }),

  // ---- Vegetables ----
  food('carrots', 'Cenoura', 'Carrots', 'frescos',
    REF,
    {
      tags: ['veg'],
      edible: 0.89, // USDA SR28 #11124 refuse 11%
      offCategory: 'en:carrots',
      buy: { packG: 1000, packLabel: 'saco 1 kg', priceEur: 0.99, range: [0.79, 1.49], search: 'cenoura' },
    }),
  food('courgette', 'Curgete', 'Courgette', 'frescos',
    REF,
    {
      tags: ['veg'],
      edible: 0.95, // USDA SR28 #11477 refuse 5%
      gut: { level: 'portion', maxG: 100, note: 'Well tolerated up to ~1 cup per meal. Peel it in phase 1.' },
      offCategory: 'en:zucchini',
      buy: { sold: 'weight', priceEur: 1.99, range: [1.29, 2.99], search: 'curgete' },
    }),
  food('green_beans', 'Feijão-verde (congelado)', 'Green beans (frozen)', 'congelados',
    REF,
    {
      tags: ['veg'],
      gut: { level: 'portion', maxG: 100, note: 'Fine up to ~100 g per meal.' },
      buy: { packG: 1000, packLabel: 'embalagem 1 kg', priceEur: 2.19, range: [1.79, 2.79], search: 'feijão verde congelado' },
    }),
  food('spinach', 'Espinafres (congelados)', 'Spinach (frozen)', 'congelados',
    REF,
    {
      tags: ['veg'],
      minPhase: 2,
      buy: { packG: 1000, packLabel: 'embalagem 1 kg (porções)', priceEur: 1.99, range: [1.49, 2.49], search: 'espinafres congelados' },
    }),
  food('broccoli', 'Brócolos (congelados)', 'Broccoli florets (frozen)', 'congelados',
    REF,
    {
      tags: ['veg'],
      minPhase: 2,
      gut: { level: 'portion', maxG: 75, note: 'Florets only, ~75 g per meal (the stalks are higher in FODMAPs).' },
      buy: { packG: 1000, packLabel: 'embalagem 1 kg', priceEur: 2.49, range: [1.99, 2.99], search: 'brócolos congelados' },
    }),
  food('red_pepper', 'Pimento vermelho', 'Red bell pepper', 'frescos',
    REF,
    {
      tags: ['veg'],
      minPhase: 2,
      edible: 0.82, // USDA SR28 #11821 refuse 18%
      gut: { level: 'portion', maxG: 50, note: 'Small amounts are fine; large portions add fructose.' },
      buy: { sold: 'weight', priceEur: 2.99, range: [1.99, 3.99], search: 'pimento vermelho' },
    }),
  food('tomato', 'Tomate', 'Tomato', 'frescos',
    REF,
    {
      tags: ['veg', 'acidic'],
      edible: 0.91, // USDA SR28 #11529 refuse 9%
      minPhase: 2,
      gut: { level: 'caution', maxG: 100, note: 'Can worsen reflux in some people.' },
      offCategory: 'en:tomatoes',
      buy: { sold: 'weight', priceEur: 1.99, range: [1.49, 2.99], search: 'tomate' },
    }),
  food('cucumber', 'Pepino', 'Cucumber', 'frescos',
    REF,
    {
      tags: ['veg'],
      edible: 0.97, // USDA SR28 #11205 refuse 3%
      offCategory: 'en:cucumbers',
      buy: { sold: 'weight', priceEur: 1.49, range: [0.99, 1.99], search: 'pepino' },
    }),
  food('lettuce', 'Alface', 'Lettuce', 'frescos',
    REF,
    {
      tags: ['veg'],
      edible: 0.64, // USDA SR28 #11253 refuse 36% (core, outer leaves)
      minPhase: 2,
      buy: { packG: 300, packLabel: '1 alface (~300 g)', priceEur: 0.89, range: [0.69, 1.29], search: 'alface' },
    }),
  food('passata', 'Polpa de tomate', 'Tomato passata', 'mercearia',
    REF,
    {
      tags: ['veg', 'acidic'],
      minPhase: 2,
      gut: { level: 'caution', maxG: 120, note: 'Check there is no onion/garlic in the ingredients. Can worsen reflux.' },
      buy: { packG: 500, packLabel: 'embalagem 500 g', priceEur: 0.79, range: [0.59, 1.19], search: 'polpa de tomate' },
    }),
  food('lemon', 'Limão (sumo)', 'Lemon (juice)', 'frescos',
    REF,
    {
      tags: ['season'],
      unit: { name: 'lemon', plural: 'lemons', pt: 'limão', grams: 48, step: 0.25 }, // juice of 1 lemon (USDA SR28 #09152)
      buy: { sold: 'unit', priceEur: 0.25, range: [0.15, 0.35], search: 'limão' },
    }),

  // ---- Fruit ----
  food('banana', 'Banana (firme, pouco madura)', 'Banana (firm, not overripe)', 'frescos',
    REF,
    {
      tags: ['fruit'],
      edible: 0.64, // USDA SR28 #09040 refuse 36%
      unit: { name: 'banana', plural: 'bananas', pt: 'banana', grams: 118, step: 0.5 }, // medium, peeled (SR28)
      gut: { level: 'ok', maxG: null, note: 'Pick firm bananas: very ripe ones have more fructans.' },
      offCategory: 'en:bananas',
      buy: { sold: 'weight', priceEur: 1.39, range: [1.19, 1.99], search: 'banana' },
    }),
  food('orange', 'Laranja', 'Orange', 'frescos',
    REF,
    {
      tags: ['fruit', 'acidic'],
      edible: 0.73, // USDA SR28 #09200 refuse 27%
      unit: { name: 'orange', plural: 'oranges', pt: 'laranja', grams: 131, step: 1 }, // 1 fruit, peeled (SR28)
      gut: { level: 'caution', maxG: null, note: 'Citrus can worsen reflux: avoid on an empty stomach or late at night.' },
      offCategory: 'en:oranges',
      buy: { sold: 'weight', priceEur: 1.49, range: [0.99, 1.99], search: 'laranja' },
    }),
  food('kiwi', 'Kiwi', 'Kiwi', 'frescos',
    REF,
    {
      tags: ['fruit'],
      edible: 0.76, // USDA SR28 #09148 refuse 24%
      unit: { name: 'kiwi', plural: 'kiwis', pt: 'kiwi', grams: 69, step: 1 }, // 1 fruit, peeled (SR28)
      offCategory: 'en:kiwis',
      buy: { sold: 'weight', priceEur: 2.99, range: [1.99, 3.99], search: 'kiwi' },
    }),
  food('tangerine', 'Tangerina / clementina', 'Tangerine / clementine', 'frescos',
    REF,
    {
      tags: ['fruit'],
      edible: 0.74, // USDA SR28 #09218 refuse 26%
      unit: { name: 'tangerine', plural: 'tangerines', pt: 'tangerina', grams: 76, step: 1 }, // small, peeled (SR28)
      offCategory: 'en:mandarin-oranges',
      buy: { sold: 'weight', priceEur: 1.99, range: [1.29, 2.49], search: 'tangerina' },
    }),
  food('strawberries', 'Morangos', 'Strawberries', 'frescos',
    REF,
    {
      tags: ['fruit'],
      edible: 0.94, // USDA SR28 #09316 refuse 6% (caps)
      minPhase: 2,
      gut: { level: 'ok', maxG: 150, note: '' },
      offCategory: 'en:strawberries',
      buy: { packG: 500, packLabel: 'caixa 500 g', priceEur: 2.49, range: [1.79, 3.49], search: 'morangos' },
    }),
  food('blueberries', 'Mirtilos', 'Blueberries', 'frescos',
    REF,
    {
      tags: ['fruit'],
      edible: 0.95, // USDA SR28 #09050 refuse 5%
      minPhase: 2,
      gut: { level: 'portion', maxG: 100, note: 'Up to a small handful (~100 g) per meal.' },
      buy: { packG: 250, packLabel: 'caixa 250 g', priceEur: 2.99, range: [1.99, 3.99], search: 'mirtilos' },
    }),
  food('pineapple', 'Ananás', 'Pineapple', 'frescos',
    REF,
    {
      tags: ['fruit'],
      minPhase: 2,
      edible: 0.51, // USDA SR28 #09266 refuse 49%
      gut: { level: 'portion', maxG: 140, note: 'About 1 cup per serving.' },
      buy: { sold: 'weight', priceEur: 1.79, range: [1.29, 2.49], search: 'ananás' },
    }),

  // ---- Optional dairy (lactose-free), only if tolerated ----
  food('lf_yogurt', 'Iogurte natural sem lactose', 'Lactose-free plain yogurt', 'refrigerados',
    REF,
    {
      tags: ['dairy_lf'],
      minPhase: 3,
      gut: { level: 'caution', maxG: 250, note: 'Only after a successful test. Choose plain, with no sweeteners or added inulin.' },
      buy: { packG: 500, packLabel: '4 × 125 g', priceEur: 1.49, range: [1.19, 1.99], search: 'iogurte natural sem lactose' },
    }),
  food('almond_drink', 'Bebida de amêndoa sem açúcar', 'Unsweetened almond drink', 'mercearia',
    REF,
    {
      tags: [],
      gut: { level: 'ok', maxG: 250, note: 'Check the label for sweeteners or added fibre (inulin).' },
      buy: { packG: 1000, packLabel: 'pacote 1 L', priceEur: 1.39, range: [0.99, 1.79], search: 'bebida de amêndoa sem açúcar' },
    }),

  // ---- Condiments & seasoning ----
  food('soy_sauce', 'Molho de soja', 'Soy sauce', 'temperos',
    REF,
    {
      tags: ['season'],
      gut: { level: 'ok', maxG: 30, note: '' },
      buy: { packG: 150, packLabel: 'frasco 150 ml', priceEur: 1.49, range: [0.99, 2.49], pantry: true, search: 'molho de soja' },
    }),
  food('paprika', 'Colorau (paprika doce)', 'Sweet paprika', 'temperos', REF,
    { tags: ['season'], buy: { packG: 40, packLabel: 'frasco', priceEur: 0.89, pantry: true, search: 'colorau' } }),
  food('oregano', 'Orégãos', 'Oregano', 'temperos', REF,
    { tags: ['season'], buy: { packG: 10, packLabel: 'frasco', priceEur: 0.89, pantry: true, search: 'orégãos' } }),
  food('cumin', 'Cominhos', 'Ground cumin', 'temperos', REF,
    { tags: ['season'], buy: { packG: 40, packLabel: 'frasco', priceEur: 0.99, pantry: true, search: 'cominhos' } }),
  food('bay_leaf', 'Louro', 'Bay leaves', 'temperos', REF,
    { tags: ['season'], buy: { packG: 10, packLabel: 'frasco', priceEur: 0.79, pantry: true, search: 'louro folhas' } }),
  food('cinnamon', 'Canela', 'Cinnamon', 'temperos', REF,
    { tags: ['season'], buy: { packG: 40, packLabel: 'frasco', priceEur: 0.99, pantry: true, search: 'canela' } }),
  food('chives', 'Cebolinho (só a parte verde)', 'Chives / green part of spring onion', 'frescos', REF,
    {
      tags: ['season'],
      gut: { level: 'ok', maxG: null, note: 'The green part gives an onion flavour without the fructans.' },
      buy: { packG: 25, packLabel: 'molho', priceEur: 0.99, pantry: true, search: 'cebolinho' },
    }),
  food('parsley', 'Salsa', 'Parsley', 'frescos', REF,
    { tags: ['season'], buy: { packG: 30, packLabel: 'molho', priceEur: 0.79, pantry: true, search: 'salsa' } }),
  food('garlic_for_oil', 'Alho (só para aromatizar o azeite)', 'Garlic (only to flavour oil, then discard)', 'frescos', ZERO,
    {
      tags: ['season'],
      gut: { level: 'caution', maxG: null, note: 'Fry sliced garlic in the oil for 1–2 min, then remove every piece. The fructans do not pass into the oil. Make it fresh each time.' },
      buy: { packG: 250, packLabel: 'rede', priceEur: 1.29, pantry: true, search: 'alho' },
    }),
];

export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));

export function getFood(id) {
  return FOOD_BY_ID[id] || null;
}

// Label values of the products you buy (see labels.js) replace the reference values.
let overrides = {};

export function setNutritionOverrides(map = {}) {
  overrides = map || {};
}

/** Nutrition per 100 g used for planning: your product's label when known, else CIQUAL. */
export function nutritionOf(foodOrId) {
  const f = typeof foodOrId === 'string' ? FOOD_BY_ID[foodOrId] : foodOrId;
  return overrides[f?.id]?.per100 || f?.per100 || ZERO;
}

/** Where the numbers come from: { kind: 'label', store, name, url } | { kind: 'reference', db, code, name } */
export function nutritionSource(foodOrId) {
  const f = typeof foodOrId === 'string' ? FOOD_BY_ID[foodOrId] : foodOrId;
  if (overrides[f?.id]) return overrides[f.id].source;
  return f?.source ? { kind: 'reference', ...f.source } : null;
}

export function macrosFor(foodOrId, grams) {
  const f = typeof foodOrId === 'string' ? FOOD_BY_ID[foodOrId] : foodOrId;
  if (!f) return { kcal: 0, p: 0, f: 0, c: 0, fib: 0 };
  const n = nutritionOf(f);
  const k = grams / 100;
  return {
    kcal: n.kcal * k,
    p: n.p * k,
    f: n.f * k,
    c: n.c * k,
    fib: (n.fib || 0) * k,
  };
}

const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

export function formatCount(n) {
  const whole = Math.floor(n + 1e-9);
  const frac = Math.round((n - whole) * 100) / 100;
  if (frac === 0) return String(whole);
  const sym = FRACTIONS[frac];
  if (sym) return whole ? `${whole}${sym}` : sym;
  return String(Math.round(n * 10) / 10);
}

// How each food is weighed in the recipes (and what its nutrition refers to).
const WEIGHED = {
  chicken_breast: 'raw', turkey_steaks: 'raw', pork_loin: 'raw', beef_mince_lean: 'raw', hake: 'raw, frozen', cod_desalted: 'raw',
  salmon: 'raw', tuna_water: 'drained', rice_white: 'dry', pasta: 'dry', oats: 'dry', potatoes: 'raw, peeled', sweet_potato: 'raw, peeled',
  carrots: 'raw, peeled', courgette: 'raw', green_beans: 'frozen', spinach: 'frozen', broccoli: 'frozen', red_pepper: 'raw, seeded',
  tomato: 'raw', cucumber: 'raw', lettuce: 'raw', pineapple: 'peeled',
};
export const weighedAs = (f) => WEIGHED[f.id] || '';

// Short English name: "Long-grain white rice (dry)" → "Long-grain white rice".
export const plainName = (f) => f.en.replace(/\s*\([^)]*\)/g, '').trim();

export function unitLabel(f, n) {
  return n <= 1 ? f.unit.name : f.unit.plural;
}

/**
 * An amount in parts, for display:
 *   qty    "150 g" | "2 eggs" | "1 tsp" | "to taste"
 *   grams  "102 g" when qty is in pieces or spoons
 *   state  "raw" | "dry" | "drained" | …
 *   cooked "≈ 115 g cooked" (weight change measured from CIQUAL raw vs cooked)
 */
export function amountParts(f, grams) {
  const g = Math.round(grams);
  if (f.unit) {
    const n = grams / f.unit.grams;
    return { qty: `${f.unit.approx ? '≈ ' : ''}${formatCount(n)} ${unitLabel(f, n)}`, grams: `${g} g`, state: weighedAs(f), cooked: '' };
  }
  if (f.id === 'olive_oil') {
    const tsp = Math.max(0.5, Math.round((grams / 4.5) * 2) / 2);
    return { qty: `${g} g`, grams: `≈ ${formatCount(tsp)} tsp`, state: '', cooked: '' };
  }
  if (isSeasoning(f)) return { qty: grams >= 5 ? `${g} g` : 'to taste', grams: '', state: '', cooked: '' };
  const cooked = f.cookedRatio && Math.abs(f.cookedRatio - 1) >= 0.05 ? `≈ ${Math.round((grams * f.cookedRatio) / 5) * 5} g cooked` : '';
  return { qty: `${g} g`, grams: '', state: weighedAs(f), cooked };
}

// One-line amount, e.g. "150 g raw (≈ 115 g cooked)", "2 eggs (102 g)", "5 g (≈ 1 tsp)".
export function describeAmount(f, grams) {
  const a = amountParts(f, grams);
  const extra = [a.grams, a.cooked].filter(Boolean).join(', ');
  return `${a.qty}${a.state && !f.unit ? ` ${a.state}` : ''}${extra ? ` (${extra})` : ''}`;
}
