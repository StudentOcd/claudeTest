// Does a store product name plausibly match a catalogue food? (word overlap)

import { normalizeText } from '/core/gut.js';

const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'com', 'sem', 'ao', 'em', 'kg', 'g', 'gr', 'pack', 'emb', 'embalado', 'embalada', 'auchan', 'pingo', 'doce', 'nosso', 'nossa', 'talho', 'os', 'as', 'o', 'a']);

const words = (s) => normalizeText(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w) && !/^\d/.test(w));
const stem = (w) => w.replace(/(oes|aes|es|s)$/, '');

export function looksLike(productName, food) {
  const product = new Set(words(productName).map(stem));
  const reference = [...words(food.name), ...words(food.buy?.search || ''), ...words(food.en)].map(stem);
  return reference.some((w) => product.has(w));
}
