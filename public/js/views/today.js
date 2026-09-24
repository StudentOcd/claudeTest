import { app } from '../app.js';
import { api } from '../api.js';
import { html, fmt, toast, bar, ring, formData, remembered, openAttr } from '../ui.js';
import { icon } from '../icons.js';
import { crawlCard, mealCollage } from '../photos.js';
import { FOOD_BY_ID, amountParts, isSeasoning, plainName } from '/core/foods.js';
import { LIFESTYLES, PACES } from '/core/nutrition.js';
import { intakeFromLog, mealSnapshot } from '/core/planner.js';
import { weeklyRate } from '/core/weight.js';
import { SYMPTOMS, BRISTOL } from '/core/gut.js';
import { dayIndex, startOfWeek, addDays } from '/core/dates.js';
import { sessionsBetween } from '/core/training.js';

const TIPS = {
  1: [
    'Eat at roughly the same times every day: your gut likes a routine.',
    'Cook vegetables until soft this fortnight; raw salads can wait for phase 2.',
    'Weigh the olive oil. Oily meals are a common trigger for urgency and reflux.',
    'Finish dinner 2–3 hours before bed to keep reflux away.',
    'Drink water through the day (about 2.5 L) rather than big glasses with meals.',
    'Craving fast food? Grilled chicken + rice or potatoes at a "prato do dia" place fits the plan.',
    'Chew slowly and put the fork down between bites. It helps both fullness and bloating.',
  ],
  2: [
    'Add fibre slowly: one new higher-fibre food every few days, not all at once.',
    'Oats, kiwi, carrots and potatoes give soluble fibre, which tends to be gentle.',
    'Hungry? Start lunch or dinner with a bowl of carrot & courgette soup.',
    'Keep protein at every meal: it protects muscle and keeps you full.',
    'A 20–30 min walk after meals helps digestion and blood sugar.',
    'Sleep 7+ hours: poor sleep makes hunger and cravings much stronger.',
    'Coffee: 1–2 cups after food is fine; on an empty stomach it can trigger urgency.',
  ],
  3: [
    'Test one new food at a time, 3 days in a row, small then normal portion.',
    'If a test goes badly, drop it for now and try again in a few weeks.',
    'Lactose-free yogurt is a good first test: plain, no sweeteners.',
    'Keep weighing in 4–7 times a week: the trend is what matters.',
    'Eating out: grilled fish/meat, rice or potatoes, sauce on the side.',
  ],
};

function onboarding() {
  const p = app.profile;
  const s = app.settings;
  return html`
    <div class="hero">
      <div class="eyebrow" style="color:rgba(255,255,255,.75)">Welcome</div>
      <h1 style="margin:4px 0 8px">Lose the belly, keep the muscle, calm the gut.</h1>
      <p class="soft">Simple meals with exact quantities, a slow fibre build-up, your weight trend, Hevy workouts, and a shopping list with real Pingo Doce, Auchan and Mercadona products.</p>
    </div>
    <form class="card" data-submit="start">
      <div class="card-head"><h2>Your details</h2></div>
      <p class="small muted">Pre-filled from what you told me. You can change everything later in Settings.</p>
      <div class="grid2">
        <div class="field"><label>Sex</label><select name="sex"><option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option></select></div>
        <div class="field"><label>Age</label><input name="age" type="number" min="14" max="100" value="${p.age}" required></div>
        <div class="field"><label>Height (cm)</label><input name="heightCm" type="number" step="0.5" value="${p.heightCm}" required></div>
        <div class="field"><label>Weight today (kg)</label><input name="weightKg" type="number" step="0.1" value="${p.weightKg}" required></div>
        <div class="field"><label>Waist at belly button (cm)</label><input name="waistCm" type="number" step="0.5" placeholder="optional"></div>
        <div class="field"><label>Strength sessions / week</label><input name="trainingDaysPerWeek" type="number" min="0" max="7" value="${p.trainingDaysPerWeek}"></div>
      </div>
      <div class="field"><label>Daily activity (outside the gym)</label>
        <select name="lifestyle">${Object.entries(LIFESTYLES).map(([k, v]) => html`<option value="${k}" ${k === p.lifestyle ? 'selected' : ''}>${v.label}</option>`)}</select></div>
      <div class="field"><label>Pace after the first 2 weeks</label>
        <select name="pace">${Object.entries(PACES).map(([k, v]) => html`<option value="${k}" ${k === p.pace ? 'selected' : ''}>${v.label}</option>`)}</select></div>
      <div class="field"><label>Where do you shop most?</label>
        <select name="mainStore">
          <option value="pingodoce" ${s.stores[0] === 'pingodoce' ? 'selected' : ''}>Pingo Doce</option>
          <option value="auchan" ${s.stores[0] === 'auchan' ? 'selected' : ''}>Auchan</option>
          <option value="mercadona" ${s.stores[0] === 'mercadona' ? 'selected' : ''}>Mercadona</option>
        </select></div>
      <button class="btn primary block" type="submit">${icon('sparkles')} Start my plan today</button>
    </form>`;
}

