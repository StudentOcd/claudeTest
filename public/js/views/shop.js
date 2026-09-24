import { app } from '../app.js';
import { api } from '../api.js';
import { html, fmt, toast, openModal, formData, modalBody, pageHead, storeChip, STORE_NAMES } from '../ui.js';
import { icon } from '../icons.js';
import { looksLike } from '../match.js';
import { crawlCard, foodTile, hasPhotos, productFor, productTile, productsOf } from '../photos.js';
import { FOOD_BY_ID, formatCount, nutritionOf, nutritionSource, unitLabel, weighedAs } from '/core/foods.js';
import { checkLabel, compareToReference } from '/core/labels.js';
import { avoidListFor, categoryUrl, STORE_PRODUCTS } from '/core/products.js';
import { addDays } from '/core/dates.js';

let refreshNote = null;
let listFoodIds = [];

const SOURCE_LABEL = { estimate: 'estimate', web: 'seen online', store: 'store website', manual: 'your price', receipt: 'receipt', openprices: 'Open Prices', 'mercadona-es': 'Mercadona Spain (guide)' };
const BADGE = { pingodoce: 'PD', auchan: 'A', mercadona: 'M' };

function needText(it) {
  const f = FOOD_BY_ID[it.foodId];
  if (f.unit && it.needUnits) {
    const n = Math.ceil(it.needUnits * 4) / 4;
    return `${formatCount(n)} ${unitLabel(f, n)}`;
  }
  const state = weighedAs(f);
  const amount = it.needGrams >= 1000 ? `${(it.needGrams / 1000).toFixed(2)} kg` : `${it.needGrams} g`;
  return `${amount}${state ? ` ${state}` : ''}`;
}

// "1 × <long product name>" says nothing the title doesn't: show the pack size instead.
function buyLabel(it, prod) {
  if (!prod?.name || !it.buyText.includes(prod.name)) return it.buyText;
  const o = it.offer;
  const size = o.packUnits ? `${o.packUnits}-pack` : o.packG ? (o.packG >= 1000 ? `${o.packG / 1000} kg pack` : `${o.packG} g pack`) : 'pack';
  return `${it.buyText.split(' × ')[0]} × ${size}`;
}

const unitPriceText = (p) => (p?.unitPrice?.eur ? `${fmt.eur(p.unitPrice.eur)}/${p.unitPrice.per}` : '');

function itemRow(it, checked) {
  const prod = productFor(it.foodId, it.store);
  const src = it.offer.source;
  return html`<div class="shop-item ${checked ? 'checked' : ''}">
    <button class="plain" data-action="product" data-food="${it.foodId}" data-store="${it.store}" aria-label="${it.name}: product and price">${foodTile(it.foodId, { store: it.store })}</button>
    <div class="grow">
      <div class="title" data-action="product" data-food="${it.foodId}" data-store="${it.store}">${prod?.name || it.name}</div>
      <div class="buy">${prod?.name ? html`${it.name} · ` : ''}buy <b>${buyLabel(it, prod)}</b></div>
      <div class="price-sub">need ${needText(it)}${it.leftoverText ? ` · ${it.leftoverText}` : ''}</div>
    </div>
    <div class="right">
      <div class="price">${fmt.eur(it.costEur)}</div>
      <div class="price-sub">${src === 'estimate' ? html`<span style="color:var(--warn)">estimate</span>` : unitPriceText(prod) || SOURCE_LABEL[src] || src}</div>
      <button class="checkcircle ${checked ? 'on' : ''}" style="margin:6px 0 0 auto" data-action="check" data-food="${it.foodId}" aria-label="Got it" aria-pressed="${Boolean(checked)}">${icon('check')}</button>
    </div>
  </div>`;
}

// ───────── Product sheet ─────────

function priceEntrySold(p) {
  if (p.sold) return p.sold;
  return p.pack?.perKg || (p.unitPrice?.per === 'kg' && !p.pack?.grams) ? 'weight' : 'pack';
}

async function useProduct(foodId, store, p) {
  const sold = priceEntrySold(p);
  const packG = p.pack?.drainedG || p.pack?.grams || p.packG || undefined;
  const packUnits = p.pack?.units || p.packUnits || undefined;
  await api.put(`/api/product-choice/${foodId}`, { store, url: p.url, name: p.name, sold, packG, packUnits });
  if (p.price > 0) {
    const eur = sold === 'weight' ? (p.unitPrice?.per === 'kg' ? p.unitPrice.eur : p.price) : p.price;
    await api.post(`/api/prices/${foodId}`, {
      store,
      sold,
      eur,
      source: store === 'mercadona' ? 'mercadona-es' : 'store',
      productName: p.name,
      url: p.url,
      packG: sold === 'pack' && !packUnits ? packG : undefined,
      packUnits: sold === 'pack' ? packUnits : undefined,
    });
  }
  await app.load();
}

