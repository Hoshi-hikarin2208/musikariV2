(() => {
'use strict';

/* ------------------------------------------------------------------ *
 *  Config + helpers
 * ------------------------------------------------------------------ */
const CFG = window.CONFIG || {};
const CLIENT_ID = (CFG.SPOTIFY_CLIENT_ID || '').trim();
const SCOPES = 'user-read-currently-playing user-read-playback-state';
const REDIRECT = location.protocol === 'file:'
  ? 'http://127.0.0.1:5500/'
  : location.origin + location.pathname.replace(/index\.html$/, '');
const { clamp, mulberry32, hashStr, lerp } = U;

const $ = (s) => document.querySelector(s);
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
const SS = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
const localAudio = $('#local-audio');
let audioDbPromise;
let savedTracks = [];
let localAudioUrl = '';
let localLoadId = 0;
['sp_access', 'sp_expires', 'sp_refresh', 'pkce_verifier'].forEach(LS.del);

/* ------------------------------------------------------------------ *
 *  State + settings
 * ------------------------------------------------------------------ */
const state = {
  mode: 'gate',          // 'gate' | 'spotify' | 'youtube' | 'local' | 'demo'
  track: null,
  anchor: { pos: 0, at: 0, playing: false },
  lines: null,           // null = loading, [] = none found
  lyricsStatus: '',
  offsetMs: 0,
};

const DESIGN_PRESETS = [
  ['Star Atlas', 'constellation', 'gold', 'dust'],
  ['Aurora Map', 'constellation', 'aurora', 'nebula'],
  ['Rose Nebula', 'constellation', 'rose', 'nebula'],
  ['Icefield Stars', 'constellation', 'ice', 'spectrum'],
  ['Solar Constellation', 'constellation', 'ember', 'rings'],
  ['Album Galaxy', 'constellation', 'album', 'none'],
  ['Quiet Orbit', 'constellation', 'mono', 'dust'],
  ['Blue Hour Map', 'constellation', 'ice', 'nebula'],
  ['Wildflower Sky', 'constellation', 'rose', 'dust'],
  ['Mint Stardust', 'constellation', 'aurora', 'none'],
  ['Violet Cluster', 'constellation', 'neon', 'rings'],
  ['Honey Stars', 'constellation', 'gold', 'spectrum'],
  ['Velvet Karaoke', 'karaoke', 'rose', 'nebula'],
  ['Solar Chorus', 'karaoke', 'ember', 'spectrum'],
  ['Glacier Singalong', 'karaoke', 'ice', 'rings'],
  ['Aurora Lyrics', 'karaoke', 'aurora', 'dust'],
  ['Neon Spotlight', 'karaoke', 'neon', 'none'],
  ['Golden Ballad', 'karaoke', 'gold', 'nebula'],
  ['Soft Focus', 'karaoke', 'mono', 'dust'],
  ['Blue Note', 'karaoke', 'ice', 'none'],
  ['Apricot Glow', 'karaoke', 'ember', 'dust'],
  ['Lilac Refrain', 'karaoke', 'neon', 'nebula'],
  ['Rosewater Type', 'karaoke', 'rose', 'spectrum'],
  ['Spring Chorus', 'karaoke', 'aurora', 'rings'],
  ['Prism Motion', 'kinetic', 'neon', 'spectrum'],
  ['Cinder Words', 'kinetic', 'ember', 'rings'],
  ['Moonlit Type', 'kinetic', 'mono', 'none'],
  ['Rose Typography', 'kinetic', 'rose', 'dust'],
  ['Polar Impact', 'kinetic', 'ice', 'nebula'],
  ['Album Pulse', 'kinetic', 'album', 'spectrum'],
  ['Quiet Type', 'kinetic', 'gold', 'none'],
  ['Violet Frame', 'kinetic', 'neon', 'dust'],
  ['Mint Momentum', 'kinetic', 'aurora', 'rings'],
  ['Cherry Flash', 'kinetic', 'rose', 'nebula'],
  ['Blue Streak', 'kinetic', 'ice', 'spectrum'],
  ['Copper Cut', 'kinetic', 'ember', 'dust'],
  ['Orbiting Gold', 'orbit', 'gold', 'rings'],
  ['Blue Planet', 'orbit', 'ice', 'nebula'],
  ['Aurora Orbit', 'orbit', 'aurora', 'spectrum'],
  ['Neon Satellites', 'orbit', 'neon', 'none'],
  ['Ember Rings', 'orbit', 'ember', 'dust'],
  ['Rose Moon', 'orbit', 'rose', 'rings'],
  ['Silver Satellite', 'orbit', 'mono', 'dust'],
  ['Blue Moonrise', 'orbit', 'ice', 'none'],
  ['Jade Planet', 'orbit', 'aurora', 'nebula'],
  ['Violet System', 'orbit', 'neon', 'rings'],
  ['Warm Eclipse', 'orbit', 'ember', 'spectrum'],
  ['Petal Moon', 'orbit', 'rose', 'dust'],
  ['Tidal Light', 'wave', 'ice', 'spectrum'],
  ['Aurora Tide', 'wave', 'aurora', 'nebula'],
  ['Neon Current', 'wave', 'neon', 'rings'],
  ['Golden Soundwave', 'wave', 'gold', 'dust'],
  ['Rosewater Wave', 'wave', 'rose', 'none'],
  ['Album Ocean', 'wave', 'album', 'nebula'],
  ['Silver Drift', 'wave', 'mono', 'dust'],
  ['Blue Current', 'wave', 'ice', 'rings'],
  ['Jade Ripple', 'wave', 'aurora', 'none'],
  ['Violet Flow', 'wave', 'neon', 'spectrum'],
  ['Ember Tide', 'wave', 'ember', 'nebula'],
  ['Petal Stream', 'wave', 'rose', 'dust'],
  ['Tokyo Drift Neon', 'kinetic', 'tokyo', 'japanese'],
  ['Tokyo Cyber Mist', 'constellation', 'tokyo', 'japanese'],
  ['Arctic Light Curtain', 'wave', 'aurora', 'northernLights'],
  ['Polar Borealis Stars', 'constellation', 'ice', 'northernLights'],
];
const CURSOR_MOTIFS = ['starlight', 'petals', 'comet', 'diamond', 'leaf', 'orbit', 'music note', 'bloom', 'firefly', 'ripple', 'snowflake', 'heart'];
const CURSOR_FAMILIES = ['star', 'song', 'prism', 'orbit', 'tide', 'tokyo'];
const DESIGN_ROWS = DESIGN_PRESETS.map(([name, style, pal, bg], index) => {
  const family = Math.floor(index / CURSOR_MOTIFS.length);
  const motif = CURSOR_MOTIFS[index % CURSOR_MOTIFS.length];
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name, style, pal, bg, cursorVariant: index % CURSOR_MOTIFS.length,
    cursorFamily: family, cursorName: CURSOR_FAMILIES[family] + ' ' + motif,
  };
});
const DEFAULTS = { style: 'constellation', pal: 'gold', bg: 'dust', design: 'custom', mood: 'custom', cursor: 'theme', lyricFont: 'dmSans', linePos: 'bottom', customBgDim: 0.45, beatVisual: ['ringSpectrum', 'beatRipples', 'miniRings', 'shake', 'randomShake', 'bass', 'glitch', 'distortion', 'beatFlash', 'strobePulse', 'pulse'], beatShake: 0.5, beatZoom: false, aggressiveZoom: false, beatRandom: true, beatFlash: false, aggressiveShake: false, aggressiveFlash: false, size: 1, glow: 0.8, motion: 0.8, sens: 1, ringSize: 1, radialSize: 1, card: true };
const STYLES = [['constellation', 'Constellation', '✦'], ['karaoke', 'Karaoke', '♪'], ['kinetic', 'Kinetic', '◆'], ['orbit', 'Orbit', '◎'], ['wave', 'Wave', '∿'], ['speakers', 'Speaker stage', '♫']];
const BGS = [
  ['dust', 'Stardust'],
  ['japanese', 'Tokyo Night (Japanese)'],
  ['northernLights', 'Northern Lights (Aurora)'],
  ['nebula', 'Nebula'],
  ['aurora', 'Aurora'],
  ['spectrum', 'Spectrum'],
  ['rings', 'Pulse rings'],
  ['none', 'Pure black'],
  ['custom', 'Custom Image / GIF'],
];
const LYRIC_FONTS = [
  ['delaGothicOne', 'Dela Gothic (Phonk)', 'Dela Gothic One'],
  ['zenTokyoZoo', 'Zen Tokyo Zoo', 'Zen Tokyo Zoo'],
  ['dotGothic16', 'DotGothic 16-bit', 'DotGothic16'],
  ['syne', 'Syne Wide', 'Syne'],
  ['orbitron', 'Orbitron Sci-Fi', 'Orbitron'],
  ['righteous', 'Righteous Neon', 'Righteous'],
  ['sawarabiMincho', 'Sawarabi Mincho', 'Sawarabi Mincho'],
  ['dmSans', 'DM Sans', 'DM Sans'],
  ['manrope', 'Manrope', 'Manrope'],
  ['oswald', 'Oswald', 'Oswald'],
  ['bebasNeue', 'Bebas Neue', 'Bebas Neue'],
  ['notoSansJp', 'Noto Sans JP', 'Noto Sans JP'],
];
const BEAT_VISUALS = [
  ['auto', 'Auto vibe', '✧'],
  ['waveLine', 'Wave line (edge-to-edge)', '〰'],
  ['signal', 'Signal waveform (edge-to-edge)', '⌁'],
  ['waveform', 'Spectrum curve (edge-to-edge)', '∿'],
  ['audio', 'Audio waveform (edge-to-edge)', '≈'],
  ['heartbeat', 'Heartbeat line (edge-to-edge)', '⌁'],
  ['scanline', 'Horizon scanline (edge-to-edge)', '▤'],
  ['phonkKanji', 'Japanese Phonk kanji', '鬼'],
  ['driftStreaks', 'Tokyo drift streaks', '⚡'],
  ['shake', 'Screen shake', '↯'],
  ['glitch', 'Glitch tear', '▦'],
  ['distortion', 'RGB split distortion', '▧'],
  ['strobePulse', 'Strobe flicker pulse', '⚡'],
  ['beatFlash', 'Beat flash lights', '✦'],
  ['blackFlicker', 'Black beat flicker', '◼'],
  ['pulse', 'Random beat burst', '◉'],
  ['bass', 'Bass thump (random places)', '◉'],
  ['randomShake', 'Random screen shake (everywhere)', '↯'],
  ['ringSpectrum', 'Neon ring spectrum (center)', '◎'],
  ['beatRipples', 'Beat ripples (random places)', '≋'],
  ['sparkBurst', 'Spark bursts (random places)', '✴'],
  ['miniRings', 'Mini spectrum rings (random places)', '✺'],
  ['diamondPop', 'Diamond pops (random places)', '◇'],
  ['bars', 'Equalizer bars', '▥'],
  ['radial', 'Radial spectrum', '✺'],
  ['darkness', 'Darkness pulse', '◐'],
  ['vignette', 'Dark vignette', '◉'],
  ['blacklight', 'Blacklight glow', '☼'],
  ['colorWash', 'Color wash', '◉'],
  ['off', 'Off', '–'],
];
const CURSORS = [
  ['theme', 'Match design / mood', '✧'], ['butterflies', 'Butterflies', '✿'], ['stardust', 'Stardust', '✦'],
  ['comet', 'Comet trail', '☄'], ['hearts', 'Hearts', '♥'], ['orbit', 'Orbiting stars', '◎'],
  ['fire', 'Fire', '🔥'], ['rose', 'Rose petals', '🌹'], ['petals', 'Falling petals', '❀'],
  ['lightning', 'Lightning', 'ϟ'], ['bubbles', 'Bubbles', '○'], ['leaves', 'Leaves', '❧'],
  ['snow', 'Snowflakes', '❄'], ['music', 'Music notes', '♫'], ['diamonds', 'Diamonds', '◇'],
  ['fireflies', 'Fireflies', '✧'], ['ribbons', 'Ribbons', '〰'],
  ['smoke', 'Smoke', '☁'], ['sakura', 'Sakura', '✿'], ['aurora', 'Aurora', '⌁'],
  ['frost', 'Frost', '❅'], ['sparks', 'Sparks', '✴'], ['embers', 'Embers', '•'],
  ['ripple', 'Ripples', '◎'], ['confetti', 'Confetti', '▪'], ['off', 'Off', '–'],
];
const MOODS = [
  ['aurora', 'Aurora dream', 'constellation', 'aurora', 'northernLights', 'aurora'],
  ['dreamy', 'Dreamy', 'karaoke', 'rose', 'nebula', 'sakura'],
  ['midnight', 'Midnight calm', 'constellation', 'ice', 'dust', 'frost'],
  ['electric', 'Electric', 'kinetic', 'neon', 'spectrum', 'sparks'],
  ['sunset', 'Warm sunset', 'orbit', 'ember', 'rings', 'smoke + embers'],
  ['minimal', 'Minimal', 'wave', 'mono', 'none', 'dust'],
  ['phonk', 'Phonk', 'kinetic', 'ember', 'none', 'sparks', ['signal', 'driftStreaks', 'shake', 'randomShake', 'bass', 'glitch', 'distortion', 'blackFlicker', 'beatFlash', 'strobePulse', 'pulse']],
  ['japanesePhonk', 'Japanese Phonk', 'kinetic', 'tokyo', 'japanese', 'sakura', ['waveLine', 'signal', 'phonkKanji', 'driftStreaks', 'shake', 'randomShake', 'bass', 'glitch', 'distortion', 'beatFlash', 'strobePulse', 'pulse']],
];

const S = Object.assign({}, DEFAULTS);
try { Object.assign(S, JSON.parse(LS.get('lyr_settings') || '{}')); } catch (e) { /* ignore */ }
state.offsetMs = parseInt(LS.get('lyr_offset') || '0', 10) || 0;

function syncCursorDesign() {
  R.cursorDesign = S.design === 'custom' ? null : DESIGN_ROWS.find((item) => item.id === S.design) || null;
}

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const str = (k, list) => { const v = q.get(k); if (v && list.includes(v)) S[k] = v; };
  const num = (k, a, b) => { const v = parseFloat(q.get(k)); if (isFinite(v)) S[k] = clamp(v, a, b); };
  str('style', STYLES.map((x) => x[0]));
  str('pal', Pal.order);
  str('bg', BGS.map((x) => x[0]));
  str('lyricFont', LYRIC_FONTS.map((x) => x[0]));
  str('linePos', ['bottom', 'center']);
  str('design', ['custom'].concat(DESIGN_ROWS.map((x) => x.id)));
  str('mood', ['custom'].concat(MOODS.map((x) => x[0])));
  str('cursor', CURSORS.map((x) => x[0]));
  const beatVisual = q.get('beatVisual');
  if (beatVisual) S.beatVisual = beatVisual.split(',').filter((id) => BEAT_VISUALS.some((item) => item[0] === id));
  num('size', 0.7, 1.5); num('glow', 0, 1.5); num('motion', 0, 1.5); num('sens', 0.5, 2); num('beatShake', 0, 1.5); num('customBgDim', 0, 0.95); num('ringSize', 0.4, 2.5); num('radialSize', 0.4, 2.5);
  ['beatZoom', 'aggressiveZoom', 'beatRandom', 'beatFlash', 'aggressiveShake', 'aggressiveFlash'].forEach((key) => {
    const value = q.get(key);
    if (value === 'true' || value === 'false') S[key] = value === 'true';
  });
}
function validate() {
  if (!STYLES.some((x) => x[0] === S.style)) S.style = DEFAULTS.style;
  if (!Pal.order.includes(S.pal)) S.pal = DEFAULTS.pal;
  if (!BGS.some((x) => x[0] === S.bg)) S.bg = DEFAULTS.bg;
  if (!LYRIC_FONTS.some((x) => x[0] === S.lyricFont)) S.lyricFont = DEFAULTS.lyricFont;
  if (S.linePos !== 'bottom' && S.linePos !== 'center') S.linePos = DEFAULTS.linePos;
  if (typeof S.customBgDim !== 'number' || !isFinite(S.customBgDim)) S.customBgDim = DEFAULTS.customBgDim;
  if (S.design !== 'custom' && !DESIGN_ROWS.some((x) => x.id === S.design)) S.design = 'custom';
  if (!['custom'].concat(MOODS.map((x) => x[0])).includes(S.mood)) S.mood = DEFAULTS.mood;
  if (!CURSORS.some((x) => x[0] === S.cursor)) S.cursor = DEFAULTS.cursor;
  if (!Array.isArray(S.beatVisual)) S.beatVisual = BEAT_VISUALS.some((x) => x[0] === S.beatVisual) ? [S.beatVisual] : DEFAULTS.beatVisual.slice();
  S.beatVisual = S.beatVisual.filter((id, index, list) => BEAT_VISUALS.some((x) => x[0] === id) && list.indexOf(id) === index);
  if (S.beatVisual.includes('off') && S.beatVisual.length > 1) S.beatVisual = S.beatVisual.filter((id) => id !== 'off');
  if (S.beatVisual.includes('auto') && S.beatVisual.length > 1) S.beatVisual = S.beatVisual.filter((id) => id !== 'auto');
  if (!S.beatVisual.length) S.beatVisual = DEFAULTS.beatVisual.slice();
  ['size', 'glow', 'motion', 'sens', 'beatShake', 'ringSize', 'radialSize'].forEach((k) => { if (typeof S[k] !== 'number' || !isFinite(S[k])) S[k] = DEFAULTS[k]; });
}

