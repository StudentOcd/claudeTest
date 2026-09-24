// REST API. Handlers get { params, query, body } and return JSON (or throw ApiError).

import { randomUUID } from 'node:crypto';
import { isISODate, todayISO, addDays } from '../src/core/dates.js';
import { FOOD_BY_ID } from '../src/core/foods.js';
import { RECIPE_BY_ID } from '../src/core/recipes.js';
import { LIFESTYLES, PACES } from '../src/core/nutrition.js';
import { DEFAULT_TRIGGER_SETTINGS, scanProduct } from '../src/core/gut.js';
import { STORE_PRODUCTS, categoryUrl } from '../src/core/products.js';
import { migrate } from './db.js';
import { HevyClient, createProgram, fetchTemplates, previewProgram, syncWorkouts } from './connectors/hevy.js';
import { offProduct, offSearch } from './connectors/openfoodfacts.js';
import { latestByStore, recentPrices } from './connectors/openprices.js';
import { browseCategory, fetchStoreProduct, searchStore, STORE_SITES } from './connectors/stores.js';
import { catalogPrices, crawlStores, downloadPhoto, labelFor, loadCatalog, saveCatalog } from './crawler.js';
import path from 'node:path';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new ApiError(400, msg);

// ───────────── validation helpers ─────────────

