import { app } from '../app.js';
import { api } from '../api.js';
import { html, fmt, toast, bar, segmented, formData, remembered, openAttr } from '../ui.js';
import { FOOD_BY_ID, describeAmount } from '/core/foods.js';
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
    <div class="card">
      <h1>Welcome to Leve 👋</h1>
      <p>A gentle fat-loss plan built around a sensitive gut: simple meals with exact quantities, a slow fibre build-up,
      weight-trend tracking, Hevy workouts and Lisbon supermarket shopping lists.</p>
      <p class="small muted">Check the numbers below (pre-filled from what you told me) and start. You can change everything later in Settings.</p>
    </div>
    <form class="card" data-submit="start">
      <h2>Your details</h2>
      <div class="grid2">
        <div class="field"><label>Sex</label><select name="sex"><option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option></select></div>
        <div class="field"><label>Age</label><input name="age" type="number" min="14" max="100" value="${p.age}" required></div>
        <div class="field"><label>Height (cm)</label><input name="heightCm" type="number" step="0.5" value="${p.heightCm}" required></div>
        <div class="field"><label>Weight today (kg)</label><input name="weightKg" type="number" step="0.1" value="${p.weightKg}" required></div>
        <div class="field"><label>Waist at belly button (cm, optional)</label><input name="waistCm" type="number" step="0.5"></div>
        <div class="field"><label>Strength sessions / week</label><input name="trainingDaysPerWeek" type="number" min="0" max="7" value="${p.trainingDaysPerWeek}"></div>
      </div>
      <div class="field"><label>Daily activity (outside the gym)</label>
        <select name="lifestyle">${Object.entries(LIFESTYLES).map(([k, v]) => html`<option value="${k}" ${k === p.lifestyle ? 'selected' : ''}>${v.label}</option>`)}</select></div>
      <div class="field"><label>Pace after the first 2 weeks</label>
        <select name="pace">${Object.entries(PACES).map(([k, v]) => html`<option value="${k}" ${k === p.pace ? 'selected' : ''}>${v.label}</option>`)}</select></div>
      <div class="field"><label>Where do you shop? (first = main store)</label>
        <select name="mainStore">
          <option value="pingodoce" ${s.stores[0] === 'pingodoce' ? 'selected' : ''}>Pingo Doce first</option>
          <option value="auchan" ${s.stores[0] === 'auchan' ? 'selected' : ''}>Auchan first</option>
          <option value="mercadona" ${s.stores[0] === 'mercadona' ? 'selected' : ''}>Mercadona first</option>
        </select></div>
      <button class="btn primary block" type="submit">Start my plan today</button>
    </form>`;
}

function weighCard(date) {
  const trend = app.trend();
  const rate = weeklyRate(app.state.weights, { endDate: date });
  const todays = app.state.weights.find((w) => w.date === date);
  return html`
    <form class="card" data-submit="weigh">
      <div class="card-head"><h3>Morning weigh-in</h3>${todays ? html`<span class="badge ok">done</span>` : ''}</div>
      <div class="row">
        <input class="grow" name="kg" type="number" step="0.1" min="30" max="350" placeholder="kg" value="${todays?.kg ?? ''}" aria-label="Weight in kg" required>
        <input class="grow" name="waistCm" type="number" step="0.5" placeholder="waist cm (weekly)" value="${todays?.waistCm ?? ''}" aria-label="Waist in cm">
        <button class="btn primary" type="submit">Save</button>
      </div>
      <p class="small muted mt">
        ${trend ? html`Trend <b>${fmt.kg(trend.trend)}</b>` : 'Weigh after the toilet, before food or drink.'}
        ${rate ? html` · ${fmt.signed(rate.kgPerWeek, 2)} kg/week (${fmt.signed(rate.pctPerWeek, 2)}%)` : ''}
      </p>
    </form>`;
}

function mealCard(meal, log, date) {
  const eaten = Boolean(log.meals?.[meal.slot]?.eaten);
  if (!meal.recipe) return html`<li class="meal"><b>${meal.label}</b>: no recipe fits your settings. <a href="#/recipes">Pick one</a></li>`;
  const r = meal.recipe;
  return html`
    <li class="meal ${eaten ? 'done' : ''}">
      <div class="row between" style="align-items:flex-start">
        <div class="grow">
          <span class="badge">${meal.label}</span> ${meal.overridden ? html`<span class="badge info">swapped</span>` : ''}
          <div class="title">${r.name}</div>
          <div class="small muted">${r.en} · ${r.minutes} min · ${r.methods.join(', ')}</div>
        </div>
        <div class="right nowrap"><b>${fmt.kcal(meal.macros.kcal)}</b> kcal<br><span class="small muted">${fmt.g(meal.macros.p)} protein</span></div>
      </div>
      <ul class="ingredients">
        ${meal.items.filter((i) => i.g > 0 && FOOD_BY_ID[i.food].per100.kcal > 0).map((i) => html`<li>${describeAmount(FOOD_BY_ID[i.food], i.g)} · ${FOOD_BY_ID[i.food].name}</li>`)}
      </ul>
      <div class="meal-actions">
        <button class="btn small ${eaten ? 'primary' : ''}" data-action="toggle-eaten" data-slot="${meal.slot}">${eaten ? '✓ Eaten' : 'Mark eaten'}</button>
        <a class="btn small" href="#/recipe/${r.id}?date=${date}&slot=${meal.slot}">How to cook</a>
        <button class="btn small" data-action="swap" data-slot="${meal.slot}">Swap</button>
      </div>
    </li>`;
}

function gutCard(date, log) {
  const s = log.symptoms || {};
  const scale = [[0, 'none'], [1, 'mild'], [2, 'mod.'], [3, 'bad']];
  return html`
    <details class="card" data-remember="gut" ${openAttr('gut', !log.symptoms)}>
      <summary>Gut & energy check (30 s) ${log.symptoms ? html`<span class="badge ok">logged</span>` : ''}</summary>
      ${SYMPTOMS.map((sym) => html`<div class="row between mb"><span>${sym.label}</span>${segmented(sym.id, scale, s[sym.id], { action: 'symptom' })}</div>`)}
      <div class="mb"><div class="small muted mb">Stool type (Bristol scale, 4 is ideal)</div>
        ${segmented('bristol', [1, 2, 3, 4, 5, 6, 7].map((n) => [n, String(n)]), s.bristol, { action: 'symptom' })}
        ${s.bristol ? html`<div class="tiny muted">${BRISTOL[s.bristol]}</div>` : ''}
      </div>
      <div class="row between mb"><span>Energy</span>${segmented('energy', [1, 2, 3, 4, 5].map((n) => [n, String(n)]), log.energy, { action: 'wellbeing' })}</div>
      <div class="row between mb"><span>Hunger</span>${segmented('hunger', [1, 2, 3, 4, 5].map((n) => [n, String(n)]), log.hunger, { action: 'wellbeing' })}</div>
      <form class="row" data-submit="notes"><input class="grow" name="notes" placeholder="Notes (e.g. ate out, stress, poor sleep)" value="${s.notes || ''}"><button class="btn small" type="submit">Save</button></form>
    </details>`;
}

function trainingCard(date) {
  if (!app.state.hevy.connected) {
    return html`<div class="card"><div class="card-head"><h3>Training</h3></div>
      <p class="small">Lift 3× a week to keep muscle while you lose fat. <a href="#/gym">Connect Hevy</a> to track it here.</p></div>`;
  }
  const ws = app.workouts || [];
  const weekStart = startOfWeek(date);
  const done = sessionsBetween(ws, weekStart, addDays(weekStart, 6));
  const target = app.profile.trainingDaysPerWeek || 3;
  const last = ws[0];
  return html`<div class="card"><div class="card-head"><h3>Training this week</h3><a class="btn small" href="#/gym">Open</a></div>
    <div class="row"><b>${done} / ${target}</b> sessions <span class="grow">${bar(done, target)}</span></div>
    <p class="small muted mt">${last ? html`Last: ${last.title} · ${fmt.date(last.start.slice(0, 10))}` : 'No workouts synced yet.'}</p></div>`;
}

export default {
  render() {
    if (!app.started()) return onboarding();
    const date = app.today();
    const t = app.targets();
    const plan = app.dayPlan(date);
    const log = app.dayLog(date);
    const intake = intakeFromLog(log) || { kcal: 0, protein: 0 };
    const phase = app.phaseInfo();
    const tips = TIPS[app.phase()] || TIPS[1];
    const tip = tips[dayIndex(date) % tips.length];
    const extras = log.extras || [];
    return html`
      <div class="card">
        <div class="card-head"><h1>${fmt.date(date)}</h1><span class="badge accent">Phase ${app.phase()} · ${phase.name} · week ${app.weekOfPlan(date)}</span></div>
        <div class="grid2">
          <div><div class="row between small"><span>Calories</span><span><b>${fmt.kcal(intake.kcal)}</b> / ${fmt.kcal(t.kcal)}</span></div>${bar(intake.kcal, t.kcal)}</div>
          <div><div class="row between small"><span>Protein</span><span><b>${intake.protein}</b> / ${t.protein} g</span></div>${bar(intake.protein, t.protein)}</div>
        </div>
        <p class="small muted mt">Plan: ${fmt.kcal(plan.totals.kcal)} kcal · ${fmt.g(plan.totals.p)} protein · ${fmt.g(plan.totals.fib)} fibre (goal ~${t.fibre} g) · water ~${t.waterL} L</p>
      </div>
      ${weighCard(date)}
      <div class="card">
        <div class="card-head"><h2>Today's meals</h2><a class="btn small" href="#/plan">Week</a></div>
        <ul class="list">${plan.meals.map((m) => mealCard(m, log, date))}</ul>
        <details class="mt" data-remember="extras" ${openAttr('extras', false)}>
          <summary>Ate something else? (${extras.length})</summary>
          <ul class="list">${extras.map((x, i) => html`<li class="row between"><span>${x.name}</span><span class="small">${x.kcal} kcal · ${x.protein} g P <button class="link-btn" data-action="remove-extra" data-index="${i}">remove</button></span></li>`)}</ul>
          <form class="grid3 mt" data-submit="add-extra">
            <input name="name" placeholder="What (e.g. café com leite)" required style="grid-column: span 3">
            <input name="kcal" type="number" min="0" max="5000" placeholder="kcal" required>
            <input name="protein" type="number" min="0" max="300" placeholder="protein g">
            <button class="btn" type="submit">Add</button>
          </form>
        </details>
      </div>
      ${gutCard(date, log)}
      ${trainingCard(date)}
      <div class="card flat"><b>Tip:</b> ${tip}</div>`;
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