/* Custom background persistent storage via IndexedDB with localStorage fallback */
let customBgDbPromise = null;
function openCustomBgDb() {
  if (!window.indexedDB) return Promise.reject(new Error('IndexedDB not supported'));
  if (customBgDbPromise) return customBgDbPromise;
  customBgDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('constellation-custom-bg-store', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('backgrounds')) {
        db.createObjectStore('backgrounds', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return customBgDbPromise;
}

async function saveCustomBgToDb(src) {
  try {
    const db = await openCustomBgDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('backgrounds', 'readwrite');
      tx.objectStore('backgrounds').put({ id: 'active', src, updated: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    try { LS.set('lyr_custom_bg', src); } catch (e) {}
  }
}

async function getCustomBgFromDb() {
  try {
    const db = await openCustomBgDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('backgrounds', 'readonly');
      const req = tx.objectStore('backgrounds').get('active');
      req.onsuccess = () => resolve(req.result ? req.result.src : null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return LS.get('lyr_custom_bg') || null;
  }
}

async function clearCustomBgFromDb() {
  try {
    const db = await openCustomBgDb();
    const tx = db.transaction('backgrounds', 'readwrite');
    tx.objectStore('backgrounds').delete('active');
  } catch (err) {}
  try { LS.del('lyr_custom_bg'); } catch (e) {}
  R.setCustomBg(null);
}

function updateCustomBgPreview(src) {
  const thumb = document.getElementById('custom-bg-thumb');
  const wrap = document.getElementById('custom-bg-preview-wrap');
  if (thumb && wrap) {
    if (src) {
      thumb.src = src;
      wrap.style.display = 'block';
    } else {
      thumb.src = '';
      wrap.style.display = 'none';
    }
  }
}

async function initCustomBg() {
  const src = await getCustomBgFromDb();
  if (src) {
    R.setCustomBg(src);
    updateCustomBgPreview(src);
  }
}
initCustomBg();

function openAudioDb() {
  if (!window.indexedDB) return Promise.reject(new Error('This browser does not support saved MP3s. Open the app in Chrome, Edge, or Firefox.'));
  if (audioDbPromise) return audioDbPromise;
  audioDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('constellation-audio-library', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error('Could not open the local MP3 library.'));
    request.onblocked = () => reject(new Error('The MP3 library is busy in another tab. Close other app tabs and try again.'));
  }).catch((error) => {
    audioDbPromise = null;
    throw error;
  });
  return audioDbPromise;
}

function dbRead(storeName, id) {
  return openAudioDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Could not read the saved MP3 library.'));
    tx.onabort = () => reject(tx.error || new Error('Could not read the saved MP3 library.'));
  }));
}

async function refreshSavedTracks() {
  const db = await openAudioDb();
  savedTracks = await new Promise((resolve, reject) => {
    const tx = db.transaction('metadata', 'readonly');
    const request = tx.objectStore('metadata').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Could not list saved MP3s.'));
    tx.onabort = () => reject(tx.error || new Error('Could not list saved MP3s.'));
  });
  savedTracks.sort((a, b) => a.added - b.added);
  renderMp3Libraries();
}