function hero(date, t, intake) {
  const left = Math.round(t.kcal - intake.kcal);
  const macros = [
    ['Protein', intake.protein, t.protein, '#ffd1dc'],
    ['Carbs', intake.carbs ?? 0, t.carbs, '#ffe3a3'],
    ['Fat', intake.fat ?? 0, t.fat, '#d9ccff'],
  ];
  return html`<section class="hero">
    <div class="row between" style="margin-bottom:14px">
      <div><div class="eyebrow" style="color:rgba(255,255,255,.75)">${fmt.date(date)}</div>
        <h2 style="margin-top:2px">${greeting()}${app.profile.name ? `, ${app.profile.name}` : ''}</h2></div>
      <span class="chip glass">${icon('target')} Week ${app.weekOfPlan(date)}</span>
    </div>
    <div class="hero-grid">
      ${ring(intake.kcal, t.kcal, { size: 128, stroke: 11, label: html`<b>${fmt.kcal(Math.abs(left))}</b><span class="tiny">${left >= 0 ? 'kcal left' : 'kcal over'}</span>` })}
      <div>
        ${macros.map(([name, v, target, c]) => html`<div class="macro"><span class="name">${name}</span><span class="val">${Math.round(v)} / ${target} g</span>${bar(v, target, c)}</div>`)}
      </div>
    </div>
    <div class="row wrap" style="margin-top:14px;gap:6px">
      <span class="chip glass">${icon('flame')} ${fmt.kcal(intake.kcal)} / ${fmt.kcal(t.kcal)} kcal</span>
      <span class="chip glass">${icon('wheat')} fibre ~${t.fibre} g</span>
      <span class="chip glass">${icon('droplets')} ${t.waterL} L water</span>
    </div>
  </section>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening';
}

function weighCard(date) {
  const trend = app.trend();
  const rate = weeklyRate(app.state.weights, { endDate: date });
  const todays = app.state.weights.find((w) => w.date === date);
  const lastWaist = [...app.state.weights].reverse().find((w) => typeof w.waistCm === 'number');
  return html`
    <form class="card" data-submit="weigh">
      <div class="row">
        <div class="tile-ic">${icon('scale')}</div>
        <div class="grow"><h3>Morning weigh-in</h3>
          <div class="tiny muted">${trend ? html`Trend <b>${fmt.kg(trend.trend)}</b>${rate ? html` · ${fmt.signed(rate.kgPerWeek, 2)} kg/week` : ''}` : 'After the toilet, before food or drink'}</div></div>
        ${todays ? html`<span class="chip ok">${icon('check')} saved</span>` : ''}
      </div>
      <div class="row mt">
        <label class="suffix grow" style="margin:0"><span class="sr">Weight</span>
          <input class="input-big" name="kg" type="number" inputmode="decimal" step="0.1" min="30" max="350" placeholder="${trend ? trend.trend.toFixed(1) : 'Weight'}" value="${todays?.kg ?? ''}" required>
          <em>kg</em></label>
        <button class="btn primary" type="submit" style="min-height:52px">Save</button>
      </div>
      <details class="mt" data-remember="waist" ${openAttr('waist', Boolean(todays?.waistCm))}>
        <summary class="small muted" style="font-weight:600">Waist too? <span class="tiny">(optional, once a week${lastWaist ? `, last ${lastWaist.waistCm} cm` : ''})</span></summary>
        <label class="suffix" style="margin:0"><span class="sr">Waist at the belly button</span>
          <input name="waistCm" type="number" inputmode="decimal" step="0.5" min="40" max="250" placeholder="Waist at the belly button" value="${todays?.waistCm ?? ''}">
          <em>cm</em></label>
      </details>
    </form>`;
}

// "150 g chicken breast fillets (raw) · 95 g long-grain white rice (dry) · 2 eggs"
export function ingredientLine(items) {
  return items
    .filter((i) => i.g > 0 && !isSeasoning(FOOD_BY_ID[i.food]))
    .map((i) => {
      const f = FOOD_BY_ID[i.food];
      const a = amountParts(f, i.g);
      if (f.unit) return a.qty;
      return `${a.qty} ${plainName(f).toLowerCase()}${a.state ? ` (${a.state})` : ''}`;
    })
    .join(' · ');
}

function mealCard(meal, log, date) {
  const eaten = Boolean(log.meals?.[meal.slot]?.eaten);
  if (!meal.recipe) {
    return html`<div class="meal"><div class="grow"><div class="kind">${meal.label}</div><div class="title">No recipe fits your settings</div>
      <a href="#/recipes">Pick one</a></div></div>`;
  }
  const r = meal.recipe;
  const href = `#/recipe/${r.id}?date=${date}&slot=${meal.slot}`;
  return html`
    <div class="meal ${eaten ? 'done' : ''}">
      <a href="${href}" aria-label="${r.name}">${mealCollage(meal.items)}</a>
      <div class="grow">
        <div class="kind">${meal.label}${meal.overridden ? html` · <span class="muted">swapped</span>` : ''}</div>
        <a class="title" href="${href}">${r.name}</a>
        <div class="facts"><span><b>${fmt.kcal(meal.macros.kcal)}</b> kcal</span><span><b>${Math.round(meal.macros.p)} g</b> protein</span><span>${icon('clock', 'sm')} ${r.minutes} min</span></div>
        <div class="ing">${ingredientLine(meal.items)}</div>
      </div>
      <div class="meal-side">
        <button class="checkcircle ${eaten ? 'on' : ''}" data-action="toggle-eaten" data-slot="${meal.slot}" aria-label="${eaten ? 'Eaten' : 'Mark eaten'}" aria-pressed="${eaten}">${icon('check')}</button>
        <button class="mini-btn" data-action="swap" data-slot="${meal.slot}" aria-label="Swap meal">${icon('shuffle')}</button>
      </div>
    </div>`;
}

