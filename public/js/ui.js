// Small UI toolkit: safe HTML templates, formatting, toasts and modals.

class Safe {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Safe) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
}

// Tagged template: interpolations are escaped unless they are html`` results or raw().
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += renderValue(values[i]);
  });
  return new Safe(out);
}

export const raw = (s) => new Safe(String(s));

export const fmt = {
  kcal: (x) => `${Math.round(x || 0).toLocaleString('en-GB')}`,
  g: (x) => `${Math.round(x || 0)} g`,
  kg: (x, d = 1) => (x === null || x === undefined ? '–' : `${Number(x).toFixed(d)} kg`),
  eur: (x) => (x === null || x === undefined || Number.isNaN(x) ? '–' : `€${Number(x).toFixed(2)}`),
  pct: (x, d = 0) => `${(x * 100).toFixed(d)}%`,
  signed: (x, d = 1) => `${x > 0 ? '+' : ''}${Number(x).toFixed(d)}`,
  date: (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  },
  dayMonth: (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  },
  dateShort: (iso) => {
    if (!iso) return '';
    const [, m, d] = iso.slice(0, 10).split('-').map(Number);
    return `${d}/${m}`;
  },
  ago: (isoTs) => {
    if (!isoTs) return 'never';
    const mins = Math.round((Date.now() - Date.parse(isoTs)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const h = Math.round(mins / 60);
    if (h < 48) return `${h} h ago`;
    return `${Math.round(h / 24)} days ago`;
  },
};

// Open/closed state of <details data-remember="key"> across re-renders.
// A product's shelf price the way the store shows it: weighed products per kg (with the
// usual piece or tray), packs by the pack (with the price per kg, litre or item).
// Returns { price: '€6.49/kg' | '€5.89', per: '€14.72/kg' | '€0.25 each' | '≈500 g each' }.
const PER = { kg: 'kg', l: 'L', unit: 'each', dozen: 'dozen', dc: 'dozen', dz: 'dozen' };
export function shelfPrice(p) {
  if (!p) return { price: '', per: '' };
  const weighed = p.pack?.perKg || (p.unitPrice?.per === 'kg' && !p.pack?.grams && !p.pack?.units && p.unitPrice.eur === p.price);
  if (weighed) {
    const perKg = p.unitPrice?.per === 'kg' ? p.unitPrice.eur : p.price;
    const g = p.pack?.pieceG;
    return {
      price: perKg > 0 ? `${fmt.eur(perKg)}/kg` : '',
      per: g ? `≈${g >= 1000 ? `${g / 1000} kg` : `${g} g`} each${perKg > 0 ? `, ≈${fmt.eur((perKg * g) / 1000)}` : ''}` : 'sold by weight',
    };
  }
  const u = p.unitPrice;
  const per = u?.eur > 0 ? (PER[u.per] === 'each' ? `${fmt.eur(u.eur)} each` : `${fmt.eur(u.eur)}/${PER[u.per] || u.per}`) : '';
  return { price: p.price > 0 ? fmt.eur(p.price) : '', per };
}

export const remembered = {};

export function openAttr(key, fallback) {
  return (remembered[key] ?? fallback) ? 'open' : '';
}

export const STORE_NAMES = { mercadona: 'Mercadona', pingodoce: 'Pingo Doce', auchan: 'Auchan', continente: 'Continente', lidl: 'Lidl', other: 'Other' };

export function toast(message, { error = false, ms = 3500 } = {}) {
  const wrap = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

let modalCleanup = null;
const CLOSE_ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

/**
 * Open a modal. content: html`` string. actions: { name: (el, event, close) => {} }
 * Returns a close function.
 */
export function openModal(title, content, actions = {}) {
  closeModal();
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-back" data-modal-back><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-modal-close aria-label="Close">${CLOSE_ICON}</button></div>
    <div data-modal-body>${content}</div></div></div>`;
  const back = root.firstElementChild;
  const close = () => closeModal();
  const onClick = async (e) => {
    if (e.target.matches('[data-modal-back]') || e.target.closest('[data-modal-close]')) return close();
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) {
      e.preventDefault();
      await runSafely(() => actions[el.dataset.action](el, e, close), el);
    }
  };
  const onSubmit = async (e) => {
    const form = e.target.closest('form[data-submit]');
    if (form && actions[form.dataset.submit]) {
      e.preventDefault();
      await runSafely(() => actions[form.dataset.submit](form, e, close), form.querySelector('[type=submit]'));
    }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  back.addEventListener('click', onClick);
  back.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKey);
  modalCleanup = () => {
    document.removeEventListener('keydown', onKey);
    root.innerHTML = '';
  };
  const firstInput = back.querySelector('input:not([type=checkbox]), select, textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 50);
  return close;
}

export function closeModal() {
  if (modalCleanup) modalCleanup();
  modalCleanup = null;
}

export function modalBody() {
  return document.querySelector('[data-modal-body]');
}

// Runs an async UI action, disabling the trigger and showing errors as toasts.
export async function runSafely(fn, trigger) {
  const btn = trigger instanceof HTMLButtonElement ? trigger : null;
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Something went wrong', { error: true, ms: 6000 });
    return undefined;
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

export function segmented(name, options, value, { action = 'seg' } = {}) {
  return html`<div class="seg" role="group">${options.map(
    ([v, label]) => html`<button type="button" class="${String(v) === String(value) ? 'on' : ''}" data-action="${action}" data-name="${name}" data-value="${v}">${label}</button>`,
  )}</div>`;
}

export function bar(value, target, color = null) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const c = value > target * 1.05 ? 'var(--accent)' : color;
  return html`<div class="bar"><div style="width:${pct.toFixed(1)}%;${c ? `--c:${c}` : ''}"></div></div>`;
}

/** Progress ring. value/target, size in px. Content goes in the middle. */
export function ring(value, target, { size = 132, stroke = 12, color = '#fff', label = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return html`<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}"/>
    </svg>
    <div class="ring-label">${label}</div>
  </div>`;
}

export function storeChip(store) {
  return html`<span class="store-chip store-${store}">${STORE_NAMES[store] || store}</span>`;
}

export function pageHead(title, sub = '', right = '') {
  return html`<div class="page-head"><div class="grow">${sub ? html`<div class="eyebrow">${sub}</div>` : ''}<h1>${title}</h1></div>${right}</div>`;
}
