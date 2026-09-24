// Router, event delegation and start-up.

import { app } from './app.js';
import { toast, runSafely, closeModal, remembered } from './ui.js';
import today from './views/today.js';
import plan from './views/plan.js';
import recipe, { recipesView } from './views/recipe.js';
import shop from './views/shop.js';
import progress from './views/progress.js';
import gym from './views/gym.js';
import more from './views/more.js';
import products from './views/products.js';
import gut from './views/gut.js';
import settings from './views/settings.js';
import guide from './views/guide.js';
import { icon } from './icons.js';
import { crawlCard } from './photos.js';
import { PHASES } from '/core/nutrition.js';

const VIEWS = { today, plan, recipe, recipes: recipesView, shop, progress, gym, more, products, gut, settings, guide };
const NAV_OF = { recipe: 'plan', recipes: 'more', products: 'more', gut: 'more', settings: 'more', guide: 'more' };

const root = document.getElementById('view');
let current = null;

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '') || 'today';
  const [path, qs] = hash.split('?');
  const [name, ...rest] = path.split('/');
  return {
    name: VIEWS[name] ? name : 'today',
    params: { id: rest[0] ? decodeURIComponent(rest[0]) : undefined },
    query: Object.fromEntries(new URLSearchParams(qs || '')),
  };
}

async function render({ keepScroll = false } = {}) {
  const route = parseRoute();
  const view = VIEWS[route.name];
  const scroll = window.scrollY;
  if (route.name === 'gym' || route.name === 'today' || route.name === 'progress') await app.loadWorkouts();
  try {
    root.innerHTML = String(view.render(route));
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="small">${err.message}</p></div>`;
  }
  current = { route, view };
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (NAV_OF[route.name] || route.name)));
  document.getElementById('btn-more').classList.toggle('on', (NAV_OF[route.name] || route.name) === 'more');
  document.getElementById('phase-chip').innerHTML = app.started() ? `<span class="chip brand">Phase ${app.phase()} · ${PHASES[app.phase()].name}</span>` : '';
  window.scrollTo(0, keepScroll ? scroll : 0);
}

async function handle(name, el, event) {
  const fn = current?.view.actions?.[name];
  if (!fn) return;
  const result = await runSafely(() => fn(el, event), el instanceof HTMLButtonElement ? el : el.querySelector?.('[type=submit]'));
  if (result === 'render') await render({ keepScroll: true });
  else if (result === 'render-top') await render();
}

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !root.contains(el)) return;
  if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault();
  handle(el.dataset.action, el, e);
});

root.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action-change]');
  if (el) handle(el.dataset.actionChange, el, e);
});

root.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-submit]');
  if (!form) return;
  e.preventDefault();
  handle(form.dataset.submit, form, e);
});

// Remember which <details data-remember> sections are open (toggle does not bubble: capture it).
root.addEventListener(
  'toggle',
  (e) => {
    const key = e.target?.dataset?.remember;
    if (key) remembered[key] = e.target.open;
  },
  true,
);

// A photo that fails to load (offline, moved on the store's CDN) leaves a plain tile.
document.addEventListener(
  'error',
  (e) => {
    if (e.target?.tagName !== 'IMG') return;
    e.target.hidden = true;
    e.target.parentElement?.classList.add('broken');
  },
  true,
);

window.addEventListener('hashchange', () => {
  closeModal();
  render();
});
window.addEventListener('leve:render', () => render({ keepScroll: true }));
window.addEventListener('leve:crawl', () => {
  document.querySelectorAll('[data-crawl-status]').forEach((el) => {
    if (app.crawlRunning()) el.innerHTML = String(crawlCard(app.crawl));
  });
});

// Re-render when the day changes while the app stays open.
let lastDay = app.today();
setInterval(() => {
  if (app.today() !== lastDay) {
    lastDay = app.today();
    render({ keepScroll: true });
  }
}, 60000);

function drawShell() {
  document.getElementById('brand-mark').innerHTML = String(icon('leaf'));
  document.getElementById('btn-products').innerHTML = String(icon('search'));
  document.getElementById('btn-more').innerHTML = String(icon('layout-grid'));
  document.querySelectorAll('#nav a[data-icon]').forEach((a) => {
    a.innerHTML = `<span class="pill">${icon(a.dataset.icon)}</span>${a.textContent}`;
  });
}

async function start() {
  drawShell();
  try {
    await Promise.all([app.load(), app.loadCatalog()]);
  } catch (err) {
    root.innerHTML = `<div class="card"><h2>Can't reach the Leve server</h2><p class="small">${err.message}</p><p class="small">Is <code>npm start</code> running on your computer?</p></div>`;
    return;
  }
  await render();
  app.watchCrawl();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

start().catch((err) => toast(err.message, { error: true }));