function number(v, name, { min = -Infinity, max = Infinity, int = false, nullable = false } = {}) {
  if (v === null || v === undefined || v === '') {
    if (nullable) return null;
    throw bad(`${name} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) {
    throw bad(`${name} must be ${int ? 'a whole number' : 'a number'} between ${min} and ${max}`);
  }
  return n;
}

function text(v, name, max = 200) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') throw bad(`${name} must be text`);
  return v.slice(0, max);
}

function oneOf(v, name, options) {
  if (!options.includes(v)) throw bad(`${name} must be one of: ${options.join(', ')}`);
  return v;
}

function bool(v, name) {
  if (typeof v !== 'boolean') throw bad(`${name} must be true or false`);
  return v;
}

function date(v, name = 'date') {
  if (!isISODate(v)) throw bad(`${name} must be a date like 2026-09-28`);
  return v;
}

const STORE_IDS = ['mercadona', 'pingodoce', 'auchan'];
const EXCLUSION_TAGS = ['fish', 'pork', 'beef', 'egg', 'wheat', 'dairy_lf', 'acidic'];
const TRIGGER_LEVELS = ['avoid', 'caution', 'info', 'off'];
const SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'];

const PROFILE_FIELDS = {
  name: (v) => text(v, 'name', 60),
  sex: (v) => oneOf(v, 'sex', ['male', 'female']),
  age: (v) => number(v, 'age', { min: 14, max: 100, int: true }),
  heightCm: (v) => number(v, 'height', { min: 120, max: 230 }),
  weightKg: (v) => number(v, 'weight', { min: 35, max: 350 }),
  lifestyle: (v) => oneOf(v, 'lifestyle', Object.keys(LIFESTYLES)),
  trainingDaysPerWeek: (v) => number(v, 'training days', { min: 0, max: 7, int: true }),
  sessionMinutes: (v) => number(v, 'session length', { min: 15, max: 180, int: true }),
  pace: (v) => oneOf(v, 'pace', Object.keys(PACES)),
  calorieAdjustment: (v) => number(v, 'calorie adjustment', { min: -1000, max: 1000, int: true }),
  calorieOverride: (v) => number(v, 'calorie override', { min: 1000, max: 5000, int: true, nullable: true }),
  proteinOverride: (v) => number(v, 'protein override', { min: 40, max: 300, int: true, nullable: true }),
  mealsPerDay: (v) => number(v, 'meals per day', { min: 3, max: 4, int: true }),
  startDate: (v) => (v === null ? null : date(v, 'start date')),
  phase: (v) => number(v, 'phase', { min: 1, max: 3, int: true }),
  phaseSince: (v) => (v === null ? null : date(v, 'phase start')),
  goalWeightKg: (v) => number(v, 'goal weight', { min: 35, max: 350, nullable: true }),
};

const ACCENTS = ['blue', 'green', 'purple', 'orange'];

function validateSettings(body, current) {
  const out = {};
  if ('stores' in body) {
    if (!Array.isArray(body.stores) || !body.stores.length) throw bad('Pick at least one store');
    out.stores = [...new Set(body.stores)].map((s) => oneOf(s, 'store', STORE_IDS));
  }
  if ('shoppingMode' in body) out.shoppingMode = oneOf(body.shoppingMode, 'shopping mode', ['cheapest', 'main']);
  if ('shoppingDays' in body) out.shoppingDays = number(body.shoppingDays, 'shopping days', { min: 1, max: 14, int: true });
  if ('batchMode' in body) out.batchMode = bool(body.batchMode, 'batch mode');
  if ('liveStoreLookups' in body) out.liveStoreLookups = bool(body.liveStoreLookups, 'live store lookups');
  if ('useLabelNutrition' in body) out.useLabelNutrition = bool(body.useLabelNutrition, 'label nutrition');
  if ('hevyAutoPushWeight' in body) out.hevyAutoPushWeight = bool(body.hevyAutoPushWeight, 'Hevy weight sync');
  if ('contactEmail' in body) out.contactEmail = text(body.contactEmail, 'contact email', 120);
  if ('appearance' in body) {
    const a = { ...current.appearance, ...(body.appearance || {}) };
    out.appearance = { accent: oneOf(a.accent, 'colour', ACCENTS), mode: oneOf(a.mode, 'mode', ['system', 'light', 'dark']) };
  }
  if ('exclusions' in body) {
    if (!Array.isArray(body.exclusions)) throw bad('exclusions must be a list');
    out.exclusions = [...new Set(body.exclusions)].map((t) => oneOf(t, 'exclusion', EXCLUSION_TAGS));
  }
  for (const key of ['hiddenRecipes', 'favoriteRecipes']) {
    if (key in body) {
      if (!Array.isArray(body[key])) throw bad(`${key} must be a list`);
      out[key] = [...new Set(body[key])].filter((id) => RECIPE_BY_ID[id]);
    }
  }
  if ('triggers' in body) {
    const t = { ...current.triggers };
    for (const [k, v] of Object.entries(body.triggers || {})) {
      if (!(k in DEFAULT_TRIGGER_SETTINGS)) continue;
      t[k] = oneOf(v, `trigger ${k}`, TRIGGER_LEVELS);
    }
    out.triggers = t;
  }
  if ('location' in body) {
    const l = body.location || {};
    out.location = {
      lat: number(l.lat, 'latitude', { min: -90, max: 90 }),
      lon: number(l.lon, 'longitude', { min: -180, max: 180 }),
      radiusKm: number(l.radiusKm ?? 25, 'radius', { min: 1, max: 100 }),
      label: text(l.label ?? '', 'label', 40),
    };
  }
  return out;
}

function validateDayPatch(body, existing = {}) {
  const out = { ...existing };
  if ('meals' in body) {
    const meals = { ...(existing.meals || {}) };
    for (const [slot, v] of Object.entries(body.meals || {})) {
      oneOf(slot, 'meal', SLOTS);
      if (v === null) {
        delete meals[slot];
        continue;
      }
      meals[slot] = {
        eaten: true,
        recipeId: v.recipeId && RECIPE_BY_ID[v.recipeId] ? v.recipeId : null,
        kcal: number(v.kcal, 'meal kcal', { min: 0, max: 5000 }),
        protein: number(v.protein ?? 0, 'meal protein', { min: 0, max: 400 }),
        carbs: number(v.carbs ?? 0, 'meal carbs', { min: 0, max: 1000 }),
        fat: number(v.fat ?? 0, 'meal fat', { min: 0, max: 500 }),
        foods: Array.isArray(v.foods) ? v.foods.filter((f) => FOOD_BY_ID[f]).slice(0, 30) : [],
      };
    }
    out.meals = meals;
  }
  if ('extras' in body) {
    if (!Array.isArray(body.extras)) throw bad('extras must be a list');
    out.extras = body.extras.slice(0, 30).map((x) => ({
      name: text(x.name, 'extra name', 80),
      kcal: number(x.kcal, 'extra kcal', { min: 0, max: 5000 }),
      protein: number(x.protein ?? 0, 'extra protein', { min: 0, max: 400 }),
    }));
  }
  if ('symptoms' in body) {
    const s = body.symptoms;
    if (s === null) delete out.symptoms;
    else {
      const sym = {};
      for (const k of ['bloating', 'pain', 'urgency', 'reflux']) {
        if (s[k] !== undefined && s[k] !== null) sym[k] = number(s[k], k, { min: 0, max: 3, int: true });
      }
      if (s.bristol !== undefined && s.bristol !== null) sym.bristol = number(s.bristol, 'stool type', { min: 1, max: 7, int: true });
      if (s.notes) sym.notes = text(s.notes, 'notes', 300);
      out.symptoms = sym;
    }
  }
  for (const [k, opts] of [
    ['energy', { min: 1, max: 5, int: true, nullable: true }],
    ['hunger', { min: 1, max: 5, int: true, nullable: true }],
    ['steps', { min: 0, max: 100000, int: true, nullable: true }],
    ['waterL', { min: 0, max: 10, nullable: true }],
  ]) {
    if (k in body) out[k] = number(body[k], k, opts);
  }
  if ('notes' in body) out.notes = text(body.notes, 'notes', 500);
  return out;
}

function validatePrice(body) {
  const sold = oneOf(body.sold || 'pack', 'sold', ['pack', 'weight', 'unit']);
  const entry = {
    store: oneOf(body.store, 'store', STORE_IDS),
    sold,
    eur: number(body.eur, 'price', { min: 0.01, max: 500 }),
    date: body.date ? date(body.date) : todayISO(),
    source: oneOf(body.source || 'manual', 'source', ['manual', 'receipt', 'store', 'openprices', 'web', 'mercadona-es']),
  };
  if (sold === 'pack') {
    if (body.packUnits) entry.packUnits = number(body.packUnits, 'units per pack', { min: 1, max: 100, int: true });
    else if (body.packG) entry.packG = number(body.packG, 'pack size', { min: 1, max: 50000 });
  }
  if (body.productName) entry.productName = text(body.productName, 'product name', 150);
  if (body.url) entry.url = text(body.url, 'url', 500);
  return entry;
}

function addPrice(state, foodId, entry) {
  const list = (state.prices[foodId] ||= []);
  list.push(entry);
  // keep the 12 newest per store
  const byStore = list.filter((p) => p.store === entry.store).sort((a, b) => (a.date < b.date ? 1 : -1));
  const drop = new Set(byStore.slice(12));
  state.prices[foodId] = list.filter((p) => !drop.has(p));
}

function publicState(state) {
  const { hevy, ...rest } = state;
  return {
    ...rest,
    hevy: {
      connected: Boolean(hevy.apiKey),
      keyHint: hevy.apiKey ? `…${hevy.apiKey.slice(-4)}` : '',
      user: hevy.user,
      lastSyncAt: hevy.lastSyncAt,
      workoutCount: Object.keys(hevy.workouts || {}).length,
      templateCount: Object.keys(hevy.templates || {}).length,
      lastError: hevy.lastError,
    },
  };
}

// ───────────── routes ─────────────

export function registerRoutes(router, ctx) {
  const { db, http } = ctx;
  const S = () => db.state;
  const jobs = new Map();
  let catalogCache = null;

  const hevyClient = () => {
    if (!S().hevy.apiKey) throw new ApiError(409, 'Connect Hevy first (Settings → Hevy API key).');
    return new HevyClient(http, S().hevy.apiKey);
  };

  const requireLive = () => {
    if (!S().settings.liveStoreLookups) throw new ApiError(409, 'Live store lookups are switched off in Settings.');
  };

  const pushWeightToHevy = async (entry) => {
    try {
      await hevyClient().upsertWeight(entry.date, { kg: entry.kg, waistCm: entry.waistCm });
      S().hevy.lastError = null;
    } catch (err) {
      S().hevy.lastError = `Weight sync: ${err.message}`;
    }
    db.save();
  };

  router.get('/api/state', () => publicState(S()));

  router.get('/api/health', () => ({ ok: true, time: new Date().toISOString() }));

  router.put('/api/profile', ({ body }) => {
    const patch = {};
    for (const [k, v] of Object.entries(body || {})) if (PROFILE_FIELDS[k]) patch[k] = PROFILE_FIELDS[k](v);
    Object.assign(S().profile, patch);
    db.save();
    return S().profile;
  });

  router.post('/api/start', ({ body }) => {
    const start = body?.startDate ? date(body.startDate, 'start date') : todayISO();
    Object.assign(S().profile, { startDate: start, phase: 1, phaseSince: start });
    db.save();
    return S().profile;
  });

  router.put('/api/settings', ({ body }) => {
    Object.assign(S().settings, validateSettings(body || {}, S().settings));
    db.save();
    return S().settings;
  });

  router.put('/api/weights/:date', ({ params, body }) => {
    const d = date(params.date);
    const entry = {
      date: d,
      kg: number(body?.kg, 'weight', { min: 30, max: 350 }),
      waistCm: number(body?.waistCm, 'waist', { min: 40, max: 250, nullable: true }),
    };
    if (body?.note) entry.note = text(body.note, 'note', 200);
    const list = S().weights.filter((w) => w.date !== d);
    list.push(entry);
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    S().weights = list;
    if (!S().profile.startDate) Object.assign(S().profile, { startDate: d, phase: 1, phaseSince: d });
    db.save();
    if (S().settings.hevyAutoPushWeight && S().hevy.apiKey) pushWeightToHevy(entry);
    return S().weights;
  });

  router.delete('/api/weights/:date', ({ params }) => {
    const d = date(params.date);
    S().weights = S().weights.filter((w) => w.date !== d);
    db.save();
    return S().weights;
  });

  router.put('/api/days/:date', ({ params, body }) => {
    const d = date(params.date);
    S().days[d] = validateDayPatch(body || {}, S().days[d]);
    db.save();
    return S().days[d];
  });

  router.put('/api/plan/:date/:slot', ({ params, body }) => {
    const d = date(params.date);
    const slot = oneOf(params.slot, 'meal', SLOTS);
    const day = { ...(S().planOverrides[d] || {}) };
    if (!body?.recipeId) delete day[slot];
    else {
      if (!RECIPE_BY_ID[body.recipeId]) throw bad('Unknown recipe');
      day[slot] = body.recipeId;
    }
    if (Object.keys(day).length) S().planOverrides[d] = day;
    else delete S().planOverrides[d];
    db.save();
    return S().planOverrides;
  });

  router.post('/api/prices/:foodId', ({ params, body }) => {
    if (!FOOD_BY_ID[params.foodId]) throw bad('Unknown food');
    addPrice(S(), params.foodId, validatePrice(body || {}));
    db.save();
    return S().prices[params.foodId];
  });

  router.delete('/api/prices/:foodId', ({ params, query }) => {
    const list = S().prices[params.foodId] || [];
    S().prices[params.foodId] = list.filter(
      (p) => !((!query.store || p.store === query.store) && (!query.source || p.source === query.source) && (!query.date || p.date === query.date)),
    );
    db.save();
    return S().prices[params.foodId];
  });

  router.put('/api/product-choice/:foodId', ({ params, body }) => {
    if (!FOOD_BY_ID[params.foodId]) throw bad('Unknown food');
    const store = oneOf(body?.store, 'store', ['pingodoce', 'auchan', 'mercadona']);
    const choice = { ...(S().productChoice[params.foodId] || {}) };
    if (!body.url) delete choice[store];
    else {
      const url = text(body.url, 'url', 500);
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {
        throw bad('Invalid link');
      }
      const hosts = store === 'mercadona' ? ['tienda.mercadona.es'] : STORE_SITES[store].hosts;
      if (!hosts.includes(host)) throw bad('That link is not on the store website');
      choice[store] = {
        url,
        name: text(body.name || '', 'name', 150),
        sold: body.sold ? oneOf(body.sold, 'sold', ['pack', 'weight', 'unit']) : undefined,
        packG: body.packG ? number(body.packG, 'pack size', { min: 1, max: 50000 }) : undefined,
        packUnits: body.packUnits ? number(body.packUnits, 'units', { min: 1, max: 100, int: true }) : undefined,
      };
    }
    S().productChoice[params.foodId] = choice;
    db.save();
    return choice;
  });

  router.put('/api/pantry/:foodId', ({ params, body }) => {
    if (!FOOD_BY_ID[params.foodId]) throw bad('Unknown food');
    if (bool(body?.have, 'have')) S().pantry[params.foodId] = true;
    else delete S().pantry[params.foodId];
    db.save();
    return S().pantry;
  });

  router.put('/api/shopping/:week/:foodId', ({ params, body }) => {
    const week = date(params.week, 'week');
    const checked = { ...(S().shoppingChecked[week] || {}) };
    if (bool(body?.checked, 'checked')) checked[params.foodId] = true;
    else delete checked[params.foodId];
    S().shoppingChecked[week] = checked;
    // forget lists older than 8 weeks
    for (const w of Object.keys(S().shoppingChecked)) if (w < addDays(todayISO(), -56)) delete S().shoppingChecked[w];
    db.save();
    return checked;
  });

  router.post('/api/checkins', ({ body }) => {
    const d = body?.date ? date(body.date) : todayISO();
    const applied = [];
    for (const a of Array.isArray(body?.actions) ? body.actions : []) {
      if (a.type === 'calories') {
        const delta = number(a.delta, 'calorie change', { min: -300, max: 300, int: true });
        S().profile.calorieAdjustment = Math.max(-1000, Math.min(1000, (S().profile.calorieAdjustment || 0) + delta));
        applied.push({ type: 'calories', delta });
      } else if (a.type === 'phase') {
        const to = number(a.to, 'phase', { min: 1, max: 3, int: true });
        Object.assign(S().profile, { phase: to, phaseSince: d });
        applied.push({ type: 'phase', to });
      }
    }
    S().checkins.push({ date: d, applied, note: text(body?.note || '', 'note', 300) });
    S().checkins = S().checkins.slice(-100);
    db.save();
    return { profile: S().profile, checkins: S().checkins };
  });

  router.get('/api/export', () => {
    const copy = JSON.parse(JSON.stringify(S()));
    copy.hevy.apiKey = '';
    return copy;
  });

  router.post('/api/import', ({ body }) => {
    if (!body?.state || typeof body.state !== 'object') throw bad('Send { state: <exported JSON> }');
    const key = S().hevy.apiKey;
    db.state = migrate(body.state);
    if (!db.state.hevy.apiKey) db.state.hevy.apiKey = key;
    db.save();
    return publicState(db.state);
  });

  // ───────────── Hevy ─────────────

  router.put('/api/hevy/key', async ({ body }) => {
    const key = text(body?.apiKey, 'API key', 100).trim();
    if (!/^[0-9a-f-]{20,60}$/i.test(key)) throw bad('That does not look like a Hevy API key (copy it from hevy.com/settings?developer).');
    const client = new HevyClient(http, key);
    let info;
    try {
      info = await client.userInfo();
    } catch (err) {
      throw new ApiError(400, err.message);
    }
    Object.assign(S().hevy, { apiKey: key, user: info?.data || info || null, lastError: null });
    db.save();
    return publicState(S()).hevy;
  });

  router.delete('/api/hevy/key', () => {
    Object.assign(S().hevy, { apiKey: '', user: null, lastError: null });
    db.save();
    return publicState(S()).hevy;
  });

  router.post('/api/hevy/sync', async ({ body }) => {
    const client = hevyClient();
    const h = S().hevy;
    if (body?.full) h.lastSyncAt = null;
    try {
      const result = await syncWorkouts(client, h);
      const stale = !h.templatesFetchedAt || Date.now() - Date.parse(h.templatesFetchedAt) > 7 * 86400000;
      if (stale) {
        h.templates = await fetchTemplates(client);
        h.templatesFetchedAt = new Date().toISOString();
      }
      h.lastError = null;
      db.save();
      return { ...result, templates: Object.keys(h.templates).length, lastSyncAt: h.lastSyncAt };
    } catch (err) {
      h.lastError = err.message;
      db.save();
      throw new ApiError(502, err.message);
    }
  });

  router.get('/api/hevy/workouts', () =>
    Object.values(S().hevy.workouts || {}).sort((a, b) => (a.start < b.start ? 1 : -1)),
  );

  router.get('/api/hevy/templates', () => S().hevy.templates || {});

  const ensureTemplates = async () => {
    const h = S().hevy;
    if (!Object.keys(h.templates || {}).length) {
      h.templates = await fetchTemplates(hevyClient());
      h.templatesFetchedAt = new Date().toISOString();
      db.save();
    }
    return h.templates;
  };

  router.post('/api/hevy/program/preview', async () => previewProgram(await ensureTemplates()));

  router.post('/api/hevy/program/create', async () => {
    const result = await createProgram(hevyClient(), await ensureTemplates());
    return result;
  });

  router.post('/api/hevy/weights/push', async ({ body }) => {
    const client = hevyClient();
    const since = addDays(todayISO(), -(number(body?.days ?? 30, 'days', { min: 1, max: 3650, int: true })));
    const entries = S().weights.filter((w) => w.date >= since);
    const results = { created: 0, updated: 0, failed: [] };
    for (const e of entries) {
      try {
        const r = await client.upsertWeight(e.date, { kg: e.kg, waistCm: e.waistCm });
        results[r]++;
      } catch (err) {
        results.failed.push({ date: e.date, error: err.message });
      }
    }
    return results;
  });

  router.post('/api/hevy/weights/pull', async () => {
    const list = await hevyClient().bodyMeasurements();
    const have = new Set(S().weights.map((w) => w.date));
    let imported = 0;
    for (const m of list) {
      if (!m?.date || !(m.weight_kg > 0) || have.has(m.date)) continue;
      S().weights.push({ date: m.date, kg: m.weight_kg, waistCm: m.waist || null, source: 'hevy' });
      imported++;
    }
    S().weights.sort((a, b) => (a.date < b.date ? -1 : 1));
    db.save();
    return { imported, total: S().weights.length };
  });

  // ───────────── Products & prices ─────────────

  const withScan = (product) => ({
    ...product,
    gut: scanProduct(
      {
        name: product.name,
        ingredientsText: product.ingredientsText,
        additivesTags: product.additivesTags,
        allergensTags: product.allergensTags,
        nutriments: { fat: product.per100?.f },
      },
      S().settings.triggers,
    ),
  });

  router.get('/api/stores/search', async ({ query }) => {
    requireLive();
    const store = oneOf(query.store, 'store', ['pingodoce', 'auchan']);
    return searchStore(http, store, text(query.q, 'search', 80));
  });

  router.get('/api/stores/category', async ({ query }) => {
    requireLive();
    const store = oneOf(query.store, 'store', ['pingodoce', 'auchan']);
    const url = query.url || categoryUrl(query.foodId, store);
    if (!url) throw bad('No category page known for that food');
    return { url, items: await browseCategory(http, store, url) };
  });

  router.get('/api/stores/product', async ({ query }) => {
    requireLive();
    const store = oneOf(query.store, 'store', ['pingodoce', 'auchan']);
    try {
      const page = await fetchStoreProduct(http, store, text(query.url, 'url', 500));
      try {
        const label = await labelFor(http, page);
        Object.assign(page, { per100: label.per100, labelFrom: label.labelFrom, offUrl: label.offUrl });
      } catch {
        // the store page's own values stay
      }
      // Keep the photo so the product shows up with it everywhere.
      if (page.image) {
        try {
          const fresh = await loadCatalog(ctx.productsDir);
          const key = `${store}:${page.id || ''}`;
          const prev = fresh.products[key] || {};
          const file = await downloadPhoto(http, path.join(ctx.productsDir, 'img'), store, page.id || page.url, page.image, { force: Boolean(prev.sourceImage && prev.sourceImage !== page.image) });
          fresh.products[key] = { ...prev, key, store, id: page.id, name: page.name, url: page.url, price: page.price, unitPrice: page.unitPrice, pack: page.pack, per100: page.per100, labelFrom: page.labelFrom, offUrl: page.offUrl, ean: page.ean, ingredientsText: page.ingredientsText, image: file, sourceImage: page.image, imageFrom: 'page', fetchedAt: page.fetchedAt, detail: true };
          if (query.foodId && FOOD_BY_ID[query.foodId]) {
            const list = ((fresh.foods[query.foodId] ||= {})[store] ||= []);
            if (!list.includes(key)) list.push(key);
            fresh.products[key].foods = [...new Set([...(fresh.products[key].foods || []), query.foodId])];
          }
          await saveCatalog(ctx.productsDir, fresh);
          catalogCache = null;
          page.photo = file;
        } catch {
          // the photo is optional
        }
      }
      return withScan(page);
    } catch (err) {
      throw new ApiError(err.code === 'BAD_URL' ? 400 : 502, err.message);
    }
  });

  // Catalogue of real store products (bundled with the app + your own crawls).
  let liveCatalog = null; // the catalogue a running crawl is filling in
  const catalog = async () => {
    if (catalogCache && !liveCatalog) return catalogCache;
    const bundled = await loadCatalog(ctx.bundledProductsDir);
    const fresh = liveCatalog || (await loadCatalog(ctx.productsDir));
    const foods = {};
    for (const src of [fresh, bundled]) {
      for (const [foodId, byStore] of Object.entries(src.foods || {})) {
        for (const [store, keys] of Object.entries(byStore)) {
          const list = ((foods[foodId] ||= {})[store] ||= []);
          for (const k of keys) if (!list.includes(k)) list.push(k);
        }
      }
    }
    catalogCache = {
      updatedAt: fresh.updatedAt || bundled.updatedAt,
      products: { ...bundled.products, ...fresh.products },
      foods,
    };
    catalogCache.prices = catalogPrices(catalogCache);
    return catalogCache;
  };

  router.get('/api/catalog', () => catalog());

  // One crawl at a time: products, photos and prices for the given foods from your stores.
  let crawlJob = null;
  const startCrawl = ({ foodIds: wanted, discover = true } = {}) => {
    if (crawlJob?.status === 'running') return { jobId: crawlJob.id, total: crawlJob.total, alreadyRunning: true };
    const foodIds = Array.isArray(wanted) && wanted.length ? wanted.filter((f) => FOOD_BY_ID[f]) : Object.keys(STORE_PRODUCTS);
    const stores = (S().settings.stores || []).filter((s) => STORE_SITES[s] || s === 'mercadona');
    const id = randomUUID();
    const job = { id, status: 'running', done: 0, total: 1, updated: 0, photos: 0, products: 0, message: 'Starting…', errors: [], startedAt: new Date().toISOString() };
    jobs.set(id, job);
    crawlJob = job;
    (async () => {
      try {
        const current = await loadCatalog(ctx.productsDir);
        liveCatalog = current;
        const res = await crawlStores(http, {
          stores,
          foodIds,
          discover,
          imgDir: path.join(ctx.productsDir, 'img'),
          catalog: current,
          choices: S().productChoice,
          onProgress: ({ step, total, message, photos, products }) => Object.assign(job, { done: step, total, message, photos, products }),
        });
        await saveCatalog(ctx.productsDir, res.catalog);
        for (const [foodId, entries] of Object.entries(res.prices)) for (const e of entries) addPrice(S(), foodId, e);
        Object.assign(job, { updated: res.stats.prices, photos: res.stats.photos, products: res.stats.products, errors: res.errors.slice(0, 50) });
      } catch (err) {
        job.errors.push({ where: 'crawler', error: err.message });
      }
      liveCatalog = null;
      catalogCache = null;
      job.status = 'done';
      job.done = job.total;
      job.finishedAt = new Date().toISOString();
      db.save();
    })();
    return { jobId: id, total: foodIds.length };
  };

  router.post('/api/stores/refresh', ({ body }) => {
    requireLive();
    return startCrawl({ foodIds: body?.foodIds, discover: body?.discover !== false });
  });

  router.get('/api/stores/crawl', () => crawlJob);

  router.get('/api/jobs/:id', ({ params }) => {
    const job = jobs.get(params.id);
    if (!job) throw new ApiError(404, 'Job not found');
    return job;
  });

  router.get('/api/off/product/:code', async ({ params }) => {
    const code = String(params.code).replace(/\D/g, '');
    let product;
    try {
      product = await offProduct(http, code);
    } catch (err) {
      throw new ApiError(502, `Open Food Facts: ${err.message}`);
    }
    if (!product) throw new ApiError(404, 'Product not found on Open Food Facts. You can add it at openfoodfacts.org.');
    let prices = [];
    try {
      const loc = S().settings.location;
      prices = await recentPrices(http, { code, lat: loc.lat, lon: loc.lon, radiusKm: loc.radiusKm });
    } catch {
      prices = [];
    }
    return { ...withScan(product), prices, latestByStore: latestByStore(prices) };
  });

  router.get('/api/off/search', async ({ query }) => {
    const q = text(query.q, 'search', 80);
    const store = query.store ? oneOf(query.store, 'store', STORE_IDS) : null;
    try {
      return (await offSearch(http, q, { store })).map(withScan);
    } catch (err) {
      throw new ApiError(502, `Open Food Facts: ${err.message}`);
    }
  });

  router.get('/api/openprices', async ({ query }) => {
    const loc = S().settings.location;
    try {
      const prices = await recentPrices(http, {
        code: query.code ? String(query.code).replace(/\D/g, '') : undefined,
        category: query.category || undefined,
        lat: loc.lat,
        lon: loc.lon,
        radiusKm: loc.radiusKm,
      });
      return { prices, latestByStore: latestByStore(prices) };
    } catch (err) {
      throw new ApiError(502, `Open Prices: ${err.message}`);
    }
  });

  return {
    startCrawl,
    catalog,
    liveLookups: () => Boolean(S().settings.liveStoreLookups),
  };
}