const SCALE = [[0, 'None', 'var(--ok)'], [1, 'Mild', '#84cc16'], [2, 'Mod.', 'var(--carbs)'], [3, 'Bad', 'var(--danger)']];

function faces(name, value, action, options = SCALE) {
  return html`<div class="faces" role="group">${options.map(
    ([v, label, c]) => html`<button type="button" class="${value === v ? 'on' : ''}" style="${c ? `--c:${c}` : ''}" data-action="${action}" data-name="${name}" data-value="${v}" aria-pressed="${value === v}">${label}</button>`,
  )}</div>`;
}

function gutCard(date, log) {
  const s = log.symptoms || {};
  const logged = Boolean(log.symptoms);
  return html`
    <details class="card" data-remember="gut" ${openAttr('gut', !logged)}>
      <summary><span class="tile-ic sm">${icon('stethoscope')}</span> Gut & energy check <span class="chip ${logged ? 'ok' : ''}" style="margin-left:6px">${logged ? 'logged' : '30 s'}</span></summary>
      ${SYMPTOMS.map((sym) => html`<div class="scale-row"><span class="small bold">${sym.label}</span>${faces(sym.id, s[sym.id], 'symptom')}</div>`)}
      <div class="scale-row stack"><span class="small bold">Stool type <span class="tiny muted">(Bristol scale: 3–4 is ideal)</span></span>
        <div class="faces bristol">${[1, 2, 3, 4, 5, 6, 7].map((n) => html`<button type="button" class="${s.bristol === n ? 'on' : ''}" style="--c:${n === 4 || n === 3 ? 'var(--ok)' : n === 5 ? 'var(--carbs)' : 'var(--danger)'}" data-action="symptom" data-name="bristol" data-value="${n}">${n}</button>`)}</div></div>
      ${s.bristol ? html`<div class="tiny muted right">${BRISTOL[s.bristol]}</div>` : ''}
      <div class="scale-row"><span class="small bold">Energy</span>${faces('energy', log.energy, 'wellbeing', [1, 2, 3, 4, 5].map((n) => [n, String(n)]))}</div>
      <div class="scale-row"><span class="small bold">Hunger</span>${faces('hunger', log.hunger, 'wellbeing', [1, 2, 3, 4, 5].map((n) => [n, String(n)]))}</div>
      <form class="row mt" data-submit="notes"><input class="grow" name="notes" placeholder="Notes: ate out, stress, poor sleep…" value="${s.notes || ''}"><button class="btn" type="submit">Save</button></form>
    </details>`;
}

