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
// edible: fraction of the purchased weight you actually eat (peel, skin).
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

function food(id, name, en, section, per100, extra = {}) {
  return {
    id,
    name,
    en,
    section,
    per100: { kcal: 0, p: 0, f: 0, c: 0, fib: 0, ...per100 },
    edible: 1,
    unit: null,
    tags: [],
    minPhase: 1,
    gut: { level: 'ok', maxG: null, note: '' },
    cookedRatio: null,
    ...extra,
    buy: { sold: 'pack', pantry: false, priceDate: PRICE_DATE, ...(extra.buy || {}) },
  };
}

const ZERO = { kcal: 0, p: 0, f: 0, c: 0, fib: 0 };

export const FOODS = [
  // ---- Protein ----
  food('chicken_breast', 'Peito de frango (filetes)', 'Chicken breast fillets', 'talho',
    { kcal: 112, p: 23.3, f: 1.9 },
    {
      tags: ['protein'],
      cookedRatio: 0.75,
      buy: { packG: 1000, packLabel: 'bandeja ~1 kg', priceEur: 6.49, range: [5.99, 7.49], search: 'peito de frango filetes' },
    }),
  food('turkey_steaks', 'Bifes de peru', 'Turkey breast steaks', 'talho',
    { kcal: 107, p: 24.0, f: 1.2 },
    {
      tags: ['protein'],
      cookedRatio: 0.75,
      buy: { packG: 600, packLabel: 'bandeja ~600 g', priceEur: 4.49, range: [3.79, 5.39], search: 'bifes de peru' },
    }),
  food('pork_loin', 'Lombo de porco (bifes)', 'Pork loin steaks', 'talho',
    { kcal: 143, p: 21.2, f: 6.3 },
    {
      tags: ['protein', 'pork'],
      cookedRatio: 0.72,
      gut: { level: 'ok', maxG: null, note: 'Trim visible fat.' },
      buy: { sold: 'weight', priceEur: 6.49, range: [5.49, 7.99], search: 'lombo de porco' },
    }),
  food('beef_mince_lean', 'Carne picada de novilho magra (≤10% gordura)', 'Lean beef mince (≤10% fat)', 'talho',
    { kcal: 176, p: 20.0, f: 10.0 },
    {
      tags: ['protein', 'beef'],
      cookedRatio: 0.72,
      gut: { level: 'ok', maxG: null, note: 'Choose the leanest mince; fattier mince can trigger symptoms.' },
      buy: { packG: 500, packLabel: 'embalagem 500 g', priceEur: 4.49, range: [3.99, 5.49], search: 'carne picada novilho' },
    }),
  food('hake', 'Filetes de pescada (ultracongelados)', 'Frozen hake fillets', 'congelados',
    { kcal: 76, p: 17.0, f: 0.9 },
    {
      tags: ['protein', 'fish'],
      cookedRatio: 0.8,
      offCategory: null,
      buy: { packG: 1000, packLabel: 'embalagem 1 kg', priceEur: 7.99, range: [6.49, 9.49], search: 'filetes de pescada' },
    }),
  food('cod_desalted', 'Bacalhau demolhado ultracongelado', 'Frozen desalted cod', 'congelados',
    { kcal: 84, p: 19.5, f: 0.6 },
    {
      tags: ['protein', 'fish'],
      cookedRatio: 0.8,
      buy: { packG: 1000, packLabel: 'embalagem 1 kg', priceEur: 11.99, range: [9.49, 14.99], search: 'bacalhau demolhado ultracongelado' },
    }),
  food('salmon', 'Salmão (postas)', 'Salmon steaks', 'peixaria',
    { kcal: 208, p: 20.4, f: 13.4 },
    {
      tags: ['protein', 'fish'],
      minPhase: 2,
      cookedRatio: 0.8,
      gut: { level: 'portion', maxG: 150, note: 'Oily fish: keep to ~130–150 g and add no extra oil.' },
      buy: { sold: 'weight', priceEur: 14.99, range: [11.99, 17.99], search: 'salmão postas' },
    }),
  food('tuna_water', 'Atum ao natural (escorrido)', 'Canned tuna in water (drained)', 'mercearia',
    { kcal: 108, p: 25.0, f: 0.8 },
    {
      tags: ['protein', 'fish'],
      buy: { packG: 85, packLabel: 'lata 120 g (≈85 g escorrido)', priceEur: 1.19, range: [0.99, 1.89], search: 'atum ao natural' },
    }),
  food('eggs', 'Ovos (classe M)', 'Eggs (medium)', 'refrigerados',
    { kcal: 143, p: 12.6, f: 9.5, c: 0.7 },
    {
      tags: ['protein', 'egg'],
      unit: { name: 'ovo', plural: 'ovos', grams: 52, step: 1 },
      gut: { level: 'ok', maxG: 156, note: 'Up to 3 whole eggs per meal; use egg whites for extra protein.' },
      buy: { packUnits: 12, packLabel: 'dúzia (12)', priceEur: 3.19, range: [2.89, 3.99], search: 'ovos classe M' },
    }),
  food('egg_whites', 'Claras de ovo pasteurizadas', 'Liquid egg whites', 'refrigerados',
    { kcal: 48, p: 10.9, f: 0.2, c: 0.7 },
    {
      tags: ['protein', 'egg'],
      gut: { level: 'ok', maxG: null, note: 'Not stocked everywhere. No egg whites? Use 1 whole egg per 100 g.' },
      buy: { packG: 500, packLabel: 'embalagem 500 g', priceEur: 2.29, range: [1.79, 2.99], search: 'claras de ovo' },
    }),
  food('turkey_ham', 'Fiambre de peru (≥90% carne)', 'Turkey ham slices', 'refrigerados',
    { kcal: 103, p: 19.0, f: 2.0, c: 2.0 },
    {
      tags: ['protein'],
      gut: { level: 'caution', maxG: 80, note: 'Check the label: many hams contain lactose, milk powder, onion or garlic.' },
      buy: { packG: 200, packLabel: 'embalagem 200 g', priceEur: 2.19, range: [1.69, 2.99], search: 'fiambre de peru' },
    }),

  // ---- Carbohydrates ----
  food('rice_white', 'Arroz agulha', 'Long-grain white rice (dry)', 'mercearia',
    { kcal: 358, p: 7.0, f: 0.6, c: 79.0, fib: 1.3 },
    {
      tags: ['carb'],
      cookedRatio: 2.8,
      buy: { packG: 1000, packLabel: 'pacote 1 kg', priceEur: 1.49, range: [0.99, 1.79], search: 'arroz agulha' },
    }),
  food('potatoes', 'Batata', 'Potatoes', 'frescos',
    { kcal: 77, p: 2.0, f: 0.1, c: 17.0, fib: 2.1 },
    {
      tags: ['carb'],
      edible: 0.85,
      cookedRatio: 1,
      offCategory: 'en:potatoes',
      buy: { packG: 3000, packLabel: 'saco 3 kg', priceEur: 3.69, range: [2.49, 4.49], search: 'batata para cozer' },
    }),
  food('sweet_potato', 'Batata-doce', 'Sweet potato', 'frescos',
    { kcal: 86, p: 1.6, f: 0.1, c: 20.1, fib: 3.0 },
    {
      tags: ['carb'],
      minPhase: 2,
      edible: 0.85,
      gut: { level: 'portion', maxG: 100, note: 'Contains mannitol: keep to ~100 g per meal (mix with normal potato).' },
      offCategory: 'en:sweet-potatoes',
      buy: { sold: 'weight', priceEur: 1.99, range: [1.29, 2.49], search: 'batata doce' },
    }),
  food('pasta', 'Massa (esparguete, penne)', 'Wheat pasta (dry)', 'mercearia',
    { kcal: 357, p: 12.5, f: 1.5, c: 71.0, fib: 3.0 },
    {
      tags: ['carb', 'wheat'],
      minPhase: 2,
      cookedRatio: 2.4,
      gut: { level: 'portion', maxG: 80, note: 'Wheat contains fructans: moderate portions. If it bothers you, swap for rice or gluten-free pasta.' },
      buy: { packG: 500, packLabel: 'pacote 500 g', priceEur: 0.99, range: [0.69, 1.29], search: 'esparguete' },
    }),
  food('oats', 'Flocos de aveia', 'Rolled oats', 'mercearia',
    { kcal: 372, p: 13.5, f: 7.0, c: 58.7, fib: 10.0 },
    {
      tags: ['carb'],
      minPhase: 2,
      gut: { level: 'portion', maxG: 50, note: 'Soluble fibre: start with 30–40 g and build up.' },
      buy: { packG: 500, packLabel: 'pacote 500 g', priceEur: 1.19, range: [0.89, 1.49], search: 'flocos de aveia' },
    }),
  food('bread', 'Pão de forma', 'Sliced sandwich bread', 'padaria',
    { kcal: 262, p: 8.5, f: 3.5, c: 47.5, fib: 3.0 },
    {
      tags: ['carb', 'wheat'],
      unit: { name: 'fatia', plural: 'fatias', grams: 28, step: 1 },
      gut: { level: 'portion', maxG: 84, note: 'Wheat: 2–3 slices per meal. Slow-fermented/sourdough bread is often better tolerated.' },
      buy: { packG: 500, packLabel: 'pacote ~500 g', priceEur: 1.39, range: [0.99, 1.99], search: 'pão de forma' },
    }),
  food('rice_cakes', 'Tortitas de arroz', 'Rice cakes', 'mercearia',
    { kcal: 387, p: 8.0, f: 2.8, c: 81.0, fib: 3.0 },
    {
      tags: ['carb'],
      unit: { name: 'tortita', plural: 'tortitas', grams: 7.5, step: 1 },
      gut: { level: 'ok', maxG: 45, note: '' },
      buy: { packG: 130, packLabel: 'pacote 130 g', priceEur: 0.99, range: [0.79, 1.29], search: 'tortitas de arroz' },
    }),

  // ---- Fats ----
  food('olive_oil', 'Azeite virgem extra', 'Extra virgin olive oil', 'mercearia',
    { kcal: 884, f: 100 },
    {
      tags: ['fat'],
      gut: { level: 'portion', maxG: 15, note: 'Measure it: 1 teaspoon = 4.5 g = 40 kcal. Big oily meals can trigger urgency and reflux.' },
      buy: { packG: 920, packLabel: 'garrafa 1 L', priceEur: 5.99, range: [4.79, 7.49], pantry: true, search: 'azeite virgem extra' },
    }),
  food('peanut_butter', 'Manteiga de amendoim 100%', 'Peanut butter (100% peanuts)', 'mercearia',
    { kcal: 600, p: 25.0, f: 50.0, c: 12.0, fib: 7.0 },
    {
      tags: ['fat'],
      gut: { level: 'portion', maxG: 30, note: 'Calorie-dense: weigh it (1 tablespoon ≈ 15 g).' },
      buy: { packG: 350, packLabel: 'frasco 350 g', priceEur: 2.99, range: [2.29, 3.99], pantry: true, search: 'manteiga de amendoim' },
    }),

  // ---- Vegetables ----
  food('carrots', 'Cenoura', 'Carrots', 'frescos',
    { kcal: 41, p: 0.9, f: 0.2, c: 9.6, fib: 2.8 },
    {
      tags: ['veg'],
      edible: 0.9,
      offCategory: 'en:carrots',
      buy: { packG: 1000, packLabel: 'saco 1 kg', priceEur: 0.99, range: [0.79, 1.49], search: 'cenoura' },
    }),
  food('courgette', 'Curgete', 'Courgette', 'frescos',
    { kcal: 17, p: 1.2, f: 0.3, c: 3.1, fib: 1.0 },
    {
      tags: ['veg'],
      edible: 0.95,
      gut: { level: 'portion', maxG: 100, note: 'Well tolerated up to ~1 cup per meal. Peel it in phase 1.' },
      offCategory: 'en:zucchini',
      buy: { sold: 'weight', priceEur: 1.99, range: [1.29, 2.99], search: 'curgete' },
    }),
  food('green_beans', 'Feijão-verde (congelado)', 'Green beans (frozen)', 'congelados',
    { kcal: 31, p: 1.8, f: 0.2, c: 7.0, fib: 2.7 },
    {
      tags: ['veg'],
      gut: { level: 'portion', maxG: 100, note: 'Fine up to ~100 g per meal.' },
      buy: { packG: 1000, packLabel: 'embalagem 1 kg', priceEur: 2.19, range: [1.79, 2.79], search: 'feijão verde congelado' },
    }),
  food('spinach', 'Espinafres (congelados)', 'Spinach (frozen)', 'congelados',
    { kcal: 25, p: 3.0, f: 0.4, c: 3.6, fib: 2.4 },
    {
      tags: ['veg'],
      minPhase: 2,
      buy: { packG: 1000, packLabel: 'embalagem 1 kg (porções)', priceEur: 1.99, range: [1.49, 2.49], search: 'espinafres congelados' },
    }),
  food('broccoli', 'Brócolos (congelados)', 'Broccoli florets (frozen)', 'congelados',
    { kcal: 34, p: 2.8, f: 0.4, c: 7.0, fib: 2.6 },
    {
      tags: ['veg'],
      minPhase: 2,
      gut: { level: 'portion', maxG: 75, note: 'Florets only, ~75 g per meal (the stalks are higher in FODMAPs).' },
      buy: { packG: 1000, packLabel: 'embalagem 1 kg', priceEur: 2.49, range: [1.99, 2.99], search: 'brócolos congelados' },
    }),
  food('red_pepper', 'Pimento vermelho', 'Red bell pepper', 'frescos',
    { kcal: 31, p: 1.0, f: 0.3, c: 6.0, fib: 2.1 },
    {
      tags: ['veg'],
      minPhase: 2,
      edible: 0.85,
      gut: { level: 'portion', maxG: 50, note: 'Small amounts are fine; large portions add fructose.' },
      buy: { sold: 'weight', priceEur: 2.99, range: [1.99, 3.99], search: 'pimento vermelho' },
    }),
  food('tomato', 'Tomate', 'Tomato', 'frescos',
    { kcal: 18, p: 0.9, f: 0.2, c: 3.9, fib: 1.2 },
    {
      tags: ['veg', 'acidic'],
      minPhase: 2,
      gut: { level: 'caution', maxG: 100, note: 'Can worsen reflux in some people.' },
      offCategory: 'en:tomatoes',
      buy: { sold: 'weight', priceEur: 1.99, range: [1.49, 2.99], search: 'tomate' },
    }),
  food('cucumber', 'Pepino', 'Cucumber', 'frescos',
    { kcal: 15, p: 0.7, f: 0.1, c: 3.6, fib: 0.5 },
    {
      tags: ['veg'],
      offCategory: 'en:cucumbers',
      buy: { sold: 'weight', priceEur: 1.49, range: [0.99, 1.99], search: 'pepino' },
    }),
  food('lettuce', 'Alface', 'Lettuce', 'frescos',
    { kcal: 15, p: 1.4, f: 0.2, c: 2.9, fib: 1.3 },
    {
      tags: ['veg'],
      minPhase: 2,
      buy: { packG: 300, packLabel: '1 alface (~300 g)', priceEur: 0.89, range: [0.69, 1.29], search: 'alface' },
    }),
  food('passata', 'Polpa de tomate', 'Tomato passata', 'mercearia',
    { kcal: 30, p: 1.3, f: 0.2, c: 5.5, fib: 1.5 },
    {
      tags: ['veg', 'acidic'],
      minPhase: 2,
      gut: { level: 'caution', maxG: 120, note: 'Check there is no onion/garlic in the ingredients. Can worsen reflux.' },
      buy: { packG: 500, packLabel: 'embalagem 500 g', priceEur: 0.79, range: [0.59, 1.19], search: 'polpa de tomate' },
    }),
  food('lemon', 'Limão (sumo)', 'Lemon (juice)', 'frescos',
    { kcal: 22, p: 0.4, f: 0.2, c: 6.9, fib: 0.3 },
    {
      tags: ['season'],
      unit: { name: 'limão', plural: 'limões', grams: 30, step: 0.25 },
      buy: { sold: 'unit', priceEur: 0.25, range: [0.15, 0.35], search: 'limão' },
    }),

  // ---- Fruit ----
  food('banana', 'Banana (firme, pouco madura)', 'Banana (firm, not overripe)', 'frescos',
    { kcal: 89, p: 1.1, f: 0.3, c: 22.8, fib: 2.6 },
    {
      tags: ['fruit'],
      edible: 0.65,
      unit: { name: 'banana', plural: 'bananas', grams: 120, step: 0.5 },
      gut: { level: 'ok', maxG: null, note: 'Pick firm bananas: very ripe ones have more fructans.' },
      offCategory: 'en:bananas',
      buy: { sold: 'weight', priceEur: 1.39, range: [1.19, 1.99], search: 'banana' },
    }),
  food('orange', 'Laranja', 'Orange', 'frescos',
    { kcal: 47, p: 0.9, f: 0.1, c: 11.8, fib: 2.4 },
    {
      tags: ['fruit', 'acidic'],
      edible: 0.72,
      unit: { name: 'laranja', plural: 'laranjas', grams: 140, step: 1 },
      gut: { level: 'caution', maxG: null, note: 'Citrus can worsen reflux: avoid on an empty stomach or late at night.' },
      offCategory: 'en:oranges',
      buy: { sold: 'weight', priceEur: 1.49, range: [0.99, 1.99], search: 'laranja' },
    }),
  food('kiwi', 'Kiwi', 'Kiwi', 'frescos',
    { kcal: 61, p: 1.1, f: 0.5, c: 14.7, fib: 3.0 },
    {
      tags: ['fruit'],
      edible: 0.87,
      unit: { name: 'kiwi', plural: 'kiwis', grams: 75, step: 1 },
      offCategory: 'en:kiwis',
      buy: { sold: 'weight', priceEur: 2.99, range: [1.99, 3.99], search: 'kiwi' },
    }),
  food('tangerine', 'Tangerina / clementina', 'Tangerine / clementine', 'frescos',
    { kcal: 53, p: 0.8, f: 0.3, c: 13.3, fib: 1.8 },
    {
      tags: ['fruit'],
      edible: 0.75,
      unit: { name: 'tangerina', plural: 'tangerinas', grams: 70, step: 1 },
      offCategory: 'en:mandarin-oranges',
      buy: { sold: 'weight', priceEur: 1.99, range: [1.29, 2.49], search: 'tangerina' },
    }),
  food('strawberries', 'Morangos', 'Strawberries', 'frescos',
    { kcal: 32, p: 0.7, f: 0.3, c: 7.7, fib: 2.0 },
    {
      tags: ['fruit'],
      minPhase: 2,
      gut: { level: 'ok', maxG: 150, note: '' },
      offCategory: 'en:strawberries',
      buy: { packG: 500, packLabel: 'caixa 500 g', priceEur: 2.49, range: [1.79, 3.49], search: 'morangos' },
    }),
  food('blueberries', 'Mirtilos', 'Blueberries', 'frescos',
    { kcal: 57, p: 0.7, f: 0.3, c: 14.5, fib: 2.4 },
    {
      tags: ['fruit'],
      minPhase: 2,
      gut: { level: 'portion', maxG: 100, note: 'Up to a small handful (~100 g) per meal.' },
      buy: { packG: 250, packLabel: 'caixa 250 g', priceEur: 2.99, range: [1.99, 3.99], search: 'mirtilos' },
    }),
  food('pineapple', 'Ananás', 'Pineapple', 'frescos',
    { kcal: 50, p: 0.5, f: 0.1, c: 13.1, fib: 1.4 },
    {
      tags: ['fruit'],
      minPhase: 2,
      edible: 0.55,
      gut: { level: 'portion', maxG: 140, note: 'About 1 cup per serving.' },
      buy: { sold: 'weight', priceEur: 1.79, range: [1.29, 2.49], search: 'ananás' },
    }),

  // ---- Optional dairy (lactose-free), only if tolerated ----
  food('lf_yogurt', 'Iogurte natural sem lactose', 'Lactose-free plain yogurt', 'refrigerados',
    { kcal: 62, p: 4.0, f: 3.0, c: 4.8 },
    {
      tags: ['dairy_lf'],
      minPhase: 3,
      gut: { level: 'caution', maxG: 250, note: 'Only after a successful test. Choose plain, with no sweeteners or added inulin.' },
      buy: { packG: 500, packLabel: '4 × 125 g', priceEur: 1.49, range: [1.19, 1.99], search: 'iogurte natural sem lactose' },
    }),
  food('almond_drink', 'Bebida de amêndoa sem açúcar', 'Unsweetened almond drink', 'mercearia',
    { kcal: 14, p: 0.5, f: 1.1, c: 0.1, fib: 0.3 },
    {
      tags: [],
      gut: { level: 'ok', maxG: 250, note: 'Check the label for sweeteners or added fibre (inulin).' },
      buy: { packG: 1000, packLabel: 'pacote 1 L', priceEur: 1.39, range: [0.99, 1.79], search: 'bebida de amêndoa sem açúcar' },
    }),

  // ---- Condiments & seasoning ----
  food('soy_sauce', 'Molho de soja', 'Soy sauce', 'temperos',
    { kcal: 53, p: 8.1, f: 0.6, c: 4.9 },
    {
      tags: ['season'],
      gut: { level: 'ok', maxG: 30, note: '' },
      buy: { packG: 150, packLabel: 'frasco 150 ml', priceEur: 1.49, range: [0.99, 2.49], pantry: true, search: 'molho de soja' },
    }),
  food('paprika', 'Colorau (paprika doce)', 'Sweet paprika', 'temperos', ZERO,
    { tags: ['season'], buy: { packG: 40, packLabel: 'frasco', priceEur: 0.89, pantry: true, search: 'colorau' } }),
  food('oregano', 'Orégãos', 'Oregano', 'temperos', ZERO,
    { tags: ['season'], buy: { packG: 10, packLabel: 'frasco', priceEur: 0.89, pantry: true, search: 'orégãos' } }),
  food('cumin', 'Cominhos', 'Ground cumin', 'temperos', ZERO,
    { tags: ['season'], buy: { packG: 40, packLabel: 'frasco', priceEur: 0.99, pantry: true, search: 'cominhos' } }),
  food('bay_leaf', 'Louro', 'Bay leaves', 'temperos', ZERO,
    { tags: ['season'], buy: { packG: 10, packLabel: 'frasco', priceEur: 0.79, pantry: true, search: 'louro folhas' } }),
  food('cinnamon', 'Canela', 'Cinnamon', 'temperos', ZERO,
    { tags: ['season'], buy: { packG: 40, packLabel: 'frasco', priceEur: 0.99, pantry: true, search: 'canela' } }),
  food('chives', 'Cebolinho (só a parte verde)', 'Chives / green part of spring onion', 'frescos', ZERO,
    {
      tags: ['season'],
      gut: { level: 'ok', maxG: null, note: 'The green part gives an onion flavour without the fructans.' },
      buy: { packG: 25, packLabel: 'molho', priceEur: 0.99, pantry: true, search: 'cebolinho' },
    }),
  food('parsley', 'Salsa', 'Parsley', 'frescos', ZERO,
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

export function macrosFor(foodOrId, grams) {
  const f = typeof foodOrId === 'string' ? FOOD_BY_ID[foodOrId] : foodOrId;
  if (!f) return { kcal: 0, p: 0, f: 0, c: 0, fib: 0 };
  const k = grams / 100;
  return {
    kcal: f.per100.kcal * k,
    p: f.per100.p * k,
    f: f.per100.f * k,
    c: f.per100.c * k,
    fib: f.per100.fib * k,
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

// Human-readable amount, e.g. "2 ovos (104 g)", "70 g (≈ 195 g cooked)", "5 g (≈ 1 colher de chá)".
export function describeAmount(f, grams) {
  if (f.unit) {
    const n = grams / f.unit.grams;
    return `${formatCount(n)} ${n <= 1 ? f.unit.name : f.unit.plural} (${Math.round(grams)} g)`;
  }
  if (f.id === 'olive_oil') {
    const tsp = grams / 4.5;
    return `${Math.round(grams)} g (≈ ${tsp < 1.25 ? '1' : (Math.round(tsp * 2) / 2).toString()} colher de chá)`;
  }
  if (f.per100.kcal === 0) return 'to taste';
  const cooked = f.cookedRatio && f.cookedRatio !== 1 ? ` (≈ ${Math.round((grams * f.cookedRatio) / 5) * 5} g cooked)` : '';
  return `${Math.round(grams)} g${cooked}`;
}
