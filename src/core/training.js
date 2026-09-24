// Training analytics over Hevy workouts, and the beginner full-body programme
// that the app can create in Hevy for you.

import { addDays, localDateOfTimestamp, startOfWeek } from './dates.js';

const round1 = (x) => Math.round(x * 10) / 10;

// Compact form of a Hevy workout (what we store locally).
export function compactWorkout(w) {
  return {
    id: w.id,
    title: w.title || 'Workout',
    start: w.start_time,
    end: w.end_time,
    updatedAt: w.updated_at || null,
    routineId: w.routine_id || null,
    exercises: (w.exercises || []).map((e) => ({
      title: e.title,
      templateId: e.exercise_template_id,
      sets: (e.sets || []).map((s) => ({
        type: s.type || 'normal',
        kg: s.weight_kg ?? null,
        reps: s.reps ?? null,
        rpe: s.rpe ?? null,
        secs: s.duration_seconds ?? null,
        m: s.distance_meters ?? null,
      })),
    })),
  };
}

const isWorking = (s) => s.type !== 'warmup';

// Epley estimate of a one-rep max; unreliable above ~12 reps.
export function e1rm(kg, reps) {
  if (!(kg > 0) || !(reps > 0) || reps > 12) return null;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

export function workoutDate(w) {
  return localDateOfTimestamp(w.start);
}

export function workoutStats(w) {
  let sets = 0;
  let volume = 0;
  for (const e of w.exercises) {
    for (const s of e.sets) {
      if (!isWorking(s)) continue;
      sets++;
      if (s.kg > 0 && s.reps > 0) volume += s.kg * s.reps;
    }
  }
  const mins = w.start && w.end ? (new Date(w.end) - new Date(w.start)) / 60000 : null;
  return {
    date: workoutDate(w),
    durationMin: mins && mins > 0 ? Math.round(mins) : null,
    sets,
    volumeKg: Math.round(volume),
    exercises: w.exercises.length,
  };
}

export function sortWorkouts(workouts) {
  return [...workouts].sort((a, b) => (a.start < b.start ? 1 : -1));
}

export function sessionsPerWeek(workouts, today, weeks = 8) {
  const thisWeek = startOfWeek(today);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ week: addDays(thisWeek, -7 * i), count: 0 });
  const idx = new Map(out.map((w, i) => [w.week, i]));
  for (const w of workouts) {
    const d = workoutDate(w);
    if (!d) continue;
    const k = idx.get(startOfWeek(d));
    if (k !== undefined) out[k].count++;
  }
  return out;
}

export function sessionsBetween(workouts, from, to) {
  return workouts.filter((w) => {
    const d = workoutDate(w);
    return d && d >= from && d <= to;
  }).length;
}

// Per exercise: best estimated 1RM and best set of each session, oldest first.
export function exerciseProgress(workouts) {
  const map = new Map();
  for (const w of sortWorkouts(workouts).reverse()) {
    const date = workoutDate(w);
    for (const e of w.exercises) {
      const key = e.templateId || e.title;
      let best = null;
      for (const s of e.sets) {
        if (!isWorking(s)) continue;
        const est = e1rm(s.kg, s.reps);
        if (est && (!best || est > best.e1rm)) best = { e1rm: est, kg: s.kg, reps: s.reps };
      }
      if (!best) continue;
      if (!map.has(key)) map.set(key, { key, title: e.title, sessions: [] });
      map.get(key).sessions.push({ date, e1rm: round1(best.e1rm), kg: best.kg, reps: best.reps });
    }
  }
  return map;
}

export function topExercises(progress, n = 5) {
  return [...progress.values()].sort((a, b) => b.sessions.length - a.sessions.length).slice(0, n);
}

/**
 * Average % change in best e1RM for the main lifts: last 14 days versus the
 * 14 days ending 4 weeks ago. Null without enough overlapping data.
 */
export function strengthChangePct(workouts, today) {
  const progress = exerciseProgress(workouts);
  const recentFrom = addDays(today, -13);
  const pastTo = addDays(today, -28);
  const pastFrom = addDays(pastTo, -13);
  const changes = [];
  for (const ex of topExercises(progress, 6)) {
    const recent = ex.sessions.filter((s) => s.date >= recentFrom && s.date <= today);
    const past = ex.sessions.filter((s) => s.date >= pastFrom && s.date <= pastTo);
    if (!recent.length || !past.length) continue;
    const r = Math.max(...recent.map((s) => s.e1rm));
    const p = Math.max(...past.map((s) => s.e1rm));
    changes.push(((r - p) / p) * 100);
  }
  if (!changes.length) return null;
  return round1(changes.reduce((a, b) => a + b, 0) / changes.length);
}

export function personalRecords(workouts) {
  const out = [];
  for (const ex of exerciseProgress(workouts).values()) {
    const best = ex.sessions.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    out.push({ title: ex.title, e1rm: best.e1rm, kg: best.kg, reps: best.reps, date: best.date, sessions: ex.sessions.length });
  }
  return out.sort((a, b) => b.sessions - a.sessions);
}

