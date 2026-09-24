// Gut helpers: label scanner for known triggers, symptom scoring and a simple
// "possible trigger" finder over the food diary.

import { addDays, dateRange } from './dates.js';
import { FOOD_BY_ID } from './foods.js';

export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

const hasPhrase = (norm, phrase) => ` ${norm} `.includes(` ${phrase} `);

// Phrases removed before matching so they do not cause false alarms.
const NOT_DAIRY = [
  'manteiga de amendoim', 'manteiga de cacau', 'manteiga de karite', 'leite de coco', 'leite de amendoa',
  'leite de soja', 'leite de aveia', 'leite de arroz', 'coconut milk', 'cocoa butter', 'peanut butter',
  'leche de coco', 'mantequilla de cacahuete', 'manteca de cacao', 'beurre de cacao',
];
const NOT_LEGUMES = ['feijao verde', 'judias verdes', 'green beans', 'haricots verts'];
const ADVISORY = ['pode conter', 'podera conter', 'may contain', 'puede contener', 'peut contenir', 'vestigios', 'tracos de', 'trazas de', 'traces of'];
const LACTOSE_FREE = ['sem lactose', 'isento de lactose', 'sin lactosa', 'lactose free', 'lactose free milk', 'sans lactose', '0% lactose'];

export const TRIGGERS = [
  {
    id: 'lactose',
    label: 'Milk / lactose',
    setting: 'dairy',
    severity: 'avoid',
    terms: [
      'leite', 'lactose', 'soro de leite', 'soro de leite em po', 'lactosoro', 'leitelho', 'natas', 'nata', 'queijo',
      'iogurte', 'manteiga', 'leite em po', 'proteinas do leite', 'proteina do leite', 'proteina de soro de leite',
      'leche', 'lactosa', 'suero de leche', 'lactosuero', 'queso', 'yogur', 'mantequilla', 'nata montada',
      'milk', 'whey', 'cream', 'cheese', 'butter', 'buttermilk', 'yoghurt', 'yogurt', 'milk powder',
      'lait', 'lactoserum', 'fromage', 'beurre',
    ],
    allergens: ['en:milk'],
    additives: [],
  },
  {
    id: 'polyols',
    label: 'Sugar alcohols (polyols)',
    setting: 'polyols',
    severity: 'avoid',
    terms: [
      'sorbitol', 'manitol', 'mannitol', 'maltitol', 'xilitol', 'xylitol', 'isomalte', 'isomalt', 'eritritol',
      'erythritol', 'lactitol', 'poliois', 'polyols', 'polialcoois', 'xarope de maltitol', 'xarope de sorbitol',
    ],
    additives: ['en:e420', 'en:e421', 'en:e953', 'en:e965', 'en:e966', 'en:e967', 'en:e968'],
  },
  {
    id: 'sweeteners',
    label: 'Artificial sweeteners',
    setting: 'sweeteners',
    severity: 'avoid',
    terms: [
      'sucralose', 'sucralosa', 'acessulfame', 'acesulfame', 'acessulfame k', 'acesulfame k', 'aspartame', 'aspartamo',
      'sacarina', 'saccharin', 'ciclamato', 'cyclamate', 'neotame', 'advantame', 'glicosidos de esteviol',
      'glicosideos de esteviol', 'glucosidos de esteviol', 'steviol glycosides', 'stevia', 'edulcorante', 'edulcorantes',
      'sweetener', 'sweeteners',
    ],
    additives: ['en:e950', 'en:e951', 'en:e952', 'en:e954', 'en:e955', 'en:e960', 'en:e960a', 'en:e961', 'en:e962', 'en:e969'],
  },
  {
    id: 'onion_garlic',
    label: 'Onion / garlic / leek',
    setting: 'onionGarlic',
    severity: 'avoid',
    terms: [
      'cebola', 'cebolas', 'cebola em po', 'alho', 'alhos', 'alho em po', 'alho frances', 'alho porro', 'chalota', 'chalotas',
      'echalota', 'onion', 'onions', 'onion powder', 'garlic', 'garlic powder', 'shallot', 'shallots', 'leek', 'leeks',
      'cebolla', 'ajo', 'ajos', 'puerro', 'oignon', 'ail', 'poireau',
    ],
    additives: [],
  },
  {
    id: 'fructans_fibre',
    label: 'Added fibre / inulin (fructans)',
    setting: 'addedFibre',
    severity: 'caution',
    terms: [
      'inulina', 'inulin', 'fibra de chicoria', 'raiz de chicoria', 'chicoria', 'chicory', 'chicory root fibre',
      'frutooligossacaridos', 'fruto oligossacaridos', 'fructooligosaccharides', 'fos', 'oligofrutose',
      'oligofructose', 'polidextrose', 'polydextrose', 'fibra de trigo soluvel',
    ],
    additives: ['en:e1200'],
  },
  {
    id: 'fructose',
    label: 'Excess fructose (honey, agave, HFCS)',
    setting: 'fructose',
    severity: 'caution',
    terms: [
      'xarope de glicose frutose', 'xarope de frutose glicose', 'xarope de frutose', 'frutose', 'fructose', 'mel', 'honey',
      'miel', 'agave', 'xarope de agave', 'sumo de maca', 'sumo concentrado de maca', 'sumo de pera', 'apple juice',
      'jarabe de glucosa y fructosa', 'high fructose corn syrup',
    ],
    additives: [],
  },
  {
    id: 'legumes',
    label: 'Beans & pulses (GOS)',
    setting: 'legumes',
    severity: 'caution',
    terms: [
      'grao de bico', 'lentilhas', 'lentilha', 'feijao', 'feijoes', 'ervilhas', 'ervilha', 'favas',
      'chickpea', 'chickpeas', 'lentil', 'lentils', 'kidney beans', 'garbanzos', 'lentejas',
    ],
    additives: [],
  },
  {
    id: 'spicy',
    label: 'Chilli / very spicy (reflux)',
    setting: 'spicy',
    severity: 'caution',
    terms: ['piri piri', 'malagueta', 'malaguetas', 'pimenta caiena', 'caiena', 'chili', 'chilli', 'jalapeno', 'picante', 'cayenne', 'chipotle', 'harissa', 'sriracha'],
    additives: [],
  },
  {
    id: 'caffeine',
    label: 'Caffeine',
    setting: 'caffeine',
    severity: 'info',
    terms: ['cafeina', 'caffeine', 'guarana', 'cafe', 'coffee', 'extrato de cafe'],
    additives: [],
  },
  {
    id: 'carbonated',
    label: 'Fizzy (gas, reflux)',
    setting: 'carbonated',
    severity: 'info',
    terms: ['gaseificada', 'gaseificado', 'gas carbonico', 'dioxido de carbono', 'carbonated', 'agua carbonatada'],
    additives: ['en:e290'],
  },
  {
    id: 'wheat',
    label: 'Wheat (fructans)',
    setting: 'wheat',
    severity: 'info',
    terms: ['trigo', 'farinha de trigo', 'wheat', 'wheat flour', 'semola de trigo', 'trigo duro', 'espelta', 'centeio', 'cevada', 'rye', 'barley'],
    allergens: ['en:gluten'],
    additives: [],
  },
];

