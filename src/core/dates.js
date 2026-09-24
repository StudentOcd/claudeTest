// Date helpers. All dates are local calendar days as 'YYYY-MM-DD' strings.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s) {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISODate(new Date());
}

// Days since 1970-01-01 for a calendar date (timezone independent).
export function dayIndex(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function fromDayIndex(n) {
  const dt = new Date(n * 86400000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  return fromDayIndex(dayIndex(iso) + n);
}

// Whole days from a to b (positive when b is later).
export function daysBetween(a, b) {
  return dayIndex(b) - dayIndex(a);
}

// Monday of the week containing iso.
export function startOfWeek(iso) {
  const idx = dayIndex(iso);
  const dow = (idx + 3) % 7; // 1970-01-01 was a Thursday; Monday => 0
  return fromDayIndex(idx - dow);
}

export function dateRange(from, to) {
  const out = [];
  for (let i = dayIndex(from); i <= dayIndex(to); i++) out.push(fromDayIndex(i));
  return out;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function weekdayShort(iso) {
  return WEEKDAYS[(dayIndex(iso) + 3) % 7];
}

// Local calendar day of an ISO timestamp such as Hevy's start_time.
export function localDateOfTimestamp(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return toISODate(d);
}