function displayTrackName(filename) {
  const name = filename.replace(/\.mp3$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = name.split(/\s[-–—]\s/);
  return parts.length > 1
    ? { title: parts.slice(1).join(' - '), artist: parts[0] }
    : { title: name || 'Untitled MP3', artist: 'Your music' };
}

async function importMp3(files) {
  const selected = Array.from(files || []);
  if (!selected.length) return;
  const unsupported = selected.filter((file) => !/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg');
  if (unsupported.length) {
    flashStatus('Please choose MP3 files. Other audio formats are not supported.', 6000);
    return;
  }
  try {
    const db = await openAudioDb();
    const entries = selected.map((file) => {
      const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      const name = displayTrackName(file.name);
      return {
        audio: { id, blob: file },
        metadata: { id, filename: file.name, title: name.title, artist: name.artist, size: file.size, added: Date.now() },
      };
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['audio', 'metadata'], 'readwrite');
      const audioStore = tx.objectStore('audio'), metadataStore = tx.objectStore('metadata');
      entries.forEach((entry) => {
        audioStore.put(entry.audio);
        metadataStore.put(entry.metadata);
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('The browser could not save these MP3 files.'));
      tx.onabort = () => reject(tx.error || new Error('The browser could not save these MP3 files.'));
    });
    await refreshSavedTracks();
    flashStatus(selected.length === 1 ? 'MP3 saved in this browser.' : selected.length + ' MP3s saved in this browser.', 4000);
    playLocalTrack(entries[0].metadata.id);
  } catch (error) {
    console.error(error);
    flashStatus(error.message || 'Could not save the MP3 files. Check available browser storage and try again.', 7000);
  }
}

function renderMp3Libraries() {
  ['#mp3-gate-library', '#mp3-panel-library'].forEach((selector) => {
    const container = $(selector);
    if (!container) return;
    container.replaceChildren();
    if (!savedTracks.length) {
      container.append(el('p', 'mp3-empty', 'No saved songs yet.'));
      return;
    }
    savedTracks.forEach((track) => {
      const row = el('div', 'mp3-row');
      const play = el('button', 'mp3-song', track.title);
      play.type = 'button';
      play.title = 'Play ' + track.title;
      play.setAttribute('aria-label', 'Play ' + track.title + ' by ' + track.artist);
      play.append(el('small', null, track.artist));
      play.addEventListener('click', () => playLocalTrack(track.id));
      const remove = el('button', 'mp3-remove', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove ' + track.title + ' from saved songs');
      remove.addEventListener('click', () => removeSavedTrack(track.id));
      row.append(play, remove);
      container.append(row);
    });
  });
}

async function playLocalTrack(id) {
  const loadId = ++localLoadId;
  try {
    const record = await dbRead('audio', id);
    if (loadId !== localLoadId) return;
    if (!record || !record.blob) throw new Error('This saved MP3 is missing. Remove it and add the file again.');
    if (youtubePlayer && typeof youtubePlayer.pauseVideo === 'function') youtubePlayer.pauseVideo();
    localAudio.pause();
    if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    localAudioUrl = URL.createObjectURL(record.blob);
    localAudio.src = localAudioUrl;
    const metadata = savedTracks.find((track) => track.id === id);
    if (!metadata) throw new Error('This MP3 is no longer in the saved library. Refresh and try again.');
    state.mode = 'local';
    state.track = {
      id: 'local-' + id, title: metadata.title, artist: metadata.artist,
      primaryArtist: metadata.artist, album: '', duration: 0, art: '',
    };
    state.lines = null;
    state.lyricsStatus = 'Loading song details…';
    state.anchor = { pos: 0, at: performance.now(), playing: false };
    $('#youtube-shell').hidden = true;
    $('#local-player').hidden = false;
    $('#local-player-title').textContent = metadata.title + ' · ' + metadata.artist;
    hideGate();
    updateNowPlaying();
    localAudio.load();
    const playback = localAudio.play();
    if (playback && playback.catch) playback.catch((error) => {
      if (state.mode === 'local' && state.track && state.track.id === 'local-' + id) {
        flashStatus('The MP3 was loaded but could not start playing. Press Play in the player.', 6000);
        console.warn(error);
      }
    });
  } catch (error) {
    console.error(error);
    flashStatus(error.message || 'Could not play this saved MP3.', 7000);
  }
}

async function removeSavedTrack(id) {
  try {
    const db = await openAudioDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['audio', 'metadata'], 'readwrite');
      tx.objectStore('audio').delete(id);
      tx.objectStore('metadata').delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not remove the saved MP3.'));
      tx.onabort = () => reject(tx.error || new Error('Could not remove the saved MP3.'));
    });
    if (state.track && state.track.id === 'local-' + id) stopLocalPlayback();
    await refreshSavedTracks();
    flashStatus('Song removed from this browser.', 3000);
  } catch (error) {
    console.error(error);
    flashStatus(error.message || 'Could not remove this MP3.', 7000);
  }
}

function stopLocalPlayback() {
  localLoadId++;
  releaseLocalAudio();
  if (state.mode === 'local') {
    state.mode = 'gate';
    state.track = null;
    state.lines = null;
    state.anchor = { pos: 0, at: performance.now(), playing: false };
    showGate();
  }
}

function releaseLocalAudio() {
  if (Beat.source === 'element') Beat.stop();
  localAudio.pause();
  localAudio.removeAttribute('src');
  localAudio.load();
  if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
  localAudioUrl = '';
  $('#local-player').hidden = true;
}

function saveSettings() {
  LS.set('lyr_settings', JSON.stringify(S));
  try {
    const q = new URLSearchParams({ style: S.style, pal: S.pal, bg: S.bg, design: S.design, mood: S.mood, cursor: S.cursor, lyricFont: S.lyricFont, beatVisual: S.beatVisual.join(','), beatShake: S.beatShake, beatZoom: S.beatZoom, aggressiveZoom: S.aggressiveZoom, beatRandom: S.beatRandom, beatFlash: S.beatFlash, aggressiveShake: S.aggressiveShake, aggressiveFlash: S.aggressiveFlash, size: S.size, glow: S.glow, motion: S.motion, sens: S.sens, ringSize: S.ringSize, radialSize: S.radialSize });
    history.replaceState(null, '', '#' + q);
  } catch (e) { /* ignore */ }
}
readHash();
validate();
syncCursorDesign();
Pal.set(S.pal);
Beat.sens = S.sens;
Beat.randomize = S.beatRandom;
document.body.classList.add('gate');

/* ------------------------------------------------------------------ *
 *  Spotify auth (Authorization Code + PKCE, no backend needed)
 * ------------------------------------------------------------------ */
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function randomString(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a).slice(0, n);
}

async function login() {
  const verifier = randomString(96);
  const oauthState = randomString(32);
  SS.set('pkce_verifier', verifier);
  SS.set('oauth_state', oauthState);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const params = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPES,
    code_challenge_method: 'S256', code_challenge: challenge, state: oauthState,
  });
  location.href = 'https://accounts.spotify.com/authorize?' + params;
}

async function tokenRequest(body) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!r.ok) {
    let detail = '';
    try {
      const error = await r.json();
      detail = error.error_description || error.error || '';
    } catch (e) { /* response may not be JSON */ }
    throw new Error(detail || 'Spotify sign-in was not accepted (HTTP ' + r.status + ').');
  }
  const j = await r.json();
  SS.set('sp_access', j.access_token);
  SS.set('sp_expires', String(Date.now() + (j.expires_in - 30) * 1000));
  if (j.refresh_token) SS.set('sp_refresh', j.refresh_token);
}

async function handleCallback() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return;
  const keepHash = location.hash;
  history.replaceState({}, '', REDIRECT + keepHash);
  if (q.get('error')) {
    SS.del('oauth_state');
    SS.del('pkce_verifier');
    const detail = (q.get('error_description') || q.get('error') || '').toLowerCase();
    if (/redirect.?uri|invalid_request/.test(detail)) {
      flashStatus('Spotify rejected this redirect address. Copy the exact URI shown below Connect Spotify and add it to your app’s Redirect URIs in Spotify Developer Dashboard.', 10000);
    } else {
      flashStatus(q.get('error') === 'access_denied' ? 'Spotify login was cancelled.' : 'Spotify could not sign in. Check your app settings and try again.', 6000);
    }
    return;
  }
  const expectedState = SS.get('oauth_state');
  const verifier = SS.get('pkce_verifier');
  SS.del('oauth_state');
  SS.del('pkce_verifier');
  if (!expectedState || q.get('state') !== expectedState) {
      flashStatus('Spotify sign-in could not be verified. Please try again.', 6000);
      return;
  }
  try {
      await tokenRequest({
      client_id: CLIENT_ID, grant_type: 'authorization_code', code: q.get('code'),
        redirect_uri: REDIRECT, code_verifier: verifier || '',
    });
  } catch (e) {
    console.warn(e);
    flashStatus('Spotify could not finish connecting. Check that the Client ID and Redirect URI match your Spotify app, then try again.', 9000);
  }
}

async function getToken() {
  const exp = parseInt(SS.get('sp_expires') || '0', 10);
  const at = SS.get('sp_access');
  if (at && Date.now() < exp) return at;
  const rt = SS.get('sp_refresh');
  if (!rt) return null;
  try {
    await tokenRequest({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: rt });
    return SS.get('sp_access');
  } catch (e) {
    logout();
    return null;
  }
}

function logout() { ['sp_access', 'sp_expires', 'sp_refresh', 'pkce_verifier', 'oauth_state'].forEach(SS.del); }

/* ------------------------------------------------------------------ *
 *  Now playing (polls Spotify, interpolates progress between polls)
 * ------------------------------------------------------------------ */
function currentPos() {
  if (state.mode === 'youtube' && youtubePlayer && youtubePlayer.getCurrentTime) {
    return youtubePlayer.getCurrentTime() * 1000;
  }
  if (state.mode === 'local' && localAudio) return localAudio.currentTime * 1000;
  const a = state.anchor;
  const now = performance.now();
  const base = a.playing ? a.pos + (now - a.at) : a.pos;
  if (!a.correction || !a.correctionDuration) return base;
  const progress = clamp((now - a.correctionAt) / a.correctionDuration);
  const eased = progress * progress * (3 - 2 * progress);
  return base + a.correction * eased;
}

let pollTimer = 0;
let youtubePlayer = null;
let youtubeApiPromise = null;
let youtubePendingVideoId = '';
let youtubeCurrentVideoId = '';

function parseYoutubeVideoId(value) {
  const raw = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtube-nocookie.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const id = url.pathname === '/watch' ? url.searchParams.get('v') :
      ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch (e) {
    return null;
  }
}

function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;
  let apiTimeout;
  const pending = new Promise((resolve, reject) => {
    apiTimeout = setTimeout(() => {
      youtubeApiPromise = null;
      reject(new Error('YouTube is taking too long to load. Check your internet connection and try again.'));
    }, 12000);
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      youtubeApiPromise = null;
      reject(new Error('Could not load the YouTube player. Check your connection and try again.'));
    };
    script.onload = () => {
      if (window.YT && window.YT.Player) resolve();
    };
    document.head.append(script);
  });
  youtubeApiPromise = pending;
  pending.then(() => clearTimeout(apiTimeout), () => clearTimeout(apiTimeout));
  return pending;
}

