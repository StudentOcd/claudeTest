import { app } from '../app.js';
import { api } from '../api.js';
import { html, fmt, openModal } from '../ui.js';
import { addDays, startOfWeek, weekdayShort } from '/core/dates.js';
import { candidateRecipes, scaleRecipe } from '/core/planner.js';
import { slotBudgets } from '/core/nutrition.js';

// Cooking sessions: consecutive days with the same lunch/dinner recipe = cook once.
function batchSessions(days) {
  const out = [];
  for (const slot of ['lunch', 'dinner']) {
    let cur = null;
    for (const d of days) {
      const m = d.meals.find((x) => x.slot === slot);
      if (!m?.recipe) continue;
      if (cur && cur.recipe.id === m.recipe.id && cur.last === addDays(d.date, -1)) {
        cur.portions++;
        cur.last = d.date;
      } else {
        cur = { slot, recipe: m.recipe, day: d.date, last: d.date, portions: 1 };
        out.push(cur);
      }
    }
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.slot < b.slot ? -1 : 1));
}

export function openSwap(date, slot) {
  const ctx = app.planContext();
  const plan = app.dayPlan(date);
  const meal = plan.meals.find((m) => m.slot === slot);
  const list = candidateRecipes(slot, ctx);
  const others = candidateRecipes(slot, { ...ctx, phase: 3 }).filter((r) => !list.includes(r));
  const budget = slotBudgets(ctx.targets, ctx.mealsPerDay).find((b) => b.id === slot);
  const row = (r, later) => {
    const s = scaleRecipe(r, { kcal: budget.kcalTarget, protein: budget.proteinTarget }, { phase: ctx.phase });
    return html`<li class="row between">
      <div class="grow"><div><b>${r.name}</b> ${later ? html`<span class="badge warn">phase ${r.phase}</span>` : ''}</div>
        <div class="small muted">${r.en} · ${fmt.kcal(s.macros.kcal)} kcal · ${fmt.g(s.macros.p)} P · ${r.minutes} min</div></div>
      <button class="btn small ${meal?.recipe?.id === r.id ? 'primary' : ''}" data-action="pick" data-id="${r.id}">${meal?.recipe?.id === r.id ? 'Current' : 'Choose'}</button></li>`;
  };
  openModal(
    `Swap ${meal?.label || slot} · ${fmt.date(date)}`,
    html`<ul class="list">${list.map((r) => row(r, false))}</ul>
      ${meal?.overridden ? html`<button class="btn block mt" data-action="reset">Back to the automatic plan</button>` : ''}
      ${others.length ? html`<details class="mt"><summary>Not yet in your phase (${others.length})</summary><ul class="list">${others.map((r) => row(r, true))}</ul></details>` : ''}`,
    {
      async pick(el, _e, close) {
        app.state.planOverrides = await api.put(`/api/plan/${date}/${slot}`, { recipeId: el.dataset.id });
        close();
        window.dispatchEvent(new Event('leve:render'));
      },
      async reset(_el, _e, close) {
        app.state.planOverrides = await api.put(`/api/plan/${date}/${slot}`, { recipeId: null });
        close();
        window.dispatchEvent(new Event('leve:render'));
      },
    },
  );
}

export default {
  render(route) {
    if (!app.started()) return html`<div class="card"><p>Start your plan on the <a href="#/today">Today</a> tab first.</p></div>`;
    const offset = Number(route.query.week || 0);
    const monday = addDays(startOfWeek(app.today()), offset * 7);
    const days = app.plans(monday, 7);
    const t = app.targets();
    const sessions = batchSessions(days);
    return html`
      <div class="card">
        <div class="card-head">
          <h1>Week of ${fmt.date(monday)}</h1>
        </div>
        <div class="tabs">
          <a class="btn small ${offset === 0 ? 'on' : ''}" href="#/plan?week=0">This week</a>
          <a class="btn small ${offset === 1 ? 'on' : ''}" href="#/plan?week=1">Next week</a>
          <a class="btn small" href="#/recipes">All recipes</a>
          <a class="btn small" href="#/shop?from=${monday}">Shopping list</a>
        </div>
        <p class="small muted">Daily target ${fmt.kcal(t.kcal)} kcal · ${t.protein} g protein. Quantities are raw/dry weights, already scaled for you.</p>
      </div>
      ${days.map(
        (d) => html`<div class="card">
          <div class="card-head"><h3>${weekdayShort(d.date)} ${fmt.dateShort(d.date)} ${d.date === app.today() ? html`<span class="badge accent">today</span>` : ''}</h3>
            <span class="small muted">${fmt.kcal(d.totals.kcal)} kcal · ${fmt.g(d.totals.p)} P</span></div>
          <ul class="list">
            ${d.meals.map(
              (m) => html`<li class="row between">
                <div class="grow"><span class="badge">${m.label}</span> ${m.recipe ? html`<a href="#/recipe/${m.recipe.id}?date=${d.date}&slot=${m.slot}">${m.recipe.name}</a>` : html`<span class="muted">nothing fits</span>`}
                  <div class="tiny muted">${fmt.kcal(m.macros.kcal)} kcal · ${fmt.g(m.macros.p)} P</div></div>
                <button class="btn small" data-action="swap" data-date="${d.date}" data-slot="${m.slot}">Swap</button></li>`,
            )}
          </ul></div>`,
      )}
      <div class="card">
        <h2>Batch cooking</h2>
        <p class="small muted">Cook once, eat on consecutive days. Keep cooked meals in the fridge up to 3 days.</p>
        <ul class="list">${sessions.filter((s) => s.portions > 1).map(
          (s) => html`<li><b>${weekdayShort(s.day)} ${fmt.dateShort(s.day)}</b>: cook <a href="#/recipe/${s.recipe.id}?date=${s.day}&slot=${s.slot}">${s.recipe.name}</a> × ${s.portions} (${s.slot}${s.portions > 1 ? ` until ${weekdayShort(s.last)}` : ''})</li>`,
        )}</ul>
        ${sessions.some((s) => s.portions > 1) ? '' : html`<p class="small">Turn on batch cooking in Settings to repeat meals over two days.</p>`}
      </div>`;
  },

  actions: {
    swap(el) {
      openSwap(el.dataset.date, el.dataset.slot);
    },
  },
};