// What the user avoids. Values: 'avoid' | 'caution' | 'off'.
export const DEFAULT_TRIGGER_SETTINGS = {
  dairy: 'avoid',
  polyols: 'avoid',
  sweeteners: 'avoid',
  onionGarlic: 'avoid',
  addedFibre: 'caution',
  fructose: 'caution',
  legumes: 'caution',
  spicy: 'caution',
  caffeine: 'info',
  carbonated: 'info',
  wheat: 'off',
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function removePhrase(norm, phrase) {
  return norm.replace(new RegExp(`(?<=^| )${escapeRe(phrase)}(?= |$)`, 'g'), ' ').replace(/ +/g, ' ').trim();
}

// Normalised ingredients text with "may contain traces of..." statements cut off.
function ingredientsForScan(text) {
  return String(text || '')
    .split(/[.;\n]/)
    .map((seg) => {
      const n = normalizeText(seg);
      let cut = n.length;
      for (const a of ADVISORY) {
        const i = ` ${n} `.indexOf(` ${a} `);
        if (i >= 0) cut = Math.min(cut, i);
      }
      return n.slice(0, cut).trim();
    })
    .filter(Boolean)
    .join(' ');
}

function hasCode(set, code) {
  for (const tag of set) {
    if (tag === code || (tag.startsWith(code) && !/\d/.test(tag[code.length]))) return true;
  }
  return false;
}

/**
 * Scan a product for gut triggers.
 * product: { name, ingredientsText, additivesTags, allergensTags, nutriments: { fat } }
 * Returns { verdict: 'ok'|'info'|'caution'|'avoid'|'unknown', flags: [...], lactoseFree }
 */
export function scanProduct(product, settings = DEFAULT_TRIGGER_SETTINGS) {
  let norm = ingredientsForScan(product.ingredientsText);
  const nameNorm = normalizeText(product.name);
  const lactoseFree = LACTOSE_FREE.some((p) => hasPhrase(norm, p) || hasPhrase(nameNorm, p));
  for (const p of [...NOT_DAIRY, ...NOT_LEGUMES, ...LACTOSE_FREE]) norm = removePhrase(norm, p);
  const additives = new Set((product.additivesTags || []).map((t) => String(t).toLowerCase()));
  const allergens = new Set((product.allergensTags || []).map((t) => String(t).toLowerCase()));

  const flags = [];
  for (const t of TRIGGERS) {
    const level = settings[t.setting] ?? 'caution';
    if (level === 'off') continue;
    const matches = new Set();
    for (const term of t.terms) if (hasPhrase(norm, term)) matches.add(term);
    for (const a of t.additives || []) if (hasCode(additives, a)) matches.add(a.replace('en:', '').toUpperCase());
    for (const a of t.allergens || []) if (allergens.has(a)) matches.add(`allergen: ${a.replace('en:', '')}`);
    if (!matches.size) continue;
    let severity = level === 'avoid' ? t.severity : level;
    let label = t.label;
    if (t.id === 'lactose' && lactoseFree) {
      severity = 'info';
      label = 'Dairy, lactose-free';
    }
    flags.push({ id: t.id, label, severity, matches: [...matches] });
  }

  const fat = Number(product.nutriments?.fat);
  if (Number.isFinite(fat) && fat >= 20) {
    flags.push({ id: 'high_fat', label: `High fat (${Math.round(fat)} g/100 g): keep portions small`, severity: 'caution', matches: [] });
  }

  const order = { avoid: 3, caution: 2, info: 1 };
  let verdict = 'ok';
  for (const f of flags) if ((order[f.severity] || 0) > (order[verdict] || 0)) verdict = f.severity;
  if (!product.ingredientsText && !additives.size && !allergens.size) verdict = flags.length ? verdict : 'unknown';
  return { verdict, flags, lactoseFree };
}

// ───────────── Symptom diary ─────────────

export const SYMPTOMS = [
  { id: 'bloating', label: 'Bloating / gas' },
  { id: 'pain', label: 'Tummy pain' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'reflux', label: 'Reflux / heartburn' },
];

export const BRISTOL = {
  1: 'Separate hard lumps',
  2: 'Lumpy sausage',
  3: 'Sausage with cracks',
  4: 'Smooth, soft sausage (ideal)',
  5: 'Soft blobs',
  6: 'Mushy, fluffy pieces',
  7: 'Watery, no solid pieces',
};

// Mean of the 0–3 symptom ratings for a day; null when nothing was logged.
export function dayGutScore(symptoms) {
  if (!symptoms) return null;
  const vals = SYMPTOMS.map((s) => symptoms[s.id]).filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function gutSummary(days, endDate, windowDays = 14) {
  const dates = dateRange(addDays(endDate, -(windowDays - 1)), endDate);
  const scores = [];
  let looseDays = 0;
  let hardDays = 0;
  for (const d of dates) {
    const s = days?.[d]?.symptoms;
    const score = dayGutScore(s);
    if (score !== null) scores.push(score);
    const b = Number(s?.bristol);
    if (b >= 6) looseDays++;
    if (b >= 1 && b <= 2) hardDays++;
  }
  if (!scores.length) return null;
  return {
    days: scores.length,
    avgScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
    looseDays,
    hardDays,
  };
}

/**
 * Foods eaten on the same day or the day before worse-than-usual days.
 * Only foods with enough exposures are reported, and only as hints.
 */
export function triggerSuspects(days, { minExposures = 3, minDelta = 0.4 } = {}) {
  const dated = Object.entries(days || {})
    .map(([date, log]) => ({ date, score: dayGutScore(log?.symptoms) }))
    .filter((d) => d.score !== null);
  if (dated.length < 5) return [];
  const baseline = dated.reduce((a, d) => a + d.score, 0) / dated.length;
  const exposures = new Map();
  for (const { date, score } of dated) {
    const foods = new Set();
    for (const d of [date, addDays(date, -1)]) {
      const log = days[d];
      for (const m of Object.values(log?.meals || {})) if (m?.eaten) for (const f of m.foods || []) foods.add(f);
      for (const x of log?.extras || []) if (x.name) foods.add(`extra:${normalizeText(x.name)}`);
    }
    for (const f of foods) {
      if (!exposures.has(f)) exposures.set(f, []);
      exposures.get(f).push(score);
    }
  }
  const out = [];
  for (const [food, scores] of exposures) {
    if (scores.length < minExposures || scores.length === dated.length) continue;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (mean - baseline >= minDelta) {
      const f = FOOD_BY_ID[food];
      out.push({
        food,
        name: f ? f.name : food.replace(/^extra:/, ''),
        exposures: scores.length,
        avgScore: Math.round(mean * 100) / 100,
        baseline: Math.round(baseline * 100) / 100,
      });
    }
  }
  return out.sort((a, b) => b.avgScore - a.avgScore);
}