function updateYoutubeTrack() {
  if (!youtubePlayer || state.mode !== 'youtube') return;
  const video = youtubePlayer.getVideoData();
  if (!video || !video.video_id || !video.title) return;
  const parsed = parseYoutubeTrackTitle(video.title);
  const track = {
    id: video.video_id,
    title: parsed.title,
    artist: parsed.artist || 'YouTube',
    primaryArtist: parsed.artist,
    lyricsTitleCandidates: parsed.titleCandidates,
    lyricsArtistCandidates: parsed.artist ? [parsed.artist] : [],
    album: '',
    duration: Math.round((youtubePlayer.getDuration() || 0) * 1000),
    art: 'https://i.ytimg.com/vi/' + encodeURIComponent(video.video_id) + '/hqdefault.jpg',
  };
  if (!state.track || state.track.id !== track.id || (track.duration > state.track.duration && (!state.lines || !state.lines.length))) setTrack(track);
}

function startYoutubePlayer(videoId) {
  youtubeCurrentVideoId = videoId;
  releaseLocalAudio();
  state.mode = 'youtube';
  state.track = null;
  state.lines = null;
  state.lyricsStatus = 'Loading video…';
  clearTimeout(pollTimer);
  $('#youtube-shell').hidden = false;
  $('#youtube-shell').classList.remove('has-youtube-error');
  $('#youtube-fallback').hidden = true;
  const externalLink = $('#youtube-external');
  externalLink.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId);
  hideGate();
  updateNowPlaying();
  if (youtubePlayer) {
    if (typeof youtubePlayer.loadVideoById === 'function') youtubePlayer.loadVideoById(videoId);
    else youtubePendingVideoId = videoId;
    return;
  }
  youtubePendingVideoId = videoId;
  youtubePlayer = new window.YT.Player('youtube-player', {
    host: 'https://www.youtube-nocookie.com',
    width: '100%',
    height: '100%',
    videoId,
    playerVars: { autoplay: 1, controls: 1, playsinline: 1, rel: 0, origin: location.origin },
    events: {
      onReady: (event) => {
        youtubePlayer = event.target;
        const requestedVideoId = youtubePendingVideoId;
        youtubePendingVideoId = '';
        if (state.mode !== 'youtube' && typeof youtubePlayer.pauseVideo === 'function') youtubePlayer.pauseVideo();
        else if (state.mode === 'youtube' && requestedVideoId && youtubePlayer.getVideoData().video_id !== requestedVideoId) youtubePlayer.loadVideoById(requestedVideoId);
        if (state.mode === 'youtube') {
          updateYoutubeTrack();
          state.anchor = { pos: youtubePlayer.getCurrentTime() * 1000, at: performance.now(), playing: false };
          flashStatus('Video ready. Press Play in the video to start the song.', 6000);
        }
      },
      onStateChange: (event) => {
        if (event.data === window.YT.PlayerState.PLAYING) {
          state.lyricsStatus = '';
          updateYoutubeTrack();
          state.anchor = { pos: youtubePlayer.getCurrentTime() * 1000, at: performance.now(), playing: true };
          wake();
          keepAwake();
        } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
          if (youtubePlayer) state.anchor = { pos: youtubePlayer.getCurrentTime() * 1000, at: performance.now(), playing: false };
        }
      },
      onError: (event) => {
        const failedVideoId = youtubePlayer && youtubePlayer.getVideoData && youtubePlayer.getVideoData().video_id;
        if (state.mode === 'youtube' && (!failedVideoId || failedVideoId === youtubeCurrentVideoId)) {
          const shell = $('#youtube-shell');
          const fallback = $('#youtube-fallback');
          state.lyricsStatus = '';
          clearTimeout(statusTimer);
          statusEl.classList.remove('show');
          statusEl.textContent = '';
          shell.classList.add('has-youtube-error');
          fallback.querySelector('strong').textContent = 'This video cannot play in the app';
          fallback.querySelector('p').textContent = 'It may be unavailable or block embedded playback. Open it on YouTube or choose another video.';
          fallback.hidden = false;
        }
      },
      onAutoplayBlocked: () => {
        if (state.mode === 'youtube') flashStatus('Your browser blocked autoplay. Press Play in the video to start.', 6000);
      },
    },
  });
}

async function connectYoutube(value) {
  const videoId = parseYoutubeVideoId(value);
  if (!videoId) {
    const query = value.trim();
    if (!query) {
      flashStatus('Type a song name, or paste a YouTube video link.', 5000);
      $('#youtube-url').focus();
      return;
    }
    if (/^(https?:\/\/|www\.)/i.test(query) || /(?:youtube\.com|youtu\.be)/i.test(query)) {
      flashStatus('That YouTube link does not look right. Copy the full video link and try again.', 6000);
      $('#youtube-url').focus();
      return;
    }
    const searchUrl = 'https://www.youtube.com/results?' + new URLSearchParams({ search_query: query });
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
    flashStatus('Choose a video on YouTube, copy its link, then paste it here and press Find / Play.', 8000);
    return;
  }
  try {
    $('#youtube-connect').disabled = true;
    await loadYouTubeAPI();
    startYoutubePlayer(videoId);
  } catch (e) {
    flashStatus(e.message || 'Could not connect to YouTube.', 5000);
  } finally {
    $('#youtube-connect').disabled = false;
  }
}

async function connectSpotify() {
  const button = $('#connect');
  if (!CLIENT_ID) {
    $('#setup').hidden = false;
    flashStatus('Spotify needs a one-time app setup. See the instructions below.', 6000);
    return;
  }
  if (!window.isSecureContext || !crypto.subtle) {
    flashStatus('Spotify sign-in needs a secure site (HTTPS) or this computer’s local address (127.0.0.1).', 7000);
    return;
  }
  try {
    button.disabled = true;
    button.textContent = 'Opening Spotify…';
    await login();
  } catch (e) {
    console.warn(e);
    button.disabled = false;
    button.textContent = 'Connect Spotify';
    flashStatus('Spotify could not be opened. Check your internet connection and try again.', 6000);
  }
}
async function poll() {
  if (state.mode !== 'spotify') return;
  let delay = 2500;
  try {
    const token = await getToken();
    if (!token) { if (state.mode === 'spotify') showGate(); return; }
    const t0 = performance.now();
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=track', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      credentials: 'omit',
    });
    const rtt = performance.now() - t0;
    if (state.mode !== 'spotify') return;
    if (r.status === 204) setIdle('Spotify is connected. Start a song in Spotify to see it here.');
    else if (r.status === 401) { SS.del('sp_expires'); delay = 300; }
    else if (r.status === 403) setIdle('Spotify is connected, but playback details are not available. Check your account access and try again.');
    else if (r.status === 429) delay = (parseFloat(r.headers.get('retry-after')) || 5) * 1000;
    else if (r.ok) applyPlayback(await r.json(), rtt);
    else delay = 5000;
  } catch (e) {
    console.warn(e); delay = 5000;
  }
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, delay);
}

function setIdle(msg) {
  state.anchor.playing = false;
  if (state.track) { state.track = null; state.lines = null; updateNowPlaying(); }
  state.lyricsStatus = msg;
}

function applyPlayback(j, rtt) {
  const item = j && j.item;
  if (!item || j.currently_playing_type !== 'track') {
    setIdle(j && j.currently_playing_type === 'ad' ? 'Ad playing…' : 'Nothing is playing. Start a song in Spotify.');
    return;
  }
  const imgs = (item.album && item.album.images) || [];
  const track = {
    id: item.id || item.uri,
    title: item.name,
    artist: (item.artists || []).map((a) => a.name).join(', '),
    primaryArtist: item.artists && item.artists[0] ? item.artists[0].name : '',
    album: item.album ? item.album.name : '',
    duration: item.duration_ms,
    art: (imgs[1] || imgs[0] || {}).url || '',
  };
  const changed = !state.track || state.track.id !== track.id;
  const now = performance.now();
  const pos = j.progress_ms + (j.is_playing ? rtt / 2 : 0);
  const predicted = currentPos();
  const error = pos - predicted;
  if (changed || state.anchor.playing !== !!j.is_playing || Math.abs(error) > 1500) {
    state.anchor = { pos, at: now, playing: !!j.is_playing };
  } else {
    state.anchor = {
      pos: predicted,
      at: now,
      playing: !!j.is_playing,
      correction: error,
      correctionAt: now,
      correctionDuration: clamp(400 + Math.abs(error) * 0.35, 400, 900),
    };
  }
  if (changed) setTrack(track);
}

function setTrack(track) {
  state.track = track;
  state.lines = null;
  state.lyricsStatus = '';
  updateNowPlaying();
  loadLyrics(track);
  extractAlbumColor(track.art, track.id);
}

/* Pull a dominant, vivid hue from the cover art for the "Album" palette */
function extractAlbumColor(url, id) {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      if (!state.track || state.track.id !== id) return;
      const c = document.createElement('canvas');
      c.width = c.height = 24;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 24, 24);
      const d = g.getImageData(0, 0, 24, 24).data;
      let sx = 0, sy = 0, sw = 0, ss = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, dl = mx - mn;
        if (dl < 0.08 || l < 0.1 || l > 0.92) continue;
        const s = dl / (1 - Math.abs(2 * l - 1));
        let h = mx === r ? ((gg - b) / dl) % 6 : mx === gg ? (b - r) / dl + 2 : (r - gg) / dl + 4;
        h *= 60; if (h < 0) h += 360;
        const w = s * (1 - Math.abs(2 * l - 1)) + 0.05;
        sx += Math.cos(h * Math.PI / 180) * w; sy += Math.sin(h * Math.PI / 180) * w; sw += w; ss += s * w;
      }
      if (sw > 0.5) { Pal.setAlbum(((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360, ss / sw); applyAccent(); }
    } catch (e) { /* tainted canvas: keep the default palette */ }
  };
  img.src = url;
}

/* ------------------------------------------------------------------ *
 *  Lyrics (synced .lrc from LRCLIB, a free open lyrics database)
 * ------------------------------------------------------------------ */
const lyricsCache = new Map();
let lyricsController = null;

function cleanTitle(t) {
  return t
    .replace(/^\s*(?:lyrics?|lyric video|official audio|official video|official music video|music video|visuali[sz]er)\s*$/i, '')
    .replace(/\s*[\[(](?:official\b|lyrics?\b|lyric video\b|audio\b|music video\b|visuali[sz]er\b|hd\b|4k\b)[^\])]*[\])]/gi, '')
    .replace(/\s*[-–—|]\s*(remaster(ed)?|live|mono|stereo|single|radio|deluxe|bonus|version|edit|official|lyrics?|audio|music video|visuali[sz]er).*$/i, '')
    .replace(/\s*[\(\[](feat|ft|with|remaster|live|deluxe|bonus|from|official|lyrics?|audio|music video|visuali[sz]er)[^\)\]]*[\)\]]/gi, '')
    .trim();
}