function trainingCard(date) {
  if (!app.state.hevy.connected) {
    return html`<a class="card row" href="#/gym" style="color:inherit">
      <div class="tile-ic">${icon('dumbbell')}</div>
      <div class="grow"><h3>Training</h3><div class="small muted">Lift 3× a week to keep muscle while you lose fat. Connect Hevy to track it.</div></div>
      ${icon('chevron-right')}</a>`;
  }
  const ws = app.workouts || [];
  const weekStart = startOfWeek(date);
  const done = sessionsBetween(ws, weekStart, addDays(weekStart, 6));
  const target = app.profile.trainingDaysPerWeek || 3;
  const last = ws[0];
  return html`<a class="card" href="#/gym" style="display:block;color:inherit">
    <div class="row"><div class="tile-ic">${icon('dumbbell')}</div>
      <div class="grow"><h3>Training this week</h3><div class="tiny muted">${last ? `Last: ${last.title} · ${fmt.date(last.start.slice(0, 10))}` : 'No workouts synced yet'}</div></div>
      <div class="price">${done}/${target}</div></div>
    <div class="mt">${bar(done, target)}</div></a>`;
}

export default {
  render() {
    if (!app.started()) return onboarding();
    const date = app.today();
    const t = app.targets();
    const plan = app.dayPlan(date);
    const log = app.dayLog(date);
    const intake = intakeFromLog(log) || { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const tips = TIPS[app.phase()] || TIPS[1];
    const tip = tips[dayIndex(date) % tips.length];
    const extras = log.extras || [];
    const eaten = plan.meals.filter((m) => log.meals?.[m.slot]?.eaten).length;
    return html`
      ${hero(date, t, intake)}
      ${weighCard(date)}
      <div data-crawl-status>${crawlCard(app.crawl)}</div>
      <div class="section-title"><h2>Today's meals</h2><span class="chip">${eaten}/${plan.meals.length} eaten</span><a class="btn small" href="#/plan">Week ${icon('chevron-right', 'sm')}</a></div>
      ${plan.meals.map((m) => mealCard(m, log, date))}
      <p class="tiny muted center">Plan total: ${fmt.kcal(plan.totals.kcal)} kcal · ${Math.round(plan.totals.p)} g protein · ${Math.round(plan.totals.fib)} g fibre. Weights are raw/dry.</p>
      <details class="card" data-remember="extras" ${openAttr('extras', false)}>
        <summary><span class="tile-ic sm">${icon('plus')}</span> Ate something else? ${extras.length ? html`<span class="chip" style="margin-left:6px">${extras.length}</span>` : ''}</summary>
        ${extras.length ? html`<ul class="list mb">${extras.map((x, i) => html`<li class="row between"><span class="bold">${x.name}</span><span class="small muted">${x.kcal} kcal · ${x.protein} g P
          <button class="mini-btn" style="display:inline-grid;vertical-align:middle;margin-left:6px" data-action="remove-extra" data-index="${i}" aria-label="Remove">${icon('x')}</button></span></li>`)}</ul>` : ''}
        <form class="grid3" data-submit="add-extra">
          <input name="name" placeholder="What (e.g. café com leite)" required style="grid-column: span 3">
          <input name="kcal" type="number" min="0" max="5000" placeholder="kcal" required>
          <input name="protein" type="number" min="0" max="300" placeholder="protein g">
          <button class="btn primary" type="submit">Add</button>
        </form>
      </details>
      ${gutCard(date, log)}
      ${trainingCard(date)}
      <div class="callout">${icon('lightbulb')}<div><b>Tip.</b> ${tip}</div></div>`;
  },

  actions: {
    async start(form) {
      const d = formData(form);
      const stores = [d.mainStore, ...['pingodoce', 'auchan', 'mercadona'].filter((s) => s !== d.mainStore)];
      await app.saveProfile({
        sex: d.sex,
        age: d.age,
        heightCm: d.heightCm,
        weightKg: d.weightKg,
        trainingDaysPerWeek: d.trainingDaysPerWeek ?? 3,
        lifestyle: d.lifestyle,
        pace: d.pace,
      });
      await app.saveSettings({ stores });
      const today = app.today();
      app.state.profile = await api.post('/api/start', { startDate: today });
      app.state.weights = await api.put(`/api/weights/${today}`, { kg: d.weightKg, waistCm: d.waistCm || null });
      toast('Plan started. Phase 1: two gentle weeks to settle in.');
      return 'render-top';
    },

    async weigh(form) {
      const d = formData(form);
      app.state.weights = await api.put(`/api/weights/${app.today()}`, { kg: d.kg, waistCm: d.waistCm || null });
      toast('Weight saved');
      return 'render';
    },

    async 'toggle-eaten'(el) {
      const date = app.today();
      const slot = el.dataset.slot;
      const meal = app.dayPlan(date).meals.find((m) => m.slot === slot);
      const eaten = app.dayLog(date).meals?.[slot]?.eaten;
      await app.saveDay(date, { meals: { [slot]: eaten ? null : mealSnapshot(meal) } });
      return 'render';
    },

    async swap(el) {
      const { openSwap } = await import('./plan.js');
      openSwap(app.today(), el.dataset.slot);
    },

    async 'add-extra'(form) {
      remembered.extras = true;
      const d = formData(form);
      const extras = [...(app.dayLog().extras || []), { name: d.name, kcal: d.kcal, protein: d.protein || 0 }];
      await app.saveDay(app.today(), { extras });
      return 'render';
    },

    async 'remove-extra'(el) {
      remembered.extras = true;
      const extras = [...(app.dayLog().extras || [])];
      extras.splice(Number(el.dataset.index), 1);
      await app.saveDay(app.today(), { extras });
      return 'render';
    },

    async symptom(el) {
      remembered.gut = true;
      const cur = { ...(app.dayLog().symptoms || {}) };
      const v = Number(el.dataset.value);
      cur[el.dataset.name] = cur[el.dataset.name] === v ? null : v;
      await app.saveDay(app.today(), { symptoms: cur });
      return 'render';
    },

    async wellbeing(el) {
      remembered.gut = true;
      const cur = app.dayLog()[el.dataset.name];
      const v = Number(el.dataset.value);
      await app.saveDay(app.today(), { [el.dataset.name]: cur === v ? null : v });
      return 'render';
    },

    async notes(form) {
      remembered.gut = true;
      const cur = { ...(app.dayLog().symptoms || {}) };
      cur.notes = formData(form).notes;
      await app.saveDay(app.today(), { symptoms: cur });
      toast('Saved');
      return 'render';
    },
  },
};
