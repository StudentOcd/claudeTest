// Energy and macro targets.
//
// Maintenance (TDEE) = Mifflin-St Jeor BMR x lifestyle factor + strength-training
// energy. The deficit is sized from a weekly loss pace expressed as % of body
// weight, capped at 30% of TDEE and never below a calorie floor.

export const KCAL_PER_KG_FAT = 7700;

export const LIFESTYLES = {
  sedentary: { factor: 1.2, label: 'Mostly sitting, under ~5,000 steps/day' },
  low: { factor: 1.3, label: 'Some walking, ~5,000–7,500 steps/day' },
  moderate: { factor: 1.4, label: 'On your feet a lot, ~7,500–10,000 steps/day' },
  high: { factor: 1.5, label: 'Physical job or 10,000+ steps/day' },
};

// Weekly loss pace as % of body weight.
export const PACES = {
  gentle: { pctPerWeek: 0.3, label: 'Gentle (~0.3%/week)' },
  standard: { pctPerWeek: 0.5, label: 'Standard (~0.5%/week)' },
  faster: { pctPerWeek: 0.75, label: 'Faster (~0.75%/week)' },
};

// Gut phases: gradual transition from fast food to a higher-fibre diet.
export const PHASES = {
  1: {
    name: 'Settle',
    weeks: '1–2',
    fibreG: 18,
    pace: 'gentle',
    summary: 'Regular meals, familiar low-residue foods, well-cooked vegetables, small deficit.',
  },
  2: {
    name: 'Build',
    weeks: '3–6',
    fibreG: 24,
    pace: null, // the user's chosen pace
    summary: 'Full deficit. Add oats, more vegetables and fruit slowly (+3–5 g fibre per week).',
  },
  3: {
    name: 'Expand',
    weeks: '7+',
    fibreG: 28,
    pace: null,
    summary: 'Keep the deficit. Test new foods one at a time (e.g. lactose-free yogurt, small portions of legumes).',
  },
};

export const MEAL_SLOTS = {
  4: [
    { id: 'breakfast', label: 'Breakfast', kcal: 0.25, protein: 0.21 },
    { id: 'lunch', label: 'Lunch', kcal: 0.3, protein: 0.31 },
    { id: 'snack', label: 'Snack', kcal: 0.15, protein: 0.17 },
    { id: 'dinner', label: 'Dinner', kcal: 0.3, protein: 0.31 },
  ],
  3: [
    { id: 'breakfast', label: 'Breakfast', kcal: 0.28, protein: 0.26 },
    { id: 'lunch', label: 'Lunch', kcal: 0.36, protein: 0.37 },
    { id: 'dinner', label: 'Dinner', kcal: 0.36, protein: 0.37 },
  ],
};

export function mealSlots(mealsPerDay = 4) {
  return MEAL_SLOTS[mealsPerDay] || MEAL_SLOTS[4];
}

export const round = (x, step = 1) => Math.round(x / step) * step;

export function bmrMifflin({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

export function bmi(weightKg, heightCm) {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

// Net energy of resistance training (Compendium ~3.5 MET), averaged per day.
export function trainingKcalPerDay({ weightKg, sessionsPerWeek = 0, sessionMinutes = 60, met = 3.5 }) {
  return ((met - 1) * weightKg * (sessionMinutes / 60) * sessionsPerWeek) / 7;
}

export function estimateTDEE(profile, weightKg = profile.weightKg) {
  const bmr = bmrMifflin({ ...profile, weightKg });
  const lifestyle = LIFESTYLES[profile.lifestyle] || LIFESTYLES.sedentary;
  const base = bmr * lifestyle.factor;
  const training = trainingKcalPerDay({
    weightKg,
    sessionsPerWeek: profile.trainingDaysPerWeek ?? 3,
    sessionMinutes: profile.sessionMinutes ?? 60,
  });
  return { bmr, base, training, tdee: base + training };
}

// Weight used for protein targets. With obesity, total body weight
// overstates lean mass, so use the clinical "adjusted body weight".
export function referenceWeight(weightKg, heightCm) {
  const m = heightCm / 100;
  const upper = 25 * m * m; // weight at BMI 25
  if (weightKg <= upper) return weightKg;
  return upper + 0.4 * (weightKg - upper);
}

export function proteinTarget(weightKg, heightCm, gPerKg = 1.75) {
  return round(gPerKg * referenceWeight(weightKg, heightCm), 5);
}

export function calorieFloor(profile) {
  return profile.sex === 'female' ? 1200 : 1500;
}

/**
 * Daily targets for a given phase.
 * options.weightKg: current (trend) weight, defaults to profile.weightKg
 * options.tdee: use this maintenance estimate instead of the formula
 */
export function computeTargets(profile, { phase = 2, weightKg, tdee: tdeeOverride } = {}) {
  const w = weightKg ?? profile.weightKg;
  const est = estimateTDEE(profile, w);
  const tdee = tdeeOverride ?? est.tdee;
  const phaseInfo = PHASES[phase] || PHASES[2];
  const paceKey = phaseInfo.pace || profile.pace || 'standard';
  const pace = PACES[paceKey] || PACES.standard;
  const deficit = Math.min(((pace.pctPerWeek / 100) * w * KCAL_PER_KG_FAT) / 7, tdee * 0.3);
  const floor = calorieFloor(profile);

  let kcal;
  if (profile.calorieOverride) {
    kcal = profile.calorieOverride;
  } else {
    kcal = round(tdee - deficit, 50) + (profile.calorieAdjustment || 0);
  }
  kcal = Math.max(kcal, floor);

  const protein = profile.proteinOverride || proteinTarget(w, profile.heightCm);
  const fat = Math.max(45, round((kcal * 0.28) / 9));
  // Carbohydrates as on EU labels (without fibre): fibre brings its own 2 kcal/g.
  const carbs = Math.max(0, round((kcal - protein * 4 - fat * 9 - phaseInfo.fibreG * 2) / 4));

  return {
    kcal,
    protein,
    fat,
    carbs,
    fibre: phaseInfo.fibreG,
    waterL: round(Math.min(3.5, Math.max(2, 0.03 * referenceWeight(w, profile.heightCm))), 0.5),
    tdee: round(tdee),
    bmr: round(est.bmr),
    deficit: round(tdee - kcal),
    expectedLossKgPerWeek: Math.max(0, ((tdee - kcal) * 7) / KCAL_PER_KG_FAT),
    pace: paceKey,
    floor,
    phase: Number(phase) in PHASES ? Number(phase) : 2,
  };
}

// Per-slot calorie and protein budgets.
export function slotBudgets(targets, mealsPerDay = 4) {
  return mealSlots(mealsPerDay).map((s) => ({
    ...s,
    kcalTarget: targets.kcal * s.kcal,
    proteinTarget: targets.protein * s.protein,
  }));
}

export function sumMacros(list) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, fib: 0 };
  for (const m of list) {
    t.kcal += m.kcal || 0;
    t.p += m.p || 0;
    t.f += m.f || 0;
    t.c += m.c || 0;
    t.fib += m.fib || 0;
  }
  return t;
}
