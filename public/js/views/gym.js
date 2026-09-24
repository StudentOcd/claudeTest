import { app } from '../app.js';
import { api } from '../api.js';
import { html, raw, fmt, toast, openModal } from '../ui.js';
import { barChart, sparkline } from '../charts.js';
import {
  exerciseProgress, muscleSets, PROGRAM, sessionsPerWeek, strengthChangePct, topExercises, workoutStats, sortWorkouts,
} from '/core/training.js';

function notConnected() {
  return html`
    <div class="card">
      <h1>Connect Hevy</h1>
      <p>Leve reads your workouts from Hevy to check that you train 3× a week and keep your strength while dieting, and can create the beginner programme in your Hevy app.</p>
      <ol class="steps small">
        <li>Hevy's API needs <b>Hevy Pro</b>.</li>
        <li>Open <a href="https://hevy.com/settings?developer" target="_blank" rel="noopener">hevy.com/settings?developer</a> on the web and generate an API key.</li>
        <li>Paste it below. It stays on your Leve server and is never shown again in full.</li>
      </ol>
      <form class="row mt" data-submit="connect">
        <input class="grow" name="apiKey" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" required>
        <button class="btn primary" type="submit">Connect</button>
      </form>
    </div>
    ${programCard()}`;
}

function programCard() {
  return html`<div class="card">
    <h2>Your programme: full body, 3× per week</h2>
    <p class="small">Alternate A and B (A-B-A one week, B-A-B the next). 3 sets per exercise, stop each set with 1–2 reps left in the tank.
      When you hit the top of the rep range on every set, add the smallest weight step next time.</p>
    ${PROGRAM.routines.map(
      (r) => html`<h3 class="mt">${r.title.replace('Leve – ', '')}</h3><table class="simple"><tr><th>Exercise</th><th>Sets × reps</th><th>Rest</th></tr>
        ${r.exercises.map((e) => html`<tr><td>${e.candidates[0]}<div class="tiny muted">or ${e.candidates.slice(1, 3).join(' / ')}</div></td>
          <td>${e.sets} × ${e.reps ? `${e.reps[0]}–${e.reps[1]}` : `${e.seconds} s`}</td><td>${Math.round(e.rest / 60 * 10) / 10} min</td></tr>`)}</table>`,
    )}
    <p class="tiny muted mt">Plus: walk daily. Build from where you are now towards 7,000–8,000 steps.</p>
    ${app.state.hevy.connected ? html`<button class="btn primary mt" data-action="program">Create these routines in Hevy</button>` : ''}
  </div>`;
}

