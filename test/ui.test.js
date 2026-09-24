import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shelfPrice } from '../public/js/ui.js';

test('shelf prices read the way the store shows them', () => {
  // Weighed: price per kg and the usual piece (Auchan "Quant. Mínima = 500g")
  assert.deepEqual(shelfPrice({ price: 8.99, unitPrice: { eur: 8.99, per: 'kg' }, pack: { perKg: true, pieceG: 500 } }), { price: '€8.99/kg', per: '≈500 g each, ≈€4.50' });
  assert.deepEqual(shelfPrice({ price: 4.99, unitPrice: { eur: 4.99, per: 'kg' }, pack: { perKg: true } }), { price: '€4.99/kg', per: 'sold by weight' });
  // Packs: the pack price, then per kg, litre or item
  assert.deepEqual(shelfPrice({ price: 5.89, unitPrice: { eur: 14.72, per: 'kg' }, pack: { grams: 400 } }), { price: '€5.89', per: '€14.72/kg' });
  assert.deepEqual(shelfPrice({ price: 2.99, unitPrice: { eur: 0.25, per: 'unit' }, pack: { units: 12 } }), { price: '€2.99', per: '€0.25 each' });
  assert.deepEqual(shelfPrice({ price: 2.85, unitPrice: { eur: 2.85, per: 'dc' }, pack: { units: 12 } }), { price: '€2.85', per: '€2.85/dozen' });
  assert.deepEqual(shelfPrice({ price: 1.57, unitPrice: { eur: 1.57, per: 'kg' }, pack: { grams: 1000 } }), { price: '€1.57', per: '€1.57/kg' }, 'a 1 kg bag is a pack');
  // Not sold online right now
  assert.deepEqual(shelfPrice({ price: 0, unitPrice: null, pack: {} }), { price: '', per: '' });
  assert.deepEqual(shelfPrice(null), { price: '', per: '' });
});