// Working sets per primary muscle in the last 7 days (secondary muscles count half).
export function muscleSets(workouts, templates, today) {
  const from = addDays(today, -6);
  const out = {};
  for (const w of workouts) {
    const d = workoutDate(w);
    if (!d || d < from || d > today) continue;
    for (const e of w.exercises) {
      const t = templates?.[e.templateId];
      if (!t) continue;
      const n = e.sets.filter(isWorking).length;
      if (!n) continue;
      if (t.primary) out[t.primary] = (out[t.primary] || 0) + n;
      for (const m of t.secondary || []) out[m] = (out[m] || 0) + n / 2;
    }
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

// ───────────── Programme ─────────────

export const PROGRAM = {
  folderTitle: 'Leve – Full Body 3x/week',
  routines: [
    {
      title: 'Leve – Full Body A',
      notes: 'Alternate A and B (A-B-A one week, B-A-B the next). Warm up with 1–2 light sets on the first exercise. Stop each set 1–2 reps before failure.',
      exercises: [
        { slot: 'Legs (knee dominant)', candidates: ['Leg Press (Machine)', 'Leg Press Horizontal (Machine)', 'Goblet Squat', 'Squat (Smith Machine)'], sets: 3, reps: [8, 12], rest: 120 },
        { slot: 'Chest press', candidates: ['Chest Press (Machine)', 'Bench Press (Dumbbell)', 'Bench Press (Barbell)'], sets: 3, reps: [8, 12], rest: 120 },
        { slot: 'Vertical pull', candidates: ['Lat Pulldown (Cable)', 'Lat Pulldown (Machine)', 'Lat Pulldown - Close Grip (Cable)', 'Assisted Pull Up'], sets: 3, reps: [10, 12], rest: 90 },
        { slot: 'Hip hinge', candidates: ['Romanian Deadlift (Dumbbell)', 'Romanian Deadlift (Barbell)', 'Hip Thrust (Machine)', 'Hip Thrust (Barbell)'], sets: 3, reps: [8, 12], rest: 120 },
        { slot: 'Shoulders', candidates: ['Lateral Raise (Dumbbell)', 'Lateral Raise (Cable)', 'Lateral Raise (Machine)'], sets: 2, reps: [12, 15], rest: 60 },
        { slot: 'Core', candidates: ['Plank'], sets: 3, seconds: 30, rest: 60 },
      ],
    },
    {
      title: 'Leve – Full Body B',
      notes: 'Double progression: when you hit the top of the rep range on all sets, add the smallest weight step next time.',
      exercises: [
        { slot: 'Legs (squat)', candidates: ['Goblet Squat', 'Squat (Smith Machine)', 'Leg Press (Machine)', 'Squat (Barbell)'], sets: 3, reps: [8, 12], rest: 120 },
        { slot: 'Horizontal pull', candidates: ['Seated Cable Row - V Grip (Cable)', 'Seated Row (Machine)', 'Dumbbell Row', 'Bent Over Row (Dumbbell)'], sets: 3, reps: [10, 12], rest: 90 },
        { slot: 'Overhead press', candidates: ['Shoulder Press (Dumbbell)', 'Seated Shoulder Press (Machine)', 'Shoulder Press (Machine Plates)', 'Overhead Press (Dumbbell)'], sets: 3, reps: [8, 12], rest: 120 },
        { slot: 'Hamstrings', candidates: ['Seated Leg Curl (Machine)', 'Lying Leg Curl (Machine)'], sets: 3, reps: [10, 15], rest: 90 },
        { slot: 'Biceps', candidates: ['Bicep Curl (Dumbbell)', 'Bicep Curl (Cable)', 'Hammer Curl (Dumbbell)'], sets: 2, reps: [10, 15], rest: 60 },
        { slot: 'Triceps', candidates: ['Triceps Pushdown', 'Triceps Rope Pushdown', 'Triceps Extension (Cable)'], sets: 2, reps: [10, 15], rest: 60 },
        { slot: 'Core', candidates: ['Dead Bug', 'Plank', 'Crunch'], sets: 3, reps: [8, 12], seconds: 30, rest: 60 },
      ],
    },
  ],
};

export function normalizeTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(t) {
  return new Set(normalizeTitle(t).split(' ').filter(Boolean));
}

function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

/**
 * Map programme slots to the user's Hevy exercise templates.
 * templates: array of { id, title, type }
 */
export function matchProgram(templates, program = PROGRAM) {
  const byTitle = new Map(templates.map((t) => [normalizeTitle(t.title), t]));
  const missing = [];
  const routines = program.routines.map((r) => ({
    title: r.title,
    notes: r.notes,
    exercises: r.exercises.map((ex) => {
      let match = null;
      for (const c of ex.candidates) {
        const t = byTitle.get(normalizeTitle(c));
        if (t) {
          match = t;
          break;
        }
      }
      if (!match) {
        let best = null;
        for (const c of ex.candidates) {
          for (const t of templates) {
            const s = similarity(c, t.title);
            if (s >= 0.75 && (!best || s > best.s)) best = { s, t };
          }
        }
        match = best?.t || null;
      }
      if (!match) missing.push(`${r.title}: ${ex.slot}`);
      return { ...ex, template: match ? { id: match.id, title: match.title, type: match.type } : null };
    }),
  }));
  return { routines, missing };
}

const DURATION_TYPES = new Set(['duration', 'weight_duration', 'distance_duration']);

// Hevy POST /v1/routines body for one matched routine.
export function routinePayload(routine, folderId = null) {
  const exercises = routine.exercises
    .filter((ex) => ex.template)
    .map((ex) => {
      const timed = DURATION_TYPES.has(ex.template.type);
      const [lo, hi] = ex.reps || [8, 12];
      const set = timed
        ? { type: 'normal', weight_kg: null, reps: null, duration_seconds: ex.seconds || 30 }
        : { type: 'normal', weight_kg: null, reps: null, rep_range: { start: lo, end: hi } };
      return {
        exercise_template_id: ex.template.id,
        superset_id: null,
        rest_seconds: ex.rest,
        notes: timed ? `${ex.sets} × ${ex.seconds || 30} s` : `${ex.sets} × ${lo}–${hi} reps, 1–2 reps in reserve`,
        sets: Array.from({ length: ex.sets }, () => ({ ...set })),
      };
    });
  return { routine: { title: routine.title, folder_id: folderId, notes: routine.notes, exercises } };
}
