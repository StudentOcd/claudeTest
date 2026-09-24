import { app } from '../app.js';
import { html, pageHead } from '../ui.js';
import { icon } from '../icons.js';

const LINKS = [
  ['#/products', 'search', 'Products', 'Real Pingo Doce, Auchan and Mercadona products, barcodes and labels'],
  ['#/recipes', 'book-open', 'Recipes', 'All recipes, favourites and hidden ones'],
  ['#/gut', 'stethoscope', 'Gut', 'Phases, symptom patterns, label words, when to see a doctor'],
  ['#/guide', 'lightbulb', 'The plan explained', 'Calories, protein, training, hunger and reflux'],
  ['#/settings', 'settings', 'Settings', 'Profile, food preferences, supermarkets, backups'],
];

export default {
  render() {
    const photos = Object.values(app.catalog?.products || {}).filter((p) => p.image).length;
    return html`${pageHead('More')}
    <div class="tiles">${LINKS.map(
      ([href, ic, title, sub]) => html`<a class="tile" href="${href}"><span class="ic">${icon(ic)}</span><b>${title}</b><span>${sub}</span></a>`,
    )}</div>
    <p class="tiny muted center mt-lg">Leve · ${app.state.weights.length} weigh-ins · ${Object.keys(app.state.days).length} days logged · ${photos} product photos</p>`;
  },
  actions: {},
};
