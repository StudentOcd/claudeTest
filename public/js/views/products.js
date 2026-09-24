import { app } from '../app.js';
import { api } from '../api.js';
import { html, fmt, toast, openModal, pageHead, storeChip, STORE_NAMES } from '../ui.js';
import { icon } from '../icons.js';
import { looksLike } from '../match.js';
import { foodTile, productFor, productTile } from '../photos.js';
import { openProductModal } from './shop.js';
import { FOODS, FOOD_BY_ID, SECTIONS } from '/core/foods.js';
import { scanProduct } from '/core/gut.js';

let lastResults = [];
let lastQuery = { q: '', source: 'pingodoce' };
let section = 'all';
let scanning = null;

const VERDICT = {
  ok: ['ok', 'Looks gut-friendly'],
  info: ['info', 'Fine, with notes'],
  caution: ['warn', 'Careful: check the portion'],
  avoid: ['danger', 'Contains a trigger you avoid'],
  unknown: ['', 'No ingredient list to check'],
};

function verdictBadge(gut) {
  if (!gut) return '';
  const [cls, label] = VERDICT[gut.verdict] || VERDICT.unknown;
  return html`<span class="chip ${cls}">${icon(cls === 'ok' ? 'circle-check' : cls === 'danger' || cls === 'warn' ? 'triangle-alert' : 'info')} ${label}</span>`;
}

function flagsList(gut) {
  if (!gut?.flags?.length) return '';
  return html`<ul class="small" style="margin:8px 0 0;padding-left:18px">${gut.flags.map((f) => html`<li><b>${f.label}</b>${f.matches.length ? `: ${f.matches.join(', ')}` : ''}</li>`)}</ul>`;
}

function nutritionTable(per100) {
  if (!per100 || per100.kcal === null || per100.kcal === undefined) return html`<p class="small muted">No nutrition table found.</p>`;
  const rows = [['Energy', per100.kcal, 'kcal'], ['Protein', per100.p, 'g'], ['Fat', per100.f, 'g'], ['… saturated', per100.satFat, 'g'], ['Carbs', per100.c, 'g'], ['… sugars', per100.sugars, 'g'], ['Fibre', per100.fib, 'g'], ['Salt', per100.salt, 'g']];
  return html`<table class="simple"><tr><th>Per 100 g</th><th class="right"></th></tr>${rows
    .filter((r) => r[1] !== null && r[1] !== undefined)
    .map((r) => html`<tr><td>${r[0]}</td><td class="right">${r[1]} ${r[2]}</td></tr>`)}</table>`;
}

function foodOptions(selected = '') {
  return html`<option value="">Link to a food in my plan…</option>${FOODS.filter((f) => f.per100.kcal > 0).map(
    (f) => html`<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${f.name}</option>`,
  )}`;
}

async function showStoreProduct(store, url) {
  openModal('Product', html`<p><span class="spinner"></span> Reading the product page…</p>`);
  let p;
  try {
    p = await api.get(`/api/stores/product?store=${store}&url=${encodeURIComponent(url)}`);
  } catch (err) {
    openModal('Product', html`<div class="notice warn">${err.message}</div><p><a href="${url}" target="_blank" rel="noopener">Open it on the store website</a></p>`);
    return;
  }
  openModal(
    p.name || 'Product',
    html`${productTile({ ...p, image: p.photo || p.image, store }, { size: 'xl' })}
      <div class="row between top mt">
        <div class="grow">${storeChip(store)}<h2 style="margin-top:6px">${p.name}</h2><div class="small muted">${p.brand || ''} ${p.ean ? `· EAN ${p.ean}` : ''}</div></div>
        <div class="right"><div class="price" style="font-size:1.3rem">${fmt.eur(p.price)}</div>${p.unitPrice ? html`<div class="price-sub">${fmt.eur(p.unitPrice.eur)}/${p.unitPrice.per}</div>` : ''}</div>
      </div>
      <div class="mt">${verdictBadge(p.gut)}${flagsList(p.gut)}</div>
      ${p.ingredientsText ? html`<p class="small"><b>Ingredients:</b> ${p.ingredientsText}</p>` : ''}
      ${nutritionTable(p.per100)}
      <form class="row mt" data-submit="link">
        <select name="food" required>${foodOptions(p.foodId)}</select>
        <button class="btn primary" type="submit">Use it</button>
      </form>
      <a class="btn outline small mt" href="${url}" target="_blank" rel="noopener">${icon('external-link', 'sm')} Open on ${STORE_NAMES[store]}</a>`,
    {
      async link(form, _e, close) {
        const foodId = form.elements.food.value;
        const f = FOOD_BY_ID[foodId];
        if (!looksLike(p.name, f) && !confirm(`“${p.name}” doesn't look like ${f.name}. Use it anyway?`)) return;
        const sold = p.pack?.perKg || (p.unitPrice?.per === 'kg' && !p.pack?.grams) ? 'weight' : 'pack';
        await api.put(`/api/product-choice/${foodId}`, {
          store, url, name: p.name, sold, packG: p.pack?.drainedG || p.pack?.grams || undefined, packUnits: p.pack?.units || undefined,
        });
        if (p.price > 0) {
          await api.post(`/api/prices/${foodId}`, {
            store, sold, source: 'store', productName: p.name, url,
            eur: sold === 'weight' && p.unitPrice?.per === 'kg' ? p.unitPrice.eur : p.price,
            packG: sold === 'pack' ? p.pack?.drainedG || p.pack?.grams || undefined : undefined,
            packUnits: p.pack?.units || undefined,
          });
        }
        await app.load();
        close();
        toast(`Your shopping list now uses this for ${f.name}`);
      },
    },
  );
}

