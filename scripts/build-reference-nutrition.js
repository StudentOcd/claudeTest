#!/usr/bin/env node
// Builds src/core/reference-nutrition.js from the official CIQUAL table (ANSES, France),
// the EU food composition table: energy by EU Regulation 1169/2011 and carbohydrates
// without fibre, exactly as on Portuguese/EU food labels.
//
//   node scripts/build-reference-nutrition.js path/to/CIQUAL2025_ENG_2025_11_03.csv
//
// The CSV is published by ANSES (https://ciqual.anses.fr) and mirrored by Open Food Facts in
// github.com/openfoodfacts/openfoodfacts-server/tree/main/external-data/ciqual/ciqual.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Which CIQUAL food each catalogue food is (raw, as weighed in the recipes).
const MAP = {
  chicken_breast: '36017', // Chicken, breast, without skin, raw
  turkey_steaks: '36304', // Turkey, escalope, raw
  pork_loin: '28480', // Pork, eye of shortloin, raw (boneless loin steaks)
  beef_mince_lean: '6252', // Beef, minced steak, 10% fat, raw
  hake: '26048', // Hake, fillet, frozen, raw
  cod_desalted: '26043', // Cod, raw (desalted cod has the same composition, a little more salt)
  salmon: '26036', // Salmon, raw, farmed
  tuna_water: '26039', // Tuna, canned in brine, drained
  eggs: '22000', // Egg, raw
  egg_whites: '22001', // Egg white, raw
  turkey_ham: '28964', // Cooked ham, from turkey, in slices
  rice_white: '9100', // Rice, white, raw
  potatoes: '4008', // Potato, peeled, raw
  sweet_potato: '4101', // Sweet potato, raw
  pasta: '9810', // Pasta, dry, regular, raw
  oats: '32140', // Oat flakes
  bread: '7201', // Sandwich loaf, crustless, prepacked
  rice_cakes: '7352', // Puffed rice textured bread, whole grain (rice cakes)
  olive_oil: '17270', // Olive oil, extra virgin
  peanut_butter: '15202', // Peanut butter or peanut paste
  carrots: '20009', // Carrot, raw
  courgette: '20020', // Courgette, flesh and skin, raw
  green_beans: '20070', // French bean, frozen, raw
  spinach: '20083', // Spinach, frozen, raw
  broccoli: '20204', // Broccoli, frozen, raw
  red_pepper: '20087', // Sweet pepper, red, raw
  tomato: '20385', // Tomato, raw (average)
  cucumber: '20019', // Cucumber, flesh and skin, raw
  lettuce: '20031', // Lettuce, raw
  passata: '20137', // Tomato, peeled, canned, in juice (polpa de tomate)
  lemon: '2007', // Lemon juice, homemade (squeezed)
  banana: '13005', // Banana, flesh without skin, raw
  orange: '13034', // Orange, flesh without skin, without seeds, raw
  kiwi: '13021', // Kiwi fruit, flesh without skin, raw
  tangerine: '13024', // Clementine or mandarin, flesh without skin, raw
  strawberries: '13014', // Strawberry, raw
  blueberries: '13028', // Blueberry, raw
  pineapple: '13002', // Pineapple, flesh without skin, raw
  lf_yogurt: '19593', // Yogurt or fermented milk, plain
  almond_drink: '18107', // Almond drink, plain, no added sugars
  soy_sauce: '11104', // Soy sauce, prepacked
  paprika: '11049', // Paprika, powder
  oregano: '11035', // Oregano, dried
  cumin: '11042', // Cumin, seed
  bay_leaf: '11053', // Bay, leaves
  cinnamon: '11025', // Cinnamon, powder
  chives: '11003', // Chive or spring onion, fresh
  parsley: '11014', // Parsley, fresh
};

// Raw → cooked weight. Meat and fish: protein is kept, so yield = raw protein / cooked protein.
// Rice, pasta, potatoes, vegetables: dry matter is kept, so yield = raw dry matter / cooked dry matter.
const COOKED = {
  chicken_breast: ['36018', 'protein'], // grilled/pan-fried
  turkey_steaks: ['36306', 'protein'], // grilled/pan-fried
  beef_mince_lean: ['6253', 'protein'],
  cod_desalted: ['26023', 'protein'], // roasted/baked
  salmon: ['26230', 'protein'], // farmed, roasted/baked
  pork_loin: ['28301', 'protein', '28300'], // roast cooked vs roast raw
  rice_white: ['9104', 'dry'],
  pasta: ['9811', 'dry'],
  potatoes: ['4028', 'dry'],
  sweet_potato: ['4102', 'dry'],
};