function parseYoutubeTrackTitle(raw) {
  const parts = raw.split(/\s+(?:[-–—|]|•)\s+/).map((part) => part.trim()).filter(Boolean);
  const marker = /\b(?:lyrics?|lyric video|official audio|official video|official music video|music video|visuali[sz]er)\b/i;
  const markerIndex = parts.findIndex((part) => marker.test(part));
  const titleCandidates = [];
  let title = '';
  let artist = '';
  if (markerIndex >= 0) {
    const markerPart = parts[markerIndex];
    const cleanMarkerPart = cleanTitle(markerPart);
    const hasOfficialTag = /\bofficial\b/i.test(markerPart);
    if (cleanMarkerPart && hasOfficialTag && markerIndex === 0 && parts.length > 1) {
      artist = cleanMarkerPart;
      title = cleanTitle(parts.slice(1).join(' '));
    } else if (cleanMarkerPart) {
      title = cleanMarkerPart;
      artist = cleanTitle(parts.slice(markerIndex + 1).join(' '));
      if (markerIndex > 0) artist = cleanTitle(parts.slice(0, markerIndex).join(' '));
    } else if (markerIndex === parts.length - 1 && markerIndex > 0) {
      title = cleanTitle(parts[markerIndex - 1]);
      artist = cleanTitle(parts.slice(0, markerIndex - 1).join(' '));
    } else {
      title = cleanTitle(parts.slice(0, markerIndex).join(' '));
      artist = cleanTitle(parts.slice(markerIndex + 1).join(' '));
    }
  } else if (parts.length > 1) {
    artist = cleanTitle(parts[0]);
    title = cleanTitle(parts.slice(1).join(' '));
  } else {
    title = cleanTitle(raw);
  }
  if (title) titleCandidates.push(title);
  if (markerIndex < 0 && parts.length > 1) {
    const first = cleanTitle(parts[0]);
    if (first && !titleCandidates.includes(first)) titleCandidates.push(first);
  }
  return { title: title || cleanTitle(raw) || raw.trim(), artist, titleCandidates };
}

async function fetchLyricsData(track, signal) {
  const dur = Math.round(track.duration / 1000);
  const titles = [...new Set([track.title, ...(track.lyricsTitleCandidates || [])].map(cleanTitle).filter(Boolean))];
  const artists = [...new Set([track.primaryArtist, ...(track.lyricsArtistCandidates || [])].map((x) => (x || '').trim()).filter(Boolean))];
  const exactParams = new URLSearchParams({ track_name: titles[0] || track.title, duration: String(dur) });
  if (artists[0]) exactParams.set('artist_name', artists[0]);
  if (track.album) exactParams.set('album_name', track.album);
  const exactResponse = await fetch('https://lrclib.net/api/get?' + exactParams, { signal, credentials: 'omit' });
  if (exactResponse.ok) {
    const exact = await exactResponse.json();
    if (exact && (exact.syncedLyrics || exact.plainLyrics)) return { text: exact.syncedLyrics || exact.plainLyrics, synced: !!exact.syncedLyrics };
  } else if (exactResponse.status !== 404) throw new Error('Lyrics service request failed (HTTP ' + exactResponse.status + ').');

  const queries = [];
  titles.forEach((title) => {
    artists.slice(0, 2).forEach((artist) => queries.push({ title, artist }));
    queries.push({ title, artist: '' });
  });
  const seen = new Set();
  const matches = [];
  for (const query of queries) {
    const key = query.title.toLowerCase() + '|' + query.artist.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const params = new URLSearchParams({ track_name: query.title });
    if (query.artist) params.set('artist_name', query.artist);
    const response = await fetch('https://lrclib.net/api/search?' + params, { signal, credentials: 'omit' });
    if (!response.ok) throw new Error('Lyrics service request failed (HTTP ' + response.status + ').');
    const list = await response.json();
    if (!Array.isArray(list)) continue;
    list.forEach((item) => {
      if (!item || !(item.syncedLyrics || item.plainLyrics)) return;
      const resultTitle = cleanTitle(item.trackName || '').toLowerCase();
      const wantedTitle = query.title.toLowerCase();
      if (!resultTitle || (resultTitle !== wantedTitle && !resultTitle.includes(wantedTitle) && !wantedTitle.includes(resultTitle))) return;
      const durationGap = Math.abs((Number(item.duration) || 0) - dur);
      const resultArtist = (item.artistName || '').toLowerCase();
      const artistMatch = query.artist && resultArtist.includes(query.artist.toLowerCase());
      if (dur > 0 && durationGap > (artistMatch && resultTitle === wantedTitle ? 60 : 20)) return;
      const titleMatch = resultTitle === wantedTitle ? 100 : 65;
      matches.push({ item, score: titleMatch + (artistMatch ? 20 : 0) - durationGap });
    });
  }
  matches.sort((a, b) => b.score - a.score);
  const best = matches[0] && matches[0].item;
  return best ? { text: best.syncedLyrics || best.plainLyrics, synced: !!best.syncedLyrics } : null;
}

async function loadLyrics(track) {
  if (lyricsController) lyricsController.abort();
  const controller = new AbortController();
  lyricsController = controller;
  const id = track.id;
  try {
    let data = lyricsCache.get(id);
    if (data === undefined) { data = await fetchLyricsData(track, controller.signal); lyricsCache.set(id, data); }
    if (!state.track || state.track.id !== id) return;
    const raw = data ? (data.synced ? parseLRC(data.text) : buildEstimatedLyrics(data.text, track.duration)) : [];
    const lines = raw.length ? buildLines(raw, track.duration) : [];
    if (!lines.some((l) => l.words.length)) { state.lines = []; state.lyricsStatus = 'No lyrics found for this song. Beat visuals still work when audio sync is on.'; return; }
    state.lines = lines;
    state.lyricsStatus = data.synced ? '' : 'Lyrics found; timing is estimated.';
    if (!data.synced) flashStatus('Lyrics found, but synced timing is unavailable. Line timing is estimated.', 6000);
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.warn(e);
    if (state.track && state.track.id === id) {
      state.lines = [];
      state.lyricsStatus = e.name === 'TypeError' ? 'Could not load lyrics (offline?).' : e.message || 'Could not load lyrics.';
    }
  } finally {
    if (lyricsController === controller) lyricsController = null;
  }
}

function buildEstimatedLyrics(text, durationMs) {
  const rows = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[^\]]+\]$/.test(line));
  if (!rows.length) return [];
  const duration = Math.max(1, durationMs / 1000);
  const start = Math.min(2, duration * 0.04);
  const span = Math.max(0.5, duration - start - Math.min(2, duration * 0.04));
  const weights = rows.map((line) => Math.max(1, line.length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = 0;
  return rows.map((line, index) => {
    const t = start + span * elapsed / total;
    elapsed += weights[index];
    return { t, text: line };
  });
}

function parseLRC(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const txt = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) out.push({ t: +m[1] * 60 + +m[2], text: txt });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function estimateSyllables(word) {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!letters) return 1;
  const groups = letters.match(/[aeiouy]+/g) || [];
  let count = groups.length;
  if (letters.length > 2 && /e$/.test(letters) && !/le$/.test(letters)) count--;
  if (/[^aeiouy]le$/.test(letters)) count++;
  return Math.max(1, count);
}

/* Timed lines -> words with times + a star position for each word (used by the constellation). */
function buildLines(raw, durationMs) {
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    const { t, text } = raw[i];
    const next = raw[i + 1];
    const end = next ? Math.max(t, next.t) : Math.min(durationMs / 1000, t + 6);
    const ws = text.split(/\s+/).filter(Boolean);
    const line = { t, end, text, words: [], pts: [], links: [] };
    if (ws.length) {
      const span = Math.max(0, Math.min(end - t, 7) - 0.08) * 0.92;
      const weights = ws.map(estimateSyllables);
      const total = weights.reduce((a, b) => a + b, 0);
      let acc = 0;
      ws.forEach((w, k) => { line.words.push({ text: w, t: t + span * (acc / total) }); acc += weights[k]; });
      layoutLine(line, i);
    }
    lines.push(line);
  }
  return lines;
}

function layoutLine(line, idx) {
  const rng = mulberry32(hashStr(line.text) + idx * 7919);
  const n = line.words.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    if (n === 1) { pts.push([0.5, 0.5]); break; }
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < 28; k++) {
      const x = lerp(0.04, 0.96, (i + 0.1 + rng() * 0.8) / n);
      const y = 0.08 + rng() * 0.84;
      let minD = 9;
      for (let j = Math.max(0, i - 4); j < i; j++) {
        const d = Math.hypot((x - pts[j][0]) * 2.4, y - pts[j][1]);
        if (d < minD) minD = d;
      }
      const dy = i > 0 ? Math.abs(y - pts[i - 1][1]) : 0.3;
      const score = Math.min(minD, 0.5) + 0.7 * Math.min(dy, 0.5) + rng() * 0.05;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    pts.push(best);
  }
  const links = [];
  for (let i = 1; i < n; i++) {
    links.push([i - 1, i]);
    if (i >= 2 && rng() < 0.5) links.push([i - 1 - Math.floor(rng() * Math.min(i - 1, 4)), i]);
    if (i >= 4 && rng() < 0.2) links.push([Math.floor(rng() * (i - 2)), i]);
  }
  line.pts = pts;
  line.links = links;
}

/* ------------------------------------------------------------------ *
 *  Demo mode (original text + simulated beat, no Spotify needed)
 * ------------------------------------------------------------------ */
const DEMO_LEN = 42000;
function startDemo() {
  if (youtubePlayer && typeof youtubePlayer.pauseVideo === 'function') youtubePlayer.pauseVideo();
  releaseLocalAudio();
  youtubePendingVideoId = '';
  statusEl.classList.remove('show');
  statusEl.textContent = '';
  $('#youtube-shell').hidden = true;
  state.mode = 'demo';
  clearTimeout(pollTimer);
  hideGate();
  const demo = [
    [2.0, 'the city hums a quiet tune tonight'],
    [6.5, 'every window is a little star'],
    [11.0, 'i trace the lines between us in the dark'],
    [15.5, 'and every word becomes a light'],
    [20.0, 'we are constellations, loosely held'],
    [25.0, 'scattered but still somehow connected'],
    [30.0, 'hold on to this one moment'],
    [34.0, 'before the morning comes'],
  ].map(([t, text]) => ({ t, text }));
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#2b2412'); grad.addColorStop(1, '#8d7a45');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f3e3b8'; g.beginPath();
  g.moveTo(64, 24); g.quadraticCurveTo(64, 64, 104, 64); g.quadraticCurveTo(64, 64, 64, 104);
  g.quadraticCurveTo(64, 64, 24, 64); g.quadraticCurveTo(64, 64, 64, 24); g.fill();
  state.track = { id: 'demo', title: 'Demo Song', artist: 'Constellation Lyrics', duration: DEMO_LEN, art: c.toDataURL() };
  state.lines = buildLines(demo, DEMO_LEN);
  state.anchor = { pos: 0, at: performance.now(), playing: true };
  if (Beat.source === 'off') Beat.startSim(100);
  updateNowPlaying();
  syncPanel();
}

