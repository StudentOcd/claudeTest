// Colour theme and light/dark mode. Kept in settings (so every device matches) and
// in localStorage (so the page paints in the right colours before the data loads).

export const ACCENTS = [
  ['blue', 'Blue', '#3b82f6', '#1d4ed8'],
  ['green', 'Green', '#10a371', '#0a7a55'],
  ['purple', 'Purple', '#8b5cf6', '#6d28d9'],
  ['orange', 'Orange', '#f97316', '#ea580c'],
];
export const MODES = [
  ['system', 'Auto'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export function applyTheme({ accent = 'blue', mode = 'system' } = {}) {
  const root = document.documentElement;
  root.dataset.accent = accent;
  if (mode === 'system') delete root.dataset.mode;
  else root.dataset.mode = mode;
  try {
    localStorage.setItem('leve-theme', JSON.stringify({ accent, mode }));
  } catch {
    // private mode: the server copy still applies after loading
  }
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name=theme-color]').forEach((m) => {
    if (mode === 'system') m.content = m.media.includes('dark') ? '#0b0d12' : '#f4f5f7';
    else m.content = bg;
  });
}