function openProductModal(foodId, startStore) {
  const f = FOOD_BY_ID[foodId];
  const stores = [...new Set([...(app.settings.stores || []), 'pingodoce', 'auchan', 'mercadona'])];
  let store = stores.includes(startStore) ? startStore : stores[0];
  let live = { store: null, items: [], note: '' };
  const avoid = avoidListFor(foodId);

  const latest = (s) => (app.prices()[foodId] || []).filter((p) => p.store === s).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1))[0];

  const body = () => {
    const current = productFor(foodId, store);
    const others = productsOf(foodId, store);
    const l = latest(store);
    const liveHere = live.store === store ? live.items : [];
    const priceNow = current?.price || (l && l.productName === current?.name ? l.eur : null);
    return html`
      <div class="seg full mb">${stores.map((s) => html`<button type="button" class="${s === store ? 'on' : ''}" data-action="store" data-store="${s}">${STORE_NAMES[s]}</button>`)}</div>
      ${current ? productTile(current, { size: 'xl', foodId }) : html`<div class="ph xl none tint-${f.section}">${icon('image-off')}</div>`}
      <div class="mt">
        <div class="row between top">
          <div class="grow"><div class="row" style="gap:6px">${storeChip(store)}${current?.chosen ? html`<span class="chip brand">${icon('check')} your pick</span>` : ''}</div>
            <h2 style="margin-top:6px">${current?.name || f.name}</h2>
            <div class="small muted">${f.name} · ${f.en}</div></div>
          <div class="right">${priceNow ? html`<div class="price" style="font-size:1.3rem">${fmt.eur(priceNow)}</div>` : ''}
            <div class="price-sub">${unitPriceText(current)}</div></div>
        </div>
        ${l ? html`<p class="tiny muted mt">List price: ${fmt.eur(l.eur)}${l.sold === 'weight' ? '/kg' : ''} · ${SOURCE_LABEL[l.source] || l.source}${l.date ? `, ${l.date}` : ''}</p>` : html`<p class="tiny muted mt">No price from ${STORE_NAMES[store]} yet: the list uses an estimate.</p>`}
        ${current?.url ? html`<a class="btn outline small mt" href="${current.url}" target="_blank" rel="noopener">${icon('external-link', 'sm')} Open on ${STORE_NAMES[store]}</a>` : ''}
        ${store === 'mercadona' ? html`<div class="callout info">${icon('info')}<div class="small">Mercadona has no online shop in Portugal. These are the same Hacendado products from its Spanish shop, with Spanish prices as a guide. Add your receipt price below for the real one.</div></div>` : ''}
      </div>
      ${f.gut?.note ? html`<div class="callout">${icon('stethoscope')}<div class="small">${f.gut.note}</div></div>` : ''}
      ${avoid.length ? html`<div class="callout warn">${icon('triangle-alert')}<div class="small"><b>Skip these:</b> ${avoid.map((a) => html`<div>${STORE_NAMES[a.store]}: ${a.name}. ${a.reason}</div>`)}</div></div>` : ''}
      ${nutritionSection(f, current)}

      <div class="section-title"><h3>${others.length ? `Other choices at ${STORE_NAMES[store]}` : `Nothing found at ${STORE_NAMES[store]} yet`}</h3></div>
      ${others.length ? html`<div class="product-grid">${others.map((p, i) => pcard(p, i, 'catalog', current))}</div>` : ''}
      ${store !== 'mercadona' ? html`<button class="btn block mt" data-action="browse">${icon('search')} ${categoryUrl(foodId, store) ? `Browse the ${STORE_NAMES[store]} shelf online` : `Search ${STORE_NAMES[store]} online`}</button>` : ''}
      ${live.note && live.store === store ? html`<div class="notice warn mt small">${live.note}</div>` : ''}
      ${liveHere.length ? html`<div class="section-title"><h3>Live from ${STORE_NAMES[store]}</h3></div><div class="product-grid">${liveHere.slice(0, 24).map((p, i) => pcard(p, i, 'live', current))}</div>` : ''}

      <details class="card flat mt" data-remember="add-price">
        <summary>${icon('tag')} Add the price on the shelf or receipt</summary>
        <form class="grid2" data-submit="save-price">
          <div class="field"><label>Store</label><select name="store">${stores.map((s) => html`<option value="${s}" ${s === store ? 'selected' : ''}>${STORE_NAMES[s]}</option>`)}</select></div>
          <div class="field"><label>Sold</label><select name="sold">
            <option value="pack" ${f.buy.sold === 'pack' ? 'selected' : ''}>per pack</option>
            <option value="weight" ${f.buy.sold === 'weight' ? 'selected' : ''}>per kg</option>
            <option value="unit" ${f.buy.sold === 'unit' ? 'selected' : ''}>per piece</option></select></div>
          <div class="field"><label>Price (€)</label><input name="eur" type="number" step="0.01" min="0.01" required></div>
          <div class="field"><label>${f.unit && f.buy.packUnits ? 'Units per pack' : 'Pack size (g)'}</label>
            <input name="${f.unit && f.buy.packUnits ? 'packUnits' : 'packG'}" type="number" min="1" value="${f.unit && f.buy.packUnits ? f.buy.packUnits : f.buy.packG || ''}"></div>
          <div class="field" style="grid-column: span 2"><label>Product name (optional)</label><input name="productName" placeholder="e.g. Atum ao natural 3×80 g"></div>
          <button class="btn primary" type="submit" style="grid-column: span 2">Save price</button>
        </form>
      </details>`;
  };

  const pcard = (p, i, kind, current) => {
    const on = current && (p.url === current.url || (p.id && p.id === current.id));
    return html`<button type="button" class="pcard ${on ? 'on' : ''}" data-action="use" data-kind="${kind}" data-index="${i}">
      ${productTile(p, { foodId })}
      <div class="name">${p.name}</div>
      <div class="row between" style="gap:4px"><span class="price" style="font-size:.95rem">${p.price ? fmt.eur(p.price) : ''}</span><span class="price-sub">${unitPriceText(p)}</span></div>
      ${p.promo ? html`<span class="chip warn" style="align-self:flex-start">promo</span>` : ''}
    </button>`;
  };

  const redraw = () => {
    const el = modalBody();
    if (el) el.innerHTML = String(body());
  };

  openModal(f.name, body(), {
    store(el) {
      store = el.dataset.store;
      redraw();
    },
    async browse(el) {
      el.innerHTML = '<span class="spinner"></span> Loading from the store website…';
      try {
        let items;
        let note = '';
        if (categoryUrl(foodId, store)) {
          items = (await api.get(`/api/stores/category?store=${store}&foodId=${foodId}`)).items;
        } else {
          const res = await api.get(`/api/stores/search?store=${store}&q=${encodeURIComponent(f.buy.search || f.name)}`);
          items = res.items;
          if (!items.length) note = `Nothing came back (${res.tried.map((t) => t.error || `${t.count} results`).join('; ')}).`;
        }
        live = { store, items: items.map((x) => ({ ...x, store })), note };
      } catch (err) {
        live = { store, items: [], note: err.message };
      }
      redraw();
    },
    async use(el) {
      const list = el.dataset.kind === 'live' ? live.items : productsOf(foodId, store);
      const p = list[Number(el.dataset.index)];
      if (!p?.url) return;
      if (!looksLike(p.name, f) && !confirm(`“${p.name}” doesn't look like ${f.name}. Use it anyway?`)) return;
      await useProduct(foodId, store, p);
      toast(`${STORE_NAMES[store]}: using “${p.name}”`);
      window.dispatchEvent(new Event('leve:render'));
      redraw();
    },
    async 'save-price'(form) {
      const d = formData(form);
      await api.post(`/api/prices/${foodId}`, { ...d, source: 'manual' });
      await app.load();
      toast('Price saved: the shopping list now uses it');
      window.dispatchEvent(new Event('leve:render'));
      redraw();
    },
  });
}

