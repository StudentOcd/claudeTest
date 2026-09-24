// Tiny SVG charts (no library): weight trend and bars.

import { esc } from './ui.js';
import { dayIndex } from '/core/dates.js';

const W = 360;

function niceRange(min, max, pad = 0.5) {
  if (min === max) return [min - 1, max + 1];
  const span = max - min;
  return [min - span * 0.08 - pad * 0.2, max + span * 0.08 + pad * 0.2];
}

/**
 * Weight chart: raw weigh-ins as dots, smoothed trend as a line.
 * points: [{ date, kg, trend }], options: { goal, height }
 */
export function weightChart(points, { goal = null, height = 200, unit = 'kg', field = 'kg', trendField = 'trend' } = {}) {
  if (!points.length) return '<p class="muted small">No data yet.</p>';
  const H = height;
  const left = 30;
  const right = 6;
  const top = 10;
  const bottom = 22;
  const xs = points.map((p) => dayIndex(p.date));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 1);
  const vals = points.flatMap((p) => [p[field], p[trendField]]).filter((v) => typeof v === 'number');
  if (goal) vals.push(goal);
  const [y0, y1] = niceRange(Math.min(...vals), Math.max(...vals));
  const sx = (d) => left + ((d - x0) / (x1 - x0)) * (W - left - right);
  const sy = (v) => top + (1 - (v - y0) / (y1 - y0)) * (H - top - bottom);
  const ticks = 4;
  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = y0 + ((y1 - y0) * i) / ticks;
    grid += `<line class="grid" x1="${left}" x2="${W - right}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/>`;
    grid += `<text x="${left - 4}" y="${(sy(v) + 3).toFixed(1)}" text-anchor="end">${v.toFixed(1)}</text>`;
  }
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  let xl = '';
  points.forEach((p, i) => {
    if (i % labelEvery === 0 || i === points.length - 1) {
      const [, m, d] = p.date.split('-').map(Number);
      xl += `<text x="${sx(dayIndex(p.date)).toFixed(1)}" y="${H - 6}" text-anchor="middle">${d}/${m}</text>`;
    }
  });
  const dots = points
    .filter((p) => typeof p[field] === 'number')
    .map((p) => `<circle class="raw" cx="${sx(dayIndex(p.date)).toFixed(1)}" cy="${sy(p[field]).toFixed(1)}" r="2.5"><title>${esc(p.date)}: ${p[field]} ${unit}</title></circle>`)
    .join('');
  const tp = points.filter((p) => typeof p[trendField] === 'number');
  const path = tp.map((p, i) => `${i ? 'L' : 'M'}${sx(dayIndex(p.date)).toFixed(1)},${sy(p[trendField]).toFixed(1)}`).join('');
  const line = tp.length > 1 ? `<path class="trend" d="${path}"/>` : '';
  const base = (H - bottom).toFixed(1);
  const area = tp.length > 1
    ? `<defs><linearGradient id="trendfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--brand);stop-opacity:.22"/><stop offset="1" style="stop-color:var(--brand);stop-opacity:0"/></linearGradient></defs>`
      + `<path class="area" d="${path}L${sx(dayIndex(tp[tp.length - 1].date)).toFixed(1)},${base}L${sx(dayIndex(tp[0].date)).toFixed(1)},${base}Z"/>`
    : '';
  const goalLine = goal ? `<line class="goal" x1="${left}" x2="${W - right}" y1="${sy(goal).toFixed(1)}" y2="${sy(goal).toFixed(1)}"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart">${grid}${area}${goalLine}${dots}${line}${xl}</svg>`;
}

/** Bars: items [{ label, value }], options: { target, height, format } */
export function barChart(items, { target = null, height = 130, format = (v) => String(v) } = {}) {
  if (!items.length) return '<p class="muted small">No data yet.</p>';
  const H = height;
  const left = 8;
  const bottom = 20;
  const top = 14;
  const max = Math.max(target || 0, ...items.map((i) => i.value), 1);
  const bw = (W - left * 2) / items.length;
  const sy = (v) => top + (1 - v / max) * (H - top - bottom);
  let out = '';
  items.forEach((it, i) => {
    const x = left + i * bw + bw * 0.15;
    const w = bw * 0.7;
    const y = sy(it.value);
    const low = target && it.value < target;
    out += `<rect class="col${low ? ' low' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(H - bottom - y).toFixed(1)}" rx="3"><title>${esc(it.label)}: ${esc(format(it.value))}</title></rect>`;
    out += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(it.label)}</text>`;
    if (it.value > 0) out += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle">${esc(format(it.value))}</text>`;
  });
  if (target) out += `<line class="target" x1="${left}" x2="${W - left}" y1="${sy(target).toFixed(1)}" y2="${sy(target).toFixed(1)}"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${out}</svg>`;
}

/** Small line for one exercise's estimated 1RM. */
export function sparkline(values, { width = 120, height = 32 } = {}) {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sx = (i) => (i / (values.length - 1)) * (width - 4) + 2;
  const sy = (v) => (max === min ? height / 2 : height - 3 - ((v - min) / (max - min)) * (height - 6));
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" style="width:${width}px;height:${height}px"><path class="trend" d="${d}"/></svg>`;
}
