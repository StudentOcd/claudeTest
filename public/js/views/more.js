import { app } from '../app.js';
import { html } from '../ui.js';

const LINKS = [
  ['#/products', 'Find products & check labels', 'Search Pingo Doce / Auchan / Open Food Facts, scan barcodes, gut check'],
  ['#/gut', 'Gut', 'Phases, symptom patterns, label words, when to see a doctor'],
  ['#/recipes', 'Recipes', 'All recipes, favourites and hidden ones'],
  ['#/guide', 'The plan explained', 'Calories, protein, training, hunger, reflux and eating out'],
  ['#/settings', 'Settings', 'Profile, food preferences, supermarkets, backups'],
];

export default {
  render() {
    return html`<div class="card"><h1>More</h1><ul class="list">${LINKS.map(
      ([href, title, sub]) => html`<li><a href="${href}"><b>${title}</b></a><div class="small muted">${sub}</div></li>`,
    )}</ul></div>
    <div class="card flat small muted">Leve · ${app.state.weights.length} weigh-ins · ${Object.keys(app.state.days).length} days logged</div>`;
  },
  actions: {},
};