// Nutrition per 100 g: what the plan uses, this product's label, and the reference table.
function nutritionSection(f, product) {
  const used = nutritionOf(f);
  const src = nutritionSource(f);
  const label = product?.per100 || null;
  const check = label ? checkLabel(label, f.per100) : null;
  const rows = compareToReference(label, f);
  const usedRow = (key) => Math.round((used[key] ?? 0) * 10) / 10;
  const srcText = src?.kind === 'label'
    ? html`Your plan uses the label of <b>${src.name}</b> (${STORE_NAMES[src.store] || src.store}), ${src.from === 'openfoodfacts' && src.offUrl
      ? html`from <a href="${src.offUrl}" target="_blank" rel="noopener">Open Food Facts</a> (typed from photos of the pack)`
      : 'read from the store page'}.`
    : html`Your plan uses <b>${src?.db}</b> #${src?.code}: ${src?.name}.`;
  return html`<details class="card flat mt" data-remember="nutrition">
    <summary>${icon('list-checks')} Nutrition per 100 g ${f.unit ? '' : html`<span class="chip" style="margin-left:6px">${weighedAs(f) || 'as sold'}</span>`}</summary>
    <table class="simple nutri">
      <tr><th></th><th class="right">Your plan</th><th class="right">This label</th><th class="right">CIQUAL</th></tr>
      ${rows.map((r) => html`<tr><td>${r.name}</td>
        <td class="right used">${usedRow(r.key)}${r.key === 'kcal' ? '' : ' g'}</td>
        <td class="right">${r.label ?? '–'}${r.label !== null && r.diffPct !== null && Math.abs(r.diffPct) >= 10 ? html` <span class="diff" style="color:var(--warn)">${r.diffPct > 0 ? '+' : ''}${r.diffPct}%</span>` : ''}</td>
        <td class="right muted">${r.ref}</td></tr>`)}
    </table>
    <p class="tiny muted mt">${srcText}
      ${label && !check.ok ? html` This label isn't used: ${check.why}.` : ''}
      ${!label ? (product?.detail ? " This product's page has no nutrition table (fresh meat, fish and loose produce don't need one), so the reference applies." : ' No label read for this product yet: Update on the Shop tab reads it from the store page.') : ''}
      CIQUAL 2025 is the EU food composition table from ANSES; energy and carbohydrates are calculated as on EU labels.</p>
  </details>`;
}

// ───────── List ─────────

export default {
  render(route) {
    if (!app.started()) return html`<div class="card"><p>Start your plan on the <a href="#/today">Today</a> tab first.</p></div>`;
    const from = route.query.from || app.today();
    const days = app.settings.shoppingDays || 7;
    const list = app.shopping(from, days);
    listFoodIds = [...list.items.map((i) => i.foodId), ...list.pantry.map((p) => p.foodId)];
    const week = app.weekStart(from);
    const checked = app.state.shoppingChecked?.[week] || {};
    const byStore = {};
    for (const it of list.items) (byStore[it.store] ||= []).push(it);
    const stores = Object.keys(byStore).sort((a, b) => app.settings.stores.indexOf(a) - app.settings.stores.indexOf(b));
    const avoid = Object.keys(STORE_PRODUCTS).flatMap((f) => (list.items.some((i) => i.foodId === f) ? avoidListFor(f) : []));
    const real = Math.round((1 - list.estimatedShare) * 100);
    const got = list.items.filter((i) => checked[i.foodId]).length;
    const main = app.settings.stores[0];
    return html`
      ${pageHead('Shopping list', `${fmt.date(from)} → ${fmt.date(addDays(from, days - 1))}`,
        html`<button class="btn small primary" data-action="refresh" ${app.crawlRunning() ? 'disabled' : ''}>${icon('refresh-cw', 'sm')} Update</button>`)}
      <section class="hero">
        <div class="row between top">
          <div><div class="eyebrow" style="color:rgba(255,255,255,.75)">At the till</div>
            <div style="font-size:2.3rem;font-weight:800;letter-spacing:-.03em;line-height:1.1">${fmt.eur(list.total)}</div>
            <div class="small soft">${fmt.eur(list.usedTotal / days)} of food per day · ${days} days</div></div>
          <span class="chip glass">${icon('list-checks')} ${got}/${list.items.length}</span>
        </div>
        <div class="stackbar mt">${stores.map((s) => html`<div class="store-${s}" style="width:${((list.totalsByStore[s] / list.total) * 100).toFixed(1)}%"></div>`)}</div>
        <div class="legend mt">${stores.map((s) => html`<span class="store-${s}"><i class="dot store"></i>${STORE_NAMES[s]} ${fmt.eur(list.totalsByStore[s])}</span>`)}</div>
        <div class="row wrap mt" style="gap:6px"><span class="chip glass">${icon('tag')} ${real}% real store prices</span></div>
      </section>
      <div class="seg full mb">
        <button class="${app.settings.shoppingMode === 'cheapest' ? 'on' : ''}" data-action="mode" data-value="cheapest">Cheapest per item</button>
        <button class="${app.settings.shoppingMode === 'main' ? 'on' : ''}" data-action="mode" data-value="main">All at ${STORE_NAMES[main]}</button>
      </div>
      <div data-crawl-status>${app.crawlRunning() ? crawlCard(app.crawl) : refreshNote || ''}</div>
      ${hasPhotos() || app.crawlRunning() ? '' : html`<div class="callout info mb">${icon('camera')}<div class="small"><b>Product photos aren't downloaded yet.</b> Tap <b>Update</b> and Leve fetches the real products, photos and prices from Pingo Doce, Auchan and Mercadona (the computer running Leve needs internet access).</div></div>`}
      ${avoid.length ? html`<details class="card" data-remember="avoid"><summary>${icon('triangle-alert')} Watch out on the shelf <span class="chip warn" style="margin-left:6px">${avoid.length}</span></summary>
        ${avoid.map((a) => html`<div class="small" style="margin-bottom:6px">${storeChip(a.store)} <b>${a.name}</b>. ${a.reason}</div>`)}</details>` : ''}
      ${stores.map((s) => {
        const sections = {};
        for (const it of byStore[s]) (sections[it.sectionLabel] ||= []).push(it);
        return html`<div class="card store-${s}">
          <div class="store-head"><span class="store-badge">${BADGE[s] || s[0].toUpperCase()}</span>
            <div class="grow"><h2>${STORE_NAMES[s]}</h2><div class="tiny muted">${byStore[s].length} items${s === 'mercadona' ? ' · prices are a guide until you add receipts' : ''}</div></div>
            <span class="price">${fmt.eur(list.totalsByStore[s])}</span></div>
          ${Object.entries(sections).map(([label, items]) => html`<div class="eyebrow mt">${label}</div>${items.map((it) => itemRow(it, checked[it.foodId]))}`)}
        </div>`;
      })}
      ${list.pantry.length ? html`<div class="card">
        <div class="card-head"><h2>Pantry check</h2><span class="chip">${list.pantry.filter((p) => p.have).length}/${list.pantry.length} at home</span></div>
        ${list.pantry.map((p) => html`<div class="shop-item">
          ${foodTile(p.foodId, { size: 'sm' })}
          <div class="grow"><div class="title">${p.name}</div><div class="price-sub">${p.en}</div></div>
          <button class="checkcircle ${p.have ? 'on' : ''}" data-action="pantry" data-food="${p.foodId}" aria-label="Have it" aria-pressed="${p.have}">${icon('check')}</button></div>`)}
      </div>` : ''}`;
  },

  actions: {
    async check(el) {
      const week = app.weekStart(new URLSearchParams(location.hash.split('?')[1] || '').get('from') || app.today());
      const on = !el.classList.contains('on');
      const res = await api.put(`/api/shopping/${week}/${el.dataset.food}`, { checked: on });
      app.state.shoppingChecked[week] = res;
      return 'render';
    },
    async pantry(el) {
      app.state.pantry = await api.put(`/api/pantry/${el.dataset.food}`, { have: !el.classList.contains('on') });
      return 'render';
    },
    async mode(el) {
      await app.saveSettings({ shoppingMode: el.dataset.value });
      return 'render';
    },
    product(el) {
      openProductModal(el.dataset.food, el.dataset.store);
    },
    async refresh() {
      await api.post('/api/stores/refresh', { foodIds: listFoodIds });
      refreshNote = null;
      const job = await app.watchCrawl();
      if (!job) return 'render';
      const errs = job.errors || [];
      const blocked = errs.filter((e) => e.code === 'ROBOTS').length;
      refreshNote = html`<div class="callout ${job.products ? '' : 'warn'} mb">${icon(job.products ? 'circle-check' : 'triangle-alert')}<div class="small">
        <b>${job.products ? `Found ${job.products} products, ${job.photos} photos and ${job.updated} prices.` : 'No products came back from the stores.'}</b>
        ${errs.length ? html`<div class="muted">${errs.length} problems${blocked ? ` (${blocked} blocked by robots.txt)` : ''}: ${errs.slice(0, 2).map((e) => e.error).join(' | ')}</div>` : ''}</div></div>`;
      return 'render';
    },
  },
};

export { openProductModal };
