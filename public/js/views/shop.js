import { app } from '../app.js';
import { api } from '../api.js';
import { html, fmt, toast, openModal, formData, modalBody, STORE_NAMES } from '../ui.js';
import { looksLike } from '../match.js';
import { FOOD_BY_ID, formatCount } from '/core/foods.js';
import { productsFor, avoidListFor, categoryUrl, STORE_PRODUCTS } from '/core/products.js';
import { addDays } from '/core/dates.js';

let refreshNote = null;
let listFoodIds = [];

const SOURCE_LABEL = { estimate: 'estimate', web: 'seen online', store: 'store site', manual: 'your price', receipt: 'receipt', openprices: 'Open Prices' };

function productFor(foodId, store) {
  return app.state.productChoice?.[foodId]?.[store] || productsFor(foodId, store).find((p) => p.url) || productsFor(foodId, store)[0] || null;
}

function needText(it) {
  const f = FOOD_BY_ID[it.foodId];
  if (f.unit && it.needUnits) return `${formatCount(Math.ceil(it.needUnits * 4) / 4)} ${it.needUnits <= 1 ? f.unit.name : f.unit.plural}`;
  return it.needGrams >= 1000 ? `${(it.needGrams / 1000).toFixed(2)} kg` : `${it.needGrams} g`;
}

function itemRow(it, checked) {
  const prod = productFor(it.foodId, it.store);
  const src = it.offer.source;
  return html`<li class="shop-item ${checked ? 'checked' : ''}">
    <input type="checkbox" data-action="check" data-food="${it.foodId}" ${checked ? 'checked' : ''} aria-label="Got it">
    <div class="grow">
      <div><b>${it.name}</b> <span class="tiny muted">${it.en}</span></div>
      <div class="small">Need ${needText(it)} → buy <b>${it.buyText}</b>${it.leftoverText ? html` <span class="muted">(${it.leftoverText})</span>` : ''}</div>
      ${prod ? html`<div class="small">${prod.url ? html`<a href="${prod.url}" target="_blank" rel="noopener">${prod.name}</a>` : prod.name}</div>` : ''}
      <div class="tiny muted">${src === 'estimate' ? 'price is an estimate' : `${SOURCE_LABEL[src] || src}${it.offer.date ? `, ${it.offer.date}` : ''}`}
        · <button class="link-btn" data-action="product" data-food="${it.foodId}" data-store="${it.store}">product & price</button></div>
    </div>
    <div class="right"><div class="price">${fmt.eur(it.costEur)}</div>${it.estimated ? html`<span class="badge warn">est.</span>` : html`<span class="badge ok">${STORE_NAMES[it.store]}</span>`}</div>
  </li>`;
}