function parse(text, sep = '\t') {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur || row.length) rows.push([...row, cur]);
  return rows;
}

// '12,3' → 12.3, 'traces' → 0, '< 0,5' → 0 (as CIQUAL does when it calculates energy), '-' → null
function value(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  if (t === '' || t === '-') return null;
  if (/^traces$/i.test(t)) return 0;
  if (t.startsWith('<')) return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`Unreadable value "${s}"`);
  return n;
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/build-reference-nutrition.js path/to/CIQUAL2025_ENG_*.csv');
  process.exit(1);
}
const rows = parse(readFileSync(file, 'utf8'));
const header = rows[0].map((h) => h.replace(/\s+/g, ' ').trim());
const col = (re) => {
  const i = header.findIndex((h) => re.test(h));
  if (i < 0) throw new Error(`Column not found: ${re}`);
  return i;
};
const C = {
  code: col(/^alim_code$/),
  name: col(/^alim_nom_eng$/),
  kcal: col(/^Energy, Regulation EU No 1169 2011 \(kcal/),
  water: col(/^Water/),
  p: col(/^Protein \(g/),
  c: col(/^Carbohydrate/),
  f: col(/^Fat \(g/),
  sugar: col(/^Sugars/),
  fib: col(/^Fibres/),
  organic: col(/^Organic acids/),
  polyols: col(/^Polyols/),
  alcohol: col(/^Alcohol/),
  salt: col(/^Salt/),
};
const byCode = new Map(rows.slice(1).filter((r) => r.length > 20).map((r) => [r[C.code].trim(), r]));
const get = (code) => {
  const r = byCode.get(code);
  if (!r) throw new Error(`CIQUAL code ${code} not found`);
  return r;
};

const out = {};
for (const [food, code] of Object.entries(MAP)) {
  const r = get(code);
  const entry = { code, name: r[C.name].trim() };
  for (const k of ['kcal', 'p', 'c', 'f', 'fib', 'sugar', 'salt', 'organic', 'polyols', 'alcohol']) entry[k] = value(r[C[k]]);
  for (const k of ['organic', 'polyols', 'alcohol']) if (!entry[k]) delete entry[k];
  for (const k of ['kcal', 'p', 'c', 'f', 'fib']) if (entry[k] === null) throw new Error(`${food}: CIQUAL ${code} has no ${k}`);
  const ck = COOKED[food];
  if (ck) {
    const [cookedCode, method, rawCode = code] = ck;
    const raw = get(rawCode);
    const cooked = get(cookedCode);
    const y = method === 'protein'
      ? value(raw[C.p]) / value(cooked[C.p])
      : (100 - value(raw[C.water])) / (100 - value(cooked[C.water]));
    entry.cooked = { code: cookedCode, name: cooked[C.name].trim(), method, yield: Math.round(y * 100) / 100 };
  }
  out[food] = entry;
}

const version = path.basename(file).match(/(\d{4})_(\d{2})_(\d{2})/)?.slice(1).join('-') || 'unknown';
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core', 'reference-nutrition.js');
const body = `// GENERATED by scripts/build-reference-nutrition.js from CIQUAL (${version}). Do not edit by hand.
//
// CIQUAL is the French national food composition table (ANSES), an EU reference: energy is
// calculated as on EU labels (Regulation 1169/2011) and carbohydrates exclude fibre, so these
// numbers compare directly with the nutrition table on Portuguese packaging.
// Per 100 g of the food as weighed in the recipes (raw / dry / drained).

export const REFERENCE_DB = {
  name: 'CIQUAL',
  version: '${version}',
  publisher: 'ANSES (France)',
  url: 'https://ciqual.anses.fr',
};

export const REFERENCE = ${JSON.stringify(out, null, 2).replace(/"([a-zA-Z_]+)":/g, '$1:').replace(/"/g, "'")};
`;
writeFileSync(target, body);
console.log(`Wrote ${Object.keys(out).length} foods to ${path.relative(process.cwd(), target)}`);
