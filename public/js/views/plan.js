import { app } from '../app.js';
import { api } from '../api.js';
import { html, fmt, openModal, pageHead } from '../ui.js';
import { icon } from '../icons.js';
import { mealCollage } from '../photos.js';
import { ingredientLine } from './today.js';
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
    const s = scaleRecipe(r, { kcal: budget.kcalTarget, protein: budget.proteinTarget }, { phase: Math.max(ctx.phase, r.phase) });
    const current = meal?.recipe?.id === r.id;
    return html`<div class="item" style="padding:10px 0;border-bottom:1px solid var(--line)">
      ${mealCollage(s.items)}
      <div class="grow"><div class="title">${r.name}</div>
        <div class="sub">${r.en}</div>
        <div class="sub">${fmt.kcal(s.macros.kcal)} kcal · ${Math.round(s.macros.p)} g protein · ${r.minutes} min ${later ? html`<span class="chip warn">phase ${r.phase}</span>` : ''}</div></div>
      <button class="btn small ${current ? 'primary' : 'outline'}" data-action="pick" data-id="${r.id}">${current ? icon('check') : 'Choose'}</button></div>`;
  };
  openModal(
    `Swap ${meal?.label?.toLowerCase() || slot} · ${fmt.date(date)}`,
    html`${list.map((r) => row(r, false))}
      ${meal?.overridden ? html`<button class="btn block mt" data-action="reset">${icon('refresh-cw')} Back to the automatic plan</button>` : ''}
      ${others.length ? html`<details class="mt"><summary>Not yet in your phase (${others.length})</summary>${others.map((r) => row(r, true))}</details>` : ''}`,
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

function planMeal(m, date) {
  if (!m.recipe) return html`<div class="meal"><div class="grow"><div class="kind">${m.label}</div><div class="title muted">Nothing fits your settings</div></div></div>`;
  const href = `#/recipe/${m.recipe.id}?date=${date}&slot=${m.slot}`;
  return html`<div class="meal">
    <a href="${href}" aria-label="${m.recipe.name}">${mealCollage(m.items)}</a>
    <div class="grow">
      <div class="kind">${m.label}${m.overridden ? html` · <span class="muted">swapped</span>` : ''}</div>
      <a class="title" href="${href}">${m.recipe.name}</a>
      <div class="facts"><span><b>${fmt.kcal(m.macros.kcal)}</b> kcal</span><span><b>${Math.round(m.macros.p)} g</b> protein</span><span>${icon('clock', 'sm')} ${m.recipe.minutes} min</span></div>
      <div class="ing">${ingredientLine(m.items)}</div>
    </div>
    <div class="meal-side"><button class="mini-btn" data-action="swap" data-date="${date}" data-slot="${m.slot}" aria-label="Swap meal">${icon('shuffle')}</button></div>
  </div>`;
}

export default {
  render(route) {
    if (!app.started()) return html`<div class="card"><p>Start your plan on the <a href="#/today">Today</a> tab first.</p></div>`;
    const offset = Number(route.query.week || 0);
    const monday = addDays(startOfWeek(app.today()), offset * 7);
    const days = app.plans(monday, 7);
    const today = app.today();
    const selected = days.find((d) => d.date === route.query.day) || days.find((d) => d.date === today) || days[0];
    const t = app.targets();
    const sessions = batchSessions(days).filter((s) => s.portions > 1);
    return html`
      ${pageHead('Meal plan', `${fmt.dayMonth(monday)} – ${fmt.dayMonth(addDays(monday, 6))}`, html`<div class="seg">
        <a class="${offset === 0 ? 'on' : ''}" href="#/plan?week=0">This week</a><a class="${offset === 1 ? 'on' : ''}" href="#/plan?week=1">Next</a></div>`)}
      <div class="days">${days.map((d) => html`<a class="day ${d.date === selected.date ? 'on' : ''}" href="#/plan?week=${offset}&day=${d.date}">
        <span class="d">${weekdayShort(d.date)}</span><span class="n">${Number(d.date.slice(8))}</span>${d.date === today ? html`<span class="today"></span>` : ''}</a>`)}</div>
      <div class="row wrap" style="margin:8px 2px 12px;gap:6px">
        <span class="chip">${icon('flame')} ${fmt.kcal(selected.totals.kcal)} / ${fmt.kcal(t.kcal)} kcal</span>
        <span class="chip">${icon('beef')} ${Math.round(selected.totals.p)} / ${t.protein} g protein</span>
        <span class="chip">${icon('wheat')} ${Math.round(selected.totals.fib)} g fibre</span>
      </div>
      ${selected.meals.map((m) => planMeal(m, selected.date))}
      <div class="tiles mt">
        <a class="tile" href="#/shop?from=${monday}"><span class="ic">${icon('shopping-basket')}</span><b>Shopping list</b><span>Everything for this week, with real products</span></a>
        <a class="tile" href="#/recipes"><span class="ic">${icon('book-open')}</span><b>All recipes</b><span>Favourites are planned first</span></a>
      </div>
      ${sessions.length ? html`<div class="section-title"><h2>Batch cooking</h2><span class="chip">${sessions.length} sessions</span></div>
        <div class="card">
          <p class="small muted">Cook once, eat on consecutive days. Cooked meals keep 3 days in the fridge.</p>
          <ul class="list">${sessions.map((s) => html`<li><a class="item" href="#/recipe/${s.recipe.id}?date=${s.day}&slot=${s.slot}" style="color:inherit">
            <div class="day on" style="box-shadow:none;width:48px;padding:6px 0"><span class="d">${weekdayShort(s.day)}</span><span class="n">${Number(s.day.slice(8))}</span></div>
            <div class="grow"><div class="title">${s.recipe.name}</div><div class="sub">${s.portions} portions · ${s.slot} until ${weekdayShort(s.last)}</div></div>${icon('chevron-right')}</a></li>`)}</ul>
        </div>` : html`<p class="small muted center mt">Turn on batch cooking in Settings to cook once for two days.</p>`}`;
  },

  actions: {
    swap(el) {
      openSwap(el.dataset.date, el.dataset.slot);
    },
  },
};
