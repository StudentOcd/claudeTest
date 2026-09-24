// Hevy public API client (https://api.hevyapp.com/docs). Needs Hevy Pro and an
// API key from https://hevy.com/settings?developer. The key never leaves the server.

import { HttpError } from './http.js';
import { compactWorkout, matchProgram, PROGRAM, routinePayload } from '../../src/core/training.js';

export const HEVY_BASE = 'https://api.hevyapp.com';

// Fields accepted by PUT /v1/body_measurements/{date} (everything else is dropped).
const MEASUREMENT_FIELDS = [
  'weight_kg', 'lean_mass_kg', 'fat_percent', 'neck_cm', 'shoulder_cm', 'chest_cm', 'left_bicep_cm', 'right_bicep_cm',
  'left_forearm_cm', 'right_forearm_cm', 'abdomen', 'waist', 'hips', 'left_thigh', 'right_thigh', 'left_calf', 'right_calf',
];

export class HevyClient {
  constructor(http, apiKey, { baseUrl = HEVY_BASE } = {}) {
    if (!apiKey) throw new HttpError('Hevy API key missing', { code: 'NO_KEY' });
    this.http = http;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  url(pathname, query = {}) {
    const u = new URL(pathname, this.baseUrl);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    return u.toString();
  }

  explain(err) {
    if (err.status === 401 || err.status === 403) {
      return new HttpError('Hevy rejected the API key (it needs Hevy Pro; copy it again from hevy.com/settings?developer).', {
        status: err.status,
        code: 'HEVY_AUTH',
      });
    }
    return err;
  }

  async get(pathname, query) {
    try {
      return await this.http.get(this.url(pathname, query), { headers: { 'api-key': this.apiKey }, rateKey: 'hevy' });
    } catch (err) {
      throw this.explain(err);
    }
  }

  async send(method, pathname, body) {
    const res = await this.http.send(method, this.url(pathname), { body, headers: { 'api-key': this.apiKey }, rateKey: 'hevy' });
    if (!res.ok) {
      const msg = typeof res.body === 'object' && res.body?.error ? res.body.error : JSON.stringify(res.body || '').slice(0, 200);
      throw this.explain(new HttpError(`Hevy ${method} ${pathname} failed (${res.status}): ${msg}`, { status: res.status }));
    }
    return res.body;
  }

  userInfo() {
    return this.get('/v1/user/info');
  }

  workoutCount() {
    return this.get('/v1/workouts/count');
  }

  // Walks every page of a paginated endpoint and returns the concatenated items.
  async allPages(pathname, key, { pageSize = 10, query = {}, maxPages = 500, onPage } = {}) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      let res;
      try {
        res = await this.get(pathname, { ...query, page, pageSize });
      } catch (err) {
        if (err.status === 404 && page > 1) break; // some endpoints 404 past the last page
        if (err.status === 404) return out;
        throw err;
      }
      const items = res?.[key] || [];
      out.push(...items);
      onPage?.(page, res?.page_count || page);
      if (!res?.page_count || page >= res.page_count || !items.length) break;
    }
    return out;
  }

  listWorkouts(opts) {
    return this.allPages('/v1/workouts', 'workouts', { pageSize: 10, ...opts });
  }

  workoutEvents(since, opts) {
    return this.allPages('/v1/workouts/events', 'events', { pageSize: 10, query: { since }, ...opts });
  }

  exerciseTemplates(opts) {
    return this.allPages('/v1/exercise_templates', 'exercise_templates', { pageSize: 100, ...opts });
  }

  routines(opts) {
    return this.allPages('/v1/routines', 'routines', { pageSize: 10, ...opts });
  }

  bodyMeasurements(opts) {
    return this.allPages('/v1/body_measurements', 'body_measurements', { pageSize: 10, ...opts });
  }

  async bodyMeasurement(date) {
    try {
      return await this.get(`/v1/body_measurements/${date}`);
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  createRoutineFolder(title) {
    return this.send('POST', '/v1/routine_folders', { routine_folder: { title } });
  }

  createRoutine(payload) {
    return this.send('POST', '/v1/routines', payload);
  }

  /**
   * Save weight (and waist) for a date without wiping other measurements:
   * PUT replaces every field, so merge with what Hevy already has.
   */
  async upsertWeight(date, { kg, waistCm }) {
    const existing = await this.bodyMeasurement(date);
    if (!existing) {
      const body = { date, weight_kg: kg };
      if (waistCm) body.waist = waistCm;
      await this.send('POST', '/v1/body_measurements', body);
      return 'created';
    }
    const current = existing.body_measurement || existing;
    const merged = {};
    for (const f of MEASUREMENT_FIELDS) if (current[f] !== undefined) merged[f] = current[f];
    merged.weight_kg = kg;
    if (waistCm) merged.waist = waistCm;
    await this.send('PUT', `/v1/body_measurements/${date}`, merged);
    return 'updated';
  }
}

/**
 * Incremental workout sync into `store` ({ workouts: {id: compact}, lastSyncAt }).
 * First run pulls every workout; later runs only apply update/delete events.
 */
export async function syncWorkouts(client, store, { now = new Date(), onProgress } = {}) {
  const startedAt = now.toISOString();
  let added = 0;
  let deleted = 0;
  if (!store.lastSyncAt) {
    const all = await client.listWorkouts({ onPage: (p, n) => onProgress?.(`workouts page ${p}/${n}`) });
    store.workouts = {};
    for (const w of all) store.workouts[w.id] = compactWorkout(w);
    added = all.length;
  } else {
    const events = await client.workoutEvents(store.lastSyncAt, { onPage: (p, n) => onProgress?.(`events page ${p}/${n}`) });
    // Events come newest first: apply oldest first so the newest state wins.
    for (const ev of [...events].reverse()) {
      if (ev.type === 'deleted' && ev.id) {
        if (store.workouts[ev.id]) deleted++;
        delete store.workouts[ev.id];
      } else if (ev.workout?.id) {
        store.workouts[ev.workout.id] = compactWorkout(ev.workout);
        added++;
      }
    }
  }
  store.lastSyncAt = startedAt;
  return { added, deleted, total: Object.keys(store.workouts).length };
}

export async function fetchTemplates(client) {
  const list = await client.exerciseTemplates();
  const map = {};
  for (const t of list) {
    map[t.id] = {
      id: t.id,
      title: t.title,
      type: t.type,
      primary: t.primary_muscle_group || null,
      secondary: t.secondary_muscle_groups || [],
      custom: Boolean(t.is_custom),
    };
  }
  return map;
}

export function previewProgram(templatesMap, program = PROGRAM) {
  return matchProgram(Object.values(templatesMap), program);
}

// Creates the folder and both routines in Hevy. Returns what was created.
export async function createProgram(client, templatesMap, program = PROGRAM) {
  const match = previewProgram(templatesMap, program);
  let folderId = null;
  try {
    const folder = await client.createRoutineFolder(program.folderTitle);
    folderId = folder?.routine_folder?.id ?? folder?.id ?? null;
  } catch {
    folderId = null; // routines still go to "My Routines"
  }
  const created = [];
  for (const r of match.routines) {
    const res = await client.createRoutine(routinePayload(r, folderId));
    const routine = Array.isArray(res?.routine) ? res.routine[0] : res?.routine || res;
    created.push({ title: r.title, id: routine?.id || null, exercises: r.exercises.filter((e) => e.template).length });
  }
  return { folderId, created, missing: match.missing };
}
