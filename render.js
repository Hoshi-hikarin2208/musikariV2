/* Renderer: backgrounds + five lyric styles. Everything is drawn on one canvas. */
(() => {
'use strict';
const { clamp, lerp, easeOut, easeInOut, mix, rgba } = U;
const FONTS = {
  dmSans: "'DM Sans','Helvetica Neue',Arial,sans-serif",
  delaGothicOne: "'Dela Gothic One','Noto Sans JP',sans-serif",
  zenTokyoZoo: "'Zen Tokyo Zoo','Noto Sans JP',cursive,sans-serif",
  dotGothic16: "'DotGothic16',monospace,sans-serif",
  syne: "'Syne','DM Sans',sans-serif",
  orbitron: "'Orbitron','DM Sans',sans-serif",
  righteous: "'Righteous','DM Sans',cursive,sans-serif",
  sawarabiMincho: "'Sawarabi Mincho','Noto Sans JP',serif",
  notoSansJp: "'Noto Sans JP','Yu Gothic',Meiryo,sans-serif",
  manrope: "'Manrope','DM Sans',Arial,sans-serif",
  oswald: "'Oswald','Arial Narrow',Arial,sans-serif",
  bebasNeue: "'Bebas Neue','Arial Narrow',sans-serif",
};
const WAVE_Y = 0.85;
function getLineY(H, S) {
  return (S && S.linePos === 'center') ? H * 0.50 : H * 0.85;
}
const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CUSTOM_CURSORS = new Set(['fire', 'rose', 'petals', 'lightning', 'bubbles', 'leaves', 'snow', 'music', 'diamonds', 'fireflies', 'ribbons', 'smoke', 'sakura', 'aurora', 'frost', 'sparks', 'embers', 'ripple', 'confetti']);

const R = {
  pointer: { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, inside: false },
  particles: [],
  rings: [],
  burstRings: [],
  cursorTrail: [],
  cursorParticles: [],
  phonkKanjis: [],
  driftStreaks: [],
  bassHits: [],
  jolts: [],
  fxHits: [],
  customBgImg: null,
  setCustomBg(src) {
    if (!src) {
      R.customBgImg = null;
      const domEl = document.getElementById('custom-bg-dom');
      if (domEl) domEl.src = '';
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { R.customBgImg = img; };
    img.src = src;
    const domEl = document.getElementById('custom-bg-dom');
    if (domEl) domEl.src = src;
  },
  _cursorEffect: '',
  quality: 1,           // 1 = full, 0 = lite (auto-lowered on slow machines)
  _lastBeat: 0,
  zoomPulse: 0,
  signalWaveform: new Float32Array(641),
  lightPulse: 0,
  blackPulse: 0,
  lightColor: 0,
  lastLightBeat: -Infinity,
  _orbitRot: 0,
  _wavePhase: 0,
  _wrapCache: new Map(),
};
window.R = R;

let selectedFont = FONTS.dmSans;
const font = (ctx, size, weight) => { ctx.font = `${weight} ${size.toFixed(1)}px ${selectedFont}`; };

function findLine(lines, t) {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/* ---------------------------------------------------------------- *
 * Backgrounds
 * ---------------------------------------------------------------- */
let dust = null;
function drawDust(ctx, W, H, now, pal, boost) {
  const n = R.quality ? 110 : 50;
  if (!dust || dust.length !== n) {
    dust = Array.from({ length: n }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.5,
      s: Math.random() * 0.004 + 0.001, p: Math.random() * 6.28, f: Math.random() * 1.5 + 0.5,
    }));
  }
  const tt = now / 1000;
  for (const d of dust) {
    const y = (((d.y - tt * d.s * 0.6) % 1) + 1) % 1;
    const a = (0.12 + 0.28 * (0.5 + 0.5 * Math.sin(tt * d.f + d.p))) * (1 + boost);
    ctx.fillStyle = rgba(pal.a, Math.min(a, 0.9));
    ctx.fillRect(d.x * W, y * H, d.r, d.r);
  }
}

let SAKURA_PETALS = null;
function initSakura() {
  if (SAKURA_PETALS) return;
  SAKURA_PETALS = Array.from({ length: 45 }, () => ({
    x: Math.random(),
    y: Math.random(),
    s: 0.5 + Math.random() * 0.9,
    vx: -0.04 - Math.random() * 0.05,
    vy: 0.03 + Math.random() * 0.05,
    rot: Math.random() * 6.28,
    vrot: (Math.random() - 0.5) * 1.6,
    wob: Math.random() * 6.28,
  }));
}

const NEB = [
  { fx: 0.00021, fy: 0.00017, ph: 0.0, c: 'a', r: 0.55 },
  { fx: 0.00015, fy: 0.00023, ph: 2.1, c: 'b', r: 0.5 },
  { fx: 0.00018, fy: 0.00013, ph: 4.2, c: 'glow', r: 0.6 },
];

function drawBg(ctx, W, H, now, S, pal) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, W, H);
  const bass = Beat.bass, bp = Beat.pulse;

  if (S.bg === 'custom') {
    if (R.customBgImg && R.customBgImg.complete && R.customBgImg.naturalWidth > 0) {
      const iw = R.customBgImg.naturalWidth, ih = R.customBgImg.naturalHeight;
      const coverScale = Math.max(W / iw, H / ih);
      const zoom = 1 + bp * (S.beatShake ? 0.025 : 0.015);
      const dw = iw * coverScale * zoom, dh = ih * coverScale * zoom;
      const dx = (W - dw) / 2, dy = (H - dh) / 2;
      ctx.drawImage(R.customBgImg, dx, dy, dw, dh);

      const dim = S.customBgDim !== undefined ? S.customBgDim : 0.45;
      ctx.fillStyle = `rgba(5, 7, 12, ${dim})`;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = rgba(pal.tint, 0.12 + bp * 0.08);
      ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.65);
      g.addColorStop(0, rgba(pal.tint, 0.3));
      g.addColorStop(1, '#05070c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      drawDust(ctx, W, H, now, pal, 0.15);
    }
    return;
  }

  if (S.bg === 'japanese') {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#06030c');
    skyGrad.addColorStop(0.45, '#160826');
    skyGrad.addColorStop(0.85, '#220b32');
    skyGrad.addColorStop(1, '#0a0312');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    const moonR = Math.min(W, H) * (0.16 + bp * 0.02);
    const moonX = W * 0.5;
    const moonY = H * 0.34;
    const haloGr = ctx.createRadialGradient(moonX, moonY, moonR * 0.8, moonX, moonY, moonR * (2.2 + bp * 0.6));
    haloGr.addColorStop(0, 'rgba(255, 30, 95, 0.45)');
    haloGr.addColorStop(0.5, 'rgba(255, 15, 80, 0.15)');
    haloGr.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = haloGr;
    ctx.beginPath(); ctx.arc(moonX, moonY, moonR * (2.2 + bp * 0.6), 0, 6.2832); ctx.fill();

    const moonGrad = ctx.createLinearGradient(moonX - moonR, moonY - moonR, moonX + moonR, moonY + moonR);
    moonGrad.addColorStop(0, '#ff2a6d');
    moonGrad.addColorStop(0.5, '#d11149');
    moonGrad.addColorStop(1, '#66082d');
    ctx.fillStyle = moonGrad;
    ctx.shadowColor = 'rgba(255, 42, 109, 0.85)';
    ctx.shadowBlur = 28 + bp * 32;
    ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, 6.2832); ctx.fill();
    ctx.shadowBlur = 0;

    const fujiBaseW = Math.max(W * 0.72, 700);
    const fujiH = H * 0.36;
    const fujiY = H * 0.72;
    ctx.fillStyle = '#0c0516';
    ctx.beginPath();
    ctx.moveTo(moonX - fujiBaseW / 2, fujiY);
    ctx.bezierCurveTo(moonX - fujiBaseW * 0.28, fujiY - fujiH * 0.35, moonX - fujiBaseW * 0.08, fujiY - fujiH, moonX - fujiBaseW * 0.035, fujiY - fujiH);
    ctx.lineTo(moonX + fujiBaseW * 0.035, fujiY - fujiH);
    ctx.bezierCurveTo(moonX + fujiBaseW * 0.08, fujiY - fujiH, moonX + fujiBaseW * 0.28, fujiY - fujiH * 0.35, moonX + fujiBaseW / 2, fujiY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 120, 190, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(moonX - fujiBaseW * 0.06, fujiY - fujiH * 0.88);
    ctx.lineTo(moonX - fujiBaseW * 0.035, fujiY - fujiH);
    ctx.lineTo(moonX + fujiBaseW * 0.035, fujiY - fujiH);
    ctx.lineTo(moonX + fujiBaseW * 0.06, fujiY - fujiH * 0.88);
    ctx.stroke();

    initSakura();
    const tt = now / 1000;
    ctx.fillStyle = 'rgba(255, 175, 205, 0.75)';
    for (const petal of SAKURA_PETALS) {
      const px = (((petal.x + tt * petal.vx + Math.sin(tt * 0.8 + petal.wob) * 0.04) % 1) + 1) % 1 * W;
      const py = (((petal.y + tt * petal.vy) % 1) + 1) % 1 * H;
      const rot = petal.rot + tt * petal.vrot;
      const size = (3.5 + bp * 2) * petal.s;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.6, size * 0.85, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    const mist = ctx.createLinearGradient(0, H * 0.65, 0, H);
    mist.addColorStop(0, 'rgba(25, 8, 40, 0)');
    mist.addColorStop(1, rgba(pal.tint, 0.45 + bp * 0.15));
    ctx.fillStyle = mist;
    ctx.fillRect(0, H * 0.65, W, H * 0.35);

    drawDust(ctx, W, H, now, pal, 0.15 * bass);
    return;
  }

  if (S.bg === 'northernLights') {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#01050d');
    sky.addColorStop(0.5, '#04131e');
    sky.addColorStop(1, '#020911');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawDust(ctx, W, H, now, pal, 0.35);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const t = REDUCED_MOTION ? 0 : now * 0.00018;
    const steps = R.quality ? 48 : 26;
    const auroraColors = [
      [35, 255, 160],
      [20, 225, 255],
      [180, 55, 255],
      [55, 255, 210],
    ];
    for (let band = 0; band < 4; band++) {
      const base = H * (0.05 + band * 0.045);
      const depth = H * (0.42 + (band % 2) * 0.14);
      const col = auroraColors[band];
      const bandPulse = band === 0 ? bass : band === 1 ? Beat.mid : band === 2 ? bp : Beat.high;
      const grad = ctx.createLinearGradient(0, base, 0, base + depth);
      grad.addColorStop(0, rgba(col, 0));
      grad.addColorStop(0.2, rgba(col, 0.05 + bandPulse * 0.04));
      grad.addColorStop(0.55, rgba(col, 0.14 + bandPulse * 0.08));
      grad.addColorStop(0.9, rgba(col, 0.04 + bandPulse * 0.03));
      grad.addColorStop(1, rgba(col, 0));

      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const x = (s / steps) * W;
        const wave = Math.sin(s * 0.19 + t * (1.2 + band * 0.2) + band * 1.7) * H * 0.055
          + Math.sin(s * 0.08 - t * 0.9 + band * 2.3) * H * 0.035;
        const y = base + wave;
        if (!s) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let s = steps; s >= 0; s--) {
        const x = (s / steps) * W;
        const wave = Math.sin(s * 0.19 + t * (1.2 + band * 0.2) + band * 1.7 + 1.2) * H * 0.085
          + Math.sin(s * 0.08 - t * 0.9 + band * 2.3) * H * 0.05;
        ctx.lineTo(x, base + depth + wave);
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = '#02050b';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H * 0.78);
    for (let m = 0; m <= 12; m++) {
      const mx = (m / 12) * W;
      const my = H * (0.75 + Math.sin(m * 1.8) * 0.04 + (m % 2 ? 0.02 : -0.02));
      ctx.lineTo(mx, my);
    }
    ctx.lineTo(W, H * 0.78);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    return;
  }

  const g = ctx.createRadialGradient(W * 0.5, H * 0.43, 0, W * 0.5, H * 0.43, Math.max(W, H) * 0.78);
  g.addColorStop(0, rgba(pal.tint, 0.3 + 0.1 * bp));
  g.addColorStop(0.52, rgba(pal.tint, 0.1));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (S.bg === 'none') {
    drawDust(ctx, W, H, now, pal, 0.12 * bass);
    return;
  }

  if (S.bg === 'nebula') {
    ctx.globalCompositeOperation = 'lighter';
    for (const b of NEB) {
      const x = W * (0.5 + 0.34 * Math.sin(now * b.fx + b.ph));
      const y = H * (0.5 + 0.3 * Math.cos(now * b.fy + b.ph * 1.7));
      const rad = Math.max(W, H) * b.r * (1 + 0.1 * bass);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const al = 0.1 + 0.12 * bass + 0.08 * bp;
      gr.addColorStop(0, rgba(pal[b.c], al));
      gr.addColorStop(1, rgba(pal[b.c], 0));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    drawDust(ctx, W, H, now, pal, 0.3 * bass);
  } else if (S.bg === 'aurora') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const t = REDUCED_MOTION ? 0 : now * 0.00015;
    const steps = R.quality ? 40 : 22;
    for (let band = 0; band < 4; band++) {
      const base = H * (0.08 + band * 0.035);
      const depth = H * (0.42 + (band % 2) * 0.12);
      const color = [pal.a, pal.b, pal.glow, pal.a][band];
      const gradient = ctx.createLinearGradient(0, base, 0, base + depth);
      gradient.addColorStop(0, rgba(color, 0));
      gradient.addColorStop(0.25, rgba(color, 0.045 + 0.025 * bass));
      gradient.addColorStop(0.65, rgba(color, 0.08 + 0.035 * Beat.pulse));
      gradient.addColorStop(1, rgba(color, 0));
      ctx.beginPath();
      for (let step = 0; step <= steps; step++) {
        const x = (step / steps) * W;
        const wave = Math.sin(step * 0.22 + t * (1 + band * 0.13) + band) * H * 0.035
          + Math.sin(step * 0.09 - t * 0.7 + band * 2) * H * 0.025;
        const y = base + wave;
        if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let step = steps; step >= 0; step--) {
        const x = (step / steps) * W;
        const wave = Math.sin(step * 0.22 + t * (1 + band * 0.13) + band + 1.1) * H * 0.06
          + Math.sin(step * 0.09 - t * 0.7 + band * 2) * H * 0.04;
        ctx.lineTo(x, base + depth + wave);
      }
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }
    ctx.restore();
    drawDust(ctx, W, H, now, pal, 0.22 * bass);
  } else if (S.bg === 'spectrum') {
    const n = Beat.bars.length, width = W, bw = width / n;
    const left = 0;
    const baseY = getLineY(H, S);
    const gr = ctx.createLinearGradient(0, baseY, 0, baseY - H * 0.3);
    gr.addColorStop(0, rgba(pal.glow, 0.28));
    gr.addColorStop(1, rgba(pal.b, 0));
    ctx.fillStyle = gr;
    for (let i = 0; i < n; i++) {
      const h = Math.max(Beat.bars[i], Beat.barPulse[i]) * H * 0.24 + 2;
      ctx.fillRect(left + i * bw + bw * 0.16, baseY - h, bw * 0.68, h);
    }
    drawDust(ctx, W, H, now, pal, 0.2 * bass);
  } else if (S.bg === 'rings') {
    ctx.lineWidth = 1.5;
    for (let i = R.rings.length - 1; i >= 0; i--) {
      const r = R.rings[i];
      const p = (now - r.born) / 1900;
      if (p >= 1) { R.rings.splice(i, 1); continue; }
      const rad = easeOut(p) * Math.max(W, H) * 0.62 + 24;
      ctx.strokeStyle = rgba(pal.glow, (1 - p) * 0.35 * r.s);
      ctx.lineWidth = 1 + (1 - p) * 2 * r.s;
      ctx.beginPath();
      ctx.arc(r.x * W, r.y * H, rad, 0, 6.2832);
      ctx.stroke();
    }
    drawDust(ctx, W, H, now, pal, 0.15 * bass);
  } else {
    drawDust(ctx, W, H, now, pal, 0.25 * bass + 0.2 * bp);
  }
  if (S.bg !== 'dust' && S.bg !== 'spectrum' && S.bg !== 'aurora') drawDust(ctx, W, H, now, pal, 0.12 * bass);
}

/* Glowing radial spectrum ring (the neon circular equalizer). valueAt(t) returns 0..1 for t in 0..1 around the circle. */
function spectrumRing(ctx, cx, cy, r0, maxLen, count, valueAt, colBar, colGlow, alpha, rot, width) {
  const step = 6.2832 / count;
  const glow = R.quality ? 14 : 0;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = rot + i * step;
    const len = 2 + valueAt(i / count) * maxLen;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(cx + c * r0, cy + s * r0);
    ctx.lineTo(cx + c * (r0 + len), cy + s * (r0 + len));
  }
  ctx.strokeStyle = rgba(colBar, 0.85 * alpha);
  ctx.lineWidth = width;
  ctx.shadowColor = rgba(colGlow, 0.95 * alpha);
  ctx.shadowBlur = glow;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r0, 0, 6.2832);
  ctx.strokeStyle = rgba(colGlow, 0.9 * alpha);
  ctx.lineWidth = width * 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255,255,255,${0.6 * alpha})`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBeatVisual(ctx, W, H, now, S, pal) {
  for (let i = R.fxHits.length - 1; i >= 0; i--) if (now - R.fxHits[i].born >= R.fxHits[i].life) R.fxHits.splice(i, 1);
  const selected = Array.isArray(S.beatVisual) ? S.beatVisual : [S.beatVisual || 'waveform'];
  if (selected.includes('off')) return;
  const modes = selected.includes('auto')
    ? [Beat.bass > Math.max(0.2, Beat.mid * 1.35) ? 'signal' : 'waveLine']
    : selected;

  const centerY = getLineY(H, S);
  const bars = Beat.bars;
  const barValue = (i) => Math.max(bars[i], Beat.barPulse[i]);
  const amp = 14 + Beat.bass * 20;
  const fxPulse = R.zoomPulse;

  modes.forEach((mode) => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (mode === 'waveLine') {
      const samples = Beat.waveform;
      const amplitude = Math.min(H * 0.22, H * (0.04 + Beat.level * 0.28 + Beat.pulse * 0.12));
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = (i / (samples.length - 1)) * W;
        const env = Math.sin(Math.PI * i / (samples.length - 1));
        const y = centerY + samples[i] * amplitude * env;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 2.5 + Beat.pulse * 2.5;
      ctx.strokeStyle = rgba(pal.glow, 0.65 + Beat.level * 0.35);
      ctx.shadowColor = rgba(pal.glow, 0.9);
      ctx.shadowBlur = 12 + Beat.pulse * 18;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (mode === 'signal') {
      const sampleCount = Math.max(160, Math.min(640, Math.floor(W / 2)));
      const amplitudeLimit = Math.max(0, Math.min(H * 0.38, centerY - 8, H - centerY - 8));
      const gradient = ctx.createLinearGradient(0, centerY, W, centerY);
      gradient.addColorStop(0, rgba(pal.a, 0.8));
      gradient.addColorStop(0.25, 'rgba(255,35,120,0.95)');
      gradient.addColorStop(0.5, 'rgba(0,240,255,0.95)');
      gradient.addColorStop(0.75, 'rgba(255,140,40,0.9)');
      gradient.addColorStop(1, rgba(pal.b, 0.8));

      const upper = R.signalWaveform;
      for (let i = 0; i <= sampleCount; i++) {
        const t = i / sampleCount;
        const bin = Math.min(bars.length - 1, Math.floor(t * bars.length));
        const sample = Beat.waveform[Math.floor(t * (Beat.waveform.length - 1))] || 0;
        const env = Math.sin(Math.PI * t);
        const texture = (Math.abs(sample) * 0.15 + barValue(bin) * 0.25 + R.zoomPulse * 0.1) * env;
        upper[i] = Math.max(-amplitudeLimit, Math.min(amplitudeLimit, sample * texture * H));
      }

      // Upper wave
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      for (let i = 0; i <= sampleCount; i++) {
        const x = (i / sampleCount) * W;
        ctx.lineTo(x, centerY - upper[i]);
      }
      ctx.lineTo(W, centerY);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2 + Beat.pulse * 1.5;
      ctx.shadowColor = 'rgba(255,45,145,0.85)';
      ctx.shadowBlur = 12 + R.zoomPulse * 16;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Lower wave
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      for (let i = 0; i <= sampleCount; i++) {
        const x = (i / sampleCount) * W;
        ctx.lineTo(x, centerY + upper[i]);
      }
      ctx.lineTo(W, centerY);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Clean full-width baseline
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(W, centerY);
      ctx.strokeStyle = rgba(pal.glow, 0.4 + R.zoomPulse * 0.35);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (mode === 'audio') {
      const samples = Beat.waveform;
      const amplitude = Math.min(H * 0.24, H * (0.04 + Beat.level * 0.38 + Beat.bass * 0.12));
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = (i / (samples.length - 1)) * W;
        const env = Math.sin(Math.PI * i / (samples.length - 1));
        const y = centerY + samples[i] * amplitude * env;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 2.2 + Beat.pulse * 2;
      ctx.strokeStyle = rgba(pal.glow, 0.55 + Beat.level * 0.45);
      ctx.shadowColor = rgba(pal.glow, 0.85);
      ctx.shadowBlur = 10 + Beat.pulse * 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (mode === 'waveform') {
      const count = R.quality ? 64 : 32;
      ctx.beginPath();
      for (let i = 0; i <= count; i++) {
        const x = (i / count) * W;
        const value = barValue(Math.min(bars.length - 1, Math.floor(i / count * bars.length)));
        const envelope = Math.sin(Math.PI * i / count);
        const y = centerY - (value * Math.min(H * 0.22, amp * 2.4) + 1.5) * envelope;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(pal.glow, 0.45 + Beat.pulse * 0.35);
      ctx.lineWidth = 2.2 + Beat.pulse * 2;
      ctx.shadowColor = rgba(pal.glow, 0.85);
      ctx.shadowBlur = 10 + Beat.pulse * 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (mode === 'heartbeat') {
      const height = Math.min(H * 0.16, 110) * (0.2 + fxPulse * 0.8);
      const points = [
        [0, 0], [0.38, 0], [0.42, -0.09], [0.45, 0.09],
        [0.5, -1], [0.55, 0.26], [0.58, 0], [1, 0],
      ];
      ctx.beginPath();
      points.forEach(([px, py], i) => {
        const x = px * W;
        const y = centerY + py * height;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(pal.glow, 0.4 + fxPulse * 0.5);
      ctx.lineWidth = 4.5;
      ctx.shadowColor = rgba(pal.glow, 0.8);
      ctx.shadowBlur = 10 + fxPulse * 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = rgba(pal.glow, 0.85 + fxPulse * 0.15);
      ctx.lineWidth = 1.8;
      ctx.stroke();
    } else if (mode === 'scanline') {
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(W, centerY);
      ctx.strokeStyle = rgba(pal.glow, 0.5 + fxPulse * 0.5);
      ctx.lineWidth = 2.2 + fxPulse * 3;
      ctx.shadowColor = rgba(pal.glow, 0.9);
      ctx.shadowBlur = 12 + fxPulse * 16;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (mode === 'bars') {
      // Clean single-direction upward equalizer bars (no mirror reflection)
      const count = 48, gap = Math.min(4, Math.max(1, W * 0.003));
      const width = Math.max(1, (W - gap * (count - 1)) / count);
      const total = count * (width + gap) - gap;
      const originX = W / 2;
      const maxHeight = H * 0.38;
      const colors = ctx.createLinearGradient(originX - total / 2, 0, originX + total / 2, 0);
      colors.addColorStop(0, rgba(pal.a, 0.85));
      colors.addColorStop(0.5, rgba(pal.glow, 0.95));
      colors.addColorStop(1, rgba(pal.b, 0.85));
      ctx.fillStyle = colors;
      ctx.shadowColor = rgba(pal.glow, 0.7);
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const value = barValue(Math.floor(i * bars.length / count));
        const height = Math.max(3, value * maxHeight);
        ctx.roundRect(originX - total / 2 + i * (width + gap), centerY - height, width, height, Math.min(width / 2, 4));
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (mode === 'phonkKanji') {
      // Japanese Phonk Kanji Burst - randomly placed on screen
      for (let i = R.phonkKanjis.length - 1; i >= 0; i--) {
        const k = R.phonkKanjis[i];
        const age = now - k.born;
        if (age >= k.life) { R.phonkKanjis.splice(i, 1); continue; }
        const prog = age / k.life;
        const fade = Math.sin(Math.PI * Math.pow(1 - prog, 0.75));
        const scale = 1 + prog * 0.35;
        ctx.save();
        ctx.translate(k.x, k.y);
        ctx.rotate(k.rot);
        ctx.scale(scale, scale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${k.size}px "Dela Gothic One", "Noto Sans JP", sans-serif`;
        ctx.shadowColor = rgba(k.col, 0.95);
        ctx.shadowBlur = 25 + Beat.pulse * 25;
        ctx.fillStyle = rgba(k.col, 0.85 * fade);
        ctx.fillText(k.char, 0, 0);
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.92 * fade})`;
        ctx.fillText(k.char, 0, 0);
        ctx.restore();
      }
    } else if (mode === 'driftStreaks') {
      // Tokyo Drift Speed Streaks
      for (let i = R.driftStreaks.length - 1; i >= 0; i--) {
        const st = R.driftStreaks[i];
        const age = now - st.born;
        if (age >= st.life) { R.driftStreaks.splice(i, 1); continue; }
        const prog = age / st.life;
        const fade = Math.sin(Math.PI * prog);
        const curX = st.x + st.speed * (age / 1000);
        const grad = ctx.createLinearGradient(curX, st.y, curX + st.len * st.dir, st.y);
        grad.addColorStop(0, rgba(st.col, 0));
        grad.addColorStop(0.7, rgba(st.col, 0.75 * fade));
        grad.addColorStop(1, `rgba(255, 255, 255, ${0.95 * fade})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = st.w;
        ctx.shadowColor = rgba(st.col, 0.8);
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(curX, st.y);
        ctx.lineTo(curX + st.len * st.dir, st.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    } else if (mode === 'pulse') {
      // Randomly placed beat burst (no impact targets)
      const beat = Beat.pulse;
      const px = Beat.pulseX * W, py = Beat.pulseY * H;
      const radius = Math.min(W, H) * (0.05 + beat * 0.14);
      const gr = ctx.createRadialGradient(px, py, 0, px, py, radius * 2.2);
      gr.addColorStop(0, rgba(pal.glow, 0.35 * beat));
      gr.addColorStop(0.35, rgba(pal.a, 0.15 * beat));
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(px, py, radius * 2.2, 0, 6.2832);
      ctx.fill();

      // Sharp core spark
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, beat * 0.95)})`;
      ctx.shadowColor = rgba(pal.glow, 0.9);
      ctx.shadowBlur = 14 + beat * 16;
      ctx.beginPath();
      ctx.arc(px, py, 3 + beat * 6, 0, 6.2832);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (mode === 'bass') {
      // Bass thump: shockwaves that land at random spots all over the screen on each beat
      for (let i = R.bassHits.length - 1; i >= 0; i--) {
        const h = R.bassHits[i];
        const prog = (now - h.born) / h.life;
        if (prog >= 1) { R.bassHits.splice(i, 1); continue; }
        const fade = 1 - prog;
        const grow = easeOut(prog);
        const core = h.size * (0.35 + grow * 0.55);
        const glow = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, core * 1.6);
        glow.addColorStop(0, rgba(h.col, 0.42 * fade * h.power));
        glow.addColorStop(0.5, rgba(h.col, 0.14 * fade * h.power));
        glow.addColorStop(1, rgba(h.col, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(h.x, h.y, core * 1.6, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = rgba(h.col, 0.8 * fade);
        ctx.lineWidth = 1.5 + fade * 5 * h.power;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.size * (0.25 + grow * 1.5), 0, 6.2832); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.55 * fade})`;
        ctx.lineWidth = 1 + fade * 1.5;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.size * (0.1 + grow * 0.9), 0, 6.2832); ctx.stroke();
      }
    } else if (mode === 'ringSpectrum') {
      // The big neon spectrum ring, always at the center of the screen
      const cx = W / 2, cy = H / 2, m = Math.min(W, H);
      const ringScale = clamp(S.ringSize || 1, 0.4, 2.5);
      const r0 = m * (0.15 + Beat.pulse * 0.035 + Beat.bass * 0.03) * ringScale;
      const maxLen = m * 0.17 * ringScale;
      const nb = bars.length;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(cx, cy, r0 * 0.97, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      spectrumRing(ctx, cx, cy, r0, maxLen, R.quality ? 140 : 80, (t) => {
        const u = t < 0.5 ? t * 2 : (1 - t) * 2;
        const idx = Math.min(nb - 1, Math.floor(u * nb * 0.8));
        const spike = 0.7 + 0.3 * Math.abs(Math.sin(t * 95 + now * 0.004));
        return clamp((barValue(idx) * 1.15 + Beat.pulse * 0.3) * spike);
      }, pal.a, pal.glow, 1, now * 0.00012, Math.max(1.4, Math.min(3, W / 520)));
    } else if (mode === 'beatRipples') {
      for (const h of R.fxHits) {
        if (h.type !== 'beatRipples') continue;
        const prog = (now - h.born) / h.life;
        for (let k = 0; k < 3; k++) {
          const q = (prog - k * 0.16) / 0.68;
          if (q <= 0 || q >= 1) continue;
          ctx.strokeStyle = rgba(k % 2 ? pal.a : h.col, (1 - q) * 0.85);
          ctx.lineWidth = 1 + (1 - q) * 4 * h.power;
          ctx.shadowColor = rgba(h.col, 0.8 * (1 - q));
          ctx.shadowBlur = R.quality ? 10 : 0;
          ctx.beginPath(); ctx.arc(h.x, h.y, h.size * (0.2 + easeOut(q) * 1.8), 0, 6.2832); ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
    } else if (mode === 'sparkBurst') {
      for (const h of R.fxHits) {
        if (h.type !== 'sparkBurst') continue;
        const prog = (now - h.born) / h.life, fade = 1 - prog;
        const inner = easeOut(prog) * h.size * 0.9;
        ctx.beginPath();
        for (let i = 0; i < 18; i++) {
          const a = h.rot + i * (6.2832 / 18);
          const len = h.size * (0.35 + (i % 3) * 0.22) * (1 - prog * 0.5);
          ctx.moveTo(h.x + Math.cos(a) * inner, h.y + Math.sin(a) * inner);
          ctx.lineTo(h.x + Math.cos(a) * (inner + len), h.y + Math.sin(a) * (inner + len));
        }
        ctx.strokeStyle = rgba(h.col, 0.9 * fade);
        ctx.lineWidth = 1.2 + fade * 2.2 * h.power;
        ctx.lineCap = 'round';
        ctx.shadowColor = rgba(h.col, 0.9 * fade);
        ctx.shadowBlur = R.quality ? 10 : 0;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    } else if (mode === 'miniRings') {
      for (const h of R.fxHits) {
        if (h.type !== 'miniRings') continue;
        const prog = (now - h.born) / h.life, fade = 1 - prog, age = now - h.born;
        spectrumRing(ctx, h.x, h.y, h.size * (0.5 + easeOut(prog) * 0.45), h.size * 0.55 * (1 - prog * 0.4), R.quality ? 56 : 32,
          (t) => 0.2 + 0.8 * Math.abs(Math.sin(h.seed + t * 38 + age * 0.011)) * (0.5 + 0.5 * Math.abs(Math.sin(t * 7 + h.seed))),
          h.col, pal.glow, fade * h.power, h.rot + age * 0.0005, 1.5);
      }
    } else if (mode === 'diamondPop') {
      for (const h of R.fxHits) {
        if (h.type !== 'diamondPop') continue;
        const prog = (now - h.born) / h.life, fade = 1 - prog;
        const s = h.size * (0.3 + easeOut(prog) * 1.2);
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.strokeStyle = rgba(h.col, 0.9 * fade);
        ctx.lineWidth = 1.5 + fade * 3 * h.power;
        ctx.shadowColor = rgba(h.col, 0.85 * fade);
        ctx.shadowBlur = R.quality ? 10 : 0;
        ctx.rotate(h.rot + prog * 1.3);
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        ctx.rotate(-prog * 2.6);
        ctx.strokeStyle = rgba(pal.a, 0.7 * fade);
        ctx.strokeRect(-s / 4, -s / 4, s / 2, s / 2);
        ctx.restore();
      }
    } else if (mode === 'radial') {
      const count = R.quality ? 64 : 32;
      const radialScale = clamp(S.radialSize || 1, 0.4, 2.5);
      const radius = Math.min(W, H) * (0.12 + Beat.pulse * 0.07) * radialScale;
      ctx.lineCap = 'round';
      for (let i = 0; i < count; i++) {
        const value = barValue(Math.floor(i * bars.length / count));
        const angle = i / count * 6.2832;
        const inner = radius;
        const outer = inner + 4 + value * Math.min(W, H) * 0.09 * radialScale;
        ctx.strokeStyle = rgba(i % 2 ? pal.a : pal.glow, 0.18 + value * 0.62);
        ctx.lineWidth = Math.max(1, Math.min(4, W / 320));
        ctx.beginPath();
        ctx.moveTo(W / 2 + Math.cos(angle) * inner, H / 2 + Math.sin(angle) * inner);
        ctx.lineTo(W / 2 + Math.cos(angle) * outer, H / 2 + Math.sin(angle) * outer);
        ctx.stroke();
      }
    } else if (mode === 'vignette') {
      const gradient = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.72);
      gradient.addColorStop(0, rgba(pal.glow, 0));
      gradient.addColorStop(1, `rgba(0,0,0,${0.45 * fxPulse})`);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
    } else if (mode === 'blacklight' || mode === 'colorWash') {
      const color = mode === 'blacklight' ? 'rgba(190,0,255,' : 'rgba(255,45,145,';
      const strength = mode === 'blacklight'
        ? clamp(0.08 + Beat.high * 0.2 + Beat.pulse * 0.16, 0, 0.38)
        : clamp(fxPulse * 0.24, 0, 0.24);
      const gradient = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.65);
      gradient.addColorStop(0, `${color}${strength})`);
      gradient.addColorStop(0.5, `${color}${strength * 0.35})`);
      gradient.addColorStop(1, `${color}0)`);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  });
}