async function pollJob(jobId, onUpdate) {
  for (;;) {
    const job = await api.get(`/api/jobs/${jobId}`);
    onUpdate(job);
    if (job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function openProductModal(foodId, store) {
  const f = FOOD_BY_ID[foodId];
  const stores = app.settings.stores;
  const prices = app.prices()[foodId] || [];
  const latest = (s) => prices.filter((p) => p.store === s).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1))[0];
  const avoid = avoidListFor(foodId);
  const body = () => html`
    <p class="small muted">${f.en}. ${f.gut.note}</p>
    ${avoid.length ? html`<div class="notice warn"><b>Avoid:</b> ${avoid.map((a) => html`<div>${STORE_NAMES[a.store]}: ${a.name}. ${a.reason}</div>`)}</div>` : ''}
    <table class="simple"><tr><th>Store</th><th>Product</th><th class="right">Price</th></tr>
      ${stores.map((s) => {
        const p = productFor(foodId, s);
        const l = latest(s);
        return html`<tr><td>${STORE_NAMES[s]}</td>
          <td>${p ? (p.url ? html`<a href="${p.url}" target="_blank" rel="noopener">${p.name}</a>` : p.name) : html`<span class="muted">${s === 'mercadona' ? 'No online shop: add the price from your receipt' : 'not mapped yet'}</span>`}
            ${s !== 'mercadona' ? html`<div><button class="link-btn tiny" data-action="browse" data-store="${s}">${categoryUrl(foodId, s) ? 'Browse the category' : 'Search the store'}</button></div>` : ''}</td>
          <td class="right">${l ? html`${fmt.eur(l.eur)}${l.sold === 'weight' ? '/kg' : ''}<div class="tiny muted">${SOURCE_LABEL[l.source] || l.source} ${l.date || ''}</div>` : html`<span class="muted">–</span>`}</td></tr>`;
      })}
    </table>
    <div data-browse></div>
    <h3 class="mt">Add a price you saw</h3>
    <form class="grid2" data-submit="save-price">
      <div class="field"><label>Store</label><select name="store">${stores.map((s) => html`<option value="${s}" ${s === store ? 'selected' : ''}>${STORE_NAMES[s]}</option>`)}</select></div>
      <div class="field"><label>Sold</label><select name="sold">
        <option value="pack" ${f.buy.sold === 'pack' ? 'selected' : ''}>per pack</option>
        <option value="weight" ${f.buy.sold === 'weight' ? 'selected' : ''}>per kg</option>
        <option value="unit" ${f.buy.sold === 'unit' ? 'selected' : ''}>per piece</option></select></div>
      <div class="field"><label>Price (€)</label><input name="eur" type="number" step="0.01" min="0.01" required></div>
      <div class="field"><label>${f.unit && f.buy.packUnits ? 'Units per pack' : 'Pack size (g)'}</label>
        <input name="${f.unit && f.buy.packUnits ? 'packUnits' : 'packG'}" type="number" min="1" value="${f.unit && f.buy.packUnits ? f.buy.packUnits : f.buy.packG || ''}"></div>
      <div class="field" style="grid-column: span 2"><label>Product name (optional)</label><input name="productName" placeholder="e.g. Hacendado atum ao natural 3x80g"></div>
      <button class="btn primary" type="submit" style="grid-column: span 2">Save price</button>
    </form>`;

  const renderBrowse = (items, s, note = '') => {
    const el = modalBody()?.querySelector('[data-browse]');
    if (!el) return;
    el.innerHTML = String(html`<div class="card flat mt"><div class="card-head"><h3>${STORE_NAMES[s]} products</h3></div>
      ${note ? html`<p class="small muted">${note}</p>` : ''}
      <ul class="list">${items.slice(0, 30).map(
        (p, i) => html`<li class="row between"><div class="grow">
          ${p.url ? html`<a href="${p.url}" target="_blank" rel="noopener">${p.name}</a>` : p.name}
          <div class="tiny muted">${p.unitPrice ? `${fmt.eur(p.unitPrice.eur)}/${p.unitPrice.per}` : ''} ${p.promo ? '· promo' : ''}</div></div>
          <div class="right"><div class="price">${fmt.eur(p.price)}</div><button class="btn small" data-action="use" data-index="${i}" data-store="${s}">Use this</button></div></li>`,
      )}</ul></div>`);
    el._items = items;
  };

  openModal(`${f.name}`, body(), {
    async browse(el) {
      const s = el.dataset.store;
      const target = modalBody().querySelector('[data-browse]');
      target.innerHTML = '<p class="small"><span class="spinner"></span> Loading from the store website…</p>';
      try {
        let items;
        let note = '';
        if (categoryUrl(foodId, s)) {
          const res = await api.get(`/api/stores/category?store=${s}&foodId=${foodId}`);
          items = res.items;
        } else {
          const res = await api.get(`/api/stores/search?store=${s}&q=${encodeURIComponent(f.buy.search || f.name)}`);
          items = res.items;
          if (!items.length) note = `Nothing came back (${res.tried.map((t) => t.error || `${t.count} results`).join('; ')}). Open ${res.browserUrl} in your browser instead.`;
        }
        renderBrowse(items, s, note);
      } catch (err) {
        target.innerHTML = String(html`<div class="notice warn">${err.message}</div>`);
      }
    },
    async use(el) {
      const s = el.dataset.store;
      const items = modalBody().querySelector('[data-browse]')._items || [];
      const p = items[Number(el.dataset.index)];
      if (!p) return;
      if (!looksLike(p.name, f) && !confirm(`“${p.name}” doesn't look like ${f.name}. Use it anyway?`)) return;
      const sold = p.pack?.perKg || (p.unitPrice?.per === 'kg' && !p.pack?.grams) ? 'weight' : 'pack';
      await api.put(`/api/product-choice/${foodId}`, {
        store: s,
        url: p.url,
        name: p.name,
        sold,
        packG: p.pack?.drainedG || p.pack?.grams || undefined,
        packUnits: p.pack?.units || undefined,
      });
      if (p.price > 0) {
        const eur = sold === 'weight' ? (p.unitPrice?.per === 'kg' ? p.unitPrice.eur : p.price) : p.price;
        await api.post(`/api/prices/${foodId}`, {
          store: s, sold, eur, source: 'store', productName: p.name, url: p.url,
          packG: sold === 'pack' ? p.pack?.drainedG || p.pack?.grams || undefined : undefined,
          packUnits: p.pack?.units || undefined,
        });
      }
      await app.load();
      toast(`${STORE_NAMES[s]}: using “${p.name}”`);
      window.dispatchEvent(new Event('leve:render'));
      modalBody().innerHTML = String(body());
    },
    async 'save-price'(form) {
      const d = formData(form);
      await api.post(`/api/prices/${foodId}`, { ...d, source: 'manual' });
      await app.load();
      toast('Price saved: the shopping list now uses it');
      window.dispatchEvent(new Event('leve:render'));
      modalBody().innerHTML = String(body());
    },
  });
}

export default {
  render(route) {
    if (!app.started()) return html`<div class="card"><p>Start your plan on the <a href="#/today">Today</a> tab first.</p></div>`;
    const from = route.query.from || app.today();
    const days = app.settings.shoppingDays || 7;
    const list = app.shopping(from, days);
    listFoodIds = list.items.map((i) => i.foodId);
    const week = app.weekStart(from);
    const checked = app.state.shoppingChecked?.[week] || {};
    const byStore = {};
    for (const it of list.items) (byStore[it.store] ||= []).push(it);
    const stores = Object.keys(byStore).sort((a, b) => app.settings.stores.indexOf(a) - app.settings.stores.indexOf(b));
    const avoid = Object.keys(STORE_PRODUCTS).flatMap((f) => (list.items.some((i) => i.foodId === f) ? avoidListFor(f) : []));
    const est = Math.round(list.estimatedShare * 100);
    return html`
      <div class="card">
        <div class="card-head"><h1>Shopping list</h1></div>
        <p class="small muted">${fmt.date(from)} → ${fmt.date(addDays(from, days - 1))} (${days} days of meals)</p>
        <div class="grid3">
          <div class="stat"><div class="v">${fmt.eur(list.total)}</div><div class="l">at the till</div></div>
          <div class="stat"><div class="v">${fmt.eur(list.usedTotal / days)}</div><div class="l">food per day</div></div>
          <div class="stat"><div class="v">${100 - est}%</div><div class="l">real prices</div></div>
        </div>
        <div class="row wrap mt">
          <button class="btn primary" data-action="refresh">Refresh Auchan & Pingo Doce prices</button>
          <select data-action-change="mode" aria-label="Store mode" style="width:auto">
            <option value="cheapest" ${app.settings.shoppingMode === 'cheapest' ? 'selected' : ''}>Cheapest store per item</option>
            <option value="main" ${app.settings.shoppingMode === 'main' ? 'selected' : ''}>Everything at ${STORE_NAMES[app.settings.stores[0]]}</option>
          </select>
        </div>
        <div data-refresh-status class="small mt">${refreshNote || ''}</div>
        ${est > 50 ? html`<p class="small muted">Tip: prices marked <span class="badge warn">est.</span> are estimates. Refresh them from the store sites, or tap "product & price" and type what you see on the shelf or receipt.</p>` : ''}
      </div>
      ${avoid.length ? html`<div class="notice warn"><b>Watch out on the shelf:</b>${avoid.map((a) => html`<div class="small">${STORE_NAMES[a.store]}: ${a.name}. ${a.reason}</div>`)}</div>` : ''}
      ${stores.map(
        (s) => html`<div class="card">
          <div class="card-head"><h2>${STORE_NAMES[s]}</h2><span class="price">${fmt.eur(list.totalsByStore[s])}</span></div>
          ${s === 'mercadona' ? html`<p class="small muted">Mercadona has no online shop in Portugal, so these prices are estimates until you add your receipt prices.</p>` : ''}
          ${(() => {
            const sections = {};
            for (const it of byStore[s]) (sections[it.sectionLabel] ||= []).push(it);
            return Object.entries(sections).map(
              ([label, items]) => html`<h3 class="mt small muted">${label}</h3><ul class="list">${items.map((it) => itemRow(it, checked[it.foodId]))}</ul>`,
            );
          })()}
        </div>`,
      )}
      <div class="card">
        <h2>Pantry check</h2>
        <p class="small muted">Tick what you already have at home.</p>
        <ul class="list">${list.pantry.map(
          (p) => html`<li class="row"><input type="checkbox" data-action="pantry" data-food="${p.foodId}" ${p.have ? 'checked' : ''}><span class="grow">${p.name} <span class="tiny muted">${p.en}</span></span></li>`,
        )}</ul>
      </div>`;
  },

  actions: {
    async check(el) {
      const week = app.weekStart(new URLSearchParams(location.hash.split('?')[1] || '').get('from') || app.today());
      const res = await api.put(`/api/shopping/${week}/${el.dataset.food}`, { checked: el.checked });
      app.state.shoppingChecked[week] = res;
      el.closest('.shop-item')?.classList.toggle('checked', el.checked);
    },
    async pantry(el) {
      app.state.pantry = await api.put(`/api/pantry/${el.dataset.food}`, { have: el.checked });
      return 'render';
    },
    async mode(el) {
      await app.saveSettings({ shoppingMode: el.value });
      return 'render';
    },
    product(el) {
      openProductModal(el.dataset.food, el.dataset.store);
    },
    async refresh(el) {
      const status = document.querySelector('[data-refresh-status]');
      const { jobId, total } = await api.post('/api/stores/refresh', { foodIds: listFoodIds });
      if (!total) {
        status.textContent = 'No store products to refresh (pick Auchan or Pingo Doce in Settings).';
        return;
      }
      el.disabled = true;
      const job = await pollJob(jobId, (j) => {
        status.innerHTML = `<span class="spinner"></span> Checking product pages… ${j.done}/${j.total} (updated ${j.updated})`;
      });
      await app.load();
      const errs = job.errors || [];
      const blocked = errs.filter((e) => e.code === 'ROBOTS').length;
      refreshNote = html`<div class="notice ${job.updated ? 'ok' : 'warn'}">Updated ${job.updated} of ${job.total} prices (${new Date().toLocaleTimeString()}).
        ${errs.length ? html`${errs.length} failed${blocked ? ` (${blocked} not allowed by the store's robots.txt)` : ''}: ${errs.slice(0, 3).map((e) => `${FOOD_BY_ID[e.foodId]?.name || e.foodId} @ ${STORE_NAMES[e.store]}: ${e.error}`).join(' | ')}` : ''}</div>`;
      el.disabled = false;
      return 'render';
    },
  },
};

export { openProductModal };