export default {
  render() {
    const h = app.state.hevy;
    if (!h.connected) return notConnected();
    const ws = sortWorkouts(app.workouts || []);
    const today = app.today();
    const perWeek = sessionsPerWeek(ws, today, 8);
    const target = app.profile.trainingDaysPerWeek || 3;
    const top = topExercises(exerciseProgress(ws), 5);
    const change = strengthChangePct(ws, today);
    const sets = muscleSets(ws, app.templates || {}, today);
    return html`
      <div class="card">
        <div class="card-head"><h1>Gym</h1><button class="btn small" data-action="sync">Sync now</button></div>
        <p class="small muted">Hevy: ${h.user?.name || 'connected'} (key ${h.keyHint}) · last sync ${fmt.ago(h.lastSyncAt)} · ${h.workoutCount} workouts</p>
        ${h.lastError ? html`<div class="notice warn">${h.lastError}</div>` : ''}
        ${raw(barChart(perWeek.map((w) => ({ label: fmt.dateShort(w.week), value: w.count })), { target }))}
        <p class="tiny muted">Sessions per week (dashed line = your goal of ${target}).</p>
      </div>
      <div class="card">
        <div class="card-head"><h2>Strength while dieting</h2>
          ${change === null ? '' : html`<span class="badge ${change >= -2 ? 'ok' : change > -7 ? 'warn' : 'danger'}">${fmt.signed(change, 1)}% vs 4 weeks ago</span>`}</div>
        <p class="small muted">Estimated 1-rep max (from your best set) for your most frequent exercises. Holding steady = you're keeping muscle.</p>
        <ul class="list">${top.map((ex) => {
          const lastS = ex.sessions[ex.sessions.length - 1];
          return html`<li class="row between"><div class="grow"><b>${ex.title}</b><div class="small muted">best recent: ${lastS.kg} kg × ${lastS.reps} · e1RM ${lastS.e1rm} kg · ${ex.sessions.length} sessions</div></div>
            ${raw(sparkline(ex.sessions.slice(-12).map((s) => s.e1rm)))}</li>`;
        })}</ul>
        ${top.length ? '' : html`<p class="small">Sync some workouts with weights and reps to see this.</p>`}
      </div>
      ${Object.keys(sets).length ? html`<div class="card"><h2>Working sets, last 7 days</h2>
        <p class="small muted">Aim for roughly 6–12 hard sets per muscle group each week.</p>
        <table class="simple">${Object.entries(sets).map(([m, n]) => html`<tr><td>${m.replace(/_/g, ' ')}</td><td class="right">${Math.round(n * 10) / 10}</td></tr>`)}</table></div>` : ''}
      <div class="card">
        <h2>Recent workouts</h2>
        <ul class="list">${ws.slice(0, 10).map((w) => {
          const st = workoutStats(w);
          return html`<li><b>${w.title}</b> <span class="small muted">${fmt.date(st.date)} · ${st.durationMin ?? '?'} min · ${st.sets} sets · ${st.volumeKg.toLocaleString('en-GB')} kg volume</span></li>`;
        })}</ul>
      </div>
      <div class="card">
        <h2>Weight in Hevy</h2>
        <p class="small muted">Keep your body weight in both apps.</p>
        <div class="row wrap">
          <button class="btn" data-action="push-weights">Send last 30 days to Hevy</button>
          <button class="btn" data-action="pull-weights">Import weights from Hevy</button>
        </div>
        <label class="check mt"><input type="checkbox" data-action-change="auto-push" ${app.settings.hevyAutoPushWeight ? 'checked' : ''}> Send each new weigh-in to Hevy automatically</label>
      </div>
      ${programCard()}
      <div class="card"><button class="btn danger small" data-action="disconnect">Disconnect Hevy</button></div>`;
  },

  actions: {
    async connect(form) {
      const res = await api.put('/api/hevy/key', { apiKey: form.elements.apiKey.value.trim() });
      app.state.hevy = { ...app.state.hevy, ...res };
      toast(`Connected to Hevy${res.user?.name ? ` as ${res.user.name}` : ''}. Syncing workouts…`);
      const sync = await api.post('/api/hevy/sync', {});
      await app.load();
      await app.loadWorkouts(true);
      toast(`Synced ${sync.total} workouts`);
      return 'render';
    },
    async sync() {
      const sync = await api.post('/api/hevy/sync', {});
      await app.load();
      await app.loadWorkouts(true);
      toast(`Up to date: ${sync.total} workouts (${sync.added} new/changed, ${sync.deleted} removed)`);
      return 'render';
    },
    async disconnect() {
      if (!confirm('Disconnect Hevy? Your synced workouts stay in Leve.')) return;
      await api.del('/api/hevy/key');
      await app.load();
      return 'render';
    },
    async 'push-weights'() {
      const r = await api.post('/api/hevy/weights/push', { days: 30 });
      toast(`Hevy: ${r.created} added, ${r.updated} updated${r.failed.length ? `, ${r.failed.length} failed` : ''}`);
    },
    async 'pull-weights'() {
      const r = await api.post('/api/hevy/weights/pull', {});
      await app.load();
      toast(`Imported ${r.imported} weigh-ins from Hevy`);
      return 'render';
    },
    async 'auto-push'(el) {
      await app.saveSettings({ hevyAutoPushWeight: el.checked });
    },
    async program() {
      const preview = await api.post('/api/hevy/program/preview', {});
      openModal(
        'Create routines in Hevy',
        html`<p class="small">These exercises from your Hevy library will be used:</p>
          ${preview.routines.map((r) => html`<h3 class="mt">${r.title}</h3><ul class="small">${r.exercises.map(
            (e) => html`<li>${e.template ? e.template.title : html`<span class="badge warn">not found</span> ${e.slot}`}</li>`,
          )}</ul>`)}
          ${preview.missing.length ? html`<div class="notice warn">Missing exercises are skipped; add them by hand in Hevy.</div>` : ''}
          <button class="btn primary block mt" data-action="create">Create 2 routines in Hevy</button>`,
        {
          async create(_el, _e, close) {
            const res = await api.post('/api/hevy/program/create', {});
            close();
            toast(`Created ${res.created.length} routines in Hevy${res.folderId ? ' (in their own folder)' : ''}. Open the Hevy app to start.`);
          },
        },
      );
    },
  },
};