/* ---------------------------------------------------------------- *
 * Small drawing helpers
 * ---------------------------------------------------------------- */
function sparkle(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

function glowDot(ctx, pal, x, y, r, a) {
  ctx.globalAlpha = clamp(a);
  ctx.drawImage(Pal.sprite(pal.glow), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function wordColor(pal, i, n) {
  return mix(pal.a, pal.b, n > 1 ? (i / (n - 1)) * 0.85 : 0);
}

function drawText(ctx, str, x, y, size, weight, col, alpha, glow, pal) {
  font(ctx, size, weight);
  ctx.fillStyle = rgba(col, alpha);
  if (glow > 0.5) { ctx.shadowColor = rgba(pal.glow, 0.7 * alpha); ctx.shadowBlur = glow; }
  ctx.fillText(str, x, y);
  if (glow > 0.5) ctx.shadowBlur = 0;
}

/* ---------------------------------------------------------------- *
 * Style 1: Constellation
 * ---------------------------------------------------------------- */
function constellation(ctx, W, H, now, dt, t, lines, idx, S, pal) {
  const m = Math.min(W, H);
  const BIG = clamp(m * 0.075 * S.size, 26, 66);
  const SMALL = clamp(m * 0.021 * Math.sqrt(S.size), 11, 17);
  const bw = Math.min(W * 0.84, 1250), bh = Math.min(H * 0.52, 480);
  const par = S.motion, bp = Beat.pulse;
  const ox = W / 2 - bw / 2 - (R.pointer.sx - 0.5) * 28 * par;
  const oy = H / 2 - bh / 2 - (R.pointer.sy - 0.5) * 20 * par;
  const px = R.pointer.sx * W, py = R.pointer.sy * H, inside = R.pointer.inside && R.quality;
  const gl = S.glow;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  for (let li = Math.max(0, idx - 3); li <= idx; li++) {
    const L = lines[li];
    if (!L.words.length) continue;
    const alpha = t > L.end ? 1 - clamp((t - L.end) / 0.9) : 1;
    if (alpha < 0.01) continue;
    const words = L.words, n = words.length;

    // positions with gentle drift + pointer repulsion
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) {
      let x = ox + L.pts[i][0] * bw, y = oy + L.pts[i][1] * bh;
      const ph = i * 1.7 + L.t;
      x += Math.sin(now * 0.0007 + ph) * 4 * par;
      y += Math.cos(now * 0.0009 + ph * 1.3) * 4 * par;
      if (inside && par > 0) {
        const dx = x - px, dy = y - py, d = Math.hypot(dx, dy), rr = 160;
        if (d < rr && d > 0.1) { const f = 1 - d / rr; const push = f * f * 42 * par; x += (dx / d) * push; y += (dy / d) * push; }
      }
      xs.push(x); ys.push(y);
    }

    ctx.lineWidth = 1 + bp * 0.9;
    for (const [a, b] of L.links) {
      const wb = words[b];
      if (wb.t > t) continue;
      const prog = easeOut(clamp((t - wb.t) / 0.45));
      ctx.strokeStyle = rgba(pal.a, (0.34 + 0.25 * bp) * alpha);
      ctx.beginPath();
      ctx.moveTo(xs[a], ys[a]);
      ctx.lineTo(lerp(xs[a], xs[b], prog), lerp(ys[a], ys[b], prog));
      ctx.stroke();
    }

    for (let i = 0; i < n; i++) {
      const w = words[i];
      if (w.t > t) break;
      const age = t - w.t;
      const pop = easeOut(clamp(age / 0.35));
      const k = i + 1 < n ? easeInOut(clamp((t - words[i + 1].t) / 0.55)) : 0;
      const x = xs[i], y = ys[i];
      const live = 1 - k;

      const sSize = lerp(lerp(2, 11, pop) * (1 + 0.5 * bp * live), 3.4, k);
      glowDot(ctx, pal, x, y, sSize * (4 + 2 * bp) * gl, alpha * lerp(0.9, 0.35, k));
      ctx.fillStyle = rgba([255, 244, 220], alpha * lerp(1, 0.75, k));
      sparkle(ctx, x, y, sSize);

      const fs = lerp(lerp(BIG * 0.55, BIG, pop) * (1 + 0.05 * bp), SMALL, k);
      font(ctx, fs, k > 0.5 ? 600 : 800);
      const tw = ctx.measureText(w.text).width;
      const flip = x + 16 + tw > W - 28;
      const bigX = flip ? x - 16 - tw : x + 16;
      const tx = lerp(bigX, x - tw / 2, k);
      const ty = y + lerp(0, -(SMALL + 8), k);
      drawText(ctx, w.text, clamp(tx, 14, W - 14 - tw), ty, fs, k > 0.5 ? 600 : 800,
        wordColor(pal, i, n), alpha * lerp(pop, 0.72, k), lerp(18 * gl, 0, k), pal);
    }
  }
}

/* ---------------------------------------------------------------- *
 * Style 2: Karaoke
 * ---------------------------------------------------------------- */
function wrapLine(ctx, L, fsz, maxW) {
  const key = `${L.t}|${L.text}|${fsz | 0}|${maxW | 0}`;
  let c = R._wrapCache.get(key);
  if (c) return c;
  font(ctx, fsz, 800);
  const space = fsz * 0.3;
  const rows = [];
  let row = { items: [], w: 0 };
  L.words.forEach((w, i) => {
    const ww = ctx.measureText(w.text).width;
    if (row.items.length && row.w + space + ww > maxW) { rows.push(row); row = { items: [], w: 0 }; }
    row.items.push({ i, x: row.w + (row.items.length ? space : 0), w: ww });
    row.w += (row.items.length > 1 ? space : 0) + ww;
  });
  rows.push(row);
  c = { rows, lineH: fsz * 1.3, h: rows.length * fsz * 1.3 };
  if (R._wrapCache.size > 120) R._wrapCache.clear();
  R._wrapCache.set(key, c);
  return c;
}

function karaokeBlock(ctx, L, t, cx, cy, fsz, alpha, mode, pal, S) {
  const maxW = ctx.canvas.clientWidth * 0.82;
  const layout = wrapLine(ctx, L, fsz, maxW);
  const bp = Beat.pulse;
  let y = cy - layout.h / 2 + layout.lineH / 2;
  const n = L.words.length;
  for (const row of layout.rows) {
    const x0 = cx - row.w / 2;
    for (const it of row.items) {
      const w = L.words[it.i];
      const col = wordColor(pal, it.i, n);
      const x = x0 + it.x;
      font(ctx, fsz, 800);
      if (mode === 'pending') { ctx.fillStyle = rgba(pal.a, 0.32 * alpha); ctx.fillText(w.text, x, y); continue; }
      if (mode === 'done') { ctx.fillStyle = rgba(col, 0.55 * alpha); ctx.fillText(w.text, x, y); continue; }
      // live line
      const nextT = it.i + 1 < n ? L.words[it.i + 1].t : L.end;
      if (w.t > t) { ctx.fillStyle = rgba(pal.a, 0.3 * alpha); ctx.fillText(w.text, x, y); continue; }
      if (t >= nextT && it.i + 1 < n) { ctx.fillStyle = rgba(col, 0.95 * alpha); ctx.fillText(w.text, x, y); continue; }
      // the word being sung: dim base + bright fill sweeping across, punching on the beat
      const prog = clamp((t - w.t) / Math.max(0.12, nextT - w.t));
      const sc = 1 + 0.07 * bp * S.motion + 0.04 * (1 - easeOut(clamp((t - w.t) / 0.25)));
      ctx.save();
      ctx.translate(x + it.w / 2, y);
      ctx.scale(sc, sc);
      ctx.fillStyle = rgba(pal.a, 0.3 * alpha);
      ctx.fillText(w.text, -it.w / 2, 0);
      ctx.beginPath();
      ctx.rect(-it.w / 2 - 4, -fsz, (it.w + 8) * prog, fsz * 2);
      ctx.clip();
      ctx.shadowColor = rgba(pal.glow, 0.8 * alpha);
      ctx.shadowBlur = (16 + 20 * bp) * S.glow;
      ctx.fillStyle = rgba(col, alpha);
      ctx.fillText(w.text, -it.w / 2, 0);
      ctx.restore();
    }
    y += layout.lineH;
  }
  return layout.h;
}

function karaoke(ctx, W, H, now, dt, t, lines, idx, S, pal) {
  const m = Math.min(W, H);
  const fsz = clamp(m * 0.066 * S.size, 22, 76);
  const sfs = fsz * 0.55;
  const L = lines[idx];
  if (!L || !L.words.length) return;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const e = easeOut(clamp((t - L.t) / 0.5));
  const slide = (1 - e) * fsz * 0.7;
  const cy = H * 0.5 + slide;
  const curH = wrapLine(ctx, L, fsz, W * 0.82).h;

  let pi = idx - 1; while (pi >= 0 && !lines[pi].words.length) pi--;
  let ni = idx + 1; while (ni < lines.length && !lines[ni].words.length) ni++;
  if (pi >= 0 && L.t - lines[pi].end < 6) {
    const P = lines[pi];
    const ph = wrapLine(ctx, P, sfs, W * 0.82).h;
    karaokeBlock(ctx, P, t, W / 2, cy - curH / 2 - ph / 2 - fsz * 0.45, sfs, lerp(1, 0.55, e) * 0.9, 'done', pal, S);
  }
  if (ni < lines.length) {
    const N = lines[ni];
    const nh = wrapLine(ctx, N, sfs, W * 0.82).h;
    karaokeBlock(ctx, N, t, W / 2, cy + curH / 2 + nh / 2 + fsz * 0.45, sfs, 0.9, 'pending', pal, S);
  }
  karaokeBlock(ctx, L, t, W / 2, cy, fsz, 0.35 + 0.65 * e, 'live', pal, S);
}

/* ---------------------------------------------------------------- *
 * Style 3: Kinetic (one giant word at a time)
 * ---------------------------------------------------------------- */
function kinetic(ctx, W, H, now, dt, t, lines, idx, S, pal) {
  const L = lines[idx];
  if (!L || !L.words.length) return;
  const m = Math.min(W, H), bp = Beat.pulse, n = L.words.length;
  let wi = -1;
  for (let i = 0; i < n; i++) if (L.words[i].t <= t) wi = i; else break;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  if (wi >= 0) {
    const w = L.words[wi];
    const age = t - w.t;
    const e = easeOut(clamp(age / 0.28));
    let fs = clamp(m * 0.22 * S.size, 56, 240);
    font(ctx, fs, 800);
    const tw = ctx.measureText(w.text).width;
    if (tw > W * 0.86) fs *= (W * 0.86) / tw;
    const sc = lerp(1.5, 1, e) * (1 + 0.07 * bp * S.motion);
    const col = mix(pal.a, pal.b, (wi % 2 ? 0.9 : 0.15));
    // burst ring on every new word
    const rp = clamp(age / 0.7);
    if (rp < 1) {
      ctx.strokeStyle = rgba(pal.glow, (1 - rp) * 0.5);
      ctx.lineWidth = 2 + (1 - rp) * 3;
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.46, easeOut(rp) * m * 0.45 + fs * 0.4, 0, 6.2832);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(W / 2, H * 0.46);
    ctx.scale(sc, sc);
    ctx.rotate((1 - e) * (wi % 2 ? 0.05 : -0.05));
    font(ctx, fs, 800);
    ctx.shadowColor = rgba(pal.glow, 0.8);
    ctx.shadowBlur = (28 + 30 * bp) * S.glow;
    ctx.fillStyle = rgba(col, clamp(age / 0.07));
    ctx.fillText(w.text, 0, 0);
    ctx.restore();
  }

  // caption: the whole line along the bottom, sung words bright
  let cf = clamp(m * 0.03 * Math.sqrt(S.size), 14, 30);
  font(ctx, cf, 600);
  const space = cf * 0.35;
  let total = 0;
  const ws = L.words.map((w) => { const x = ctx.measureText(w.text).width; total += x + space; return x; });
  total -= space;
  const k = Math.min(1, (W * 0.9) / total);
  cf *= k;
  font(ctx, cf, 600);
  let x = W / 2 - (total * k) / 2;
  ctx.textAlign = 'left';
  const y = H * 0.46 + clamp(m * 0.22 * S.size, 56, 240) * 0.82 + 28;
  L.words.forEach((w, i) => {
    const wd = ws[i] * k;
    ctx.fillStyle = rgba(i <= wi ? pal.a : pal.a, i === wi ? 1 : i < wi ? 0.7 : 0.25);
    ctx.fillText(w.text, x, Math.min(y, H - 44));
    x += wd + space * k;
  });
}

/* ---------------------------------------------------------------- *
 * Style 4: Orbit
 * ---------------------------------------------------------------- */
function orbit(ctx, W, H, now, dt, t, lines, idx, S, pal) {
  const L = lines[idx];
  if (!L || !L.words.length) return;
  const m = Math.min(W, H), bp = Beat.pulse, bass = Beat.bass, n = L.words.length;
  const cx = W / 2 - (R.pointer.sx - 0.5) * 18 * S.motion, cy = H / 2 - (R.pointer.sy - 0.5) * 14 * S.motion;
  const rx = Math.min(W * 0.36, 520), ry = Math.min(H * 0.31, 300);
  R._orbitRot += dt * (0.00005 + bp * 0.0002) * (0.4 + S.motion);
  const rot = R._orbitRot;
  const SMALL = clamp(m * 0.022 * Math.sqrt(S.size), 11, 18);
  const BIG = clamp(m * 0.1 * S.size, 32, 110);

  // faint orbit rails
  ctx.lineWidth = 1;
  for (let k = 0; k < 2; k++) {
    ctx.strokeStyle = rgba(pal.a, (0.09 + 0.14 * bass) * (k ? 0.6 : 1));
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * (1 + k * 0.13 + 0.03 * bp), ry * (1 + k * 0.13 + 0.03 * bp), rot * 0.3, 0, 6.2832);
    ctx.stroke();
  }

  const pts = [];
  let wi = -1;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * 6.2832 + rot;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, a]);
    if (L.words[i].t <= t) wi = i;
  }
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1 + bp;
  for (let i = 1; i <= wi; i++) {
    ctx.strokeStyle = rgba(pal.a, 0.28 + 0.2 * bp);
    ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
  }
  if (wi >= 0) { ctx.strokeStyle = rgba(pal.glow, 0.25 + 0.2 * bp); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(pts[wi][0], pts[wi][1]); ctx.stroke(); }

  for (let i = 0; i <= wi; i++) {
    const w = L.words[i], [x, y, a] = pts[i];
    const cur = i === wi;
    const pop = easeOut(clamp((t - w.t) / 0.4));
    const s = (cur ? lerp(3, 10, pop) * (1 + 0.5 * bp) : 3.4);
    glowDot(ctx, pal, x, y, s * 4.5 * S.glow, cur ? 0.95 : 0.4);
    ctx.fillStyle = rgba([255, 244, 220], cur ? 1 : 0.75);
    sparkle(ctx, x, y, s);
    const right = Math.cos(a) >= 0;
    font(ctx, cur ? SMALL * 1.25 : SMALL, cur ? 800 : 600);
    const tw = ctx.measureText(w.text).width;
    ctx.textAlign = 'left';
    const tx = right ? x + s + 10 : x - s - 10 - tw;
    drawText(ctx, w.text, clamp(tx, 12, W - 12 - tw), y, cur ? SMALL * 1.25 : SMALL, cur ? 800 : 600, wordColor(pal, i, n), cur ? 1 : 0.7, 0, pal);
  }

  // current word big in the middle
  if (wi >= 0) {
    const w = L.words[wi];
    const age = t - w.t;
    const e = easeOut(clamp(age / 0.3));
    let fs = BIG;
    font(ctx, fs, 800);
    const tw = ctx.measureText(w.text).width;
    if (tw > rx * 1.5) fs *= (rx * 1.5) / tw;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(lerp(1.3, 1, e) * (1 + 0.06 * bp * S.motion), lerp(1.3, 1, e) * (1 + 0.06 * bp * S.motion));
    ctx.textAlign = 'center';
    font(ctx, fs, 800);
    ctx.shadowColor = rgba(pal.glow, 0.8);
    ctx.shadowBlur = (24 + 24 * bp) * S.glow;
    ctx.fillStyle = rgba(wordColor(pal, wi, n), clamp(age / 0.08));
    ctx.fillText(w.text, 0, 0);
    ctx.restore();
  }
  ctx.textAlign = 'left';
}

