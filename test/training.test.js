import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compactWorkout, e1rm, exerciseProgress, matchProgram, muscleSets, personalRecords, PROGRAM,
  routinePayload, sessionsPerWeek, strengthChangePct, workoutStats,
} from '../src/core/training.js';

function hevyWorkout(id, date, kg, reps = 8) {
  return {
    id,
    title: 'Full Body A',
    start_time: `${date}T18:00:00Z`,
    end_time: `${date}T19:05:00Z`,
    exercises: [
      {
        title: 'Leg Press (Machine)',
        exercise_template_id: 'LP',
        sets: [
          { type: 'warmup', weight_kg: 40, reps: 12 },
          { type: 'normal', weight_kg: kg, reps },
          { type: 'normal', weight_kg: kg, reps: reps - 1 },
        ],
      },
      { title: 'Plank', exercise_template_id: 'PL', sets: [{ type: 'normal', duration_seconds: 30 }] },
    ],
  };
}

test('Epley estimate', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.ok(Math.abs(e1rm(100, 10) - 133.33) < 0.01);
  assert.equal(e1rm(100, 20), null);
  assert.equal(e1rm(0, 5), null);
});

test('workout stats skip warm-ups', () => {
  const w = compactWorkout(hevyWorkout('a', '2026-10-01', 100));
  const s = workoutStats(w);
  assert.equal(s.sets, 3);
  assert.equal(s.volumeKg, 100 * 8 + 100 * 7);
  assert.equal(s.durationMin, 65);
});

test('sessions per week and progress', () => {
  const ws = [
    compactWorkout(hevyWorkout('a', '2026-09-01', 100)),
    compactWorkout(hevyWorkout('b', '2026-09-03', 105)),
    compactWorkout(hevyWorkout('c', '2026-09-29', 110)),
    compactWorkout(hevyWorkout('d', '2026-10-01', 112.5)),
  ];
  const weeks = sessionsPerWeek(ws, '2026-10-02', 6);
  assert.equal(weeks[weeks.length - 1].count, 2);
  const prog = exerciseProgress(ws).get('LP');
  assert.equal(prog.sessions.length, 4);
  assert.ok(prog.sessions[3].e1rm > prog.sessions[0].e1rm);
  assert.equal(personalRecords(ws)[0].kg, 112.5);
  assert.ok(strengthChangePct(ws, '2026-10-02') > 0);
});

test('muscle sets use template muscle groups', () => {
  const ws = [compactWorkout(hevyWorkout('a', '2026-10-01', 100))];
  const sets = muscleSets(ws, { LP: { primary: 'quadriceps', secondary: ['glutes'] } }, '2026-10-02');
  assert.deepEqual(sets, { quadriceps: 2, glutes: 1 });
});

const templates = [
  { id: 'T1', title: 'Leg Press (Machine)', type: 'weight_reps' },
  { id: 'T2', title: 'Chest Press (Machine)', type: 'weight_reps' },
  { id: 'T3', title: 'Lat Pulldown (Cable)', type: 'weight_reps' },
  { id: 'T4', title: 'Romanian Deadlift (Dumbbell)', type: 'weight_reps' },
  { id: 'T5', title: 'Lateral Raise (Dumbbell)', type: 'weight_reps' },
  { id: 'T6', title: 'Plank', type: 'duration' },
  { id: 'T7', title: 'Goblet Squat', type: 'weight_reps' },
  { id: 'T8', title: 'Seated Cable Row - V Grip (Cable)', type: 'weight_reps' },
  { id: 'T9', title: 'Shoulder Press (Dumbbell)', type: 'weight_reps' },
  { id: 'T10', title: 'Seated Leg Curl (Machine)', type: 'weight_reps' },
  { id: 'T11', title: 'Bicep Curl (Dumbbell)', type: 'weight_reps' },
  { id: 'T12', title: 'Triceps Rope Pushdown', type: 'weight_reps' },
];

test('programme maps onto Hevy templates', () => {
  const m = matchProgram(templates);
  assert.equal(m.routines.length, 2);
  assert.equal(m.routines[0].exercises[0].template.id, 'T1');
  // Dead Bug is missing, so B's core slot falls back to Plank
  assert.equal(m.routines[1].exercises.at(-1).template.id, 'T6');
  assert.deepEqual(m.missing, []);
  const withoutRow = matchProgram(templates.filter((t) => t.id !== 'T8'));
  assert.ok(withoutRow.missing.some((s) => s.includes('Horizontal pull')));
});

test('routine payload follows the Hevy API shape', () => {
  const m = matchProgram(templates);
  const body = routinePayload(m.routines[0], 42);
  assert.equal(body.routine.folder_id, 42);
  assert.equal(body.routine.title, PROGRAM.routines[0].title);
  const legPress = body.routine.exercises[0];
  assert.equal(legPress.exercise_template_id, 'T1');
  assert.equal(legPress.sets.length, 3);
  assert.deepEqual(legPress.sets[0].rep_range, { start: 8, end: 12 });
  const plank = body.routine.exercises.find((e) => e.exercise_template_id === 'T6');
  assert.equal(plank.sets[0].duration_seconds, 30);
});