/* ------------------------------------------------------------------ *
 *  UI
 * ------------------------------------------------------------------ */
const gate = $('#gate'), statusEl = $('#status'), panel = $('#panel');
let statusTimer = 0;

function showGate() {
  if (youtubePlayer && typeof youtubePlayer.pauseVideo === 'function') youtubePlayer.pauseVideo();
  releaseLocalAudio();
  youtubePendingVideoId = '';
  $('#youtube-shell').hidden = true;
  state.mode = 'gate';
  document.title = 'Constellation Lyrics';
  document.body.classList.add('gate');
  gate.classList.remove('hide');
  $('#np').hidden = true;
  document.body.classList.remove('panel-open');
  syncPanel();
}
function hideGate() { gate.classList.add('hide'); document.body.classList.remove('gate'); }
function flashStatus(msg, ms) {
  statusEl.textContent = msg; statusEl.classList.add('show');
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => statusEl.classList.remove('show'), ms);
}

function updateNowPlaying() {
  const np = $('#np');
  if (!state.track) { np.hidden = true; document.title = 'Constellation Lyrics'; return; }
  np.hidden = false;
  $('#title').textContent = state.track.title;
  $('#artist').textContent = state.track.artist;
  const art = $('#art');
  if (state.track.art) { art.referrerPolicy = 'no-referrer'; art.src = state.track.art; art.style.visibility = 'visible'; } else { art.style.visibility = 'hidden'; }
  document.title = `${state.track.title} · ${state.track.artist}`;
}

