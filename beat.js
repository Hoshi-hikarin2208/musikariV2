/* Beat engine.
 * Spotify does not let websites hear its audio, so real beat detection listens to the
 * sound your PC is playing (system / tab audio) or the microphone. Without a source we
 * fall back to a slow "ambient" breathing pulse (or a simulated beat in demo mode). */
(() => {
'use strict';

const NB = 48;
const Beat = {
  source: 'off',        // 'off' | 'system' | 'mic' | 'sim'
  label: 'Ambient',
  pulse: 0,             // 1 on a beat, decays to 0 (~300ms)
  pulseX: 0.5, pulseY: 0.5,
  bass: 0, mid: 0, high: 0, level: 0,   // 0..1 smoothed band energy
  bars: new Float32Array(NB),           // log-spaced spectrum, 0..1
  barPulse: new Float32Array(NB),
  waveform: new Float32Array(128),      // normalized audio waveform, -1..1
  beatCount: 0,
  sens: 1,              // 0.5 (calm) .. 2 (twitchy)
  randomize: true,
  hitSize: 1,
  bpm: 100,             // used by the simulated beat only
  error: '',
  _ctx: null, _an: null, _data: null, _timeData: null, _stream: null, _src: null,
  _element: null,
  _hist: [], _fluxHist: [], _lastBeat: 0, _simN: -1, _ambN: -1, _edges: null,
  _bassPrev: 0, _prevSpectrum: null,
};

function edges(binCount) {
  const top = Math.min(binCount - 1, 380);
  const e = [];
  for (let i = 0; i <= NB; i++) {
    const v = Math.round(Math.pow(top, i / NB));
    e.push(i ? Math.max(e[i - 1] + 1, v) : 1);
  }
  return e;
}

Beat._connect = async function (stream, source, label) {
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(source === 'element'
      ? 'MP3 audio capture is unavailable in this browser. Use “Sync to music” to share audio instead.'
      : 'No audio was shared. Enable “Share tab audio” or “Share system audio” and try again.');
  }
  this.stop();
  const AC = window.AudioContext || window.webkitAudioContext;
  this._ctx = new AC();
  if (this._ctx.state === 'suspended') await this._ctx.resume();
  this._src = this._ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  this._an = this._ctx.createAnalyser();
  this._an.fftSize = 2048;
  this._an.smoothingTimeConstant = 0.55;
  this._src.connect(this._an);      // deliberately NOT connected to speakers (no echo)
  this._data = new Uint8Array(this._an.frequencyBinCount);
  this._timeData = new Uint8Array(this._an.fftSize);
  this._prevSpectrum = new Float32Array(this._an.frequencyBinCount);
  this._edges = edges(this._an.frequencyBinCount);
  this._stream = stream;
  stream.getTracks().forEach((t) => t.addEventListener('ended', () => { if (this._stream === stream) this.stop(); }));
  this.source = source;
  this.label = label;
  this.error = '';
  this._hist.length = 0;
  this._fluxHist.length = 0;
  this._bassPrev = 0;
};

Beat.startSystem = async function () {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('This browser cannot capture system audio. Try Chrome or Edge on a PC.');
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { width: 2, height: 2, frameRate: 1 },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  await this._connect(stream, 'system', 'System audio');
};

Beat.startMic = async function () {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Microphone is not available here.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  await this._connect(stream, 'mic', 'Microphone');
};

Beat.startElement = async function (element) {
  if (!element) throw new Error('The MP3 player is not available.');
  if (this.source !== 'off' && this.source !== 'element' && this.source !== 'sim') return;
  if (this.source === 'element' && this._element === element && this._an) return;
  if (typeof element.captureStream !== 'function') throw new Error('This browser cannot analyze MP3 audio automatically. Use “Sync to music” to share audio instead.');
  const stream = element.captureStream();
  try {
    await this._connect(stream, 'element', 'MP3 audio');
    this._element = element;
  } catch (error) {
    if (this._stream !== stream) stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
};

Beat.startSim = function (bpm) {
  this.stop();
  this.source = 'sim';
  this.label = 'Simulated';
  this.bpm = bpm || 100;
  this._simN = -1;
};

Beat.stop = function () {
  if (this._stream) this._stream.getTracks().forEach((t) => t.stop());
  if (this._ctx) { try { this._ctx.close(); } catch (e) { /* ignore */ } }
  this._ctx = this._an = this._data = this._timeData = this._stream = this._src = null;
  this._element = null;
  this._prevSpectrum = null;
  this.source = 'off';
  this.label = 'Ambient';
};

Beat._fire = function (now, strength) {
  if (this.randomize) {
    const roll = Math.random();
    this.hitSize = roll < 0.2 ? 0.62 : roll < 0.48 ? 0.82 : roll < 0.8 ? 1 : roll < 0.95 ? 1.2 : 1.38;
  } else {
    this.hitSize = 1;
  }
  const hit = U.clamp(strength * this.hitSize);
  this.pulse = Math.max(this.pulse, hit);
  this.pulseX = 0.10 + Math.random() * 0.80;
  this.pulseY = 0.12 + Math.random() * 0.76;
  for (let i = 0; i < NB; i++) {
    this.barPulse[i] = Math.max(this.barPulse[i], Math.random() < 0.72 ? hit * (0.18 + Math.random() * 0.82) : 0);
  }
  this.beatCount++;
  this._lastBeat = now;
};

Beat.update = function (now, dt) {
  const decay = Math.exp(-dt / 170);
  this.pulse *= decay;
  const barDecay = Math.exp(-dt / 260);
  for (let i = 0; i < NB; i++) this.barPulse[i] *= barDecay;

  if (this._an) {
    this._an.getByteFrequencyData(this._data);
    this._an.getByteTimeDomainData(this._timeData);
    for (let i = 0; i < this.waveform.length; i++) {
      const sample = this._timeData[Math.floor(i * this._timeData.length / this.waveform.length)];
      this.waveform[i] = (sample - 128) / 128;
    }
    const d = this._data, e = this._edges;
    const binWidth = this._ctx.sampleRate / this._an.fftSize;
    const bandRms = (lowHz, highHz) => {
      const start = Math.max(1, Math.floor(lowHz / binWidth));
      const end = Math.min(d.length, Math.max(start + 1, Math.ceil(highHz / binWidth)));
      let sum = 0;
      for (let i = start; i < end; i++) {
        const magnitude = d[i] / 255;
        sum += magnitude * magnitude;
      }
      return Math.sqrt(sum / Math.max(1, end - start));
    };
    const bassRaw = bandRms(28, 180);
    const midRaw = bandRms(180, 2400);
    const highRaw = bandRms(2400, 10000);
    const lvl = bandRms(28, 10000);
    let fluxPower = 0;
    const fluxBins = Math.min(d.length, 300);
    for (let i = 2; i < fluxBins; i++) {
      const magnitude = d[i] / 255;
      const rise = Math.max(0, magnitude - this._prevSpectrum[i]);
      fluxPower += rise * rise * (i < 12 ? 1.8 : 1);
      this._prevSpectrum[i] = magnitude;
    }
    const spectralFlux = Math.sqrt(fluxPower / Math.max(1, fluxBins - 2));
    this.bass += (bassRaw - this.bass) * (bassRaw > this.bass ? 0.58 : 0.13);
    this.mid += (midRaw - this.mid) * (midRaw > this.mid ? 0.48 : 0.11);
    this.high += (highRaw - this.high) * (highRaw > this.high ? 0.48 : 0.11);
    this.level += (lvl - this.level) * (lvl > this.level ? 0.5 : 0.12);
    const barAttack = 1 - Math.exp(-dt / 45);
    const barRelease = 1 - Math.exp(-dt / 145);
    for (let i = 0; i < NB; i++) {
      const start = Math.min(d.length - 1, e[i]);
      const end = Math.min(d.length, Math.max(start + 1, e[i + 1]));
      let sum = 0;
      for (let bin = start; bin < end; bin++) {
        const magnitude = d[bin] / 255;
        sum += magnitude * magnitude;
      }
      const v = Math.min(1, Math.sqrt(sum / Math.max(1, end - start)) * 1.35);
      this.bars[i] += (v - this.bars[i]) * (v > this.bars[i] ? barAttack : barRelease);
    }
    // Detect both kick-like bass rises and non-bass attacks such as snares.
    const h = this._hist, fh = this._fluxHist;
    const mean = h.length ? h.reduce((sum, value) => sum + value, 0) / h.length : bassRaw;
    const fluxMean = fh.length ? fh.reduce((sum, value) => sum + value, 0) / fh.length : spectralFlux;
    const s = U.clamp((this.sens - 0.5) / 1.5);
    const C = U.lerp(1.35, 1.05, s);
    const bassFlux = bassRaw - this._bassPrev;
    this._bassPrev = bassRaw;
    h.push(bassRaw);
    fh.push(spectralFlux);
    if (h.length > 50) h.shift();
    if (fh.length > 50) fh.shift();
    const bassHit = bassRaw > U.lerp(0.065, 0.025, s) && bassRaw > mean * C
      && bassFlux > Math.max(0.004, mean * 0.02);
    const mixHit = spectralFlux > Math.max(U.lerp(0.018, 0.006, s), fluxMean * U.lerp(1.7, 1.2, s));
    if (h.length > 5 && (bassHit || mixHit) && now - this._lastBeat > 125) {
      this._fire(now, U.clamp(0.48 + bassFlux * 4 + spectralFlux * 5, 0.5, 1));
    }
    return;
  }

  if (this.source === 'sim') {
    const beatLen = 60000 / this.bpm;
    const n = Math.floor(now / beatLen);
    if (n !== this._simN) { this._simN = n; this._fire(now, n % 4 === 0 ? 1 : 0.8); }
    const p = this.pulse;
    this.bass = 0.15 + 0.7 * p; this.mid = 0.2 + 0.3 * p; this.high = 0.15 + 0.2 * Math.abs(Math.sin(now / 90));
    this.level = 0.3 + 0.4 * p;
    for (let i = 0; i < NB; i++) {
      const fall = Math.pow(1 - i / NB, 1.4);
      const wob = 0.5 + 0.5 * Math.sin(now / 160 + i * 0.9) * Math.sin(now / 410 + i * 0.3);
      const target = U.clamp((0.12 + 0.55 * p) * fall * (0.55 + 0.6 * wob) + 0.04);
      this.bars[i] += (target - this.bars[i]) * (target > this.bars[i] ? 1 - Math.exp(-dt / 45) : 1 - Math.exp(-dt / 145));
    }
    for (let i = 0; i < this.waveform.length; i++) {
      const x = i / this.waveform.length * Math.PI * 8;
      this.waveform[i] = Math.sin(x + now * 0.009) * (0.15 + p * 0.72)
        + Math.sin(x * 2.7 - now * 0.014) * (0.05 + this.high * 0.24);
    }
    return;
  }

  // Keep the idle scene gently animated, with irregular visual accents.
  if (now >= this._ambN) {
    this._fire(now, 0.28 + Math.random() * 0.22);
    this._ambN = now + 1400 + Math.random() * 1800;
  }
  this.bass = 0.1 + 0.06 * Math.sin(now / 1100);
  this.mid = this.high = 0.08;
  this.level = 0.1;
  for (let i = 0; i < NB; i++) this.bars[i] = 0.05 + 0.04 * (1 + Math.sin(now / 700 + i * 0.55));
  for (let i = 0; i < this.waveform.length; i++) this.waveform[i] = Math.sin(i / this.waveform.length * Math.PI * 6 + now * 0.001) * 0.08;
};

window.Beat = Beat;
})();
