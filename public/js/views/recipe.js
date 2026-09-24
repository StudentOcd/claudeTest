import { app } from '../app.js';
import { html, fmt, toast } from '../ui.js';
import { FOOD_BY_ID, describeAmount } from '/core/foods.js';
import { getRecipe, RECIPES } from '/core/recipes.js';
import { scaleRecipe, recipeAllowed } from '/core/planner.js';
import { slotBudgets } from '/core/nutrition.js';
import { productsFor } from '/core/products.js';

function whereToBuy(foodId) {
  const links = [];
  for (const store of ['pingodoce', 'auchan']) {
    const chosen = app.state.productChoice?.[foodId]?.[store];
    const prod = chosen || productsFor(foodId, store).find((p) => p.url);
    if (prod?.url) links.push(html`<a href="${prod.url}" target="_blank" rel="noopener">${store === 'auchan' ? 'Auchan' : 'Pingo Doce'}</a>`);
  }
  return links.length ? html` <span class="tiny">(${links.map((l, i) => html`${i ? ' · ' : ''}${l}`)})</span>` : '';
}

export default {
  render(route) {
    const r = getRecipe(route.params.id);
    if (!r) return html`<div class="card"><p>Recipe not found. <a href="#/recipes">All recipes</a></p></div>`;
    const date = route.query.date || app.today();
    const slot = route.query.slot || r.slots[0];
    const ctx = app.planContext();
    let items;
    let macros;
    const planned = app.started() ? app.dayPlan(date).meals.find((m) => m.slot === slot) : null;
    if (planned?.recipe?.id === r.id) {
      ({ items, macros } = planned);
    } else {
      const b = slotBudgets(ctx.targets, ctx.mealsPerDay).find((x) => x.id === slot) || slotBudgets(ctx.targets, 4)[1];
      ({ items, macros } = scaleRecipe(r, { kcal: b.kcalTarget, protein: b.proteinTarget }, { phase: Math.max(ctx.phase, r.phase) }));
    }
    const fav = (app.settings.favoriteRecipes || []).includes(r.id);
    const hidden = (app.settings.hiddenRecipes || []).includes(r.id);
    const allowed = recipeAllowed(r, ctx);
    const seasonings = items.filter((i) => FOOD_BY_ID[i.food].per100.kcal === 0).map((i) => FOOD_BY_ID[i.food].name);
    return html`
      <div class="card">
        <h1>${r.name}</h1>
        <p class="muted">${r.en}</p>
        <div class="row wrap">
          <span class="badge accent">${r.minutes} min</span>
          ${r.methods.map((m) => html`<span class="badge">${m}</span>`)}
          <span class="badge">phase ${r.phase}+</span>
          ${r.batch ? html`<span class="badge ok">batch-friendly</span>` : ''}
          ${allowed ? '' : html`<span class="badge warn">not in your current plan</span>`}
        </div>
        <p class="small muted mt">Portion for ${slot} on ${fmt.date(date)}.</p>
      </div>
      <div class="card">
        <h2>Ingredients (1 portion)</h2>
        <ul class="list">
          ${items.filter((i) => i.g > 0 && FOOD_BY_ID[i.food].per100.kcal > 0).map(
            (i) => html`<li><b>${describeAmount(FOOD_BY_ID[i.food], i.g)}</b> · ${FOOD_BY_ID[i.food].name}${whereToBuy(i.food)}
              ${FOOD_BY_ID[i.food].gut.note ? html`<div class="tiny muted">${FOOD_BY_ID[i.food].gut.note}</div>` : ''}</li>`,
          )}
        </ul>
        ${seasonings.length ? html`<p class="small mt">Season with: ${seasonings.join(', ')}, salt and pepper.</p>` : ''}
        <div class="grid3 mt">
          <div class="stat"><div class="v">${fmt.kcal(macros.kcal)}</div><div class="l">kcal</div></div>
          <div class="stat"><div class="v">${fmt.g(macros.p)}</div><div class="l">protein</div></div>
          <div class="stat"><div class="v">${fmt.g(macros.c)}</div><div class="l">carbs</div></div>
          <div class="stat"><div class="v">${fmt.g(macros.f)}</div><div class="l">fat</div></div>
          <div class="stat"><div class="v">${fmt.g(macros.fib)}</div><div class="l">fibre</div></div>
        </div>
      </div>
      <div class="card">
        <h2>How to cook it</h2>
        <ol class="steps">${r.steps.map((s) => html`<li>${s}</li>`)}</ol>
        ${r.tips.length ? html`<h3 class="mt">Tips</h3><ul>${r.tips.map((t) => html`<li class="small">${t}</li>`)}</ul>` : ''}
        ${r.gut ? html`<div class="notice ok mt">${r.gut}</div>` : ''}
      </div>
      <div class="card row wrap">
        <button class="btn ${fav ? 'primary' : ''}" data-action="fav" data-id="${r.id}">${fav ? '★ Favourite' : '☆ Favourite'}</button>
        <button class="btn" data-action="hide" data-id="${r.id}">${hidden ? 'Show in plan again' : "Don't plan this"}</button>
        <a class="btn" href="#/plan">Back to plan</a>
      </div>`;
  },

  actions: {
    async fav(el) {
      const list = new Set(app.settings.favoriteRecipes || []);
      if (list.has(el.dataset.id)) list.delete(el.dataset.id);
      else list.add(el.dataset.id);
      await app.saveSettings({ favoriteRecipes: [...list] });
      toast(list.has(el.dataset.id) ? 'Favourites are planned first for that meal' : 'Removed from favourites');
      return 'render';
    },
    async hide(el) {
      const list = new Set(app.settings.hiddenRecipes || []);
      if (list.has(el.dataset.id)) list.delete(el.dataset.id);
      else list.add(el.dataset.id);
      await app.saveSettings({ hiddenRecipes: [...list] });
      return 'render';
    },
  },
};