/* ---------------------------------------------------------------- *
 * Style 5: Wave
 * ---------------------------------------------------------------- */
function wave(ctx, W, H, now, dt, t, lines, idx, S, pal) {
  const L = lines[idx];
  if (!L || !L.words.length) return;
  const m = Math.min(W, H), bp = Beat.pulse, bass = Beat.bass, n = L.words.length;
  R._wavePhase += dt * (0.0011 + bass * 0.0018) * (0.4 + S.motion);
  const ph = R._wavePhase;
  const amp = H * 0.065 * (1 + 0.9 * bass + 0.5 * bp);
  const cy = H * 0.52;
  const yAt = (x, k) => cy + (Math.sin(x * 0.0055 + ph + k) * amp + Math.sin(x * 0.012 - ph * 1.6 + k) * amp * 0.38) * (k ? 0.6 : 1);
  const BIG = clamp(m * 0.075 * S.size, 28, 70);
  const SMALL = clamp(m * 0.023 * Math.sqrt(S.size), 12, 19);

  const step = R.quality ? 8 : 16;
  for (let k = 1; k >= 0; k--) {
    ctx.beginPath();
    for (let x = -10; x <= W + 10; x += step) {
      const y = yAt(x, k * 1.3);
      if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = k ? 1.2 : 2 + bp * 2.5;
    ctx.strokeStyle = rgba(k ? pal.b : pal.glow, k ? 0.3 : 0.75);
    if (!k && R.quality) { ctx.shadowColor = rgba(pal.glow, 0.8); ctx.shadowBlur = (10 + 12 * bp) * S.glow; }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  const left = W * 0.09, right = W * 0.91;
  let wi = -1;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) if (L.words[i].t <= t) wi = i;
  for (let i = 0; i <= wi; i++) {
    const w = L.words[i];
    const x = n === 1 ? W / 2 : left + (i + 0.5) / n * (right - left);
    const y = yAt(x, 0);
    const cur = i === wi;
    const age = t - w.t;
    const pop = easeOut(clamp(age / 0.35));
    const r = cur ? lerp(3, 9, pop) * (1 + 0.5 * bp) : 3.2;
    glowDot(ctx, pal, x, y, r * 4.5 * S.glow, cur ? 0.95 : 0.45);
    ctx.fillStyle = rgba([255, 244, 220], cur ? 1 : 0.8);
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 6.2832); ctx.fill();
    const fs = cur ? lerp(BIG * 0.6, BIG, pop) * (1 + 0.05 * bp) : SMALL;
    font(ctx, fs, cur ? 800 : 600);
    const tw = ctx.measureText(w.text).width;
    ctx.textAlign = 'left';
    const above = cur || i % 2 === 0;
    const ty = y + (above ? -(cur ? fs * 0.9 + 14 : 24) : 26);
    drawText(ctx, w.text, clamp(x - tw / 2, 12, W - 12 - tw), ty, fs, cur ? 800 : 600, wordColor(pal, i, n), cur ? 1 : 0.65, cur ? 20 * S.glow : 0, pal);
  }
}