async function showBarcode(code) {
  openModal('Barcode', html`<p><span class="spinner"></span> Looking up ${code} on Open Food Facts…</p>`);
  try {
    const p = await api.get(`/api/off/product/${code}`);
    const latest = Object.values(p.latestByStore || {});
    openModal(
      p.name || code,
      html`${p.image ? html`<div class="ph xl"><img src="${p.image}" alt="${p.name || ''}"></div>` : ''}
        <h2 class="mt">${p.name}</h2><div class="small muted">${p.brand} ${p.quantity ? `· ${p.quantity}` : ''} · EAN ${p.code}</div>
        <div class="mt">${verdictBadge(p.gut)}${flagsList(p.gut)}</div>
        ${p.ingredientsText ? html`<p class="small"><b>Ingredients:</b> ${p.ingredientsText}</p>` : ''}
        ${nutritionTable(p.per100)}
        <div class="section-title"><h3>Prices seen near ${app.settings.location.label || 'you'}</h3></div>
        ${latest.length ? html`<table class="simple">${latest.map((x) => html`<tr><td>${STORE_NAMES[x.store] || x.storeName}</td><td>${x.date}</td><td class="right">${fmt.eur(x.eur)}${x.discounted ? ' (promo)' : ''}</td></tr>`)}</table>`
          : html`<p class="small muted">No prices shared yet. You can add prices from receipts at prices.openfoodfacts.org.</p>`}
        <p class="tiny muted mt">Data: Open Food Facts & Open Prices (ODbL). <a href="${p.url}" target="_blank" rel="noopener">View on Open Food Facts</a></p>`,
    );
  } catch (err) {
    openModal('Barcode', html`<div class="notice warn">${err.message}</div>`);
  }
}

async function startCamera() {
  if (!('BarcodeDetector' in window)) {
    toast('This browser cannot scan barcodes. Type the numbers under the barcode instead.', { error: true });
    return;
  }
  if (!window.isSecureContext) {
    toast('The camera needs HTTPS or localhost. Type the barcode instead.', { error: true });
    return;
  }
  const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  const close = openModal('Scan a barcode', html`<video playsinline muted style="width:100%;border-radius:12px"></video><p class="small muted">Point the camera at the barcode.</p>`);
  const video = document.querySelector('#modal-root video');
  video.srcObject = stream;
  await video.play();
  const stop = () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(scanning);
  };
  scanning = setInterval(async () => {
    if (!video.isConnected) return stop();
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        stop();
        close();
        showBarcode(codes[0].rawValue);
      }
    } catch {
      // keep trying
    }
  }, 400);
}

function foodGrid() {
  const foods = FOODS.filter((f) => !f.buy.pantry && f.per100.kcal > 0 && (section === 'all' || f.section === section));
  const main = app.settings.stores[0];
  return html`<div class="product-grid">${foods.map((f) => {
    const p = productFor(f.id, main) || productFor(f.id, 'pingodoce') || productFor(f.id, 'auchan');
    return html`<button type="button" class="pcard" data-action="food" data-food="${f.id}" data-store="${p?.store || main}">
      ${foodTile(f.id, { store: main, storeTag: true })}
      <div class="name">${f.name}</div>
      <div class="price-sub" style="white-space:normal">${p?.name || f.en}</div>
    </button>`;
  })}</div>`;
}