export const recipesView = {
  render(route) {
    const slot = route.query.slot || 'all';
    const ctx = app.planContext();
    const list = RECIPES.filter((r) => slot === 'all' || r.slots.includes(slot));
    const favs = new Set(app.settings.favoriteRecipes || []);
    const hidden = new Set(app.settings.hiddenRecipes || []);
    return html`
      <div class="card">
        <h1>Recipes</h1>
        <div class="tabs">
          ${[['all', 'All'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch & dinner'], ['snack', 'Snacks']].map(
            ([k, l]) => html`<a class="btn small ${slot === k ? 'on' : ''}" href="#/recipes?slot=${k}">${l}</a>`,
          )}
        </div>
        <p class="small muted">★ favourites are planned first; hidden recipes are never planned.</p>
      </div>
      <div class="card"><ul class="list">
        ${list.map(
          (r) => html`<li class="row between">
            <div class="grow"><a href="#/recipe/${r.id}"><b>${r.name}</b></a>
              <div class="small muted">${r.en} · ${r.minutes} min · phase ${r.phase}+
                ${favs.has(r.id) ? html` · <span class="badge ok">★</span>` : ''}${hidden.has(r.id) ? html` · <span class="badge">hidden</span>` : ''}
                ${recipeAllowed(r, { ...ctx, hidden: [] }) ? '' : html` · <span class="badge warn">later / excluded</span>`}</div></div>
            <button class="btn small" data-action="fav" data-id="${r.id}">${favs.has(r.id) ? '★' : '☆'}</button>
          </li>`,
        )}
      </ul></div>`;
  },
  actions: {
    async fav(el) {
      const list = new Set(app.settings.favoriteRecipes || []);
      if (list.has(el.dataset.id)) list.delete(el.dataset.id);
      else list.add(el.dataset.id);
      await app.saveSettings({ favoriteRecipes: [...list] });
      return 'render';
    },
  },
};