/* ---------------------------------------------------------------- *
 * Interlude, messages, particles, pointer light
 * ---------------------------------------------------------------- */
function interlude(ctx, W, H, now, pal, alpha) {
  const bp = Beat.pulse;
  const r = 7 + 5 * bp + Math.sin(now / 500) * 1.5;
  glowDot(ctx, pal, W / 2, H / 2, r * 5, alpha * 0.9);
  ctx.fillStyle = rgba([255, 244, 220], alpha);
  sparkle(ctx, W / 2, H / 2, r);
  for (let i = -1; i <= 1; i += 2) {
    ctx.fillStyle = rgba(pal.a, alpha * 0.5);
    ctx.beginPath(); ctx.arc(W / 2 + i * 34, H / 2, 2.4 + bp * 1.5, 0, 6.2832); ctx.fill();
  }
}

function message(ctx, W, H, msg, pal) {
  if (!msg) return;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  font(ctx, 16, 500);
  ctx.fillStyle = rgba(pal.a, 0.55);
  ctx.fillText(msg, W / 2, H / 2);
  ctx.textAlign = 'left';
}

R.burst = function (x, y, W, H) {
  const pal = Pal.cur;
  const n = R.quality ? 22 : 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.2832 + Math.random() * 0.4, sp = 1.5 + Math.random() * 4;
    R.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, size: 4 + Math.random() * 9, c: Math.random() < 0.5 ? pal.glow : pal.b });
  }
  R.burstRings.push({ x, y, life: 1 });
  if (R.particles.length > 220) R.particles.splice(0, R.particles.length - 220);
};

