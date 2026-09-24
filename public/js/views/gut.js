import { app } from '../app.js';
import { api } from '../api.js';
import { html, raw, toast, pageHead } from '../ui.js';
import { icon } from '../icons.js';
import { barChart } from '../charts.js';
import { gutSummary, triggerSuspects, dayGutScore } from '/core/gut.js';
import { PHASES } from '/core/nutrition.js';
import { addDays, dateRange, daysBetween } from '/core/dates.js';

const LABEL_WORDS = [
  ['Lactose / milk', 'leite, lactose, soro de leite, leite em pó, proteínas do leite, natas, queijo, iogurte, manteiga (not "manteiga de amendoim")'],
  ['Sugar alcohols', 'sorbitol (E420), manitol (E421), maltitol (E965), xilitol (E967), isomalte (E953), eritritol (E968), lactitol (E966), "polióis"'],
  ['Sweeteners', 'sucralose (E955), acessulfame K (E950), aspartame (E951), sacarina (E954), ciclamato (E952), esteviol (E960), "edulcorantes"'],
  ['Onion / garlic', 'cebola, alho, alho-francês, chalota, "cebola em pó", "alho em pó"; also inside "caldo", "tempero", "molho"'],
  ['Added fibre', 'inulina, fibra de chicória, raiz de chicória, frutooligossacarídeos (FOS), polidextrose (E1200)'],
  ['Fructose', 'xarope de glicose-frutose, frutose, mel, agave, sumo de maçã/pera concentrado'],
];

const SWAPS = [
  ['Milk in coffee', 'lactose-free milk (phase 3 test) or unsweetened almond drink'],
  ['Whey shakes', 'more chicken/fish/eggs/tuna, or liquid egg whites (clara de ovo)'],
  ['"Zero"/"light" snacks', 'fruit you tolerate, rice cakes, a small piece of 70% dark chocolate'],
  ['Onion & garlic for flavour', 'garlic-infused olive oil (garlic removed), chives, green part of spring onion, colorau, cumin, herbs, lemon'],
  ['Big salads', 'cooked carrots, courgette, green beans, spinach; salads from phase 2'],
  ['Fried fast food', 'air-fried chicken/fish and potatoes with a measured teaspoon of oil'],
];

export default {
  render() {
    const today = app.today();
    const days = app.state.days;
    const sum = gutSummary(days, today, 14);
    const suspects = triggerSuspects(days);
    const last14 = dateRange(addDays(today, -13), today);
    const scores = last14.map((d) => ({ label: `${Number(d.slice(8))}`, value: Math.round((dayGutScore(days[d]?.symptoms) ?? 0) * 10) / 10 }));
    const phase = app.phase();
    const p = PHASES[phase];
    const phaseDays = app.profile.phaseSince ? daysBetween(app.profile.phaseSince, today) : 0;
    return html`
      ${pageHead('Gut', 'Sensitive-gut plan')}
      <section class="hero">
        <div class="eyebrow" style="color:rgba(255,255,255,.75)">Phase ${phase} · day ${phaseDays + 1} · usually weeks ${p.weeks}</div>
        <h2 style="margin:4px 0 8px">${p.name}</h2>
        <p class="soft small">${p.summary}</p>
        <div class="seg full mt" style="background:rgba(255,255,255,.14)">${[1, 2, 3].map((n) => html`<button class="${n === phase ? 'on' : ''}" style="${n === phase ? '' : 'color:#fff'}" data-action="phase" data-value="${n}">${n}. ${PHASES[n].name}</button>`)}</div>
        <p class="tiny soft mt">Move on after ~2 calm weeks. Go back a phase any time things flare up.</p>
      </section>
      <div class="card">
        <div class="card-head"><h2>Last 14 days</h2></div>
        ${sum ? html`<div class="grid3">
            <div class="stat"><div class="v">${sum.avgScore}</div><div class="l">avg symptoms (0–3)</div></div>
            <div class="stat"><div class="v">${sum.looseDays}</div><div class="l">loose days (type 6–7)</div></div>
            <div class="stat"><div class="v">${sum.hardDays}</div><div class="l">hard days (type 1–2)</div></div></div>
          ${raw(barChart(scores, { target: 1, height: 120, format: (v) => (v ? v.toFixed(1) : '') }))}`
          : html`<p class="small">Log the 30-second gut check on the Today tab to see patterns here.</p>`}
      </div>
      <div class="card">
        <div class="card-head"><h2>Possible triggers</h2></div>
        ${suspects.length ? html`<p class="small muted">Foods eaten on the day of, or the day before, worse-than-usual days. These are hints, not proof: test them on purpose later.</p>
          <ul class="list">${suspects.map((s) => html`<li class="row between"><span>${s.name}</span><span class="small">${s.exposures}× · avg ${s.avgScore} vs usual ${s.baseline}</span></li>`)}</ul>`
          : html`<p class="small">Nothing stands out yet (needs a couple of weeks of meals ticked as eaten plus gut checks).</p>`}
      </div>
      <div class="card">
        <div class="card-head"><h2>Label words to watch (in Portuguese)</h2></div>
        <table class="simple">${LABEL_WORDS.map(([k, v]) => html`<tr><td><b>${k}</b></td><td class="small">${v}</td></tr>`)}</table>
        <p class="small mt">Tip: "Pode conter vestígios de leite" (may contain traces) is an allergy warning; traces don't matter for lactose intolerance. You can check any product on the <a href="#/products">Products</a> tab.</p>
      </div>
      <div class="card">
        <div class="card-head"><h2>Easy swaps</h2></div>
        <table class="simple">${SWAPS.map(([a, b]) => html`<tr><td>${a}</td><td class="small">${b}</td></tr>`)}</table>
      </div>
      <div class="card">
        <div class="card-head"><h2>Phase 3: testing new foods</h2></div>
        <ol class="steps small">
          <li>Only test on a calm week, one food at a time.</li>
          <li>Day 1 a small portion, day 2 a medium one, day 3 a normal one. Keep everything else the same.</li>
          <li>Symptoms? Stop, note it, wait until you're settled, then test the next food. No symptoms? It's back in your diet.</li>
          <li>Good first tests: lactose-free yogurt, a slice of wholemeal bread, ½ cup of canned rinsed lentils or chickpeas, a small amount of onion cooked in a dish.</li>
        </ol>
      </div>
      <div class="card" style="box-shadow:inset 0 0 0 1.5px var(--danger-soft)">
        <div class="card-head"><span class="tile-ic sm" style="background:var(--danger-soft);color:var(--danger)">${icon('stethoscope')}</span><h2>When to see a doctor</h2></div>
        <p class="small">See your GP (médico de família) if you notice blood in your stool, black stools, diarrhoea that wakes you at night, fever, vomiting,
          weight loss you're not trying for, trouble swallowing, or symptoms that keep getting worse. Also mention a family history of coeliac disease,
          inflammatory bowel disease or bowel cancer.</p>
        <p class="small">It is worth asking for a coeliac blood test <b>before</b> cutting out gluten (the test needs you to be eating it). A dietitian (nutricionista)
          can guide a proper low-FODMAP trial. For reflux, ask your doctor too; losing weight often helps a lot.</p>
      </div>`;
  },

  actions: {
    async phase(el) {
      const to = Number(el.dataset.value);
      const res = await api.post('/api/checkins', { date: app.today(), actions: [{ type: 'phase', to }], note: 'phase changed on Gut tab' });
      app.state.profile = res.profile;
      toast(`Phase ${to}: ${PHASES[to].name}. Your plan and targets are updated.`);
      return 'render';
    },
  },
};