function setOffset(ms) {
  state.offsetMs = clamp(ms, -5000, 5000);
  LS.set('lyr_offset', String(state.offsetMs));
  syncPanel();
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function setPanel(open) {
  document.body.classList.toggle('panel-open', open);
  panel.setAttribute('aria-hidden', String(!open));
  $('#cust').setAttribute('aria-expanded', String(open));
  if (open) wake();
}

function setS(key, val) {
  S[key] = val;
  if (key === 'style' || key === 'pal' || key === 'bg') { S.design = 'custom'; S.mood = 'custom'; }
  if (key === 'style' || key === 'pal' || key === 'bg' || key === 'design') syncCursorDesign();
  if (key === 'pal') Pal.set(val);
  if (key === 'sens') Beat.sens = val;
  if (key === 'beatRandom') Beat.randomize = val;
  saveSettings();
  applyAccent();
  syncPanel();
}

function applyDesign(id) {
  const design = DESIGN_ROWS.find((item) => item.id === id);
  if (!design) return;
  S.style = design.style;
  S.pal = design.pal;
  S.bg = design.bg;
  S.design = design.id;
  S.mood = 'custom';
  syncCursorDesign();
  Pal.set(S.pal);
  saveSettings();
  applyAccent();
  syncPanel();
}

function applyMood(id) {
  const mood = MOODS.find((item) => item[0] === id);
  if (!mood) return;
  S.mood = mood[0];
  S.style = mood[2];
  S.pal = mood[3];
  S.bg = mood[4];
  if (mood[6]) S.beatVisual = mood[6].slice();
  if (id === 'japanesePhonk') {
    S.lyricFont = 'delaGothicOne';
    S.linePos = 'bottom';
    S.beatShake = 0.65;
    S.aggressiveShake = true;
    S.beatFlash = true;
  } else if (id === 'phonk') {
    S.lyricFont = 'syne';
    S.linePos = 'bottom';
    S.beatShake = 0.75;
    S.aggressiveShake = true;
  }
  S.design = 'custom';
  syncCursorDesign();
  Pal.set(S.pal);
  saveSettings();
  applyAccent();
  syncPanel();
}

function applyAccent() {
  const p = Pal.cur;
  const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const r = document.documentElement.style;
  r.setProperty('--acc', css(p.a));
  r.setProperty('--acc-2', css(p.b));
  r.setProperty('--cream', css(p.a));
  r.setProperty('--cream-dim', `rgba(${p.a.map((x) => x | 0).join(',')},0.62)`);
  r.setProperty('--line', `rgba(${p.a.map((x) => x | 0).join(',')},0.2)`);
  document.body.classList.toggle('nocard', !S.card);
}

function shuffleDesign() {
  const designs = DESIGN_ROWS.filter((design) => design.id !== S.design);
  applyDesign(designs[Math.floor(Math.random() * designs.length)].id);
}

/* ---- customize panel (built once, synced on change) ---- */
const refs = { chips: {}, sw: {}, sliders: {}, designs: [], moods: [] };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function section(title, open) {
  const s = el('details', 'panel-section');
  s.open = !!open;
  const summary = el('summary', 'panel-summary');
  summary.append(el('h3', null, title), el('span', 'section-chevron', '⌄'));
  s.append(summary);
  $('#pbody').append(s);
  return s;
}

function chipGroup(title, items, key) {
  const s = section(title), wrap = el('div', 'chips');
  refs.chips[key] = [];
  items.forEach(([id, label, icon]) => {
    const b = el('button', 'chip');
    b.type = 'button';
    if (key === 'lyricFont') b.style.fontFamily = LYRIC_FONTS.find((item) => item[0] === id)[2];
    if (icon) b.append(el('span', 'ic', icon));
    b.append(el('span', null, label));
    b.addEventListener('click', () => setS(key, id));
    wrap.append(b);
    refs.chips[key].push([id, b]);
  });
  s.append(wrap);
}

function multiChipGroup(title, items, key) {
  const s = section(title), wrap = el('div', 'chips');
  refs.chips[key] = [];
  items.forEach(([id, label, icon]) => {
    const b = el('button', 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    if (icon) b.append(el('span', 'ic', icon));
    b.append(el('span', null, label));
    b.addEventListener('click', () => {
      const selected = S[key].slice();
      if (id === 'off' || id === 'auto') {
        setS(key, selected.includes(id) ? DEFAULTS[key].slice() : [id]);
      } else {
        const next = selected.filter((item) => item !== 'off' && item !== 'auto');
        const toggled = next.includes(id) ? next.filter((item) => item !== id) : next.concat(id);
        setS(key, toggled.length ? toggled : DEFAULTS[key].slice());
      }
    });
    wrap.append(b);
    refs.chips[key].push([id, b]);
  });
  s.append(wrap, el('p', 'hint', key === 'beatVisual'
    ? 'Line visuals stay fixed, full-width, and near the center or bottom. Beat pulses can move independently.'
    : 'Choose any combination. Auto vibe and Off work alone.'));
}

function slider(parent, key, label, min, max, step, get, set, fmt) {
  const row = el('label', 'slider');
  const inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
  const out = el('output');
  inp.addEventListener('input', () => set(parseFloat(inp.value)));
  row.append(el('span', null, label), inp, out);
  parent.append(row);
  refs.sliders[key] = () => { const v = get(); inp.value = v; out.textContent = fmt(v); };
}

function toggle(parent, label, get, set) {
  const row = el('label', 'toggle');
  const inp = el('input'); inp.type = 'checkbox';
  inp.addEventListener('change', () => set(inp.checked));
  row.append(el('span', null, label), inp, el('span', 'tk'));
  parent.append(row);
  return () => { inp.checked = get(); };
}

let syncToggles = [];
let beatMsgEl, meterEl, beatBtns;
let designFilter = 'all';
let designCountEl;
let designSearch = '';
let designFilterButtons = [];

function filterDesignCards() {
  let visible = 0;
  refs.designs.forEach(([designId, card]) => {
    const design = DESIGN_ROWS.find((item) => item.id === designId);
    const matchesStyle = designFilter === 'all' || design.style === designFilter;
    const matchesSearch = !designSearch || design.name.toLowerCase().includes(designSearch) || design.style.includes(designSearch) || design.pal.includes(designSearch) || design.bg.includes(designSearch);
    card.hidden = !matchesStyle || !matchesSearch;
    if (!card.hidden) visible++;
  });
  if (designCountEl) designCountEl.textContent = visible + (visible === 1 ? ' look' : ' looks');
}

function buildPanel() {
  const moodSection = section('Moods', true);
  const moodIntro = el('p', 'hint', 'Each of the 60 designs has its own cursor trail. Moods have matching trails too.');
  const moodGrid = el('div', 'mood-grid');
  MOODS.forEach(([id, label, , , , cursorEffect]) => {
    const b = el('button', 'mood-chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    b.title = label + ' · ' + cursorEffect + ' cursor trail';
    const copy = el('span', 'mood-copy');
    copy.append(el('span', 'mood-label', label), el('small', 'mood-effect', cursorEffect + ' trail'));
    b.append(el('span', 'mood-swatch mood-' + id), copy);
    b.addEventListener('click', () => applyMood(id));
    moodGrid.append(b);
    refs.moods.push([id, b]);
  });
  moodSection.append(moodIntro, moodGrid);

  const ds = section('Designs', true);
  const designIntro = el('div', 'design-intro');
  designIntro.append(el('span', null, 'Find your atmosphere.'), el('span', 'design-count', '60 looks'));
  designCountEl = designIntro.lastChild;
  ds.append(designIntro);
  const searchInput = el('input', 'design-search');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search styles, colors, moods…';
  searchInput.setAttribute('aria-label', 'Search designs');
  searchInput.addEventListener('input', () => {
    designSearch = searchInput.value.trim().toLowerCase();
    filterDesignCards();
  });
  ds.append(searchInput);
  const filterRow = el('div', 'design-filters');
  [['all', 'All'], ...STYLES.map(([id, label]) => [id, label])].forEach(([id, label]) => {
    const b = el('button', 'filter-chip', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(id === designFilter));
    b.addEventListener('click', () => {
      designFilter = id;
      designFilterButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === b)));
      filterDesignCards();
    });
    designFilterButtons.push(b);
    filterRow.append(b);
  });
  ds.append(filterRow);
  const designGrid = el('div', 'design-grid');
  DESIGN_ROWS.forEach((design) => {
    const b = el('button', 'design-card');
    const art = el('span', 'design-art design-art-' + design.style);
    const palette = Pal.list[design.pal];
    b.type = 'button';
    b.title = design.name + ' · ' + design.cursorName + ' cursor trail';
    b.setAttribute('aria-label', design.name + ', ' + STYLES.find((item) => item[0] === design.style)[1] + ', unique ' + design.cursorName + ' cursor trail');
    b.setAttribute('aria-pressed', 'false');
    b.dataset.style = design.style;
    b.dataset.cursorVariant = String(design.cursorVariant);
    b.dataset.cursorFamily = String(design.cursorFamily);
    b.dataset.cursorName = design.cursorName;
    b.style.setProperty('--design-a', `rgb(${palette.a.join(',')})`);
    b.style.setProperty('--design-b', `rgb(${palette.b.join(',')})`);
    b.append(art, el('span', 'design-cursor', design.cursorName), el('span', 'design-name', design.name), el('span', 'design-style', design.style));
    b.addEventListener('click', () => applyDesign(design.id));
    designGrid.append(b);
    refs.designs.push([design.id, b]);
  });
  ds.append(designGrid);

  chipGroup('Style', STYLES, 'style');
  chipGroup('Cursor animation', CURSORS, 'cursor');

  const sp = section('Colour');
  const grid = el('div', 'swatches');
  refs.sw = {};
  Pal.order.forEach((id) => {
    const b = el('button', 'sw');
    b.type = 'button'; b.title = Pal.list[id].name; b.setAttribute('aria-label', Pal.list[id].name + ' palette');
    const p = Pal.list[id];
    b.style.background = id === 'album'
      ? 'conic-gradient(#ff6b6b,#ffd93d,#6bcB77,#4d96ff,#c77dff,#ff6b6b)'
      : `linear-gradient(135deg, rgb(${p.a}), rgb(${p.b}))`;
    b.addEventListener('click', () => setS('pal', id));
    grid.append(b);
    refs.sw[id] = b;
  });
  sp.append(grid);
  refs.swName = el('div', 'swatch-name');
  sp.append(refs.swName);

  chipGroup('Background', BGS, 'bg');

  const customBgCard = el('div', 'custom-bg-card');
  customBgCard.id = 'custom-bg-card';
  const customBgRow = el('div', 'custom-bg-row');
  const uploadBtn = el('button', 'primary custom-bg-btn', 'Choose Image or GIF');
  uploadBtn.type = 'button';
  uploadBtn.addEventListener('click', () => $('#custom-bg-input').click());
  const clearBtn = el('button', 'custom-bg-clear', 'Remove custom image');
  clearBtn.type = 'button';
  clearBtn.addEventListener('click', async () => {
    await clearCustomBgFromDb();
    updateCustomBgPreview(null);
    if (S.bg === 'custom') setS('bg', 'dust');
  });
  customBgRow.append(uploadBtn, clearBtn);

  const urlRow = el('div', 'custom-bg-url-row');
  const urlInput = el('input', 'custom-bg-url-input');
  urlInput.type = 'url';
  urlInput.placeholder = 'Or paste image/GIF link (URL)';
  const urlBtn = el('button', 'custom-bg-url-btn', 'Apply');
  urlBtn.type = 'button';
  urlBtn.addEventListener('click', async () => {
    const val = urlInput.value.trim();
    if (val) {
      await saveCustomBgToDb(val);
      R.setCustomBg(val);
      updateCustomBgPreview(val);
      setS('bg', 'custom');
      urlInput.value = '';
    }
  });
  urlRow.append(urlInput, urlBtn);

  const previewEl = el('div', 'custom-bg-preview-wrap');
  previewEl.id = 'custom-bg-preview-wrap';
  const previewImg = el('img', 'custom-bg-thumb');
  previewImg.id = 'custom-bg-thumb';
  previewImg.alt = 'Custom background preview';
  previewEl.append(previewImg);

  customBgCard.append(
    customBgRow,
    urlRow,
    previewEl,
    el('p', 'hint', 'Custom pictures and animated GIFs are saved in this browser and scaled cleanly to fit your screen.')
  );
  slider(customBgCard, 'customBgDim', 'Custom background dimming', 0, 0.9, 0.05, () => S.customBgDim !== undefined ? S.customBgDim : 0.45, (v) => setS('customBgDim', v), (v) => Math.round(v * 100) + '%');
  const bgSection = refs.chips.bg && refs.chips.bg[0] && refs.chips.bg[0][1].closest('.panel-section');
  if (bgSection) bgSection.append(customBgCard);

  chipGroup('Line position · locked in one spot edge-to-edge', [
    ['bottom', 'Bottom (edge-to-edge)', '⤓'],
    ['center', 'Near Center (edge-to-edge)', '⇋'],
  ], 'linePos');

  chipGroup('Lyric font', LYRIC_FONTS.map(([id, label]) => [id, label, '']), 'lyricFont');
  multiChipGroup('Beat visuals · choose multiple', BEAT_VISUALS, 'beatVisual');
  chipGroup('Mouse trail · independent of design', CURSORS, 'cursor');

  const librarySection = section('Your MP3 library', true);
  const importButton = el('button', 'primary mp3-add', 'Add MP3 files');
  importButton.type = 'button';
  importButton.addEventListener('click', () => $('#mp3-files').click());
  const panelLibrary = el('div', 'mp3-library');
  panelLibrary.id = 'mp3-panel-library';
  librarySection.append(importButton, el('p', 'hint', 'Songs are saved only in this browser. Removing a song frees its saved space.'), panelLibrary);

  const sb = section('Beat sync', true);
  const box = el('div', 'beatbox');
  const btns = el('div', 'btns');
  const bSys = el('button', 'primary', 'Sync to music'); bSys.type = 'button';
  const bMic = el('button', null, 'Use microphone'); bMic.type = 'button';
  const bStop = el('button', null, 'Stop'); bStop.type = 'button';
  bSys.addEventListener('click', () => startBeat('system'));
  bMic.addEventListener('click', () => startBeat('mic'));
  bStop.addEventListener('click', () => { Beat.stop(); if (state.mode === 'demo') Beat.startSim(100); Beat.error = ''; syncPanel(); });
  btns.append(bSys, bMic, bStop);
  beatBtns = { bSys, bMic, bStop };
  beatMsgEl = el('div', 'hint');
  const meter = el('div', 'meter'); meterEl = el('i'); meter.append(meterEl);
  box.append(btns, meter, beatMsgEl);
  const hint = el('p', 'hint', 'For DJ equalizer bars and waveforms to follow the actual song, select Sync to music and share the tab playing it with “Share tab audio” enabled. For Spotify desktop, share your screen with “Share system audio”. Without shared audio, visuals use an ambient pulse; audio stays on your device.');
  box.append(hint);
  const privacyHint = el('p', 'hint', 'MP3 beat sync starts automatically where supported. Spotify and YouTube need you to choose what audio to share because browsers protect other apps’ sound.');
  box.append(privacyHint);
  slider(box, 'ringSize', 'Neon ring size', 0.4, 2.5, 0.05, () => S.ringSize, (v) => setS('ringSize', v), (v) => Math.round(v * 100) + '%');
  slider(box, 'radialSize', 'Radial spectrum size', 0.4, 2.5, 0.05, () => S.radialSize, (v) => setS('radialSize', v), (v) => Math.round(v * 100) + '%');
  slider(box, 'sens', 'Beat sensitivity · bass + full mix', 0.5, 2, 0.05, () => S.sens, (v) => setS('sens', v), (v) => v.toFixed(2) + '×');
  syncToggles.push(toggle(box, 'Random beat size · small to big', () => S.beatRandom, (v) => setS('beatRandom', v)));
  slider(box, 'beatShake', 'Beat shake', 0, 1.5, 0.05, () => S.beatShake, (v) => setS('beatShake', v), (v) => Math.round(v * 100) + '%');
  syncToggles.push(toggle(box, 'Aggressive beat shake', () => S.aggressiveShake, (v) => setS('aggressiveShake', v)));
  syncToggles.push(toggle(box, 'Beat zoom + lyric tilt', () => S.beatZoom, (v) => setS('beatZoom', v)));
  syncToggles.push(toggle(box, 'Aggressive lyric zoom + tilt', () => S.aggressiveZoom, (v) => setS('aggressiveZoom', v)));
  syncToggles.push(toggle(box, 'Beat flash', () => S.beatFlash, (v) => setS('beatFlash', v)));
  syncToggles.push(toggle(box, 'Aggressive beat flash', () => S.aggressiveFlash, (v) => setS('aggressiveFlash', v)));
  box.append(el('p', 'hint', 'Audio waveform shows the captured sound directly. Beat visuals, bass response, speakers, shake, and flashes continue even when lyrics are unavailable.'));
  box.append(el('p', 'hint', 'Beat size varies from subtle to strong when randomization is on. The black beat flicker is tied to each beat and fades quickly. Flash, flicker, and shake effects are disabled when reduced motion is enabled.'));
  sb.append(box);

  const sa = section('Fine tune');
  slider(sa, 'size', 'Text size', 0.7, 1.5, 0.05, () => S.size, (v) => setS('size', v), (v) => Math.round(v * 100) + '%');
  slider(sa, 'glow', 'Glow', 0, 1.5, 0.05, () => S.glow, (v) => setS('glow', v), (v) => Math.round(v * 100) + '%');
  slider(sa, 'motion', 'Word & scene motion', 0, 1.5, 0.05, () => S.motion, (v) => setS('motion', v), (v) => Math.round(v * 100) + '%');
  slider(sa, 'timing', 'Lyric timing', -3000, 3000, 50, () => state.offsetMs, (v) => setOffset(v), (v) => (v >= 0 ? '+' : '') + (v / 1000).toFixed(2) + 's');
  syncToggles.push(toggle(sa, 'Show album card', () => S.card, (v) => setS('card', v)));

  const sx = section('Actions');
  const row = el('div', 'row2');
  const mk = (label, fn) => { const b = el('button', null, label); b.type = 'button'; b.addEventListener('click', fn); row.append(b); return b; };
  mk('Surprise me', shuffleDesign);
  mk('Change music source', () => showGate());
  mk('Copy design link', async () => {
    try { await navigator.clipboard.writeText(location.href); flashStatus('Design link copied.', 2500); }
    catch (e) { prompt('Copy this link:', location.href); }
  });
  mk('Reset', () => { Object.assign(S, DEFAULTS); Beat.randomize = DEFAULTS.beatRandom; setOffset(0); setS('pal', DEFAULTS.pal); });
  refs.disc = mk('Disconnect Spotify', () => { logout(); Beat.stop(); state.track = null; state.lines = null; clearTimeout(pollTimer); showGate(); });
  sx.append(row);
  const privacy = el('p', 'hint');
  privacy.append(document.createTextNode('Spotify access is read-only and stays in this browser tab. To revoke the app’s permission too, use '));
  const revoke = el('a', null, 'Spotify account settings');
  revoke.href = 'https://www.spotify.com/account/apps/';
  revoke.target = '_blank';
  revoke.rel = 'noopener noreferrer';
  privacy.append(revoke);
  sx.append(privacy);

  const sk = section('Shortcuts');
  const keys = el('div', 'keys');
  keys.innerHTML = '<kbd>1</kbd>–<kbd>5</kbd> style &nbsp; <kbd>P</kbd> colour &nbsp; <kbd>B</kbd> background &nbsp; <kbd>R</kbd> surprise<br><kbd>C</kbd> customize &nbsp; <kbd>F</kbd> fullscreen &nbsp; <kbd>[</kbd> <kbd>]</kbd> lyric timing &nbsp; <kbd>Click</kbd> burst';
  sk.append(keys);
}

