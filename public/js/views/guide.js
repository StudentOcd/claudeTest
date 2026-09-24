import { app } from '../app.js';
import { html, fmt } from '../ui.js';
import { PHASES, computeTargets } from '/core/nutrition.js';

export default {
  render() {
    const t = app.targets();
    const p1 = computeTargets(app.profile, { phase: 1, weightKg: app.currentWeight() });
    const p2 = computeTargets(app.profile, { phase: 2, weightKg: app.currentWeight() });
    return html`
      <div class="card">
        <h1>The plan explained</h1>
        <p>Lose fat steadily without wrecking your gut, your energy or your gym progress. Three ideas do most of the work:
          <b>a moderate calorie deficit</b>, <b>plenty of protein</b> and <b>lifting 3× a week</b>, all with simple, predictable food.</p>
      </div>
      <div class="card">
        <h2>Your numbers</h2>
        <dl class="kv">
          <dt>Maintenance (estimate)</dt><dd>~${fmt.kcal(t.tdee)} kcal/day</dd>
          <dt>Weeks 1–2 (phase 1)</dt><dd><b>${fmt.kcal(p1.kcal)} kcal</b>: a small deficit while your gut adjusts</dd>
          <dt>From week 3</dt><dd><b>${fmt.kcal(p2.kcal)} kcal</b>: about ${p2.expectedLossKgPerWeek.toFixed(1)}–0.8 kg per week</dd>
          <dt>Protein</dt><dd><b>${t.protein} g/day</b>, spread over every meal</dd>
          <dt>Fat</dt><dd>~${t.fat} g (measure oil; avoid very fatty meals)</dd>
          <dt>Carbs</dt><dd>the rest (~${t.carbs} g): rice, potatoes, oats, bread, fruit</dd>
          <dt>Fibre</dt><dd>build slowly: ${PHASES[1].fibreG} → ${PHASES[2].fibreG} → ${PHASES[3].fibreG} g/day</dd>
        </dl>
        <p class="small muted mt">The scale drops fast in the first 1–2 weeks (water and salt from fast food), then settles.
          From week 3 the weekly check-in adjusts calories from your real trend: aim for 0.5–1% of body weight per week.</p>
      </div>
      <div class="card">
        <h2>Phases (gradual transition)</h2>
        ${[1, 2, 3].map((n) => html`<p><b>Phase ${n}: ${PHASES[n].name}</b> (weeks ${PHASES[n].weeks}). ${PHASES[n].summary}</p>`)}
      </div>
      <div class="card">
        <h2>Daily rhythm</h2>
        <ul class="small">
          <li>4 regular meals (breakfast, lunch, snack, dinner), none huge. Similar times every day.</li>
          <li>Protein at every meal: chicken, turkey, fish, tuna, eggs, egg whites, lean pork or beef.</li>
          <li>Carbs you tolerate: white rice, potatoes, oats (from phase 2), bread in moderate amounts.</li>
          <li>Cooked vegetables first; raw salad later. Soup before dinner if hungry.</li>
          <li>Water ~${t.waterL} L. Coffee 1–2 cups after food. Keep alcohol rare (calories + gut + reflux).</li>
          <li>Last meal 2–3 h before bed; walk 10–20 min after meals if you can.</li>
        </ul>
      </div>
      <div class="card">
        <h2>Training</h2>
        <p class="small">Full-body strength sessions 3× per week (routines A and B on the Gym tab, which Leve can create in Hevy).
          3 sets of 8–12 reps, 1–2 reps short of failure, add weight when you hit the top of the range.
          Walk every day and build up to 7,000–8,000 steps. Lifting + protein is what makes the weight you lose fat, not muscle.</p>
      </div>
      <div class="card">
        <h2>Hunger & cravings</h2>
        <ul class="small">
          <li>Big volume, few calories: potatoes, soup, cooked vegetables, fruit, lean protein.</li>
          <li>Don't skip meals and then binge: regularity is your friend (and your gut's).</li>
          <li>Sleep 7+ hours; tiredness drives hunger.</li>
          <li>Plan a weekly "free" meal out if it helps, and log it roughly.</li>
          <li>Eating out: grilled fish or chicken, rice/potatoes, sauce on the side, skip the fried starters.</li>
        </ul>
      </div>
      <div class="card">
        <h2>Reflux</h2>
        <ul class="small">
          <li>Smaller dinners, earlier; don't lie down for 2–3 hours after eating.</li>
          <li>Limit very fatty meals, chilli, tomato-heavy sauces, citrus on an empty stomach, fizzy drinks, alcohol, lots of coffee.</li>
          <li>Losing abdominal fat usually improves reflux noticeably.</li>
        </ul>
      </div>
      <div class="card flat small muted">This is general guidance, not medical advice. If you have red-flag symptoms (see the Gut tab) or anything worries you, talk to your doctor.</div>`;
  },
  actions: {},
};