function drawParticles(ctx, dt, pal) {
  ctx.globalCompositeOperation = 'lighter';
  const k = dt / 16.7;
  for (let i = R.particles.length - 1; i >= 0; i--) {
    const p = R.particles[i];
    p.x += p.vx * k; p.y += p.vy * k;
    p.vx *= Math.pow(0.965, k); p.vy *= Math.pow(0.965, k);
    p.life -= dt / 1100;
    if (p.life <= 0) { R.particles.splice(i, 1); continue; }
    glowDot(ctx, pal, p.x, p.y, p.size * p.life * 2.2, p.life);
  }
  for (let i = R.burstRings.length - 1; i >= 0; i--) {
    const b = R.burstRings[i];
    b.life -= dt / 800;
    if (b.life <= 0) { R.burstRings.splice(i, 1); continue; }
    ctx.strokeStyle = rgba(pal.glow, b.life * 0.5);
    ctx.lineWidth = 1 + b.life * 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, (1 - b.life) * 120 + 8, 0, 6.2832); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawButterfly(ctx, x, y, now, pal, scale, angle) {
  const flap = REDUCED_MOTION ? 0.12 : Math.sin(now * 0.018 + x * 0.01) * 0.42;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(pal.a, 0.78);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-8, -15 - flap * 8, -23, -15 - flap * 11, -18, -2);
  ctx.bezierCurveTo(-15, 5, -6, 5, 0, 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(pal.b, 0.72);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(8, -15 - flap * 8, 23, -15 - flap * 11, 18, -2);
  ctx.bezierCurveTo(15, 5, 6, 5, 0, 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(pal.glow, 0.95);
  ctx.fillRect(-1, -3, 2, 8);
  ctx.restore();
}

function cursorEffectFor(S) {
  const design = S.design !== 'custom' && R.cursorDesign && R.cursorDesign.id === S.design ? R.cursorDesign : null;
  if (design) return design;
  const moods = { aurora: 'aurora', dreamy: 'sakura', midnight: 'frost', electric: 'sparks', sunset: 'smoke', minimal: 'dust', phonk: 'sparks', japanesePhonk: 'sakura' };
  const palettes = { aurora: 'aurora', rose: 'sakura', ice: 'frost', neon: 'sparks', ember: 'smoke' };
  return moods[S.mood] || palettes[S.pal] || 'dust';
}

function addCursorParticles(effect, x, y, design) {
  if (design) {
    const count = R.quality ? ([2, 2, 3, 2, 2][design.cursorFamily] || 2) : 1;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * 6.2832;
      const speed = 10 + Math.random() * (design.cursorFamily === 2 ? 40 : 14);
      R.cursorParticles.push({
        effect: 'design', family: design.cursorFamily, variant: design.cursorVariant,
        x, y, originX: x, originY: y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        born: performance.now(), life: 850 + Math.random() * 450,
        size: 2 + Math.random() * 2.5, angle, phase: Math.random() * 6.2832,
      });
    }
    if (R.cursorParticles.length > 80) R.cursorParticles.splice(0, R.cursorParticles.length - 80);
    return;
  }
  const counts = { sakura: 2, aurora: 2, frost: 1, sparks: 3, smoke: 2, dust: 2 };
  const count = R.quality ? counts[effect] || 1 : 1;
  for (let i = 0; i < count; i++) {
    const particleEffect = effect === 'smoke' && i ? 'embers' : effect;
    const spread = effect === 'sparks' ? 42 : 15;
    R.cursorParticles.push({
      effect: particleEffect, x: x + (Math.random() - 0.5) * 5, y: y + (Math.random() - 0.5) * 5,
      vx: (Math.random() - 0.5) * spread,
      vy: effect === 'sakura' || effect === 'frost' ? 7 + Math.random() * 12
        : effect === 'embers' || effect === 'smoke' ? -8 - Math.random() * 18 : (Math.random() - 0.5) * spread,
      born: performance.now(),
      life: effect === 'aurora' ? 1500 : effect === 'sakura' || effect === 'frost' ? 1100 : particleEffect === 'smoke' ? 1200 : 650 + Math.random() * 250,
      size: particleEffect === 'smoke' ? 5 + Math.random() * 5 : effect === 'sparks' ? 1 + Math.random() * 1.4 : 2 + Math.random() * 2,
      angle: Math.random() * 6.2832,
      spin: (Math.random() - 0.5) * 3,
    });
  }
  if (R.cursorParticles.length > 80) R.cursorParticles.splice(0, R.cursorParticles.length - 80);
}

function drawDesignMark(ctx, particle, pal, fade, progress) {
  const size = particle.size * (1 - progress * 0.3);
  ctx.strokeStyle = rgba(pal.glow, 0.75 * fade);
  ctx.fillStyle = rgba(pal.a, 0.65 * fade);
  ctx.lineWidth = 0.9;
  switch (particle.variant) {
    case 0:
      ctx.beginPath(); ctx.moveTo(0, -size * 1.8); ctx.lineTo(size * 0.45, -size * 0.45); ctx.lineTo(size * 1.8, 0); ctx.lineTo(size * 0.45, size * 0.45); ctx.lineTo(0, size * 1.8); ctx.lineTo(-size * 0.45, size * 0.45); ctx.lineTo(-size * 1.8, 0); ctx.lineTo(-size * 0.45, -size * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 1:
    case 7: {
      const petals = particle.variant === 1 ? 5 : 6;
      for (let i = 0; i < petals; i++) {
        ctx.rotate(6.2832 / petals);
        ctx.beginPath(); ctx.ellipse(0, -size * 0.85, size * 0.38, size * 0.78, 0, 0, 6.2832); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, size * 0.2, 0, 6.2832); ctx.fillStyle = rgba(pal.glow, fade); ctx.fill();
      break;
    }
    case 2:
      ctx.beginPath(); ctx.moveTo(-size * 2.5, size); ctx.quadraticCurveTo(-size * 0.4, -size * 0.4, size * 0.5, -size * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.arc(size * 0.75, -size * 0.45, size * 0.55, 0, 6.2832); ctx.fill();
      break;
    case 3:
      ctx.rotate(Math.PI / 4); ctx.strokeRect(-size * 0.7, -size * 0.7, size * 1.4, size * 1.4);
      break;
    case 4:
      ctx.beginPath(); ctx.moveTo(0, size); ctx.bezierCurveTo(-size * 2, -size * 0.2, -size * 0.3, -size * 2, size, -size); ctx.bezierCurveTo(size * 0.8, size * 0.2, size * 0.4, size * 0.6, 0, size); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, size * 0.7); ctx.lineTo(size * 0.6, -size * 0.65); ctx.stroke();
      break;
    case 5:
      ctx.beginPath(); ctx.ellipse(0, 0, size * 1.6, size * 0.7, particle.angle, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.arc(size, 0, size * 0.38, 0, 6.2832); ctx.fill();
      break;
    case 6:
      ctx.beginPath(); ctx.arc(-size * 0.45, size * 0.65, size * 0.45, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-size * 0.05, size * 0.55); ctx.lineTo(-size * 0.05, -size * 1.6); ctx.lineTo(size * 1.1, -size * 1.3); ctx.lineTo(size * 1.1, size * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.arc(size * 0.7, size * 0.12, size * 0.4, 0, 6.2832); ctx.fill();
      break;
    case 8: {
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.2);
      glow.addColorStop(0, rgba(pal.glow, 0.8 * fade)); glow.addColorStop(1, rgba(pal.glow, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, size * 2.2, 0, 6.2832); ctx.fill();
      ctx.fillStyle = rgba(pal.a, fade); ctx.beginPath(); ctx.arc(0, 0, size * 0.35, 0, 6.2832); ctx.fill();
      break;
    }
    case 9:
      ctx.beginPath(); ctx.arc(0, 0, size * 0.55, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, size * 1.35, 0, 6.2832); ctx.stroke();
      break;
    case 10:
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath(); ctx.moveTo(-size * 1.4, 0); ctx.lineTo(size * 1.4, 0); ctx.moveTo(size, 0); ctx.lineTo(size * 0.65, -size * 0.4); ctx.moveTo(size, 0); ctx.lineTo(size * 0.65, size * 0.4); ctx.stroke();
      }
      break;
    default:
      ctx.beginPath(); ctx.moveTo(0, size * 1.2); ctx.bezierCurveTo(-size * 2.2, 0, -size * 0.9, -size * 1.8, 0, -size * 0.65); ctx.bezierCurveTo(size * 0.9, -size * 1.8, size * 2.2, 0, 0, size * 1.2); ctx.fill(); ctx.stroke();
  }
}

function drawThemedCursor(ctx, W, H, now, dt, pal, effect, motion) {
  const particles = R.cursorParticles;
  const step = dt / 1000;
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    const age = now - particle.born;
    if (age >= particle.life) { particles.splice(i, 1); continue; }
    const progress = age / particle.life;
    const fade = Math.sin(Math.PI * progress);
    const drift = REDUCED_MOTION ? 0.28 : motion;
    if (particle.effect === 'design') {
      const seconds = age / 1000 * drift;
      particle.x = particle.originX + particle.vx * seconds;
      particle.y = particle.originY + particle.vy * seconds;
      if (particle.family === 0) particle.y += Math.sin(age * 0.004 + particle.phase) * 2.5;
      else if (particle.family === 1) { particle.x += Math.sin(age * 0.005 + particle.phase) * 3; particle.y += Math.cos(age * 0.005 + particle.phase) * 2; }
      else if (particle.family === 3) { particle.x += Math.sin(age * 0.004 + particle.phase) * particle.size * 1.5; particle.y += Math.cos(age * 0.004 + particle.phase) * particle.size * 1.5; }
      else if (particle.family === 4) particle.y += Math.sin(age * 0.007 + particle.phase) * 5;
    } else {
      particle.x += particle.vx * step * drift;
      particle.y += particle.vy * step * drift;
    }
    particle.angle += particle.spin * step * drift;
    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.angle);
    if (particle.effect === 'design') {
      drawDesignMark(ctx, particle, pal, fade, progress);
    } else if (particle.effect === 'sakura') {
      ctx.fillStyle = rgba(pal.a, 0.72 * fade);
      ctx.beginPath();
      ctx.ellipse(0, 0, particle.size * 1.65, particle.size, 0, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = rgba(pal.glow, 0.5 * fade);
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(-particle.size, 0); ctx.lineTo(particle.size, 0); ctx.stroke();
    } else if (particle.effect === 'aurora') {
      ctx.strokeStyle = rgba(pal.a, 0.3 * fade);
      ctx.lineWidth = particle.size * (1 - progress * 0.45);
      ctx.beginPath(); ctx.moveTo(-particle.size * 3, 0); ctx.quadraticCurveTo(0, Math.sin(age * 0.008) * 5, particle.size * 3, 0); ctx.stroke();
    } else if (particle.effect === 'frost') {
      ctx.strokeStyle = rgba(pal.glow, 0.75 * fade);
      ctx.lineWidth = 0.8;
      for (let spoke = 0; spoke < 6; spoke++) {
        ctx.rotate(1.0472);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(particle.size * 2.2, 0); ctx.stroke();
      }
    } else if (particle.effect === 'sparks' || particle.effect === 'embers') {
      ctx.fillStyle = rgba(particle.effect === 'embers' ? pal.b : pal.glow, 0.85 * fade);
      ctx.beginPath(); ctx.arc(0, 0, particle.size * (1 - progress * 0.55), 0, 6.2832); ctx.fill();
      if (particle.effect === 'sparks') {
        ctx.strokeStyle = rgba(pal.a, 0.6 * fade);
        ctx.beginPath(); ctx.moveTo(-particle.size * 2, 0); ctx.lineTo(particle.size * 2, 0); ctx.stroke();
      }
    } else if (particle.effect === 'smoke') {
      const radius = particle.size * (1 + progress * 1.5);
      const cloud = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      cloud.addColorStop(0, rgba(pal.b, 0.17 * fade));
      cloud.addColorStop(1, rgba(pal.b, 0));
      ctx.fillStyle = cloud;
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, 6.2832); ctx.fill();
    } else {
      ctx.fillStyle = rgba(pal.glow, 0.55 * fade);
      ctx.beginPath(); ctx.arc(0, 0, particle.size * (1 - progress * 0.5), 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
  const p = R.pointer;
  if (p.inside) {
    ctx.fillStyle = rgba(pal.glow, 0.8);
    ctx.beginPath(); ctx.arc(p.sx * W, p.sy * H, 1.5, 0, 6.2832); ctx.fill();
  }
}

function drawCursorPreset(ctx, effect, trail, x, y, now, pal) {
  const pointCount = Math.ceil(trail.length / 2);
  for (let pointIndex = 0; pointIndex < trail.length; pointIndex += 2) {
    const point = trail[pointIndex];
    const index = Math.floor(pointIndex / 2);
    const fade = (index + 1) / pointCount;
    const size = 2 + fade * 7;
    const phase = now * 0.001 + index * 1.7;
    const color = index % 2 ? pal.a : pal.glow;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(phase * 0.35);
    ctx.lineWidth = Math.max(0.8, size * 0.16);
    ctx.strokeStyle = rgba(color, fade * 0.75);
    ctx.fillStyle = rgba(color, fade * 0.6);
    if (effect === 'fire' || effect === 'embers') {
      ctx.beginPath(); ctx.moveTo(0, size); ctx.bezierCurveTo(-size, size * 0.1, -size * 0.25, -size, 0, -size * 0.45); ctx.bezierCurveTo(size * 0.25, -size, size, size * 0.1, 0, size); ctx.fill();
      ctx.fillStyle = rgba(pal.b, fade * 0.7);
      ctx.beginPath(); ctx.ellipse(0, size * 0.25, size * 0.22, size * 0.48, 0, 0, 6.2832); ctx.fill();
    } else if (effect === 'rose' || effect === 'petals' || effect === 'sakura') {
      const petals = effect === 'rose' ? 6 : 1;
      for (let i = 0; i < petals; i++) {
        ctx.save(); ctx.rotate(i * 6.2832 / petals + phase);
        ctx.beginPath(); ctx.ellipse(0, -size * 0.62, size * 0.35, size * 0.7, 0, 0, 6.2832); ctx.fill(); ctx.restore();
      }
      if (effect === 'rose') { ctx.fillStyle = rgba(pal.b, fade); ctx.beginPath(); ctx.arc(0, 0, size * 0.22, 0, 6.2832); ctx.fill(); }
    } else if (effect === 'lightning') {
      ctx.beginPath(); ctx.moveTo(size * 0.15, -size); ctx.lineTo(-size * 0.45, 0); ctx.lineTo(size * 0.1, 0); ctx.lineTo(-size * 0.2, size); ctx.stroke();
    } else if (effect === 'bubbles') {
      ctx.beginPath(); ctx.arc(0, 0, size * 0.55, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = rgba([255, 255, 255], fade * 0.7); ctx.beginPath(); ctx.arc(-size * 0.18, -size * 0.2, size * 0.11, 0, 6.2832); ctx.fill();
    } else if (effect === 'leaves') {
      ctx.beginPath(); ctx.moveTo(0, size); ctx.bezierCurveTo(-size * 1.1, size * 0.15, -size * 0.7, -size, 0, -size * 0.8); ctx.bezierCurveTo(size * 1.1, -size * 0.15, size * 0.7, size, 0, size); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, size * 0.7); ctx.lineTo(0, -size * 0.65); ctx.stroke();
    } else if (effect === 'snow' || effect === 'frost') {
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.moveTo(size * 0.55, 0); ctx.lineTo(size * 0.3, -size * 0.22); ctx.moveTo(size * 0.55, 0); ctx.lineTo(size * 0.3, size * 0.22); ctx.stroke();
      }
    } else if (effect === 'music') {
      ctx.rotate(-phase * 0.25); ctx.font = `${Math.max(10, size * 1.8)}px ${selectedFont}`; ctx.fillText(index % 2 ? '♪' : '♫', 0, 0);
    } else if (effect === 'diamonds') {
      ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.65, 0); ctx.lineTo(0, size); ctx.lineTo(-size * 0.65, 0); ctx.closePath(); ctx.stroke();
    } else if (effect === 'fireflies' || effect === 'sparks') {
      ctx.shadowColor = rgba(pal.glow, fade); ctx.shadowBlur = size * 2;
      ctx.beginPath(); ctx.arc(0, 0, effect === 'sparks' ? size * 0.32 : size * 0.2, 0, 6.2832); ctx.fill();
      if (effect === 'sparks') { ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.moveTo(0, -size); ctx.lineTo(0, size); ctx.stroke(); }
    } else if (effect === 'ribbons' || effect === 'aurora') {
      ctx.beginPath(); ctx.moveTo(-size * 1.5, 0); ctx.bezierCurveTo(-size * 0.5, Math.sin(phase) * size, size * 0.5, -Math.sin(phase) * size, size * 1.5, 0); ctx.stroke();
      if (effect === 'aurora') { ctx.globalAlpha *= 0.45; ctx.translate(0, size * 0.45); ctx.stroke(); }
    } else if (effect === 'smoke') {
      const cloud = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.6);
      cloud.addColorStop(0, rgba(pal.b, fade * 0.35)); cloud.addColorStop(1, rgba(pal.b, 0));
      ctx.fillStyle = cloud; ctx.beginPath(); ctx.arc(0, 0, size * 1.6, 0, 6.2832); ctx.fill();
    } else if (effect === 'ripple') {
      ctx.beginPath(); ctx.arc(0, 0, size * 0.45, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, size, 0, 6.2832); ctx.stroke();
    } else if (effect === 'confetti') {
      ctx.rotate(phase); ctx.fillRect(-size * 0.3, -size * 0.65, size * 0.6, size * 1.3);
    }
    ctx.restore();
  }
  ctx.fillStyle = rgba(pal.glow, 0.9);
  ctx.shadowColor = rgba(pal.glow, 0.9);
  ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 6.2832); ctx.fill();
}

