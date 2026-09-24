import { app } from '../app.js';
import { api } from '../api.js';
import { html, raw, fmt, toast } from '../ui.js';
import { weightChart } from '../charts.js';
import { trendSeries, weeklyRate, weeklyAverages } from '/core/weight.js';
import { addDays } from '/core/dates.js';
import { bmi, PHASES } from '/core/nutrition.js';

export default {
  render(route) {
    if (!app.started()) return html`<div class="card"><p>Start your plan on the <a href="#/today">Today</a> tab first.</p></div>`;
    const range = route.query.range || '12w';
    const days = { '4w': 28, '12w': 84, all: 100000 }[range] || 84;
    const from = addDays(app.today(), -days);
    const series = trendSeries(app.state.weights);
    const shown = series.filter((p) => p.date >= from);
    const first = series[0];
    const last = series[series.length - 1];
    const rate = weeklyRate(app.state.weights, { endDate: app.today() });
    const t = app.targets();
    const fromData = app.maintenanceFromData();
    const check = app.checkIn();
    const waist = shown.filter((p) => typeof p.waistCm === 'number').map((p) => ({ date: p.date, kg: p.waistCm, trend: p.waistCm }));
    const weeks = weeklyAverages(app.state.weights).slice(-8).reverse();
    const goal = app.profile.goalWeightKg;
    const heightCm = app.profile.heightCm;
    return html`
      <div class="card">
        <div class="card-head"><h1>Progress</h1></div>
        <div class="tabs">${[['4w', '4 weeks'], ['12w', '12 weeks'], ['all', 'All']].map(([k, l]) => html`<a class="btn small ${range === k ? 'on' : ''}" href="#/progress?range=${k}">${l}</a>`)}</div>
        ${raw(weightChart(shown, { goal }))}
        <p class="tiny muted">Dots = daily weigh-ins (noisy: water, salt, digestion). Line = trend. Judge progress by the line.</p>
        <div class="grid3 mt">
          <div class="stat"><div class="v">${last ? fmt.kg(last.trend) : '–'}</div><div class="l">trend weight</div></div>
          <div class="stat"><div class="v">${first && last ? fmt.signed(last.trend - first.kg, 1) : '–'} kg</div><div class="l">since start</div></div>
          <div class="stat"><div class="v">${rate ? fmt.signed(rate.kgPerWeek, 2) : '–'}</div><div class="l">kg / week (${rate ? `${fmt.signed(rate.pctPerWeek, 2)}%` : 'need 4+ weigh-ins'})</div></div>
          <div class="stat"><div class="v">${last ? bmi(last.trend, heightCm).toFixed(1) : '–'}</div><div class="l">BMI</div></div>
          <div class="stat"><div class="v">${fmt.kcal(t.kcal)}</div><div class="l">kcal target</div></div>
          <div class="stat"><div class="v">${fromData ? fmt.kcal(fromData.tdee) : fmt.kcal(t.tdee)}</div><div class="l">maintenance ${fromData ? '(from your data)' : '(formula)'}</div></div>
        </div>
      </div>

      <div class="card recs">
        <div class="card-head"><h2>Weekly check-in</h2></div>
        ${check.recommendations.map(
          (r) => html`<div class="rec ${r.kind}"><b>${r.title}</b><div class="small">${r.detail}</div>
            ${r.action ? html`<button class="btn small mt" data-action="apply" data-type="${r.action.type}" data-value="${r.action.delta ?? r.action.to}">
              ${r.action.type === 'calories' ? `Apply ${r.action.delta > 0 ? '+' : ''}${r.action.delta} kcal` : `Move to phase ${r.action.to}`}</button>` : ''}</div>`,
        )}
        ${check.recommendations.length ? '' : html`<p class="small">Nothing to change. Keep going!</p>`}
        <p class="tiny muted">Current adjustment: ${fmt.signed(app.profile.calorieAdjustment || 0, 0)} kcal. Phase ${app.phase()} (${PHASES[app.phase()].name}) since ${fmt.date(app.profile.phaseSince)}.</p>
      </div>

      <div class="card">
        <h2>Your targets</h2>
        <dl class="kv">
          <dt>Resting burn (BMR)</dt><dd>${fmt.kcal(t.bmr)} kcal</dd>
          <dt>Maintenance (estimate)</dt><dd>${fmt.kcal(t.tdee)} kcal</dd>
          <dt>Daily deficit</dt><dd>${fmt.kcal(t.deficit)} kcal → about ${t.expectedLossKgPerWeek.toFixed(2)} kg/week of fat</dd>
          <dt>Calories</dt><dd><b>${fmt.kcal(t.kcal)} kcal</b></dd>
          <dt>Protein</dt><dd><b>${t.protein} g</b></dd>
          <dt>Fat / carbs</dt><dd>${t.fat} g / ${t.carbs} g</dd>
          <dt>Fibre goal</dt><dd>${t.fibre} g (phase ${t.phase})</dd>
          <dt>Never below</dt><dd>${t.floor} kcal</dd>
        </dl>
        <p class="tiny muted mt">Water weight moves the scale in the first 1–2 weeks, so calorie changes only start from week 3, based on your trend.</p>
      </div>

      ${waist.length ? html`<div class="card"><h2>Waist (cm)</h2>${raw(weightChart(waist, { unit: 'cm', height: 160 }))}</div>` : ''}

      <div class="card">
        <h2>Weekly averages</h2>
        <table class="simple"><tr><th>Week of</th><th>Avg</th><th>Change</th><th>Weigh-ins</th><th>Waist</th></tr>
          ${weeks.map((w, i) => html`<tr><td>${fmt.date(w.week)}</td><td>${fmt.kg(w.avgKg)}</td>
            <td>${weeks[i + 1] ? fmt.signed(w.avgKg - weeks[i + 1].avgKg, 2) : ''}</td><td>${w.count}</td><td>${w.waistCm ?? ''}</td></tr>`)}
        </table>
      </div>

      <details class="card">
        <summary>All weigh-ins (${app.state.weights.length})</summary>
        <ul class="list">${[...app.state.weights].reverse().slice(0, 120).map(
          (w) => html`<li class="row between"><span>${fmt.date(w.date)}</span><span>${fmt.kg(w.kg)}${w.waistCm ? ` · ${w.waistCm} cm` : ''}${w.source === 'hevy' ? html` <span class="badge">Hevy</span>` : ''}
            <button class="link-btn small" data-action="delete-weight" data-date="${w.date}">delete</button></span></li>`,
        )}</ul>
        <form class="row mt" data-submit="add-weight">
          <input name="date" type="date" max="${app.today()}" required>
          <input name="kg" type="number" step="0.1" placeholder="kg" required>
          <button class="btn" type="submit">Add</button>
        </form>
      </details>`;
  },

  actions: {
    async apply(el) {
      const action = el.dataset.type === 'calories' ? { type: 'calories', delta: Number(el.dataset.value) } : { type: 'phase', to: Number(el.dataset.value) };
      const res = await api.post('/api/checkins', { date: app.today(), actions: [action] });
      app.state.profile = res.profile;
      app.state.checkins = res.checkins;
      toast(action.type === 'calories' ? `New target: ${app.targets().kcal} kcal` : `Phase ${action.to} started`);
      return 'render';
    },
    async 'delete-weight'(el) {
      if (!confirm(`Delete the weigh-in of ${el.dataset.date}?`)) return;
      app.state.weights = await api.del(`/api/weights/${el.dataset.date}`);
      return 'render';
    },
    async 'add-weight'(form) {
      const date = form.elements.date.value;
      const kg = Number(form.elements.kg.value);
      app.state.weights = await api.put(`/api/weights/${date}`, { kg });
      return 'render';
    },
  },
};
