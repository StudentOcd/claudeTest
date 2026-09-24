import { app } from '../app.js';
import { api } from '../api.js';
import { html, fmt, toast, openModal, STORE_NAMES } from '../ui.js';
import { FOODS, FOOD_BY_ID } from '/core/foods.js';
import { scanProduct } from '/core/gut.js';

let lastResults = [];
let lastQuery = { q: '', source: 'pingodoce' };
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
  return html`<span class="badge ${cls}">${label}</span>`;
}

function flagsList(gut) {
  if (!gut?.flags?.length) return '';
  return html`<ul class="small">${gut.flags.map((f) => html`<li><b>${f.label}</b>${f.matches.length ? `: ${f.matches.join(', ')}` : ''}</li>`)}</ul>`;
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
    html`<div class="row">${p.image ? html`<img class="thumb" src="${p.image}" alt="">` : ''}
        <div class="grow"><div><b>${p.name}</b></div><div class="small muted">${STORE_NAMES[store]} ${p.brand ? `· ${p.brand}` : ''} ${p.ean ? `· EAN ${p.ean}` : ''}</div>
          <div><span class="price">${fmt.eur(p.price)}</span> ${p.unitPrice ? html`<span class="small muted">(${fmt.eur(p.unitPrice.eur)}/${p.unitPrice.per})</span>` : ''}</div></div></div>
      <div class="mt">${verdictBadge(p.gut)}${flagsList(p.gut)}</div>
      ${p.ingredientsText ? html`<p class="small"><b>Ingredients:</b> ${p.ingredientsText}</p>` : ''}
      ${nutritionTable(p.per100)}
      <form class="row mt" data-submit="link">
        <select name="food" required>${foodOptions()}</select>
        <button class="btn primary" type="submit">Use this product</button>
      </form>
      <p class="tiny muted mt"><a href="${url}" target="_blank" rel="noopener">Open on ${STORE_NAMES[store]}</a></p>`,
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
      html`<div class="row">${p.image ? html`<img class="thumb" src="${p.image}" alt="">` : ''}
          <div class="grow"><b>${p.name}</b><div class="small muted">${p.brand} ${p.quantity ? `· ${p.quantity}` : ''} · EAN ${p.code}</div></div></div>
        <div class="mt">${verdictBadge(p.gut)}${flagsList(p.gut)}</div>
        ${p.ingredientsText ? html`<p class="small"><b>Ingredients:</b> ${p.ingredientsText}</p>` : ''}
        ${nutritionTable(p.per100)}
        <h3 class="mt">Prices seen near ${app.settings.location.label || 'you'} (Open Prices)</h3>
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

export default {
  render() {
    const src = lastQuery.source;
    return html`
      <div class="card">
        <h1>Find products</h1>
        <p class="small muted">Search Pingo Doce and Auchan (live prices from their websites) or Open Food Facts (all three chains, including Mercadona's Hacendado),
          and check labels for your gut triggers.</p>
        <form data-submit="search">
          <div class="row"><input class="grow" name="q" placeholder="e.g. atum ao natural, pão de forma" value="${lastQuery.q}" required>
            <button class="btn primary" type="submit">Search</button></div>
          <div class="tabs mt">
            ${[['pingodoce', 'Pingo Doce'], ['auchan', 'Auchan'], ['off-mercadona', 'Mercadona (OFF)'], ['off', 'Open Food Facts']].map(
              ([k, l]) => html`<button type="button" class="btn small ${src === k ? 'on' : ''}" data-action="source" data-value="${k}">${l}</button>`,
            )}
          </div>
        </form>
        <div data-results>${renderResults()}</div>
      </div>
      <div class="card">
        <h2>Check a barcode</h2>
        <p class="small muted">Gut check + nutrition + prices near you, from the numbers under any barcode.</p>
        <form class="row" data-submit="barcode">
          <input class="grow" name="code" inputmode="numeric" pattern="[0-9]{6,14}" placeholder="5601234567890" required>
          <button class="btn" type="submit">Look up</button>
          <button class="btn" type="button" data-action="camera">📷</button>
        </form>
      </div>
      <div class="card">
        <h2>Check any label</h2>
        <p class="small muted">Paste or type an ingredient list (Portuguese, Spanish or English).</p>
        <form data-submit="label"><textarea name="text" rows="3" placeholder="Ingredientes: ..."></textarea><button class="btn mt" type="submit">Check</button></form>
        <div data-label-result></div>
      </div>`;
  },

  actions: {
    source(el) {
      lastQuery.source = el.dataset.value;
      return 'render';
    },
    async search(form) {
      lastQuery.q = form.elements.q.value.trim();
      const target = document.querySelector('[data-results]');
      target.innerHTML = '<p class="small"><span class="spinner"></span> Searching…</p>';
      const src = lastQuery.source;
      try {
        if (src === 'pingodoce' || src === 'auchan') {
          const res = await api.get(`/api/stores/search?store=${src}&q=${encodeURIComponent(lastQuery.q)}`);
          lastResults = res.items.map((x) => ({ ...x, kind: 'store' }));
          if (!lastResults.length) {
            target.innerHTML = String(html`<div class="notice warn">No results from ${STORE_NAMES[src]}.
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
        target.innerHTML = String(html`<div class="notice warn">${err.message}</div>`);
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
  return html`<ul class="list mt">${lastResults.map(
    (r, i) => html`<li class="row">
      ${r.image ? html`<img class="thumb" src="${r.image}" alt="" loading="lazy">` : ''}
      <div class="grow"><b>${r.name || '(no name)'}</b>
        <div class="small muted">${r.kind === 'store' ? STORE_NAMES[r.store] : r.brand || ''} ${r.unitPrice ? `· ${fmt.eur(r.unitPrice.eur)}/${r.unitPrice.per}` : ''}
          ${r.kind === 'off' && r.per100?.kcal != null ? `· ${r.per100.kcal} kcal, ${r.per100.p ?? '?'} g protein /100 g` : ''}</div>
        ${r.gut ? verdictBadge(r.gut) : ''}</div>
      <div class="right">${r.price ? html`<div class="price">${fmt.eur(r.price)}</div>` : ''}<button class="btn small" data-action="open" data-index="${i}">Details</button></div>
    </li>`,
  )}</ul>`;
}

