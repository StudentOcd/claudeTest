// Weight trend, rate of loss, adaptive maintenance estimate and the weekly check-in.

import { addDays, dateRange, dayIndex, daysBetween, startOfWeek } from './dates.js';
import { KCAL_PER_KG_FAT } from './nutrition.js';

const round2 = (x) => Math.round(x * 100) / 100;

export function normalizeWeights(weights) {
  const byDate = new Map();
  for (const w of weights || []) {
    if (w && typeof w.kg === 'number' && Number.isFinite(w.kg) && w.date) byDate.set(w.date, w);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Exponentially smoothed trend (10%/day, gap aware), as in "The Hacker's Diet".
export function trendSeries(weights, alphaPerDay = 0.1) {
  const entries = normalizeWeights(weights);
  let trend = null;
  let prev = null;
  return entries.map((e) => {
    if (trend === null) {
      trend = e.kg;
    } else {
      const gap = Math.max(1, daysBetween(prev, e.date));
      const a = 1 - Math.pow(1 - alphaPerDay, gap);
      trend += a * (e.kg - trend);
    }
    prev = e.date;
    return { date: e.date, kg: e.kg, trend: round2(trend), waistCm: e.waistCm ?? null };
  });
}

export function latestTrend(weights) {
  const s = trendSeries(weights);
  return s.length ? s[s.length - 1] : null;
}

export function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const { x, y } of points) {
    sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
  }
  const den = n * sxx - sx * sx;
  if (den === 0) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const ssTot = syy - (sy * sy) / n;
  const ssRes = points.reduce((acc, p) => acc + (p.y - (intercept + slope * p.x)) ** 2, 0);
  return { slope, intercept, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
}

/**
 * Rate of change from a least-squares fit of the weigh-ins in the window.
 * Negative kgPerWeek = losing. Returns null without enough data
 * (>= 4 weigh-ins spanning >= 6 days).
 */
export function weeklyRate(weights, { endDate, windowDays = 21 } = {}) {
  const entries = normalizeWeights(weights);
  if (!entries.length) return null;
  const end = endDate || entries[entries.length - 1].date;
  const start = addDays(end, -(windowDays - 1));
  const inWin = entries.filter((e) => e.date >= start && e.date <= end);
  if (inWin.length < 4) return null;
  const span = daysBetween(inWin[0].date, inWin[inWin.length - 1].date);
  if (span < 6) return null;
  const base = dayIndex(inWin[0].date);
  const fit = linearRegression(inWin.map((e) => ({ x: dayIndex(e.date) - base, y: e.kg })));
  if (!fit) return null;
  const kgPerWeek = fit.slope * 7;
  const refKg = fit.intercept + fit.slope * span;
  return {
    kgPerWeek: round2(kgPerWeek),
    pctPerWeek: round2((kgPerWeek / refKg) * 100),
    points: inWin.length,
    spanDays: span,
    from: inWin[0].date,
    to: inWin[inWin.length - 1].date,
    r2: round2(fit.r2),
  };
}

export function weeklyAverages(weights) {
  const groups = new Map();
  for (const e of normalizeWeights(weights)) {
    const wk = startOfWeek(e.date);
    if (!groups.has(wk)) groups.set(wk, []);
    groups.get(wk).push(e);
  }
  return [...groups.entries()].map(([week, list]) => {
    const kgs = list.map((e) => e.kg);
    const waists = list.map((e) => e.waistCm).filter((x) => typeof x === 'number');
    return {
      week,
      avgKg: round2(kgs.reduce((a, b) => a + b, 0) / kgs.length),
      minKg: Math.min(...kgs),
      maxKg: Math.max(...kgs),
      count: kgs.length,
      waistCm: waists.length ? round2(waists.reduce((a, b) => a + b, 0) / waists.length) : null,
    };
  });
}

/**
 * Maintenance estimated from data: average logged intake minus the energy
 * equivalent of the weight change. intakeByDate: { 'YYYY-MM-DD': kcal }.
 */
export function estimateTdeeFromData({ weights, intakeByDate, endDate, windowDays = 21 }) {
  const rate = weeklyRate(weights, { endDate, windowDays });
  if (!rate) return null;
  const days = dateRange(rate.from, rate.to);
  const logged = days.map((d) => intakeByDate?.[d]).filter((k) => typeof k === 'number' && k > 0);
  if (logged.length < Math.max(7, Math.floor(days.length * 0.6))) return null;
  const avgIntake = logged.reduce((a, b) => a + b, 0) / logged.length;
  const dailyBalance = (rate.kgPerWeek * KCAL_PER_KG_FAT) / 7; // negative when losing
  return {
    tdee: Math.round(avgIntake - dailyBalance),
    avgIntake: Math.round(avgIntake),
    loggedDays: logged.length,
    rate,
  };
}

/**
 * Weekly check-in: turns the last weeks of data into concrete suggestions.
 * Each recommendation: { id, kind, title, detail, action? }
 *   action: { type: 'calories', delta } | { type: 'phase', to }
 */
export function weeklyCheckIn({
  today,
  startDate,
  phase,
  phaseSince,
  targets,
  weights,
  adherence, // 0..1 or null
  gut, // { avgScore, looseDays, days } or null
  training, // { sessions14d, target14d, strengthChangePct } or null
  wellbeing, // { energyAvg, hungerAvg } (1..5) or null
}) {
  const recs = [];
  const daysIn = startDate ? daysBetween(startDate, today) : 0;
  const trend = latestTrend(weights);
  const rate = weeklyRate(weights, { endDate: today, windowDays: 21 });
  const recent = normalizeWeights(weights).filter((w) => w.date > addDays(today, -14));
  const lossPct = rate ? -rate.pctPerWeek : null;

  if (recent.length < 6) {
    recs.push({
      id: 'weigh-more',
      kind: 'info',
      title: 'Weigh in more often',
      detail: `Only ${recent.length} weigh-in${recent.length === 1 ? '' : 's'} in the last 14 days. Weigh 4–7 mornings a week (after the toilet, before food or drink) so the trend is reliable.`,
    });
  }

  if (daysIn < 14) {
    recs.push({
      id: 'too-early',
      kind: 'info',
      title: 'Too early to adjust calories',
      detail: 'The first 1–2 weeks mostly show water and glycogen changes (especially after cutting fast food and salt). Keep going and log consistently.',
    });
  } else if (lossPct !== null) {
    const floorGap = targets.kcal - targets.floor;
    if (lossPct > 1.0) {
      recs.push({
        id: 'too-fast',
        kind: 'calories',
        title: 'Losing faster than planned: eat a bit more',
        detail: `You are losing ${lossPct.toFixed(2)}% of body weight per week. Above ~1%/week you risk losing muscle, losing gym performance and feeling drained. Add ~150 kcal (e.g. 40 g more rice or 1 banana).`,
        action: { type: 'calories', delta: 150 },
      });
    } else if (lossPct >= 0.4) {
      recs.push({
        id: 'on-track',
        kind: 'good',
        title: 'On track',
        detail: `Trend: ${rate.kgPerWeek.toFixed(2)} kg/week (${lossPct.toFixed(2)}%/week). No change needed.`,
      });
    } else if (adherence !== null && adherence < 0.8) {
      recs.push({
        id: 'adherence',
        kind: 'info',
        title: 'Focus on consistency before cutting calories',
        detail: `Weight loss is slow (${rate.kgPerWeek.toFixed(2)} kg/week), but only ${Math.round(adherence * 100)}% of planned meals were logged as eaten. Aim for 80%+ before changing the target.`,
      });
    } else if (floorGap >= 100) {
      recs.push({
        id: 'too-slow',
        kind: 'calories',
        title: 'Loss has slowed: small reduction',
        detail: `Trend is ${rate.kgPerWeek.toFixed(2)} kg/week. Reduce by ~100 kcal/day, or add ~2,000 steps/day instead if you prefer to keep the food.`,
        action: { type: 'calories', delta: -100 },
      });
    } else {
      recs.push({
        id: 'at-floor',
        kind: 'info',
        title: 'Move more rather than eat less',
        detail: 'You are close to the minimum calorie target. Add daily walking (+2,000 steps) instead of cutting food further.',
      });
    }
  }

  if (wellbeing && ((wellbeing.energyAvg && wellbeing.energyAvg <= 2) || (wellbeing.hungerAvg && wellbeing.hungerAvg >= 4))) {
    recs.push({
      id: 'wellbeing',
      kind: 'calories',
      title: 'Low energy or high hunger',
      detail: 'Add ~100 kcal on training days (extra potatoes or rice around the workout), keep protein high and fill up with cooked vegetables and soup. Check sleep (7+ h).',
      action: { type: 'calories', delta: 100 },
    });
  }

  if (daysIn >= 84) {
    recs.push({
      id: 'diet-break',
      kind: 'info',
      title: 'Consider a diet break',
      detail: 'After ~12 weeks of dieting, 1–2 weeks at maintenance (about your TDEE) can restore energy and training performance. Your progress stays.',
    });
  }

  if (training) {
    if (training.sessions14d !== null && training.sessions14d < training.target14d - 1) {
      recs.push({
        id: 'train-more',
        kind: 'training',
        title: 'Keep training 3×/week',
        detail: `${training.sessions14d} sessions in the last 14 days (goal ${training.target14d}). Lifting while dieting is what keeps you from ending up "skinny-fat".`,
      });
    }
    if (typeof training.strengthChangePct === 'number' && training.strengthChangePct <= -7) {
      recs.push({
        id: 'strength-drop',
        kind: 'calories',
        title: 'Strength is dropping',
        detail: `Your main lifts are ${Math.abs(training.strengthChangePct).toFixed(0)}% weaker than 4 weeks ago. Add ~150 kcal, keep protein at target and prioritise sleep.`,
        action: { type: 'calories', delta: 150 },
      });
    }
  }

  const phaseDays = phaseSince ? daysBetween(phaseSince, today) : daysIn;
  if (gut && gut.days >= 5) {
    const troubled = gut.avgScore >= 1.5 || gut.looseDays >= 3;
    if (troubled) {
      recs.push({
        id: 'gut-hold',
        kind: 'gut',
        title: 'Gut is unsettled: hold the current phase',
        detail: 'Do not add new foods or fibre this week. Check the Gut tab for possible triggers. If symptoms persist, or you notice blood, night-time diarrhoea, fever or unexplained weight loss, see a doctor.',
      });
    } else if (phase === 1 && phaseDays >= 14 && gut.avgScore < 1) {
      recs.push({
        id: 'phase-2',
        kind: 'phase',
        title: 'Ready for phase 2 (Build)',
        detail: 'Your gut has been calm. Move to the full calorie target and start adding oats, fruit and more vegetables slowly.',
        action: { type: 'phase', to: 2 },
      });
    } else if (phase === 2 && phaseDays >= 28 && gut.avgScore < 1) {
      recs.push({
        id: 'phase-3',
        kind: 'phase',
        title: 'Ready for phase 3 (Expand)',
        detail: 'Things are stable. You can start testing new foods one at a time, 3 days apart.',
        action: { type: 'phase', to: 3 },
      });
    }
  }

  return { daysIn, trend, rate, lossPct, recommendations: recs };
}