function drawCursorEffect(ctx, W, H, now, dt, pal, S) {
  const p = R.pointer;
  if (S.cursor === 'off' || S.motion <= 0) {
    R.cursorParticles.length = 0;
    R.cursorTrail.length = 0;
    R._cursorEffect = '';
    return;
  }
  const themed = S.cursor === 'theme' ? cursorEffectFor(S) : S.cursor;
  const effect = typeof themed === 'string' ? themed : 'design';
  const effectKey = typeof themed === 'string' ? effect : themed.id;
  if (R._cursorEffect !== effectKey) {
    R._cursorEffect = effectKey;
    R.cursorTrail.length = 0;
    R.cursorParticles.length = 0;
  }
  const x = p.sx * W, y = p.sy * H;
  const trail = R.cursorTrail;
  const last = trail[trail.length - 1];
  const moved = !last || Math.hypot(last.x - x, last.y - y) > 3;
  if (moved || now - last.t > 55) {
    trail.push({ x, y, t: now });
    if (trail.length > 28) trail.shift();
    if (moved && p.inside && S.cursor === 'theme') addCursorParticles(effect, x, y, typeof themed === 'string' ? null : themed);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (S.cursor === 'theme') {
    drawThemedCursor(ctx, W, H, now, dt, pal, effect, S.motion);
  } else if (S.cursor === 'butterflies') {
    const previous = trail[Math.max(0, trail.length - 7)];
    const older = trail[Math.max(0, trail.length - 15)];
    const angle = previous && trail.length > 2 ? Math.atan2(y - previous.y, x - previous.x) * 0.18 : 0;
    for (let i = 1; i < trail.length; i += 4) {
      const point = trail[i];
      const alpha = i / trail.length * 0.22;
      ctx.fillStyle = rgba(pal.glow, alpha);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1 + alpha * 3, 0, 6.2832);
      ctx.fill();
    }
    if (older) drawButterfly(ctx, older.x, older.y, now - 240, pal, 0.55, angle * 0.6);
    if (previous) drawButterfly(ctx, previous.x, previous.y, now - 120, pal, 0.78, angle);
    drawButterfly(ctx, x, y, now, pal, 1, angle);
  } else if (S.cursor === 'comet') {
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const fade = i / trail.length;
      ctx.strokeStyle = rgba(i % 2 ? pal.a : pal.glow, fade * 0.72);
      ctx.lineWidth = 1 + fade * 5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.shadowColor = rgba(pal.glow, 0.9);
    ctx.shadowBlur = 16;
    ctx.fillStyle = rgba(pal.glow, 0.95);
    ctx.beginPath(); ctx.arc(x, y, 3.5 + Beat.pulse * 1.5, 0, 6.2832); ctx.fill();
  } else if (S.cursor === 'hearts') {
    trail.forEach((point, index) => {
      const fade = index / Math.max(1, trail.length);
      const size = 2 + fade * 7;
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.scale(size / 10, size / 10);
      ctx.fillStyle = rgba(index % 2 ? pal.a : pal.glow, fade * 0.68);
      ctx.beginPath();
      ctx.moveTo(0, 3);
      ctx.bezierCurveTo(-10, -3, -5, -9, 0, -4);
      ctx.bezierCurveTo(5, -9, 10, -3, 0, 3);
      ctx.fill();
      ctx.restore();
    });
  } else if (S.cursor === 'orbit') {
    const radius = 9 + Beat.pulse * 3;
    ctx.strokeStyle = rgba(pal.glow, 0.38);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y, radius * 1.6, radius * 0.65, now * 0.001, 0, 6.2832); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const angle = now * 0.003 * (i % 2 ? -1 : 1) + i * 2.094;
      const px = x + Math.cos(angle) * radius * 1.6;
      const py = y + Math.sin(angle) * radius * 0.65;
      ctx.fillStyle = rgba(i % 2 ? pal.a : pal.glow, 0.9);
      ctx.beginPath(); ctx.arc(px, py, i === 0 ? 2.5 : 1.8, 0, 6.2832); ctx.fill();
    }
  } else if (CUSTOM_CURSORS.has(S.cursor)) {
    drawCursorPreset(ctx, S.cursor, trail, x, y, now, pal);
  } else {
    trail.forEach((point, index) => {
      const fade = index / Math.max(1, trail.length);
      ctx.fillStyle = rgba(index % 2 ? pal.a : pal.glow, fade * 0.7);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1 + fade * 2, 0, 6.2832);
      ctx.fill();
    });
  }
  ctx.restore();
}

