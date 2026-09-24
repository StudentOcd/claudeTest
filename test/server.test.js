import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';

const offline = async () => new Response('offline', { status: 599 });

async function boot(opts = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'leve-test-'));
  const app = await startServer({ port: 0, dataDir, quiet: true, fetchImpl: offline, autoCrawl: false, ...opts });
  const base = `http://127.0.0.1:${app.port}`;
  const call = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { app, base, call, dataDir };
}

test('state, profile and weights round-trip and persist to disk', async () => {
  const { app, call, dataDir } = await boot();
  try {
    const s = await call('GET', '/api/state');
    assert.equal(s.status, 200);
    assert.equal(s.json.profile.heightCm, 167);
    assert.equal(s.json.hevy.connected, false);
    assert.equal((await call('PUT', '/api/profile', { weightKg: 94.2, pace: 'gentle' })).json.pace, 'gentle');
    assert.equal((await call('PUT', '/api/profile', { pace: 'turbo' })).status, 400);
    const w = await call('PUT', '/api/weights/2026-09-28', { kg: 95.1, waistCm: 111 });
    assert.deepEqual(w.json, [{ date: '2026-09-28', kg: 95.1, waistCm: 111 }]);
    const after = await call('GET', '/api/state');
    assert.equal(after.json.profile.startDate, '2026-09-28', 'first weigh-in starts the plan');
    await app.db.flush();
    const disk = JSON.parse(readFileSync(path.join(dataDir, 'leve.json'), 'utf8'));
    assert.equal(disk.weights[0].kg, 95.1);
  } finally {
    await app.close();
  }
});

test('day logs, plan overrides, prices, pantry and check-ins', async () => {
  const { app, call } = await boot();
  try {
    const day = await call('PUT', '/api/days/2026-09-28', {
      meals: { lunch: { recipeId: 'chicken_rice_carrots', kcal: 610, protein: 46, foods: ['chicken_breast', 'nope'] } },
      symptoms: { bloating: 1, bristol: 4 },
      energy: 4,
    });
    assert.deepEqual(day.json.meals.lunch.foods, ['chicken_breast']);
    assert.equal(day.json.symptoms.bristol, 4);
    assert.equal((await call('PUT', '/api/days/2026-09-28', { symptoms: { bloating: 7 } })).status, 400);
    const ov = await call('PUT', '/api/plan/2026-09-28/dinner', { recipeId: 'cod_potatoes_egg' });
    assert.equal(ov.json['2026-09-28'].dinner, 'cod_potatoes_egg');
    assert.equal((await call('PUT', '/api/plan/2026-09-28/dinner', { recipeId: 'pizza' })).status, 400);
    const pr = await call('POST', '/api/prices/eggs', { store: 'mercadona', sold: 'pack', eur: 2.99, packUnits: 12, source: 'receipt' });
    assert.equal(pr.json[0].packUnits, 12);
    assert.equal((await call('POST', '/api/prices/eggs', { store: 'lidl', eur: 1 })).status, 400);
    assert.deepEqual((await call('PUT', '/api/pantry/olive_oil', { have: true })).json, { olive_oil: true });
    const ci = await call('POST', '/api/checkins', { date: '2026-10-12', actions: [{ type: 'calories', delta: -100 }, { type: 'phase', to: 2 }] });
    assert.equal(ci.json.profile.calorieAdjustment, -100);
    assert.equal(ci.json.profile.phase, 2);
    assert.equal(ci.json.profile.phaseSince, '2026-10-12');
    const choice = await call('PUT', '/api/product-choice/chicken_breast', { store: 'auchan', url: 'https://evil.example/x.html' });
    assert.equal(choice.status, 400);
  } finally {
    await app.close();
  }
});

test('JSON only, 404s, static files and no path traversal', async () => {
  const { app, call, base } = await boot();
  try {
    const form = await fetch(`${base}/api/profile`, { method: 'PUT', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'age=5' });
    assert.equal(form.status, 415);
    assert.equal((await call('GET', '/api/nothing')).status, 404);
    const idx = await call('GET', '/');
    assert.match(idx.text, /<title>Leve/);
    const core = await call('GET', '/core/nutrition.js');
    assert.match(core.headers.get('content-type'), /javascript/);
    const trav = await call('GET', '/core/%2e%2e/%2e%2e/server/db.js');
    assert.doesNotMatch(trav.text, /JsonDb/);
    const trav2 = await call('GET', '/../server/db.js');
    assert.doesNotMatch(trav2.text, /JsonDb/);
  } finally {
    await app.close();
  }
});

test('password protection', async () => {
  const { app, base } = await boot({ password: 's3cret' });
  try {
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
    const auth = { authorization: `Basic ${Buffer.from('me:s3cret').toString('base64')}` };
    assert.equal((await fetch(`${base}/api/state`, { headers: auth })).status, 200);
    const wrong = { authorization: `Basic ${Buffer.from('me:nope').toString('base64')}` };
    assert.equal((await fetch(`${base}/api/state`, { headers: wrong })).status, 401);
  } finally {
    await app.close();
  }
});

test('refuses to listen on the network without a password', async () => {
  await assert.rejects(boot({ host: '0.0.0.0' }), /without a password/);
});

test('Hevy key is validated and never returned', async () => {
  const fake = async (url) => {
    if (String(url).includes('/v1/user/info')) return new Response(JSON.stringify({ data: { id: 'u', name: 'Rui' } }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const { app, call } = await boot({ fetchImpl: fake });
  try {
    assert.equal((await call('PUT', '/api/hevy/key', { apiKey: 'not a key' })).status, 400);
    const ok = await call('PUT', '/api/hevy/key', { apiKey: 'abcdef12-3456-7890-abcd-ef1234567890' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.name, 'Rui');
    assert.equal(ok.json.keyHint, '…7890');
    const state = await call('GET', '/api/state');
    assert.ok(!JSON.stringify(state.json).includes('abcdef12-3456'));
    const exp = await call('GET', '/api/export');
    assert.equal(exp.json.hevy.apiKey, '');
  } finally {
    await app.close();
  }
});

test('store lookups report failures instead of crashing', async () => {
  const { app, call } = await boot();
  try {
    const res = await call('GET', '/api/stores/search?store=auchan&q=frango');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.items, []);
    assert.ok(res.json.tried.length >= 1);
    assert.match(res.json.browserUrl, /auchan\.pt\/pt\/pesquisa\?q=frango/);
    const bad = await call('GET', '/api/stores/product?store=auchan&url=https%3A%2F%2Fexample.com%2Fx.html');
    assert.equal(bad.status, 400);
    await call('PUT', '/api/settings', { liveStoreLookups: false });
    assert.equal((await call('GET', '/api/stores/search?store=auchan&q=frango')).status, 409);
  } finally {
    await app.close();
  }
});