export default {
  render() {
    const src = lastQuery.source;
    const sections = Object.entries(SECTIONS).filter(([k]) => FOODS.some((f) => f.section === k && !f.buy.pantry && f.per100.kcal > 0));
    return html`
      ${pageHead('Products', 'Pingo Doce · Auchan · Mercadona')}
      <form class="card" data-submit="search">
        <div class="row"><input class="grow" name="q" placeholder="Search: atum ao natural, pão de forma…" value="${lastQuery.q}" required aria-label="Search products">
          <button class="icon-btn" style="background:var(--brand);color:var(--on-brand)" type="submit" aria-label="Search">${icon('search')}</button></div>
        <div class="days mt" style="padding-bottom:0">
          ${[['pingodoce', 'Pingo Doce'], ['auchan', 'Auchan'], ['off-mercadona', 'Mercadona'], ['off', 'Any brand']].map(
            ([k, l]) => html`<button type="button" class="chip ${src === k ? 'brand' : ''}" data-action="source" data-value="${k}">${k === 'off' ? '' : html`<i class="dot store store-${k.replace('off-', '')}"></i>`}${l}</button>`,
          )}
        </div>
        <div data-results>${renderResults()}</div>
      </form>

      <div class="section-title"><h2>Your plan's products</h2></div>
      <div class="days" style="margin-bottom:6px">
        <button type="button" class="chip ${section === 'all' ? 'brand' : ''}" data-action="section" data-value="all">All</button>
        ${sections.map(([k, label]) => html`<button type="button" class="chip ${section === k ? 'brand' : ''}" data-action="section" data-value="${k}">${label.replace(/ \(.*\)$/, '')}</button>`)}
      </div>
      ${foodGrid()}

      <div class="section-title"><h2>Check a product</h2></div>
      <div class="card">
        <div class="card-head"><span class="tile-ic">${icon('scan-barcode')}</span><h3>Barcode</h3></div>
        <p class="small muted">Gut check, nutrition and prices near you from the numbers under any barcode.</p>
        <form class="row" data-submit="barcode">
          <input class="grow" name="code" inputmode="numeric" pattern="[0-9]{6,14}" placeholder="5601234567890" required aria-label="Barcode number">
          <button class="btn" type="submit">Look up</button>
          <button class="icon-btn" type="button" data-action="camera" aria-label="Scan with camera">${icon('camera')}</button>
        </form>
      </div>
      <div class="card">
        <div class="card-head"><span class="tile-ic">${icon('list-checks')}</span><h3>Ingredient list</h3></div>
        <p class="small muted">Paste or type the ingredients (Portuguese, Spanish or English).</p>
        <form data-submit="label"><textarea name="text" rows="3" placeholder="Ingredientes: ..." aria-label="Ingredients"></textarea><button class="btn mt" type="submit">Check</button></form>
        <div data-label-result></div>
      </div>`;
  },

  actions: {
    section(el) {
      section = el.dataset.value;
      return 'render';
    },
    food(el) {
      openProductModal(el.dataset.food, el.dataset.store);
    },
    source(el) {
      lastQuery.source = el.dataset.value;
      return 'render';
    },
    async search(form) {
      lastQuery.q = form.elements.q.value.trim();
      const target = document.querySelector('[data-results]');
      target.innerHTML = '<p class="small mt"><span class="spinner"></span> Searching…</p>';
      const src = lastQuery.source;
      try {
        if (src === 'pingodoce' || src === 'auchan') {
          const res = await api.get(`/api/stores/search?store=${src}&q=${encodeURIComponent(lastQuery.q)}`);
          lastResults = res.items.map((x) => ({ ...x, kind: 'store' }));
          if (!lastResults.length) {
            target.innerHTML = String(html`<div class="notice warn mt">No results from ${STORE_NAMES[src]}.
              ${res.tried.map((t) => html`<div class="tiny">${t.error || `${t.count} results`}</div>`)}
              <a href="${res.browserUrl}" target="_blank" rel="noopener">Open the search on ${STORE_NAMES[src]}</a></div>`);
            return;
          }
        } else {
          const store = src === 'off-mercadona' ? 'mercadona' : '';
          const res = await api.get(`/api/off/search?q=${encodeURIComponent(lastQuery.q)}${store ? `&store=${store}` : ''}`);
          lastResults = res.map((x) => ({ ...x, kind: 'off' }));
        }
      } catch (err) {
        target.innerHTML = String(html`<div class="notice warn mt">${err.message}</div>`);
        return;
      }
      target.innerHTML = String(renderResults());
    },
    open(el) {
      const r = lastResults[Number(el.dataset.index)];
      if (!r) return;
      if (r.kind === 'store') showStoreProduct(r.store, r.url);
      else if (r.code) showBarcode(r.code);
    },
    barcode(form) {
      showBarcode(form.elements.code.value.trim());
    },
    camera() {
      return startCamera();
    },
    label(form) {
      const res = scanProduct({ name: '', ingredientsText: form.elements.text.value }, app.settings.triggers);
      document.querySelector('[data-label-result]').innerHTML = String(html`<div class="mt">${verdictBadge(res)}${flagsList(res)}</div>`);
    },
  },
};

function renderResults() {
  if (!lastResults.length) return '';
  return html`<div class="product-grid mt">${lastResults.map(
    (r, i) => html`<button type="button" class="pcard" data-action="open" data-index="${i}">
      ${productTile({ ...r, image: r.image }, {})}
      <div class="name">${r.name || '(no name)'}</div>
      <div class="price-sub" style="white-space:normal">${r.kind === 'store' ? STORE_NAMES[r.store] : r.brand || ''}${r.kind === 'off' && r.per100?.kcal != null ? ` · ${r.per100.kcal} kcal, ${r.per100.p ?? '?'} g P` : ''}</div>
      <div class="row between" style="gap:4px"><span class="price" style="font-size:.95rem">${r.price ? fmt.eur(r.price) : ''}</span><span class="price-sub">${r.unitPrice ? `${fmt.eur(r.unitPrice.eur)}/${r.unitPrice.per}` : ''}</span></div>
      ${r.gut ? verdictBadge(r.gut) : ''}
    </button>`,
  )}</div>`;
}