function elongatedIntensity(text) {
  const letters = text.toLowerCase().match(/[a-z]/g) || [];
  if (letters.length < 4) return 1;
  const repeated = text.match(/([a-z])\1{1,}/ig) || [];
  return Math.min(3.5, 1 + repeated.reduce((sum, group) => sum + group.length - 1, 0) * 0.22);
}

function speakerCabinet(ctx, x, cy, side, size, bass, pulse, pal, now) {
  const width = size * 0.62, height = size * 1.42;
  const thump = 1 + bass * 0.22 + pulse * 0.18;
  const wobble = REDUCED_MOTION ? 0 : Math.sin(now * 0.045 + side) * (bass + pulse) * 2;
  ctx.save();
  ctx.translate(x + wobble, cy);
  ctx.fillStyle = rgba(pal.a, 0.12 + bass * 0.12);
  ctx.strokeStyle = rgba(pal.glow, 0.3 + bass * 0.42);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-width / 2, -height / 2, width, height, size * 0.08); ctx.fill(); ctx.stroke();
  [cy - height * 0.22, cy + height * 0.2].forEach((_, index) => {
    const r = size * (index ? 0.18 : 0.26) * thump;
    ctx.fillStyle = rgba(pal.b, 0.18 + bass * 0.15);
    ctx.strokeStyle = rgba(index ? pal.a : pal.glow, 0.38 + bass * 0.48);
    ctx.beginPath(); ctx.arc(0, (index ? 0.22 : -0.22) * size, r * 1.2, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1 + bass * 2;
    ctx.beginPath(); ctx.arc(0, (index ? 0.22 : -0.22) * size, r * (0.52 + pulse * 0.18), 0, 6.2832); ctx.stroke();
    ctx.fillStyle = rgba(pal.glow, 0.45 + bass * 0.45);
    ctx.beginPath(); ctx.arc(0, (index ? 0.22 : -0.22) * size, Math.max(2, r * 0.16), 0, 6.2832); ctx.fill();
  });
  ctx.restore();
}

function speakers(ctx, W, H, now, dt, t, lines, idx, S, pal) {
  const L = lines[idx];
  const m = Math.min(W, H), bass = Beat.bass, pulse = Beat.pulse;
  const size = clamp(m * 0.3, 110, 250);
  const cy = H * 0.49;
  const sideX = Math.min(W * 0.12 + size * 0.28, 230);
  speakerCabinet(ctx, sideX, cy, -1, size, bass, pulse, pal, now);
  speakerCabinet(ctx, W - sideX, cy, 1, size, bass, pulse, pal, now);
  if (!L || !L.words.length) return;

  let wi = -1;
  for (let i = 0; i < L.words.length; i++) if (L.words[i].t <= t) wi = i;
  if (wi < 0) return;
  const word = L.words[wi];
  const elapsed = Math.max(0, t - word.t);
  const stretch = elongatedIntensity(word.text);
  const intensity = 1 + (stretch - 1) * (0.45 + pulse * 0.55);
  const energy = REDUCED_MOTION ? 0 : clamp(pulse * 0.65 + bass * 0.5);
  const shake = energy * intensity * Math.min(14, m * 0.022);
  const x = Math.sin(now * 0.071) * shake;
  const y = Math.cos(now * 0.087) * shake * 0.55;
  const base = clamp(m * 0.12 * S.size, 34, 112);
  let fontSize = Math.min(base, W * 0.72 / Math.max(1, word.text.length * 0.58));
  const zoom = 1 + Math.min(0.9, (pulse * 0.28 + bass * 0.18) * intensity);

  ctx.save();
  ctx.translate(W / 2 + x, cy + y);
  ctx.scale(zoom, zoom);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  font(ctx, fontSize, 800);
  ctx.shadowColor = rgba(pal.glow, 0.7 + pulse * 0.25);
  ctx.shadowBlur = (18 + bass * 35 + pulse * 28) * S.glow;
  ctx.fillStyle = rgba(wordColor(pal, wi, L.words.length), 0.45 + clamp(elapsed / 0.08) * 0.55);
  ctx.fillText(word.text, 0, 0, W * 0.7);
  ctx.restore();

  const from = Math.max(0, wi - 2), to = Math.min(L.words.length, wi + 4);
  const contextWords = L.words.slice(from, to).map((item) => item.text);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  font(ctx, clamp(m * 0.026, 13, 23), 600);
  ctx.fillStyle = rgba(pal.a, 0.5);
  ctx.fillText(contextWords.join('  '), W / 2, cy + size * 0.92, W * 0.6);
}

const STYLES = { constellation, karaoke, kinetic, orbit, wave, speakers };

/* ---------------------------------------------------------------- *
 * Entry point, called once per frame
 * ---------------------------------------------------------------- */