async function startBeat(kind) {
  Beat.error = '';
  try {
    if (kind === 'system') await Beat.startSystem(); else await Beat.startMic();
  } catch (e) {
    Beat.error = e && e.name === 'NotAllowedError' ? 'Permission was declined.' : (e && e.message) || 'Could not start audio capture.';
  }
  syncPanel();
  if (Beat.error) flashStatus(Beat.error, 7000);
  else flashStatus('Beat sync is on. Listening to ' + Beat.label + '.', 4000);
}

function syncPanel() {
  for (const key of Object.keys(refs.chips)) refs.chips[key].forEach(([id, b]) => {
    const active = Array.isArray(S[key]) ? S[key].includes(id) : S[key] === id;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  refs.designs.forEach(([id, b]) => {
    const active = S.design === id;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  refs.moods.forEach(([id, b]) => {
    const active = S.mood === id;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  for (const id of Object.keys(refs.sw)) refs.sw[id].classList.toggle('active', S.pal === id);
  if (refs.swName) refs.swName.textContent = Pal.list[S.pal].name + (S.pal === 'album' ? ' (colours from the cover art)' : '');
  for (const k of Object.keys(refs.sliders)) refs.sliders[k]();
  syncToggles.forEach((f) => f());
  if (beatMsgEl) {
    if (Beat.error) { beatMsgEl.textContent = Beat.error; beatMsgEl.classList.add('err'); }
    else {
      beatMsgEl.classList.remove('err');
      beatMsgEl.textContent = Beat.source === 'off' ? 'Not connected: using a gentle ambient pulse.' : Beat.source === 'sim' ? 'Demo beat (simulated).' : 'Listening: ' + Beat.label;
    }
    beatBtns.bStop.disabled = Beat.source === 'off';
  }
  if (refs.disc) refs.disc.style.display = CLIENT_ID && SS.get('sp_refresh') ? '' : 'none';
  const customBgCard = document.getElementById('custom-bg-card');
  if (customBgCard) customBgCard.style.display = S.bg === 'custom' ? 'flex' : 'none';
}

/* ---- events ---- */
$('#connect').addEventListener('click', connectSpotify);
$('#youtube-sync-beat').addEventListener('click', () => {
  flashStatus('In the share window, choose this browser tab and enable “Share tab audio”.', 7000);
  startBeat('system');
});
$('#copy-spotify-redirect').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(REDIRECT);
    flashStatus('Spotify redirect URI copied.', 3000);
  } catch (error) {
    prompt('Copy this exact Spotify redirect URI:', REDIRECT);
  }
});
$('#demo').addEventListener('click', startDemo);
$('#youtube-form').addEventListener('submit', (e) => { e.preventDefault(); connectYoutube($('#youtube-url').value); });
$('#youtube-close').addEventListener('click', () => showGate());
$('#cust').addEventListener('click', () => setPanel(!document.body.classList.contains('panel-open')));
$('#pclose').addEventListener('click', () => setPanel(false));
$('#fs').addEventListener('click', toggleFullscreen);
$('#choose-mp3').addEventListener('click', () => $('#mp3-files').click());
$('#mp3-files').addEventListener('change', (event) => {
  importMp3(event.target.files);
  event.target.value = '';
});
$('#custom-bg-input').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    await saveCustomBgToDb(dataUrl);
    R.setCustomBg(dataUrl);
    updateCustomBgPreview(dataUrl);
    setS('bg', 'custom');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});
$('#local-player-close').addEventListener('click', stopLocalPlayback);
localAudio.addEventListener('loadedmetadata', () => {
  if (state.mode !== 'local' || !state.track) return;
  const updated = Object.assign({}, state.track, { duration: Math.round((localAudio.duration || 0) * 1000) });
  if (updated.duration > 0) setTrack(updated);
});
localAudio.addEventListener('play', () => {
  if (state.mode !== 'local') return;
  state.anchor = { pos: localAudio.currentTime * 1000, at: performance.now(), playing: true };
  wake();
  if (Beat.source === 'off' || Beat.source === 'element' || Beat.source === 'sim') {
    Beat.startElement(localAudio).then(syncPanel).catch((error) => {
      Beat.error = error.message || 'Could not analyze MP3 audio.';
      syncPanel();
    });
  }
});
localAudio.addEventListener('pause', () => {
  if (state.mode === 'local') state.anchor = { pos: localAudio.currentTime * 1000, at: performance.now(), playing: false };
});
localAudio.addEventListener('error', () => {
  if (state.mode === 'local') flashStatus('This MP3 could not be decoded by the browser. Try a standard MP3 file.', 7000);
});

addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
  const k = e.key;
  if (state.mode === 'gate') return;
  if (k >= '1' && k <= String(STYLES.length)) setS('style', STYLES[+k - 1][0]);
  else if (k === 'p' || k === 'P') setS('pal', Pal.order[(Pal.order.indexOf(S.pal) + 1) % Pal.order.length]);
  else if (k === 'b' || k === 'B') setS('bg', BGS[(BGS.findIndex((x) => x[0] === S.bg) + 1) % BGS.length][0]);
  else if (k === 'r' || k === 'R') shuffleDesign();
  else if (k === 'c' || k === 'C') setPanel(!document.body.classList.contains('panel-open'));
  else if (k === 'f' || k === 'F') toggleFullscreen();
  else if (k === '[') setOffset(state.offsetMs - 250);
  else if (k === ']') setOffset(state.offsetMs + 250);
  else if (k === 'Escape') setPanel(false);
});

let idleTimer = 0;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (state.mode !== 'gate') document.body.classList.add('idle'); }, 4000);
}
['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));

const canvas = $('#c');
document.addEventListener('pointermove', (e) => {
  R.pointer.x = e.clientX / innerWidth;
  R.pointer.y = e.clientY / innerHeight;
  R.pointer.inside = e.pointerType === 'mouse' || e.pointerType === 'pen';
});
window.addEventListener('pointerout', (e) => { if (!e.relatedTarget) R.pointer.inside = false; });
window.addEventListener('blur', () => { R.pointer.inside = false; });
canvas.addEventListener('pointerdown', (e) => {
  R.pointer.x = e.clientX / innerWidth; R.pointer.y = e.clientY / innerHeight; R.pointer.inside = e.pointerType === 'mouse';
  if (state.mode !== 'gate') R.burst(e.clientX, e.clientY, innerWidth, innerHeight);
  if (document.body.classList.contains('panel-open')) setPanel(false);
});

addEventListener('hashchange', () => { readHash(); validate(); syncCursorDesign(); Pal.set(S.pal); Beat.sens = S.sens; Beat.randomize = S.beatRandom; LS.set('lyr_settings', JSON.stringify(S)); applyAccent(); syncPanel(); });

/* keep the screen awake while lyrics are on */
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* ignore */ }
}
let frameId = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (state.mode !== 'gate') keepAwake();
    if (!frameId) frameId = requestAnimationFrame(frame);
  }
});

/* ------------------------------------------------------------------ *
 *  Canvas + main loop
 * ------------------------------------------------------------------ */
const ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, R.quality ? 1.5 : 1);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener('resize', resize);
resize();

let lastRenderError = '';
let lastNow = 0, slowFor = 0, fastFor = 0, beatSeen = 0, meterT = 0;
function frame(now) {
  frameId = 0;
  if (document.hidden) return;
  frameId = requestAnimationFrame(frame);
  const dt = Math.min(100, lastNow ? now - lastNow : 16);
  lastNow = now;

  // auto quality: drop effects on slow machines, never flip-flop
  if (R.quality) {
    if (dt > 30) slowFor += dt; else slowFor = Math.max(0, slowFor - dt * 0.5);
    if (slowFor > 2500) { R.quality = 0; resize(); flashStatus('Lite mode on for smoother playback.', 3000); }
  }

  if (state.mode === 'demo' && currentPos() > DEMO_LEN) state.anchor = { pos: 0, at: performance.now(), playing: true };

  Beat.update(now, dt);
  if (Beat.beatCount !== beatSeen) {
    beatSeen = Beat.beatCount;
    if (Beat.pulse > 0.4) { const d = $('#beatdot'); d.classList.add('on'); setTimeout(() => d.classList.remove('on'), 90); }
  }
  if (document.body.classList.contains('panel-open') && now - meterT > 60 && meterEl) {
    meterT = now;
    meterEl.style.width = Math.round(clamp(Math.max(Beat.level * 2.4, Beat.bass * 1.2)) * 100) + '%';
  }

  const fs = { t: 0, lines: null, message: '' };
  if (state.mode !== 'gate') {
    if (!state.track) fs.message = state.lyricsStatus;
    else if (state.lines === null) fs.message = 'Finding lyrics…';
    else if (!state.lines.length) fs.message = state.lyricsStatus;
    else { fs.lines = state.lines; fs.t = (currentPos() + state.offsetMs) / 1000; }
  }
  try {
    R.render(ctx, W, H, now, dt, fs, S);
  } catch (err) {
    // Never leave a silent black screen: reset the canvas and show the real error.
    try { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } catch (e2) { /* ignore */ }
    const msg = 'Render error: ' + (err && err.message ? err.message : err);
    if (msg !== lastRenderError) {
      lastRenderError = msg;
      console.error(err);
      flashStatus(msg + ' (open the browser console, F12, for details)', 0);
    }
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ------------------------------------------------------------------ *
 *  Boot
 * ------------------------------------------------------------------ */
async function boot() {
  $('#redir').textContent = REDIRECT;
  $('#spotify-redirect').textContent = REDIRECT;
  if (!CLIENT_ID) $('#setup').hidden = false;
  buildPanel();
  applyAccent();
  syncPanel();
  frameId = requestAnimationFrame(frame);
  refreshSavedTracks().catch((error) => {
    console.error(error);
    flashStatus(error.message || 'Could not open the saved MP3 library.', 7000);
  });

  if (new URLSearchParams(location.search).has('demo')) { startDemo(); wake(); keepAwake(); return; }

  if (CLIENT_ID) {
    await handleCallback();
    const token = await getToken();
    if (token && state.mode === 'gate') {
      releaseLocalAudio();
      state.mode = 'spotify';
      hideGate();
      flashStatus('Connected. Play something in Spotify.', 4000);
      wake(); keepAwake(); syncPanel();
      poll();
      return;
    }
  }
  if (state.mode === 'gate') showGate();
}

// expose for tests / tinkering in the console
window.__LY = { state, S, Beat, R, setS, startDemo, buildLines, parseLRC, parseYoutubeTrackTitle };
boot();
})();
