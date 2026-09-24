// Tiny JSON-file database. One file (data/leve.json) holds everything; writes
// are atomic (temp file + rename) and debounced.

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_TRIGGER_SETTINGS } from '../src/core/gut.js';

export const SCHEMA_VERSION = 1;

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    profile: {
      name: '',
      sex: 'male',
      age: 26,
      heightCm: 167,
      weightKg: 95,
      lifestyle: 'sedentary',
      trainingDaysPerWeek: 3,
      sessionMinutes: 60,
      pace: 'standard',
      calorieAdjustment: 0,
      calorieOverride: null,
      proteinOverride: null,
      mealsPerDay: 4,
      startDate: null,
      phase: 1,
      phaseSince: null,
      goalWeightKg: null,
    },
    settings: {
      stores: ['pingodoce', 'auchan', 'mercadona'],
      shoppingMode: 'cheapest',
      shoppingDays: 7,
      batchMode: true,
      exclusions: ['dairy_lf'],
      hiddenRecipes: [],
      favoriteRecipes: [],
      triggers: { ...DEFAULT_TRIGGER_SETTINGS },
      liveStoreLookups: true,
      contactEmail: '',
      location: { lat: 38.7223, lon: -9.1393, radiusKm: 25, label: 'Lisboa' },
      hevyAutoPushWeight: false,
      appearance: { accent: 'blue', mode: 'system' },
      useLabelNutrition: true,
    },
    weights: [],
    days: {},
    planOverrides: {},
    prices: {},
    productChoice: {},
    pantry: {},
    shoppingChecked: {},
    checkins: [],
    hevy: {
      apiKey: '',
      user: null,
      lastSyncAt: null,
      workouts: {},
      templates: {},
      templatesFetchedAt: null,
      lastError: null,
    },
  };
}

// Fill in anything missing (new fields added in later versions).
export function migrate(state) {
  const def = defaultState();
  const out = { ...def, ...state };
  for (const key of ['profile', 'settings', 'hevy']) out[key] = { ...def[key], ...(state?.[key] || {}) };
  out.settings.triggers = { ...DEFAULT_TRIGGER_SETTINGS, ...(state?.settings?.triggers || {}) };
  out.settings.location = { ...def.settings.location, ...(state?.settings?.location || {}) };
  out.settings.appearance = { ...def.settings.appearance, ...(state?.settings?.appearance || {}) };
  for (const key of ['days', 'planOverrides', 'prices', 'productChoice', 'pantry', 'shoppingChecked']) {
    if (!out[key] || typeof out[key] !== 'object' || Array.isArray(out[key])) out[key] = {};
  }
  for (const key of ['weights', 'checkins']) if (!Array.isArray(out[key])) out[key] = [];
  out.version = SCHEMA_VERSION;
  return out;
}

export class JsonDb {
  constructor(dir, { file = 'leve.json', debounceMs = 150 } = {}) {
    this.dir = dir;
    this.file = path.join(dir, file);
    this.debounceMs = debounceMs;
    this.state = null;
    this.timer = null;
    this.writing = Promise.resolve();
  }

  async load() {
    await mkdir(this.dir, { recursive: true });
    if (existsSync(this.file)) {
      const raw = await readFile(this.file, 'utf8');
      this.state = migrate(JSON.parse(raw));
      await copyFile(this.file, `${this.file}.bak`).catch(() => {});
    } else {
      this.state = defaultState();
      await this.flush();
    }
    return this.state;
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flush().catch((err) => console.error('Could not save data:', err));
    }, this.debounceMs);
  }

  async flush() {
    clearTimeout(this.timer);
    const snapshot = JSON.stringify(this.state, null, 1);
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, this.file);
    });
    return this.writing;
  }
}
