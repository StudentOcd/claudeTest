import { app } from '../app.js';
import { html, fmt, toast, pageHead, storeChip } from '../ui.js';
import { icon } from '../icons.js';
import { foodTile, mealCollage, productFor, withPhotosFirst } from '../photos.js';
import { FOOD_BY_ID, describeAmount } from '/core/foods.js';
import { getRecipe, RECIPES } from '/core/recipes.js';
import { scaleRecipe, recipeAllowed } from '/core/planner.js';
import { slotBudgets } from '/core/nutrition.js';

function heroPhotos(items) {
  const main = withPhotosFirst(items).slice(0, 5);
  if (!main.length) return '';
  return html`<div class="recipe-hero n${main.length}">${main.map((i) => foodTile(i.food))}</div>`;
}

function ingredientRow(i) {
  const f = FOOD_BY_ID[i.food];
  const store = app.settings.stores[0];
  const prod = productFor(i.food, store) || productFor(i.food, 'pingodoce') || productFor(i.food, 'auchan');
  return html`<li><button class="item plain" data-action="product" data-food="${i.food}" data-store="${prod?.store || store}">
    ${foodTile(i.food, { size: 'sm', store })}
    <div class="grow"><div class="title"><span class="amount">${describeAmount(f, i.g)}</span> ${f.name}</div>
      <div class="sub">${prod ? html`${storeChip(prod.store)} ${prod.name}` : f.en}</div>
      ${f.gut.note ? html`<div class="sub">${f.gut.note}</div>` : ''}</div>
    ${icon('chevron-right', 'sm')}</button></li>`;
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
      <div class="row" style="margin:4px 0 12px">
        <a class="icon-btn" href="#/plan" aria-label="Back to plan">${icon('arrow-left')}</a>
        <span class="grow"></span>
        <button class="icon-btn ${fav ? 'fav' : ''}" data-action="fav" data-id="${r.id}" aria-label="${fav ? 'Remove favourite' : 'Favourite'}" aria-pressed="${fav}">${icon('heart')}</button>
      </div>
      ${heroPhotos(items)}
      <div class="eyebrow">${slot} · ${fmt.date(date)}</div>
      <h1 style="margin:4px 0 2px">${r.name}</h1>
      <p class="muted">${r.en}</p>
      <div class="row wrap" style="gap:6px;margin-bottom:14px">
        <span class="chip brand">${icon('clock')} ${r.minutes} min</span>
        ${r.methods.map((m) => html`<span class="chip">${icon('cooking-pot')} ${m}</span>`)}
        ${r.batch ? html`<span class="chip ok">${icon('check')} batch-friendly</span>` : ''}
        ${allowed ? '' : html`<span class="chip warn">not in your current plan</span>`}
      </div>
      <div class="card">
        <div class="grid-macros">
          <div><b>${fmt.kcal(macros.kcal)}</b><span>kcal</span></div>
          <div style="--c:var(--protein)"><b>${Math.round(macros.p)} g</b><span>protein</span></div>
          <div style="--c:var(--carbs)"><b>${Math.round(macros.c)} g</b><span>carbs</span></div>
          <div style="--c:var(--fat)"><b>${Math.round(macros.f)} g</b><span>fat</span></div>
          <div style="--c:var(--fibre)"><b>${Math.round(macros.fib)} g</b><span>fibre</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Ingredients</h2><span class="chip">1 portion</span></div>
        <ul class="list">${items.filter((i) => i.g > 0 && FOOD_BY_ID[i.food].per100.kcal > 0).map(ingredientRow)}</ul>
        ${seasonings.length ? html`<p class="small muted mt">Season with ${seasonings.join(', ').toLowerCase()}, salt and pepper.</p>` : ''}
      </div>
      <div class="card">
        <div class="card-head"><h2>How to cook it</h2></div>
        <ol class="steps">${r.steps.map((st) => html`<li><div>${st}</div></li>`)}</ol>
        ${r.tips.length ? r.tips.map((t) => html`<div class="callout">${icon('lightbulb')}<div>${t}</div></div>`) : ''}
        ${r.gut ? html`<div class="callout info">${icon('stethoscope')}<div>${r.gut}</div></div>` : ''}
      </div>
      <div class="row wrap">
        <button class="btn ${fav ? 'primary' : 'outline'}" data-action="fav" data-id="${r.id}">${icon('heart')} ${fav ? 'Favourite' : 'Add to favourites'}</button>
        <button class="btn outline" data-action="hide" data-id="${r.id}">${icon('eye-off')} ${hidden ? 'Plan it again' : "Don't plan this"}</button>
      </div>`;
  },

  actions: {
    async product(el) {
      const { openProductModal } = await import('./shop.js');
      openProductModal(el.dataset.food, el.dataset.store);
    },
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
    const budgets = slotBudgets(ctx.targets, ctx.mealsPerDay);
    return html`
      ${pageHead('Recipes', `${RECIPES.length} simple, gut-friendly meals`)}
      <div class="seg full mb">${[['all', 'All'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch & dinner'], ['snack', 'Snacks']].map(
        ([k, l]) => html`<a class="${slot === k ? 'on' : ''}" href="#/recipes?slot=${k}">${l}</a>`,
      )}</div>
      ${list.map((r) => {
        const b = budgets.find((x) => x.id === r.slots[0]) || budgets[1];
        const s = scaleRecipe(r, { kcal: b.kcalTarget, protein: b.proteinTarget }, { phase: Math.max(ctx.phase, r.phase) });
        const later = !recipeAllowed(r, { ...ctx, hidden: [] });
        return html`<div class="meal ${hidden.has(r.id) ? 'done' : ''}">
          <a href="#/recipe/${r.id}?slot=${r.slots[0]}">${mealCollage(s.items)}</a>
          <div class="grow">
            <div class="kind">${r.slots.join(' · ')}${later ? html` · <span style="color:var(--warn)">phase ${r.phase}+</span>` : ''}${hidden.has(r.id) ? html` · <span class="muted">hidden</span>` : ''}</div>
            <a class="title" href="#/recipe/${r.id}?slot=${r.slots[0]}">${r.name}</a>
            <div class="facts"><span><b>${fmt.kcal(s.macros.kcal)}</b> kcal</span><span><b>${Math.round(s.macros.p)} g</b> protein</span><span>${icon('clock', 'sm')} ${r.minutes} min</span></div>
          </div>
          <div class="meal-side"><button class="mini-btn ${favs.has(r.id) ? 'fav' : ''}" data-action="fav" data-id="${r.id}" aria-label="Favourite" aria-pressed="${favs.has(r.id)}">${icon('heart')}</button></div>
        </div>`;
      })}`;
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
