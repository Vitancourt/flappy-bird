// Graphics quality tiers. The game starts on the best tier the device is likely to handle and
// steps down on its own if the frame rate stays low (see main.js). `?quality=low|medium|high`
// in the URL pins a tier and turns the automatic step-down off.
const TIERS = {
  high: { pixelRatio: 2, shadowSize: 2048, viewRadius: 3 },
  medium: { pixelRatio: 1.5, shadowSize: 1024, viewRadius: 3 },
  low: { pixelRatio: 1, shadowSize: 0, viewRadius: 2 }, // no shadows
};
const ORDER = ['high', 'medium', 'low'];

export const quality = { name: 'high', ...TIERS.high, auto: true, listeners: [] };

export function applyQuality(name) {
  if (!TIERS[name]) return;
  Object.assign(quality, { name }, TIERS[name]);
  quality.pixelRatio = Math.min(quality.pixelRatio, window.devicePixelRatio || 1);
  for (const fn of quality.listeners) fn(quality);
}

// pick the starting tier: URL override, else touch devices start lower
export function initQuality(isTouch) {
  const q = new URLSearchParams(window.location.search).get('quality');
  if (TIERS[q]) {
    quality.auto = false;
    applyQuality(q);
  } else {
    applyQuality(isTouch ? 'medium' : 'high');
  }
}

// step one tier down; returns false when already at the bottom or pinned
export function lowerQuality() {
  if (!quality.auto) return false;
  const i = ORDER.indexOf(quality.name);
  if (i >= ORDER.length - 1) return false;
  applyQuality(ORDER[i + 1]);
  return true;
}
