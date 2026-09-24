import { app } from '../app.js';
import { api } from '../api.js';
import { html, fmt, toast, formData, pageHead, STORE_NAMES } from '../ui.js';
import { ACCENTS, MODES, applyTheme } from '../theme.js';
import { LIFESTYLES, PACES } from '/core/nutrition.js';
import { TRIGGERS } from '/core/gut.js';

const EXCLUSIONS = [
  ['fish', "I don't eat fish"],
  ['pork', "I don't eat pork"],
  ['beef', "I don't eat beef"],
  ['egg', "I don't eat eggs"],
  ['wheat', 'Avoid wheat (bread, pasta)'],
  ['acidic', 'Avoid tomato & citrus (reflux)'],
];

export default {
  render() {
    const p = app.profile;
    const s = app.settings;
    const t = app.targets();
    const look = s.appearance || { accent: 'blue', mode: 'system' };
    const opt = (v, cur, label) => html`<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
    return html`
      ${pageHead('Settings')}
      <div class="card">
        <div class="card-head"><h2>Appearance</h2></div>
        <div class="swatches" role="group" aria-label="Colour">${ACCENTS.map(([id, label, c1, c2]) => html`<button type="button" class="swatch ${look.accent === id ? 'on' : ''}" data-action="accent" data-value="${id}" aria-pressed="${look.accent === id}">
          <i style="background:linear-gradient(135deg, ${c1}, ${c2})"></i>${label}</button>`)}</div>
        <div class="seg full mt" role="group" aria-label="Light or dark">${MODES.map(([id, label]) => html`<button type="button" class="${look.mode === id ? 'on' : ''}" data-action="look-mode" data-value="${id}">${label}</button>`)}</div>
        <p class="tiny muted mt">Auto follows your phone's light/dark setting.</p>
      </div>
      <form class="card" data-submit="profile">
        <div class="card-head"><h2>You</h2></div>
        <div class="grid2">
          <div class="field"><label>Name</label><input name="name" value="${p.name}"></div>
          <div class="field"><label>Sex</label><select name="sex">${opt('male', p.sex, 'Male')}${opt('female', p.sex, 'Female')}</select></div>
          <div class="field"><label>Age</label><input name="age" type="number" min="14" max="100" value="${p.age}"></div>
          <div class="field"><label>Height (cm)</label><input name="heightCm" type="number" step="0.5" value="${p.heightCm}"></div>
          <div class="field"><label>Start weight (kg)</label><input name="weightKg" type="number" step="0.1" value="${p.weightKg}"></div>
          <div class="field"><label>Goal weight (kg, optional)</label><input name="goalWeightKg" type="number" step="0.5" value="${p.goalWeightKg ?? ''}"></div>
          <div class="field"><label>Strength sessions / week</label><input name="trainingDaysPerWeek" type="number" min="0" max="7" value="${p.trainingDaysPerWeek}"></div>
          <div class="field"><label>Session length (min)</label><input name="sessionMinutes" type="number" min="15" max="180" value="${p.sessionMinutes}"></div>
        </div>
        <div class="field"><label>Daily activity</label><select name="lifestyle">${Object.entries(LIFESTYLES).map(([k, v]) => opt(k, p.lifestyle, v.label))}</select></div>
        <div class="grid2">
          <div class="field"><label>Pace (from phase 2)</label><select name="pace">${Object.entries(PACES).map(([k, v]) => opt(k, p.pace, v.label))}</select></div>
          <div class="field"><label>Meals per day</label><select name="mealsPerDay">${opt(4, p.mealsPerDay, '4 (3 meals + snack)')}${opt(3, p.mealsPerDay, '3 meals')}</select></div>
          <div class="field"><label>Fixed calories (optional)</label><input name="calorieOverride" type="number" min="1000" max="5000" value="${p.calorieOverride ?? ''}" placeholder="auto: ${t.kcal}"></div>
          <div class="field"><label>Fixed protein g (optional)</label><input name="proteinOverride" type="number" min="40" max="300" value="${p.proteinOverride ?? ''}" placeholder="auto: ${t.protein}"></div>
          <div class="field"><label>Check-in adjustment (kcal)</label><input name="calorieAdjustment" type="number" min="-1000" max="1000" step="25" value="${p.calorieAdjustment || 0}"></div>
          <div class="field"><label>Plan start date</label><input name="startDate" type="date" value="${p.startDate || ''}"></div>
        </div>
        <p class="small muted">Current target: <b>${fmt.kcal(t.kcal)} kcal</b>, ${t.protein} g protein (maintenance ≈ ${fmt.kcal(t.tdee)}).</p>
        <button class="btn primary" type="submit">Save profile</button>
      </form>

      <form class="card" data-submit="food">
        <div class="card-head"><h2>Food preferences</h2></div>
        ${EXCLUSIONS.map(([k, l]) => html`<label class="check"><input type="checkbox" name="ex_${k}" ${s.exclusions.includes(k) ? 'checked' : ''}> ${l}</label>`)}
        <label class="check"><input type="checkbox" name="lactoseFree" ${s.exclusions.includes('dairy_lf') ? '' : 'checked'}> Lactose-free dairy is OK for me (after testing it)</label>
        <label class="check"><input type="checkbox" name="batchMode" ${s.batchMode ? 'checked' : ''}> Batch cooking: repeat lunch and dinner for 2 days</label>
        <p class="small"><a href="#/recipes">Favourite or hide recipes</a></p>
        <h3 class="mt">Label checker sensitivity</h3>
        <table class="simple">${TRIGGERS.map((tr) => html`<tr><td>${tr.label}</td><td><select name="tr_${tr.setting}" style="min-height:36px;padding:6px 10px">
          ${['avoid', 'caution', 'info', 'off'].map((lv) => opt(lv, s.triggers[tr.setting], lv))}</select></td></tr>`)}</table>
        <button class="btn primary mt" type="submit">Save food settings</button>
      </form>

      <form class="card" data-submit="stores">
        <div class="card-head"><h2>Supermarkets</h2></div>
        <p class="small muted">Order = preference. Your main store is used unless another is clearly cheaper.</p>
        ${[0, 1, 2].map((i) => html`<div class="field"><label>${i === 0 ? 'Main store' : `Also shop at (${i + 1})`}</label><select name="store${i}">
          ${opt('', s.stores[i] || '', i === 0 ? '—' : 'none')}${['pingodoce', 'auchan', 'mercadona'].map((k) => opt(k, s.stores[i] || '', STORE_NAMES[k]))}</select></div>`)}
        <div class="grid2">
          <div class="field"><label>Shopping list covers (days)</label><input name="shoppingDays" type="number" min="1" max="14" value="${s.shoppingDays}"></div>
          <div class="field"><label>Mode</label><select name="shoppingMode">${opt('cheapest', s.shoppingMode, 'Cheapest store per item')}${opt('main', s.shoppingMode, 'Everything at main store')}</select></div>
        </div>
        <label class="check"><input type="checkbox" name="liveStoreLookups" ${s.liveStoreLookups ? 'checked' : ''}> Look up live products and prices on the Auchan and Pingo Doce websites</label>
        <div class="field"><label>Contact email for Open Food Facts requests (optional, they ask apps to identify themselves)</label><input name="contactEmail" type="email" value="${s.contactEmail}"></div>
        <div class="grid3">
          <div class="field"><label>Area</label><input name="label" value="${s.location.label}"></div>
          <div class="field"><label>Latitude</label><input name="lat" type="number" step="0.0001" value="${s.location.lat}"></div>
          <div class="field"><label>Longitude</label><input name="lon" type="number" step="0.0001" value="${s.location.lon}"></div>
        </div>
        <button class="btn primary" type="submit">Save supermarkets</button>
      </form>

      <div class="card">
        <div class="card-head"><h2>Hevy</h2></div>
        <p class="small">${app.state.hevy.connected ? html`Connected (key ${app.state.hevy.keyHint}). Manage it on the <a href="#/gym">Gym</a> tab.` : html`Not connected. <a href="#/gym">Connect on the Gym tab</a>.`}</p>
      </div>

      <div class="card">
        <div class="card-head"><h2>Your data</h2></div>
        <p class="small muted">Everything is stored in <code>data/leve.json</code> on the computer running Leve. Back it up now and then.</p>
        <div class="row wrap">
          <button class="btn" data-action="export">Download backup</button>
          <label class="btn" style="margin:0;font-size:inherit;color:var(--text)">Restore backup<input type="file" accept="application/json" data-action-change="import" style="display:none"></label>
        </div>
      </div>
      <div class="card flat small muted">Leve gives general guidance, not medical advice. Check with your doctor before big diet changes, especially with ongoing gut symptoms.</div>`;
  },

  actions: {
    async accent(el) {
      const appearance = { ...app.settings.appearance, accent: el.dataset.value };
      applyTheme(appearance);
      await app.saveSettings({ appearance });
      return 'render';
    },
    async 'look-mode'(el) {
      const appearance = { ...app.settings.appearance, mode: el.dataset.value };
      applyTheme(appearance);
      await app.saveSettings({ appearance });
      return 'render';
    },
    async profile(form) {
      const d = formData(form);
      const patch = {
        name: d.name,
        sex: d.sex,
        age: d.age,
        heightCm: d.heightCm,
        weightKg: d.weightKg,
        goalWeightKg: d.goalWeightKg,
        trainingDaysPerWeek: d.trainingDaysPerWeek,
        sessionMinutes: d.sessionMinutes,
        lifestyle: d.lifestyle,
        pace: d.pace,
        mealsPerDay: Number(d.mealsPerDay),
        calorieOverride: d.calorieOverride,
        proteinOverride: d.proteinOverride,
        calorieAdjustment: d.calorieAdjustment || 0,
      };
      if (d.startDate) patch.startDate = d.startDate;
      await app.saveProfile(patch);
      toast(`Saved. Target: ${app.targets().kcal} kcal, ${app.targets().protein} g protein`);
      return 'render';
    },
    async food(form) {
      const d = formData(form);
      const exclusions = Object.keys(d).filter((k) => k.startsWith('ex_') && d[k]).map((k) => k.slice(3));
      if (!d.lactoseFree) exclusions.push('dairy_lf');
      const triggers = Object.fromEntries(Object.keys(d).filter((k) => k.startsWith('tr_')).map((k) => [k.slice(3), d[k]]));
      await app.saveSettings({ exclusions, batchMode: d.batchMode, triggers });
      toast('Food settings saved');
      return 'render';
    },
    async stores(form) {
      const d = formData(form);
      const stores = [d.store0, d.store1, d.store2].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
      await app.saveSettings({
        stores,
        shoppingDays: d.shoppingDays,
        shoppingMode: d.shoppingMode,
        liveStoreLookups: d.liveStoreLookups,
        contactEmail: d.contactEmail,
        location: { lat: d.lat, lon: d.lon, radiusKm: app.settings.location.radiusKm || 25, label: d.label },
      });
      toast('Supermarkets saved');
      return 'render';
    },
    async export() {
      const data = await api.get('/api/export');
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `leve-backup-${app.today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    async import(el) {
      const file = el.files?.[0];
      if (!file) return;
      if (!confirm('Replace all data in Leve with this backup?')) return;
      const state = JSON.parse(await file.text());
      await api.post('/api/import', { state });
      await app.load();
      toast('Backup restored');
      return 'render';
    },
  },
};
