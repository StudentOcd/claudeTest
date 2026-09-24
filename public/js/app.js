// App state and everything derived from it (targets, plans, shopping list,
// check-in). Views only read from here and call the API.

import { api } from './api.js';
import { addDays, dateRange, daysBetween, startOfWeek, todayISO } from '/core/dates.js';
import { PHASES, computeTargets } from '/core/nutrition.js';
import { planDay, planRange, intakeFromLog, adherence } from '/core/planner.js';
import { buildShoppingList } from '/core/shopping.js';
import { latestTrend, weeklyCheckIn, estimateTdeeFromData } from '/core/weight.js';
import { gutSummary } from '/core/gut.js';
import { seenPriceEntries } from '/core/products.js';
import { sessionsBetween, strengthChangePct } from '/core/training.js';

export const app = {
  state: null,
  workouts: null,
  templates: {},
  catalog: { products: {}, foods: {} },
  seenPrices: seenPriceEntries(),

  async load() {
    this.state = await api.get('/api/state');
    return this.state;
  },

  // Product crawl running on the server (started by you or on first start-up).
  crawl: null,
  watching: null,

  /** Follow the running crawl; resolves with the finished job (or null when none runs). */
  watchCrawl() {
    if (this.watching) return this.watching;
    this.watching = (async () => {
      for (;;) {
        try {
          this.crawl = await api.get('/api/stores/crawl');
        } catch {
          break;
        }
        window.dispatchEvent(new Event('leve:crawl'));
        if (this.crawl?.status !== 'running') break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      const job = this.crawl?.status === 'done' ? this.crawl : null;
      if (job) {
        await Promise.all([this.load(), this.loadCatalog()]);
        window.dispatchEvent(new Event('leve:render'));
      }
      this.watching = null;
      return job;
    })();
    return this.watching;
  },

  crawlRunning() {
    return this.crawl?.status === 'running';
  },

  // Real store products with their photos (bundled + your own crawls).
  async loadCatalog() {
    try {
      this.catalog = await api.get('/api/catalog');
    } catch {
      // keep the last copy
    }
    return this.catalog;
  },

  async loadWorkouts(force = false) {
    if (this.workouts && !force) return this.workouts;
    if (!this.state?.hevy?.connected) return (this.workouts = []);
    try {
      [this.workouts, this.templates] = await Promise.all([api.get('/api/hevy/workouts'), api.get('/api/hevy/templates')]);
    } catch {
      this.workouts = this.workouts || [];
    }
    return this.workouts;
  },

  today() {
    return todayISO();
  },

  get profile() {
    return this.state.profile;
  },

  get settings() {
    return this.state.settings;
  },

  started() {
    return Boolean(this.state.profile.startDate);
  },

  phase() {
    return this.state.profile.phase || 1;
  },

  phaseInfo() {
    return PHASES[this.phase()];
  },

  weekOfPlan(date = this.today()) {
    if (!this.state.profile.startDate) return 0;
    return Math.floor(daysBetween(this.state.profile.startDate, date) / 7) + 1;
  },

  trend() {
    return latestTrend(this.state.weights);
  },

  currentWeight() {
    return this.trend()?.trend ?? this.state.profile.weightKg;
  },

  targets() {
    return computeTargets(this.state.profile, { phase: this.phase(), weightKg: this.currentWeight() });
  },

  planContext() {
    const s = this.state;
    return {
      targets: this.targets(),
      phase: this.phase(),
      mealsPerDay: s.profile.mealsPerDay || 4,
      exclusions: s.settings.exclusions || [],
      hidden: s.settings.hiddenRecipes || [],
      favorites: s.settings.favoriteRecipes || [],
      batchMode: s.settings.batchMode !== false,
      overrides: s.planOverrides || {},
    };
  },

  dayPlan(date = this.today()) {
    return planDay(date, this.planContext());
  },

  plans(from, days) {
    return planRange(from, days, this.planContext());
  },

  // Prices seen on the store sites, overridden by anything newer (refreshes, your entries).
  prices() {
    const out = {};
    for (const [food, list] of Object.entries(this.seenPrices)) out[food] = [...list];
    for (const [food, list] of Object.entries(this.state.prices || {})) out[food] = [...(out[food] || []), ...list];
    return out;
  },

  shopping(from = this.today(), days = this.state.settings.shoppingDays || 7) {
    return buildShoppingList(this.plans(from, days), {
      prices: this.prices(),
      stores: this.state.settings.stores,
      mode: this.state.settings.shoppingMode,
      pantryHave: this.state.pantry,
    });
  },

  dayLog(date = this.today()) {
    return this.state.days[date] || {};
  },

  intakeByDate() {
    const out = {};
    for (const [d, log] of Object.entries(this.state.days)) {
      const i = intakeFromLog(log);
      if (i) out[d] = i.kcal;
    }
    return out;
  },

  maintenanceFromData() {
    return estimateTdeeFromData({ weights: this.state.weights, intakeByDate: this.intakeByDate(), endDate: this.today() });
  },

  checkIn() {
    const today = this.today();
    const last14 = dateRange(addDays(today, -13), today);
    const last7 = dateRange(addDays(today, -6), today);
    const avg = (key) => {
      const vals = last7.map((d) => this.state.days[d]?.[key]).filter((v) => typeof v === 'number');
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const workouts = this.workouts || [];
    const training = this.state.hevy.connected
      ? {
          sessions14d: sessionsBetween(workouts, addDays(today, -13), today),
          target14d: (this.state.profile.trainingDaysPerWeek || 3) * 2,
          strengthChangePct: strengthChangePct(workouts, today),
        }
      : null;
    return weeklyCheckIn({
      today,
      startDate: this.state.profile.startDate,
      phase: this.phase(),
      phaseSince: this.state.profile.phaseSince,
      targets: this.targets(),
      weights: this.state.weights,
      adherence: adherence(this.state.days, last14.slice(0, -1), this.state.profile.mealsPerDay || 4),
      gut: gutSummary(this.state.days, today, 14),
      training,
      wellbeing: { energyAvg: avg('energy'), hungerAvg: avg('hunger') },
    });
  },

  weekStart(date = this.today()) {
    return startOfWeek(date);
  },

  // Save helpers that keep local state in sync with the server.
  async saveDay(date, patch) {
    this.state.days[date] = await api.put(`/api/days/${date}`, patch);
    return this.state.days[date];
  },

  async saveSettings(patch) {
    this.state.settings = await api.put('/api/settings', patch);
    return this.state.settings;
  },

  async saveProfile(patch) {
    this.state.profile = await api.put('/api/profile', patch);
    return this.state.profile;
  },
};
