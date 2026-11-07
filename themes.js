/* Shared helpers + colour palettes */
(() => {
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const U = {
  clamp: (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  mix: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  rgba: (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3)})`,
  mulberry32,
  hashStr,
};

const PALETTES = {
  gold:   { name: 'Gold',   a: [243, 227, 184], b: [255, 190, 100], glow: [255, 225, 160], tint: [58, 44, 12] },
  tokyo:  { name: 'Tokyo',  a: [255, 45, 95],   b: [0, 240, 255],   glow: [255, 30, 110],  tint: [45, 8, 28] },
  neon:   { name: 'Neon',   a: [255, 110, 210], b: [80, 230, 255],  glow: [190, 100, 255], tint: [42, 8, 62] },
  aurora: { name: 'Aurora', a: [150, 255, 205], b: [130, 165, 255], glow: [100, 255, 195], tint: [6, 44, 52] },
  rose:   { name: 'Rose',   a: [255, 210, 220], b: [255, 118, 150], glow: [255, 140, 172], tint: [62, 10, 26] },
  ice:    { name: 'Ice',    a: [225, 242, 255], b: [125, 200, 255], glow: [150, 212, 255], tint: [10, 30, 62] },
  ember:  { name: 'Ember',  a: [255, 218, 175], b: [255, 112, 55],  glow: [255, 150, 70],  tint: [64, 20, 4] },
  mono:   { name: 'Mono',   a: [255, 255, 255], b: [185, 185, 185], glow: [255, 255, 255], tint: [30, 30, 30] },
  album:  { name: 'Album',  a: [243, 227, 184], b: [255, 190, 100], glow: [255, 225, 160], tint: [58, 44, 12] },
};
const ORDER = ['gold', 'tokyo', 'neon', 'aurora', 'rose', 'ice', 'ember', 'mono', 'album'];

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

const spriteCache = new Map();
const Pal = {
  list: PALETTES,
  order: ORDER,
  id: 'gold',
  cur: PALETTES.gold,
  set(id) {
    this.id = PALETTES[id] ? id : 'gold';
    this.cur = PALETTES[this.id];
  },
  /* Build the "album" palette from a hue (0-360) + saturation (0-1) taken from the cover art */
  setAlbum(h, s) {
    const sat = U.clamp(s, 0.35, 0.95);
    PALETTES.album = {
      name: 'Album',
      a: hsl2rgb(h, Math.min(sat, 0.75), 0.86),
      b: hsl2rgb(h + 28, sat, 0.62),
      glow: hsl2rgb(h, sat, 0.62),
      tint: hsl2rgb(h, sat * 0.8, 0.12),
    };
    if (this.id === 'album') this.cur = PALETTES.album;
  },
  /* Soft pre-rendered glow dot: far cheaper than shadowBlur for every star */
  sprite(c) {
    const key = c.join(',');
    let s = spriteCache.get(key);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = s.height = 64;
    const g = s.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.12, U.rgba(c, 0.85));
    gr.addColorStop(0.45, U.rgba(c, 0.2));
    gr.addColorStop(1, U.rgba(c, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    spriteCache.set(key, s);
    if (spriteCache.size > 24) spriteCache.delete(spriteCache.keys().next().value);
    return s;
  },
};

window.U = U;
window.Pal = Pal;
})();