R.render = function (ctx, W, H, now, dt, fs, S) {
  selectedFont = FONTS[S.lyricFont] || FONTS.dmSans;
  const pal = Pal.cur;
  const visuals = Array.isArray(S.beatVisual) ? S.beatVisual : [S.beatVisual || 'waveform'];
  const p = R.pointer;
  const k = 1 - Math.exp(-dt / 55);
  p.sx += (p.x - p.sx) * k;
  p.sy += (p.y - p.sy) * k;

  if (Beat.beatCount !== R._lastBeat) {
    R._lastBeat = Beat.beatCount;
    if (now - R.lastLightBeat >= 250) {
      R.lastLightBeat = now;
      R.lightPulse = Math.max(R.lightPulse, Math.min(1, Beat.pulse));
      R.lightColor = (R.lightColor + 1) % 2;
    }
    R.zoomPulse = Math.max(R.zoomPulse, 0.8 + Beat.pulse * 0.35);
    R.blackPulse = Math.max(R.blackPulse, Beat.pulse);

    // Japanese Phonk Kanji trigger
    if (visuals.includes('phonkKanji') && Beat.pulse > 0.18) {
      const KANJIS = ['鬼', '殺', '影', '魂', '夜', '夢', '侍', '狂', '闇', '龍', '死', '瞬', '閃', '神'];
      const char = KANJIS[Math.floor(Math.random() * KANJIS.length)];
      R.phonkKanjis.push({
        char,
        x: Beat.pulseX * W,
        y: Beat.pulseY * H,
        born: now,
        life: 520 + Math.random() * 260,
        size: Math.min(W, H) * (0.13 + Math.random() * 0.13),
        rot: (Math.random() - 0.5) * 0.22,
        col: Math.random() < 0.65 ? pal.glow : (Math.random() < 0.5 ? pal.a : pal.b),
      });
      if (R.phonkKanjis.length > 8) R.phonkKanjis.shift();
    }

    // Tokyo drift speed streaks trigger
    if (visuals.includes('driftStreaks') && Beat.pulse > 0.22) {
      const count = 3 + Math.floor(Math.random() * 4);
      for (let s = 0; s < count; s++) {
        const y = Math.random() * H;
        const len = W * (0.25 + Math.random() * 0.45);
        const dir = Math.random() < 0.7 ? 1 : -1;
        const x = dir > 0 ? -len : W + len;
        R.driftStreaks.push({
          x, y, len, dir,
          speed: (W * (0.85 + Math.random() * 1.35)) * dir,
          born: now,
          life: 380 + Math.random() * 220,
          w: 1.5 + Math.random() * 2.5,
          col: Math.random() < 0.5 ? pal.glow : pal.a,
        });
      }
      if (R.driftStreaks.length > 20) R.driftStreaks.splice(0, R.driftStreaks.length - 20);
    }

    // Bass thump: 1-3 shockwaves at random places across the whole screen
    if (visuals.includes('bass') && (Beat.pulse > 0.15 || Beat.bass > 0.3)) {
      const hits = 1 + (Beat.pulse > 0.6 ? 1 : 0) + (Beat.bass > 0.4 ? 1 : 0);
      for (let n = 0; n < hits; n++) {
        const r = Math.random();
        R.bassHits.push({
          x: Math.random() * W, y: Math.random() * H, born: now,
          life: 520 + Math.random() * 380,
          size: Math.min(W, H) * (0.08 + Math.random() * 0.16) * (0.7 + Beat.pulse * 0.6),
          power: clamp(0.5 + Beat.pulse * 0.6 + Beat.bass * 0.4),
          col: r < 0.5 ? pal.glow : r < 0.8 ? pal.a : pal.b,
        });
      }
      if (R.bassHits.length > 16) R.bassHits.splice(0, R.bassHits.length - 16);
    }

    // Random screen shake: patches of the screen jolt at random places on each beat
    if (visuals.includes('randomShake') && !REDUCED_MOTION && (Beat.pulse > 0.15 || Beat.bass > 0.3)) {
      const patches = 2 + Math.floor(Math.random() * 3) + (Beat.pulse > 0.7 ? 1 : 0);
      const power = (S.beatShake !== undefined ? S.beatShake : 0.5) * (S.aggressiveShake ? 1.8 : 1);
      for (let n = 0; n < patches; n++) {
        const w = W * (0.16 + Math.random() * 0.34), h = H * (0.14 + Math.random() * 0.32);
        R.jolts.push({
          x: Math.random() * (W - w), y: Math.random() * (H - h), w, h, born: now,
          life: 170 + Math.random() * 190,
          amp: (14 + Beat.pulse * 34 + Beat.bass * 20) * Math.max(0.25, power),
          col: Math.random() < 0.5 ? pal.glow : pal.b,
        });
      }
      if (R.jolts.length > 18) R.jolts.splice(0, R.jolts.length - 18);
    }

    // Random-place beat effects: ripples, spark bursts, mini spectrum rings, diamond pops
    if (Beat.pulse > 0.15 || Beat.bass > 0.3) {
      const spawn = (type, count, lifeMin, lifeSpan, sizeMin, sizeSpan) => {
        if (!visuals.includes(type)) return;
        for (let n = 0; n < count; n++) {
          const r = Math.random();
          R.fxHits.push({
            type, x: Math.random() * W, y: Math.random() * H, born: now,
            life: lifeMin + Math.random() * lifeSpan,
            size: Math.min(W, H) * (sizeMin + Math.random() * sizeSpan) * (0.7 + Beat.pulse * 0.6),
            power: clamp(0.5 + Beat.pulse * 0.6 + Beat.bass * 0.3),
            col: r < 0.45 ? pal.glow : r < 0.75 ? pal.a : pal.b,
            rot: Math.random() * 6.2832, seed: Math.random() * 100,
          });
        }
      };
      const strong = Beat.pulse > 0.65 ? 1 : 0;
      spawn('beatRipples', 1 + strong, 800, 400, 0.05, 0.08);
      spawn('sparkBurst', 1 + strong, 450, 300, 0.07, 0.1);
      spawn('miniRings', 1 + strong, 650, 350, 0.06, 0.07);
      spawn('diamondPop', 1 + strong, 500, 300, 0.06, 0.09);
      if (R.fxHits.length > 40) R.fxHits.splice(0, R.fxHits.length - 40);
    }
  }
  R.zoomPulse *= Math.exp(-dt / 300);
  R.blackPulse *= Math.exp(-dt / 100);
  R.lightPulse *= Math.exp(-dt / 210);

  const aggressiveShake = S.aggressiveShake;
  const shakeBase = (Beat.pulse * 5.0 + Beat.bass * 4.0 + (visuals.includes('shake') ? 8 * R.zoomPulse : 0));
  const userShake = S.beatShake !== undefined ? S.beatShake : 0.45;
  const shakePower = Math.min(aggressiveShake ? 36 : 15, shakeBase * userShake * (aggressiveShake ? 2.6 : 1.15));
  ctx.save();
  ctx.fillStyle = '#05070c';
  ctx.fillRect(-6, -6, W + 12, H + 12);
  if (shakePower > 0.35 && !REDUCED_MOTION) {
    const sx = (Math.random() - 0.5) * shakePower * 2.2;
    const sy = (Math.random() - 0.5) * shakePower * 1.8;
    const srot = (Math.random() - 0.5) * shakePower * 0.0016;
    ctx.translate(sx, sy);
    ctx.rotate(srot);
  }

  drawBg(ctx, W, H, now, S, pal);
  drawBeatVisual(ctx, W, H, now, S, pal);

  if (p.inside && S.motion > 0 && R.quality) {
    ctx.globalCompositeOperation = 'lighter';
    glowDot(ctx, pal, p.sx * W, p.sy * H, 90 + 40 * Beat.pulse, 0.15 * S.glow);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (fs.lines && fs.lines.length) {
    const lines = fs.lines;
    const idx = findLine(lines, fs.t);
    if ((S.beatZoom || S.aggressiveZoom) && !REDUCED_MOTION && idx >= 0) {
      const aggressive = S.aggressiveZoom;
      const pulse = R.zoomPulse;
      const zoom = 1 + Beat.pulse * (aggressive ? 0.12 : 0.08) + pulse * (aggressive ? 0.2 : 0.07);
      const tilt = ((Beat.beatCount % 2) ? 1 : -1)
        * (Beat.pulse * (aggressive ? 0.055 : 0.028) + pulse * (aggressive ? 0.045 : 0.02));
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(tilt);
      ctx.scale(zoom, zoom);
      ctx.translate(-W / 2, -H / 2);
      STYLES[S.style](ctx, W, H, now, dt, fs.t, lines, idx, S, pal);
      ctx.restore();
    } else {
      STYLES[S.style](ctx, W, H, now, dt, fs.t, lines, idx, S, pal);
    }
    const cur = idx >= 0 ? lines[idx] : null;
    if (!cur || !cur.words.length) {
      const a = cur ? clamp((fs.t - cur.t - 0.6) / 0.8) : clamp(1 - Math.abs(fs.t) * 0.2);
      if (a > 0.01) interlude(ctx, W, H, now, pal, a);
    }
  } else {
    if (S.style === 'speakers') STYLES.speakers(ctx, W, H, now, dt, 0, [], -1, S, pal);
    message(ctx, W, H, fs.message, pal);
  }

  drawParticles(ctx, dt, pal);
  drawCursorEffect(ctx, W, H, now, dt, pal, S);

  if (visuals.includes('darkness') && !REDUCED_MOTION && R.zoomPulse > 0.01) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.52, R.zoomPulse * 0.48)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (visuals.includes('blackFlicker') && !REDUCED_MOTION && R.blackPulse > 0.01) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.42, R.blackPulse * 0.4)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (visuals.includes('strobePulse') && !REDUCED_MOTION && Beat.pulse > 0.22) {
    const strobe = Math.sin(now * 0.08) > 0 ? 1 : 0;
    if (strobe) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rgba(pal.glow, Math.min(0.2, Beat.pulse * 0.2));
      ctx.fillRect(0, 0, W, H);
    }
  }
  if ((S.beatFlash || S.aggressiveFlash || visuals.includes('beatFlash')) && !REDUCED_MOTION && Beat.source !== 'off' && Beat.pulse > 0.05) {
    ctx.globalCompositeOperation = 'screen';
    const maxFlash = S.aggressiveFlash ? 0.22 : 0.12;
    const strength = Math.min(maxFlash, Beat.pulse * maxFlash);
    ctx.fillStyle = rgba(pal.glow, strength * 0.65);
    ctx.fillRect(0, 0, W, H);
    const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, rgba(pal.glow, strength * 1.4));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  // Random screen shake patches: re-draw random regions of the finished frame, jolted sideways
  if (R.jolts.length) {
    const sc = ctx.canvas.width / W;
    for (let i = R.jolts.length - 1; i >= 0; i--) {
      const j = R.jolts[i];
      const prog = (now - j.born) / j.life;
      if (prog >= 1 || REDUCED_MOTION) { R.jolts.splice(i, 1); continue; }
      const fade = 1 - prog;
      const dx = (Math.random() - 0.5) * 2 * j.amp * fade;
      const dy = (Math.random() - 0.5) * 1.2 * j.amp * fade;
      const sx = clamp(j.x - dx, 0, W - j.w), sy = clamp(j.y - dy, 0, H - j.h);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.rect(j.x, j.y, j.w, j.h); ctx.clip();
      ctx.drawImage(ctx.canvas, sx * sc, sy * sc, j.w * sc, j.h * sc, j.x, j.y, j.w, j.h);
      ctx.restore();
      ctx.strokeStyle = rgba(j.col, 0.35 * fade);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(j.x + dx * 0.5, j.y + dy * 0.5, j.w, j.h);
    }
  }

  // Glitch Effect (canvas slice displacement + digital block glitch)
  if (visuals.includes('glitch') && !REDUCED_MOTION && (Beat.pulse > 0.18 || Beat.bass > 0.28)) {
    const intensity = clamp(Beat.pulse * 1.2 + Beat.bass * 0.7);
    const sliceCount = Math.floor(3 + intensity * 6);
    for (let s = 0; s < sliceCount; s++) {
      const sy = Math.random() * H;
      const sh = 4 + Math.random() * 24;
      const offset = (Math.random() - 0.5) * (18 + intensity * 36);
      const sc = ctx.canvas.width / W;
      ctx.drawImage(ctx.canvas, 0, sy * sc, ctx.canvas.width, sh * sc, offset, sy, W, sh);
    }
    if (Math.random() < 0.4 * intensity) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255, 30, 90, 0.45)' : 'rgba(0, 240, 255, 0.45)';
      ctx.fillRect(Math.random() * W, Math.random() * H, 40 + Math.random() * 140, 5 + Math.random() * 18);
    }
  }

  // Distortion Effect (RGB Split / Chromatic Aberration)
  if (visuals.includes('distortion') && !REDUCED_MOTION && (Beat.pulse > 0.14 || Beat.bass > 0.22)) {
    const dist = (Beat.pulse * 12 + Beat.bass * 8) * (S.beatShake || 0.5);
    if (dist > 1.2) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.38 + Beat.pulse * 0.32;
      ctx.drawImage(ctx.canvas, -dist, (Math.random() - 0.5) * dist * 0.3, W, H);
      ctx.drawImage(ctx.canvas, dist, (Math.random() - 0.5) * dist * 0.3, W, H);
      ctx.restore();
    }
  }

  ctx.restore();
};

R.findLine = findLine;
})();
