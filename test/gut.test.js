import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayGutScore, gutSummary, scanProduct, triggerSuspects } from '../src/core/gut.js';

const flagIds = (r) => r.flags.map((f) => f.id);

test('finds lactose, sweeteners and polyols in Portuguese labels', () => {
  const r = scanProduct({
    name: 'Iogurte proteico',
    ingredientsText: 'Leite magro, proteínas do leite, edulcorantes (sucralose, acessulfame K), espessante. Pode conter vestígios de frutos de casca rija.',
  });
  assert.equal(r.verdict, 'avoid');
  assert.ok(flagIds(r).includes('lactose'));
  assert.ok(flagIds(r).includes('sweeteners'));
  const gum = scanProduct({ name: 'Pastilhas', ingredientsText: 'Edulcorantes: sorbitol, maltitol, xilitol; aroma' });
  assert.ok(flagIds(gum).includes('polyols'));
});

test('turkey ham with milk proteins and onion powder', () => {
  const r = scanProduct({
    name: 'Fiambre de peito de peru',
    ingredientsText: 'Peito de peru (60%), água, amido, sal, dextrose, proteínas do leite, cebola em pó, aromas.',
  });
  assert.deepEqual(flagIds(r).sort(), ['lactose', 'onion_garlic']);
});

test('no false alarms: peanut butter, coconut milk, green beans, chives, traces, "trabalho"', () => {
  const r = scanProduct({
    name: 'Mix',
    ingredientsText: 'Manteiga de amendoim, leite de coco, feijão verde, cebolinho, bajo en grasa, trabalho artesanal. Pode conter leite e soja.',
  });
  assert.deepEqual(r.flags, []);
  assert.equal(r.verdict, 'ok');
});

test('lactose-free dairy is information, not a warning', () => {
  const r = scanProduct({ name: 'Iogurte natural sem lactose', ingredientsText: 'Leite pasteurizado, lactase, fermentos lácticos.' });
  const f = r.flags.find((x) => x.id === 'lactose');
  assert.equal(f.severity, 'info');
  assert.equal(r.lactoseFree, true);
});

test('E-numbers, allergens and fat from Open Food Facts', () => {
  const r = scanProduct({
    name: 'Chocolate sem açúcar',
    ingredientsText: '',
    additivesTags: ['en:e965ii', 'en:e322'],
    allergensTags: ['en:milk'],
    nutriments: { fat: 32 },
  });
  const ids = flagIds(r);
  assert.ok(ids.includes('polyols'));
  assert.ok(ids.includes('lactose'));
  assert.ok(ids.includes('high_fat'));
});

test('settings switch triggers off or down', () => {
  const r = scanProduct({ name: 'Pão', ingredientsText: 'Farinha de trigo, água, sal, alho' }, { onionGarlic: 'caution', wheat: 'off' });
  assert.deepEqual(r.flags.map((f) => [f.id, f.severity]), [['onion_garlic', 'caution']]);
});

test('unknown when there is nothing to scan', () => {
  assert.equal(scanProduct({ name: 'Produto' }).verdict, 'unknown');
});

test('symptom scores and summary', () => {
  assert.equal(dayGutScore({ bloating: 2, pain: 1, urgency: 0, reflux: 1 }), 1);
  assert.equal(dayGutScore({}), null);
  const days = {
    '2026-10-01': { symptoms: { bloating: 0, pain: 0, urgency: 0, reflux: 0, bristol: 4 } },
    '2026-10-02': { symptoms: { bloating: 2, pain: 2, urgency: 3, reflux: 1, bristol: 7 } },
  };
  const s = gutSummary(days, '2026-10-02', 14);
  assert.equal(s.days, 2);
  assert.equal(s.looseDays, 1);
  assert.equal(s.avgScore, 1);
});

test('possible triggers from the diary', () => {
  const days = {};
  const add = (d, foods, score) => {
    days[d] = { meals: { lunch: { eaten: true, kcal: 500, protein: 40, foods } }, symptoms: { bloating: score, pain: score, urgency: score, reflux: score } };
  };
  add('2026-10-01', ['chicken_breast', 'rice_white'], 0);
  add('2026-10-02', ['chicken_breast', 'rice_white'], 0);
  add('2026-10-04', ['pasta', 'beef_mince_lean'], 2);
  add('2026-10-06', ['pasta', 'chicken_breast'], 2);
  add('2026-10-08', ['pasta', 'hake'], 3);
  add('2026-10-10', ['hake', 'potatoes'], 0);
  add('2026-10-12', ['hake', 'potatoes'], 0);
  const s = triggerSuspects(days);
  assert.equal(s[0].food, 'pasta');
  assert.ok(!s.some((x) => x.food === 'rice_white'));
});
