// ASCII Piano Roll — turns text / ASCII art into a piano roll and plays it.
// Rows of the text grid are pitches (top = highest), columns are 16th-note steps.

import { ROLES, ROLE_LABEL, ROLE_COLOR, ROLE_VEL, GM_DRUM, KIT_ROLE_MATCH, KITS, STYLES, randomStyle, seedLabel, styleRoles, hitsAt } from "./drums.js";
import { buildMidi, downloadBytes, GM_PROGRAM } from "./midi.js";
import { encodeState, decodeState, shareTargets, copyText } from "./share.js";
import { initAnalytics, track as trackEvent } from "./analytics.js";
import { VERSION, CHANGELOG_URL } from "./version.js";

const SMPLR_URL = "https://unpkg.com/smplr@0.15.1/dist/index.mjs";
const smplrReady = import(SMPLR_URL).catch((err) => {
  console.warn("smplr failed to load, using built-in synth", err);
  return null;
});

const $ = (id) => document.getElementById(id);
const els = {
  text: $("text"), mode: $("mode"), instrument: $("instrument"), scale: $("scale"), root: $("root"), octave: $("octave"), font: $("font"), fontHint: $("fontHint"),
  bpm: $("bpm"), bpmOut: $("bpmOut"), sustain: $("sustain"), drums: $("drums"), drumOpts: $("drumOpts"),
  pattern: $("pattern"), kit: $("kit"), drumVol: $("drumVol"), loop: $("loop"), intro: $("intro"),
  play: $("play"), canvas: $("roll"), stage: $("stage"), pill: $("pill"), pillText: $("pillText"),
  replay: $("replay"), presets: $("presets"), info: $("info"), loadHint: $("loadHint"),
  swing: $("swing"), swingOut: $("swingOut"), dice: $("dice"), surprise: $("surprise"),
  share: $("share"), midi: $("midi"), sharedBanner: $("sharedBanner"), sharedPlay: $("sharedPlay"),
  shareDialog: $("shareDialog"), shareUrl: $("shareUrl"), copyLink: $("copyLink"), nativeShare: $("nativeShare"),
  shareSummary: $("shareSummary"), shareLinks: document.querySelectorAll("[data-net]"), version: $("version"),
};
const g = els.canvas.getContext("2d");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- presets

const WORDS = ["HELLO", "LOVE", "MUSIC", "DREAM", "HOPE", "PEACE", "OCEAN", "LIGHT", "BOSTON", "JOY"];

// Hand-drawn shapes for emojis. Typing one of these emojis (or several) plays its shape.
const art = (...lines) => lines.join("\n");
const EMOJI_ART = {
  "❤": art(
    "  ***     ***",
    " *****   *****",
    "******* *******",
    "***************",
    " *************",
    "  ***********",
    "   *********",
    "    *******",
    "     *****",
    "      ***",
    "       *"),
  "😀": art(
    "     ******",
    "   **      **",
    "  *          *",
    " *   **  **   *",
    " *            *",
    " *  *      *  *",
    "  *  ******  *",
    "   **      **",
    "     ******"),
  "⭐": art(
    "        *",
    "       ***",
    "      *****",
    "*****************",
    "  *************",
    "    *********",
    "   ***********",
    "  ****     ****",
    " **           **"),
  "🌙": art(
    "      *****",
    "    ***",
    "   **",
    "  **",
    "  **",
    "  **",
    "   **",
    "    ***",
    "      *****"),
  "☀": art(
    "  *     *     *",
    "    *   *   *",
    "      *****",
    "*  * ******* *  *",
    "     *******",
    "*  * ******* *  *",
    "      *****",
    "    *   *   *",
    "  *     *     *"),
  "🌊": art(
    "      **                **",
    "    **  **            **  **",
    "  **      **        **      **",
    "**          **    **          **",
    "              ****"),
  "🎵": art(
    "     ***********",
    "     **********",
    "     *        *",
    "     *        *",
    "     *        *",
    "  ****     ****",
    " *****    *****",
    "  ***      ***"),
  "🌸": art(
    "    **   **",
    "   **** ****",
    "    *******",
    " ****  *  ****",
    "    *******",
    "   **** ****",
    "    **   **",
    "       *",
    "     * * *",
    "       *"),
  "🐱": art(
    " *          *",
    " **        **",
    " * ******** *",
    " *          *",
    "*   **  **   *",
    "*     **     *",
    "*   * ** *   *",
    " *          *",
    "  **********"),
  "⚡": art(
    "      ****",
    "     ****",
    "    ****",
    "   ****",
    "  ********",
    "     ****",
    "    ***",
    "   **",
    "  *"),
};
const EMOJIS = Object.keys(EMOJI_ART);

// If the text is only known emojis (and spaces), return them in order.
const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter() : null;
function emojiSequence(text) {
  const parts = segmenter ? [...segmenter.segment(text)].map((x) => x.segment) : [...text];
  const seq = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    const key = part.replace(/️/g, "");
    if (!EMOJI_ART[key]) return null;
    seq.push(key);
  }
  return seq.length ? seq : null;
}

// Place several art grids side by side, bottom-aligned, with a gap between them.
function joinGrids(grids, gap = 3) {
  const H = Math.max(...grids.map((gr) => gr.length));
  const rows = Array.from({ length: H }, () => []);
  grids.forEach((gr, i) => {
    const w = gr[0]?.length ?? 0;
    const pad = H - gr.length;
    for (let r = 0; r < H; r++) {
      if (i > 0) rows[r].push(...Array(gap).fill(null));
      rows[r].push(...(r < pad ? Array(w).fill(null) : gr[r - pad]));
    }
  });
  return rows.map((r) => r.slice(0, MAX_COLS));
}

// ---------------------------------------------------------------- 5x7 pixel font

// Each glyph is 7 rows; each row is a 5-bit mask (16 = leftmost pixel).
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 2, 4, 0, 4], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8], "-": [0, 0, 0, 31, 0, 0, 0], "'": [4, 4, 8, 0, 0, 0, 0],
  ":": [0, 12, 12, 0, 12, 12, 0],
};
const GLYPH_W = 5, GLYPH_H = 7;
const MAX_ROWS = 48, MAX_COLS = 400;

function detectMode(text) {
  const t = text.replace(/\s+$/, "");
  if (t.includes("\n")) return "art";
  return /^[A-Za-z0-9 !?.,:'\-]+$/.test(t) ? "word" : "art";
}

function artGrid(text) {
  let lines = text.replace(/\t/g, "    ").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  lines = lines.slice(0, MAX_ROWS);
  const filled = lines.filter((l) => l.trim());
  const indent = filled.length ? Math.min(...filled.map((l) => l.match(/^ */)[0].length)) : 0;
  const rows = lines.map((l) => [...l.slice(indent).replace(/\s+$/, "")].slice(0, MAX_COLS));
  const w = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: w }, (_, i) => (r[i] && r[i] !== " " ? r[i] : null)));
}

// Font styles reshape the letters, and the shape changes how the word sounds.
const FONT_STYLES = {
  classic: { label: "Classic", hint: "Even, steady phrasing" },
  bold:    { label: "Bold",    hint: "Thicker strokes, fuller chords and longer notes" },
  italic:  { label: "Italic",  hint: "Slanted, so chords roll like a strum" },
  tall:    { label: "Tall",    hint: "Twice the height, a wider range of pitches" },
  wide:    { label: "Wide",    hint: "Stretched out, slower and more spacious" },
  dotted:  { label: "Dotted",  hint: "Broken strokes, light and staccato" },
  mixed:   { label: "Mixed",   hint: "Each letter in a different style" },
};
const MIXED_CYCLE = ["classic", "italic", "bold", "dotted"];

function glyphMatrix(ch) {
  const glyph = FONT[ch] ?? FONT["?"];
  return glyph.map((bits) => Array.from({ length: GLYPH_W }, (_, x) => !!(bits & (16 >> x))));
}

function styleGlyph(m, style) {
  switch (style) {
    case "bold":
      return m.map((r) => Array.from({ length: r.length + 1 }, (_, x) => !!(r[x] || r[x - 1])));
    case "italic":
      return m.map((r, y) => {
        const shift = Math.floor((m.length - 1 - y) / 2);
        const max = Math.floor((m.length - 1) / 2);
        return [...Array(shift).fill(false), ...r, ...Array(max - shift).fill(false)];
      });
    case "tall":
      return m.flatMap((r) => [r, r]);
    case "wide":
      return m.map((r) => r.flatMap((v) => [v, v]));
    case "dotted":
      return m.map((r, y) => r.map((v, x) => v && (x + y) % 2 === 0));
    default:
      return m;
  }
}

function wordGrid(text, style = "classic") {
  const chars = [...text.trim().toUpperCase()].slice(0, 60);
  const H = style === "tall" ? GLYPH_H * 2 : GLYPH_H;
  const rows = Array.from({ length: H }, () => []);
  let letter = 0;
  chars.forEach((ch, idx) => {
    if (idx > 0) rows.forEach((r) => r.push(null));
    if (ch === " ") { rows.forEach((r) => r.push(null, null)); return; }
    const st = style === "mixed" ? MIXED_CYCLE[letter++ % MIXED_CYCLE.length] : style;
    const m = styleGlyph(glyphMatrix(ch), st);
    m.forEach((r, y) => r.forEach((v) => rows[y].push(v ? ch : null)));
  });
  return rows;
}

// ---------------------------------------------------------------- grid -> notes

const SCALES = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);

function buildSong() {
  const text = els.text.value;
  const emojis = els.mode.value !== "word" ? emojiSequence(text) : null;
  const mode = emojis ? "emoji" : els.mode.value === "auto" ? detectMode(text) : els.mode.value;
  const grid = emojis ? joinGrids(emojis.map((e) => artGrid(EMOJI_ART[e])))
    : mode === "word" ? wordGrid(text, els.font.value) : artGrid(text);
  const R = grid.length;
  const C = R ? grid[0].length : 0;

  const scale = SCALES[els.scale.value];
  const n = scale.length;
  const offset = (row) => { const fb = R - 1 - row; return scale[fb % n] + 12 * Math.floor(fb / n); };
  const span = R ? offset(0) : 0;
  // Pick the octave that centres the shape around E4, staying inside the piano range.
  const pc = +els.root.value;
  let base = 24 + pc, bestD = Infinity;
  for (let oct = 2; oct <= 7; oct++) {
    const b = 12 * oct + pc;
    if (b < 24 || b + span > 108) continue;
    const d = Math.abs(b + span / 2 - 64);
    if (d < bestD) { bestD = d; base = b; }
  }
  // Octave selector shifts the auto choice up or down, within the piano range.
  base += 12 * +els.octave.value;
  while (base + span > 108 && base - 12 >= 21) base -= 12;
  while (base < 21) base += 12;
  const rowMidi = Array.from({ length: R }, (_, r) => Math.min(108, base + offset(r)));

  const notes = [];
  const sustain = els.sustain.checked;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!grid[r][c]) continue;
      let len = 1;
      if (sustain) while (c + len < C && grid[r][c + len]) len++;
      notes.push({ row: r, start: c, len, midi: rowMidi[r], ch: grid[r][c] });
      c += len - 1;
    }
  }
  const totalSteps = Math.max(4, Math.ceil(C / 4) * 4);
  const notesByStep = Array.from({ length: totalSteps }, () => []);
  for (const note of notes) notesByStep[note.start].push(note);

  // How "heavy" the bottom half of each column is, used by the "From the text" drum pattern.
  const bottom = Array.from({ length: totalSteps }, (_, c) => {
    let k = 0;
    for (let r = Math.floor(R / 2); r < R; r++) if (grid[r][c]) k++;
    return k;
  });
  const maxBottom = Math.max(1, ...bottom);
  const bottomDensity = bottom.map((k) => k / maxBottom);

  return { mode, grid, R, C, rowMidi, notes, notesByStep, totalSteps, bottomDensity, base };
}

// ---------------------------------------------------------------- drums

// The beat randomiser stores its seed; the style menu shows "Random #xxxx" for it.
let drumSeed = 0;
let styleCache = { key: null, style: null, roles: [] };

function currentStyle() {
  const key = els.pattern.value;
  const cacheKey = key === "random" ? `random:${drumSeed}` : key;
  if (styleCache.key !== cacheKey) {
    const style = key === "random" ? randomStyle(drumSeed) : STYLES[key];
    styleCache = { key: cacheKey, style, roles: styleRoles(key, style) };
  }
  return styleCache;
}

const drumHitsAt = (step) => hitsAt(els.pattern.value, currentStyle().style, step, song.bottomDensity);
const swingAmount = () => +els.swing.value / 100;

// ---------------------------------------------------------------- audio

let ctx = null, master = null, noiseBuf = null;

// Safari (and so every browser on iPhone/iPad) says it "maybe" plays audio/ogg but can't decode
// the Ogg Vorbis samples, which would leave instruments silent. There we load the MP3 soundfonts
// and the M4A drum samples instead.
const VORBIS_OK = (() => {
  try { return document.createElement("audio").canPlayType('audio/ogg; codecs="vorbis"') === "probably"; } catch { return false; }
})();
const sampleStorage = {
  fetch: (url) => fetch(VORBIS_OK ? url : url.replace(/-ogg\.js$/, "-mp3.js").replace(/\.ogg$/, ".m4a")),
};
const hasSamples = (inst) => Object.keys(inst?.player?.buffers ?? {}).length > 0;

// iPhone: play through the ringer/silent switch like a music app, and wake audio inside the tap.
let silentEl = null;
function silentWavUrl() {
  const n = 2000, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, "data"); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}
function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
  if (!navigator.audioSession) {
    if (!silentEl) {
      silentEl = new Audio(silentWavUrl());
      silentEl.loop = true;
      silentEl.setAttribute("playsinline", "");
    }
    silentEl.play().catch(() => {});
  }
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}
const melodic = new Map();
const kits = new Map();
let activeInst = null, activeKit = null;
const synthVoices = new Set();
let clickNodes = [];

function ensureCtx() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createDynamicsCompressor();
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== "running") ctx.resume();
  return ctx;
}

const instLabel = () => els.instrument.selectedOptions[0].textContent;

function loadInstrument(name) {
  if (melodic.has(name)) return melodic.get(name);
  const entry = { name, inst: null, failed: false, loaded: false };
  entry.ready = smplrReady
    .then((m) => {
      if (!m) throw new Error("smplr unavailable");
      entry.inst = new m.Soundfont(ctx, { instrument: name, storage: sampleStorage });
      return entry.inst.load;
    })
    .then(() => { if (!hasSamples(entry.inst)) throw new Error("no samples could be decoded"); })
    .catch((err) => { console.warn("Instrument failed, falling back to synth:", name, err); entry.failed = true; })
    .then(() => {
      entry.loaded = true;
      if (els.instrument.value === name) activeInst = entry;
      updateLoadHint();
      return entry;
    });
  melodic.set(name, entry);
  updateLoadHint();
  return entry;
}

function loadKit(name) {
  if (kits.has(name)) return kits.get(name);
  const entry = { name, inst: null, roles: {}, failed: false, loaded: false };
  entry.ready = smplrReady
    .then((m) => {
      if (!m) throw new Error("smplr unavailable");
      entry.inst = new m.DrumMachine(ctx, { instrument: name, storage: sampleStorage });
      return entry.inst.load;
    })
    .then(() => {
      if (!hasSamples(entry.inst)) throw new Error("no samples could be decoded");
      const names = entry.inst.sampleNames;
      const pick = (...res) => { for (const re of res) { const hit = names.find((s) => re.test(s)); if (hit) return hit; } return null; };
      entry.roles = Object.fromEntries(ROLES.map((role) => [role, pick(...KIT_ROLE_MATCH[role])]));
    })
    .catch((err) => { console.warn("Drum kit failed, falling back to synth drums:", name, err); entry.failed = true; })
    .then(() => {
      entry.loaded = true;
      if (els.kit.value === name) activeKit = entry;
      updateLoadHint();
      return entry;
    });
  kits.set(name, entry);
  updateLoadHint();
  return entry;
}

function updateLoadHint() {
  const pending = [...melodic.values(), ...kits.values()].filter((e) => !e.loaded).map((e) => e.name);
  const failed = activeInst?.failed ? " · samples unavailable, using synth" : "";
  els.loadHint.textContent = pending.length ? `Loading ${pending.join(", ")}…` : failed.slice(3);
}

function track(node) { synthVoices.add(node); node.onended = () => synthVoices.delete(node); }

function synthNote(midi, time, dur, vel) {
  const o = ctx.createOscillator(), env = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  const peak = 0.2 * (vel / 127);
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(peak, time + 0.01);
  env.gain.exponentialRampToValueAtTime(peak * 0.45, time + 0.18);
  env.gain.setTargetAtTime(0, time + dur, 0.08);
  o.connect(env).connect(master);
  o.start(time);
  o.stop(time + dur + 0.6);
  track(o);
}

function playNote(midi, time, dur, vel) {
  const e = activeInst;
  if (e && e.inst && !e.failed) e.inst.start({ note: midi, time, duration: dur, velocity: vel });
  else synthNote(midi, time, dur, vel);
}

function synthDrum(role, time, vel) {
  const amp = vel / 127;
  if (role === "kick") {
    const o = ctx.createOscillator(), env = ctx.createGain();
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.15);
    env.gain.setValueAtTime(0.9 * amp, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    o.connect(env).connect(master);
    o.start(time); o.stop(time + 0.4); track(o);
    return;
  }
  if (role === "perc") {
    const o = ctx.createOscillator(), env = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(820, time);
    env.gain.setValueAtTime(0.5 * amp, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    o.connect(env).connect(master);
    o.start(time); o.stop(time + 0.1); track(o);
    return;
  }
  const src = ctx.createBufferSource(), filt = ctx.createBiquadFilter(), env = ctx.createGain();
  src.buffer = noiseBuf;
  const hatLike = role === "hat" || role === "open";
  const len = role === "hat" ? 0.05 : role === "open" ? 0.28 : role === "clap" ? 0.18 : 0.2;
  filt.type = hatLike ? "highpass" : "bandpass";
  filt.frequency.value = hatLike ? 7000 : role === "clap" ? 1500 : 1800;
  env.gain.setValueAtTime((hatLike ? 0.25 : 0.6) * amp, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + len);
  src.connect(filt).connect(env).connect(master);
  src.start(time); src.stop(time + len + 0.05); track(src);
}

function playDrum(role, time, vel) {
  const k = activeKit;
  if (k && k.inst && !k.failed && k.roles[role]) k.inst.start({ note: k.roles[role], time, velocity: vel });
  else synthDrum(role, time, vel);
}

function click(time, accent) {
  const o = ctx.createOscillator(), env = ctx.createGain();
  o.frequency.value = accent ? 1760 : 1320;
  env.gain.setValueAtTime(0.25, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
  o.connect(env).connect(master);
  o.start(time); o.stop(time + 0.08);
  clickNodes.push(o);
}

function silence() {
  for (const e of melodic.values()) e.inst?.stop?.();
  for (const e of kits.values()) e.inst?.stop?.();
  for (const v of synthVoices) { try { v.stop(); } catch {} }
  synthVoices.clear();
  for (const c of clickNodes) { try { c.stop(); } catch {} }
  clickNodes = [];
}

// ---------------------------------------------------------------- playback state machine
// idle -> composing (intro) -> tuning (wait for samples) -> countin -> playing -> done

const INTRO_FALL = 0.55, INTRO_SPREAD = 1.0, INTRO_SOLID = 0.7;
const INTRO_COMPOSE_END = INTRO_SPREAD + 0.25 + INTRO_FALL;
const INTRO_TOTAL = INTRO_COMPOSE_END + INTRO_SOLID;
const LOOKAHEAD = 0.12;

const play = {
  state: "idle", loaded: false, skipCountIn: false,
  introStart: 0, introCells: [],
  countStart: 0, beat: 0.5, startTime: 0,
  nextStep: 0, nextTime: 0, timeline: [], ending: false, endTime: 0, timer: null,
};
let events = []; // visual events waiting for their audio time

const stepDur = () => 60 / +els.bpm.value / 4;

function setState(state) {
  play.state = state;
  els.pill.dataset.state = state;
  const label = {
    idle: "Ready",
    composing: "AI is composing…",
    tuning: `AI is tuning the ${instLabel().toLowerCase()}…`,
    countin: "AI is counting in…",
    playing: `AI is playing · ${instLabel()}${els.drums.checked ? " + drums" : ""}`,
    done: "Performance complete",
  }[state];
  els.pillText.textContent = label;
  const busy = state !== "idle" && state !== "done";
  els.play.textContent = busy ? "■ Stop" : "▶ Play";
  els.play.classList.toggle("stop", busy);
}

function startPerformance() {
  ensureCtx();
  stopPerformance(true);
  unlockAudio();
  if (!song.notes.length) { els.pillText.textContent = "Nothing to play — type something"; return; }
  play.loaded = false;
  play.skipCountIn = !els.intro.checked;
  const inst = loadInstrument(els.instrument.value);
  const kit = els.drums.checked ? loadKit(els.kit.value) : null;
  Promise.all([inst.ready, kit?.ready]).then(() => {
    activeInst = inst;
    if (kit) activeKit = kit;
    play.loaded = true;
  });
  if (els.intro.checked && !reducedMotion.matches) {
    buildIntroCells();
    play.introStart = performance.now() / 1000;
    setState("composing");
  } else {
    setState("tuning");
  }
}

function stopPerformance(quiet = false) {
  clearInterval(play.timer);
  play.timer = null;
  play.ending = false;
  play.timeline = [];
  events = [];
  silentEl?.pause();
  if (ctx) silence();
  if (!quiet) setState("idle");
}

function beginCountIn() {
  const now = ctx.currentTime;
  play.beat = 60 / +els.bpm.value;
  play.countStart = now + 0.06;
  for (let i = 0; i < 4; i++) click(play.countStart + i * play.beat, i === 0);
  beginPlaying(play.countStart + 4 * play.beat);
}

function beginPlaying(startTime) {
  play.startTime = startTime;
  play.nextStep = 0;
  play.nextTime = startTime;
  play.timeline = [];
  play.ending = false;
  setState(startTime > ctx.currentTime + 0.02 ? "countin" : "playing");
  clearInterval(play.timer);
  play.timer = setInterval(schedule, 25);
  schedule();
}

function afterLoad() {
  if (play.skipCountIn) beginPlaying(ctx.currentTime + 0.08);
  else beginCountIn();
}

function schedule() {
  if (play.state !== "countin" && play.state !== "playing") return;
  const horizon = ctx.currentTime + LOOKAHEAD;
  while (!play.ending && play.nextTime < horizon) {
    const step = play.nextStep, t = play.nextTime, dur = stepDur();
    if (step < song.totalSteps) scheduleStep(step, t, dur);
    play.timeline.push({ step, t, dur });
    if (play.timeline.length > 64) play.timeline.shift();
    play.nextTime += dur;
    play.nextStep++;
    if (play.nextStep >= song.totalSteps) {
      if (els.loop.checked) play.nextStep = 0;
      else { play.ending = true; play.endTime = play.nextTime; }
    }
  }
}

// Velocity for the melody notes that start together on one step.
const chordVel = (count) => clamp(Math.round(108 - 7 * (count - 1)), 50, 112);
const drumVel = (hit) => clamp(Math.round(ROLE_VEL[hit.role] * hit.v * (+els.drumVol.value / 100)), 1, 127);

function scheduleStep(step, t, dur) {
  // Swing pushes every second 16th later, for notes and drums alike.
  if (step % 2) t += swingAmount() * dur * 0.5;
  const notes = song.notesByStep[step];
  const vel = chordVel(notes.length);
  for (const note of notes) {
    const d = note.len * dur;
    playNote(note.midi, t, d * 0.96, vel);
    events.push({ t, kind: "note", note, d });
  }
  if (els.drums.checked) {
    for (const hit of drumHitsAt(step)) {
      const v = drumVel(hit);
      playDrum(hit.role, t, v);
      if (hit.roll) playDrum(hit.role, t + dur / 2, Math.round(v * 0.8));
      events.push({ t, kind: "drum", role: hit.role });
    }
  }
}

function skipIntro() {
  if (play.state === "composing" || play.state === "tuning") {
    play.skipCountIn = true;
    setState("tuning");
  } else if (play.state === "countin") {
    silence();
    beginPlaying(ctx.currentTime + 0.05);
  }
}

// ---------------------------------------------------------------- visuals

const KEY_W = 64, RULER_H = 22, DRUM_ROW_H = 16, DRUM_GAP = 14, PAD_B = 10;
const view = { W: 0, H: 0, dpr: 1, cellW: 20, cellH: 16, rollTop: RULER_H, drumTop: 0, viewX: 0 };
let pal = {};
const keyGlow = new Map();   // row -> audio time until which the key is lit
const drumFlash = {};        // role -> audio time of last hit
const particles = [];
const hands = [{ y: null, press: 0 }, { y: null, press: 0 }];
let lastFrame = performance.now() / 1000;

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  pal = {
    bg: v("--roll-bg"), grid: v("--grid"), gridStrong: v("--grid-strong"), text: v("--text"), muted: v("--muted"),
    keyWhite: v("--key-white"), keyBlack: v("--key-black"), keyWhiteText: v("--key-white-text"),
    keyBlackText: v("--key-black-text"), accent: v("--accent"), accent2: v("--accent-2"),
    dark: cs.colorScheme === "dark" || v("color-scheme") === "dark",
  };
}

function withAlpha(hex, a) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function rowColor(row, alpha = 1, light = 0) {
  const R = Math.max(1, song.R - 1);
  const fb = song.R - 1 - row;
  const hue = 190 + (fb / R) * 170;
  const l = (pal.dark ? 63 : 52) + light;
  return `hsla(${hue}, 78%, ${l}%, ${alpha})`;
}

function layout() {
  const W = els.stage.clientWidth;
  const R = Math.max(song.R, 1);
  const cellH = clamp(Math.floor(360 / R), 7, 26);
  const cellW = clamp((W - KEY_W) / song.totalSteps, 10, 34);
  const rollH = R * cellH;
  const drumTop = RULER_H + rollH + DRUM_GAP;
  const H = drumTop + (els.drums.checked ? currentStyle().roles.length * DRUM_ROW_H : -DRUM_GAP) + PAD_B;
  const dpr = window.devicePixelRatio || 1;
  Object.assign(view, { cellW, cellH, drumTop, rollH });
  if (W !== view.W || H !== view.H || dpr !== view.dpr) {
    Object.assign(view, { W, H, dpr });
    els.canvas.width = Math.round(W * dpr);
    els.canvas.height = Math.round(H * dpr);
    els.canvas.style.height = H + "px";
  }
  const maxX = Math.max(0, song.totalSteps * cellW - (W - KEY_W));
  view.viewX = clamp(view.viewX, 0, maxX);
  view.maxX = maxX;
}

function buildIntroCells() {
  play.introCells = [];
  const C = Math.max(1, song.C - 1);
  for (let r = 0; r < song.R; r++)
    for (let c = 0; c < song.C; c++) {
      const ch = song.grid[r][c];
      if (!ch) continue;
      play.introCells.push({
        r, c, ch,
        delay: (c / C) * INTRO_SPREAD + Math.random() * 0.25,
        jx: (Math.random() - 0.5) * 80,
        drop: 40 + Math.random() * 120,
        rot: (Math.random() - 0.5) * 2.4,
      });
    }
}

function easeOutBack(x) { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; }

// Where the playhead is, in (fractional) steps, for audio time `now`.
function playheadPos(now) {
  const tl = play.timeline;
  for (let i = tl.length - 1; i >= 0; i--) {
    if (tl[i].t <= now) return tl[i].step + Math.min(1, (now - tl[i].t) / tl[i].dur);
  }
  return 0;
}

function updatePhase(t, now) {
  if (play.state === "composing" && t - play.introStart >= INTRO_TOTAL) setState("tuning");
  if (play.state === "tuning" && play.loaded) afterLoad();
  if (play.state === "countin" && now >= play.startTime) setState("playing");
  if (play.state === "playing" && play.ending && now >= play.endTime + 0.5) {
    clearInterval(play.timer);
    play.timer = null;
    silentEl?.pause();
    setState("done");
  }
}

function processEvents(now) {
  const motion = !reducedMotion.matches;
  while (events.length && events[0].t <= now) {
    const e = events.shift();
    if (e.kind === "drum") { drumFlash[e.role] = e.t; continue; }
    const { note } = e;
    if (note.row >= song.R) continue;
    keyGlow.set(note.row, Math.max(keyGlow.get(note.row) ?? 0, e.t + e.d));
    for (const h of hands) if (h.target === note.row) h.press = 1;
    if (!motion) continue;
    const x = note.start * view.cellW;
    const y = view.rollTop + (note.row + 0.5) * view.cellH;
    const color = rowColor(note.row, 1, 8);
    particles.push({ kind: "ring", x, y, r: view.cellH * 0.4, life: 0, max: 0.5, color });
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90;
      particles.push({ kind: "spark", x, y, vx: Math.cos(a) * s + 30, vy: Math.sin(a) * s, life: 0, max: 0.45 + Math.random() * 0.35, color });
    }
  }
  if (particles.length > 500) particles.splice(0, particles.length - 500);
}

function roundRect(x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

function draw(t, now, dt) {
  const { W, H, dpr, cellW, cellH, rollTop, rollH, drumTop } = view;
  const R = song.R, steps = song.totalSteps;
  const active = play.state === "playing" || play.state === "countin" || (play.state === "done" && now < play.endTime + 0.5);
  const pos = play.state === "playing" ? playheadPos(now) : -1;

  // camera follows the playhead
  if (pos >= 0 && view.maxX > 0) {
    const target = clamp(pos * cellW - (W - KEY_W) * 0.3, 0, view.maxX);
    const jump = Math.abs(target - view.viewX) > (W - KEY_W);
    view.viewX = jump ? target : view.viewX + (target - view.viewX) * Math.min(1, dt * 6);
  }
  const ox = KEY_W - view.viewX; // screen x of step 0

  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = pal.bg;
  g.fillRect(0, 0, W, H);

  g.save();
  g.beginPath();
  g.rect(KEY_W, 0, W - KEY_W, H);
  g.clip();

  // row stripes (black-key rows shaded) + grid
  for (let r = 0; r < R; r++) {
    if (BLACK.has(song.rowMidi[r] % 12)) { g.fillStyle = pal.grid; g.fillRect(KEY_W, rollTop + r * cellH, W, cellH); }
  }
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(ox + s * cellW) + 0.5;
    if (x < KEY_W - 1 || x > W + 1) continue;
    g.strokeStyle = s % 4 === 0 ? pal.gridStrong : pal.grid;
    g.beginPath(); g.moveTo(x, rollTop); g.lineTo(x, rollTop + rollH); g.stroke();
    if (s % 16 === 0 && s < steps) {
      g.fillStyle = pal.muted;
      g.font = "600 10px ui-monospace, Menlo, monospace";
      g.fillText(String(s / 16 + 1), x + 4, 14);
    }
    if (s % 4 === 0) { g.fillStyle = pal.gridStrong; g.fillRect(x - 0.5, RULER_H - 6, 1, 6); }
  }
  g.strokeStyle = pal.gridStrong;
  g.beginPath(); g.moveTo(KEY_W, rollTop + 0.5); g.lineTo(W, rollTop + 0.5); g.stroke();

  // notes
  const showChars = cellW >= 11 && cellH >= 11;
  const fontPx = Math.round(clamp(cellH * 0.62, 8, 15));
  g.font = `700 ${fontPx}px ui-monospace, Menlo, monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";

  if (play.state === "composing") {
    drawIntro(t - play.introStart, ox, showChars);
  } else {
    for (const note of song.notes) {
      const x = ox + note.start * cellW, w = note.len * cellW;
      if (x + w < KEY_W || x > W) continue;
      const y = rollTop + note.row * cellH;
      const sounding = pos >= note.start && pos < note.start + note.len;
      const played = pos >= note.start + note.len;
      g.shadowBlur = sounding ? 16 : 0;
      g.shadowColor = rowColor(note.row, 0.9, 10);
      g.fillStyle = rowColor(note.row, played && active ? 0.55 : 1, sounding ? 12 : 0);
      roundRect(x + 1, y + 1, w - 2, cellH - 2, Math.min(4, cellH / 3));
      g.fill();
      g.shadowBlur = 0;
      if (showChars) {
        g.fillStyle = "rgba(0,0,0,0.55)";
        for (let k = 0; k < note.len; k++) {
          const ch = song.grid[note.row][note.start + k];
          if (ch) g.fillText(ch, x + (k + 0.5) * cellW, y + cellH / 2 + 0.5);
        }
      }
    }
  }

  // drum lane
  if (els.drums.checked) {
    const sz = Math.min(cellW, DRUM_ROW_H) - 4;
    for (let s = 0; s < steps; s++) {
      const x = ox + s * cellW;
      if (x + cellW < KEY_W || x > W) continue;
      const hits = drumHitsAt(s);
      const cur = pos >= s && pos < s + 1;
      const lanes = currentStyle().roles;
      hits.forEach(({ role, v }) => {
        const i = lanes.indexOf(role);
        if (i < 0) return;
        const y = drumTop + i * DRUM_ROW_H;
        const flash = now - (drumFlash[role] ?? -9) < 0.12;
        g.fillStyle = ROLE_COLOR[role];
        g.globalAlpha = cur && flash ? 1 : v < 0.6 ? 0.3 : 0.55;
        roundRect(x + (cellW - sz) / 2, y + (DRUM_ROW_H - sz) / 2, sz, sz, 3);
        g.fill();
        g.globalAlpha = 1;
      });
    }
  }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.max) { particles.splice(i, 1); continue; }
    const k = p.life / p.max;
    g.globalAlpha = 1 - k;
    if (p.kind === "ring") {
      g.strokeStyle = p.color; g.lineWidth = 2;
      g.beginPath(); g.arc(ox + p.x, p.y, p.r + k * 26, 0, Math.PI * 2); g.stroke();
    } else {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt;
      g.fillStyle = p.color;
      g.beginPath(); g.arc(ox + p.x, p.y, 2.2 * (1 - k) + 0.6, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1; g.lineWidth = 1;

  // playhead with a "thinking" shimmer
  if (pos >= 0) {
    const x = ox + pos * cellW;
    const bottom = els.drums.checked ? drumTop + currentStyle().roles.length * DRUM_ROW_H : rollTop + rollH;
    const glow = 0.18 + 0.1 * Math.sin(t * 7);
    const grad = g.createLinearGradient(x - 14, 0, x + 14, 0);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(0.5, withAlpha(pal.accent, glow));
    grad.addColorStop(1, "transparent");
    g.fillStyle = grad;
    g.fillRect(x - 14, rollTop, 28, bottom - rollTop);
    g.fillStyle = pal.accent;
    g.fillRect(x - 1, rollTop - 4, 2, bottom - rollTop + 4);
    if (!reducedMotion.matches) {
      for (let i = 0; i < 3; i++) {
        const yy = rollTop + (((t * 0.6 + i / 3) % 1) * (bottom - rollTop));
        g.fillStyle = pal.accent2;
        g.globalAlpha = 0.8;
        g.beginPath(); g.arc(x, yy, 2.5, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    g.beginPath();
    g.moveTo(x - 6, rollTop - 10); g.lineTo(x + 6, rollTop - 10); g.lineTo(x, rollTop - 3); g.closePath();
    g.fill();
  }
  g.restore();

  drawKeyboard(now, pos, dt, t);
  drawOverlay(t, now);
}

function drawIntro(it, ox, showChars) {
  const { cellW, cellH, rollTop } = view;
  const fontPx = Math.round(clamp(cellH * 0.85, 9, 22));
  const sweep = ((it - INTRO_COMPOSE_END) / INTRO_SOLID) * (song.C + 2);
  // solidified part
  for (const note of song.notes) {
    const w = clamp(sweep - note.start, 0, note.len);
    if (w <= 0) continue;
    const grow = clamp((sweep - note.start) / 1.5, 0.35, 1);
    const x = ox + note.start * cellW, y = rollTop + note.row * cellH;
    const hh = (cellH - 2) * grow;
    g.shadowBlur = sweep - (note.start + note.len) < 3 ? 18 : 0;
    g.shadowColor = rowColor(note.row, 1, 15);
    g.fillStyle = rowColor(note.row);
    roundRect(x + 1, y + (cellH - hh) / 2, w * cellW - 2, hh, Math.min(4, cellH / 3));
    g.fill();
    g.shadowBlur = 0;
  }
  // falling characters
  g.font = `700 ${fontPx}px ui-monospace, Menlo, monospace`;
  for (const cell of play.introCells) {
    if (cell.c < sweep) continue;
    const p = clamp((it - cell.delay) / INTRO_FALL, 0, 1);
    if (p <= 0) continue;
    const e = easeOutBack(p);
    const tx = ox + (cell.c + 0.5) * cellW, ty = rollTop + (cell.r + 0.5) * cellH;
    const x = tx + cell.jx * (1 - e);
    const y = ty - (cell.drop + ty) * (1 - e);
    g.save();
    g.globalAlpha = Math.min(1, p * 3);
    g.translate(x, y);
    g.rotate(cell.rot * (1 - e));
    g.fillStyle = rowColor(cell.r, 1, 6);
    g.fillText(cell.ch, 0, 1);
    g.restore();
  }
  // sweep glow bar
  if (sweep > 0 && sweep < song.C + 2) {
    const x = ox + sweep * cellW;
    const grad = g.createLinearGradient(x - 40, 0, x + 6, 0);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(1, pal.accent2);
    g.globalAlpha = 0.35;
    g.fillStyle = grad;
    g.fillRect(x - 40, rollTop, 46, view.rollH);
    g.globalAlpha = 1;
  }
}

function drawKeyboard(now, pos, dt, t) {
  const { cellH, rollTop, drumTop } = view;
  g.fillStyle = pal.bg;
  g.fillRect(0, 0, KEY_W, view.H);
  const label = cellH >= 10;
  g.font = `600 ${Math.round(clamp(cellH * 0.55, 8, 11))}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = "left";
  g.textBaseline = "middle";
  for (let r = 0; r < song.R; r++) {
    const midi = song.rowMidi[r];
    const black = BLACK.has(midi % 12);
    const y = rollTop + r * cellH;
    const lit = (keyGlow.get(r) ?? 0) > now && play.state !== "idle";
    g.fillStyle = lit ? rowColor(r, 1, 6) : black ? pal.keyBlack : pal.keyWhite;
    roundRect(4, y + 0.5, KEY_W - 8, cellH - 1, 3);
    g.fill();
    g.strokeStyle = pal.gridStrong;
    g.stroke();
    if (label) {
      g.fillStyle = lit ? "#111" : black ? pal.keyBlackText : pal.keyWhiteText;
      g.fillText(NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1), 10, y + cellH / 2 + 0.5);
    }
  }
  if (els.drums.checked) {
    g.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    currentStyle().roles.forEach((role, i) => {
      const y = drumTop + i * DRUM_ROW_H;
      const flash = now - (drumFlash[role] ?? -9) < 0.12;
      g.fillStyle = flash ? ROLE_COLOR[role] : pal.muted;
      g.fillText(ROLE_LABEL[role], 10, y + DRUM_ROW_H / 2);
    });
  }
  if (pos >= 0) drawHands(now, pos, dt, t);
}

// Two glowing "ghost hands" that glide to the notes the AI is about to play.
function drawHands(now, pos, dt, t) {
  const rows = [];
  const s0 = Math.floor(pos);
  for (const n of song.notes) if (pos >= n.start && pos < n.start + n.len) rows.push(n.row);
  for (let k = 1; k <= 2; k++) {
    let s = s0 + k;
    if (s >= song.totalSteps) { if (!els.loop.checked) break; s -= song.totalSteps; }
    for (const n of song.notesByStep[s] ?? []) rows.push(n.row);
  }
  if (rows.length) {
    const lo = Math.max(...rows), hi = Math.min(...rows);
    hands[0].target = lo;
    hands[1].target = hi === lo ? Math.max(0, lo - 2) : hi;
  }
  const { cellH, rollTop } = view;
  hands.forEach((h, i) => {
    if (h.target == null) return;
    const ty = rollTop + (h.target + 0.5) * cellH;
    h.y = h.y == null ? ty : h.y + (ty - h.y) * Math.min(1, dt * 14);
    h.press = Math.max(0, h.press - dt * 5);
    const x = KEY_W * (i === 0 ? 0.42 : 0.72) + Math.sin(t * 2 + i) * 2;
    const r = clamp(cellH * 0.55, 6, 12) * (1 - h.press * 0.25);
    const glow = g.createRadialGradient(x, h.y, 0, x, h.y, r * 2.6);
    glow.addColorStop(0, withAlpha(i ? pal.accent2 : pal.accent, 0.7));
    glow.addColorStop(1, "transparent");
    g.fillStyle = glow;
    g.beginPath(); g.arc(x, h.y, r * 2.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath(); g.arc(x, h.y, r * 0.55, 0, Math.PI * 2); g.fill();
    // fingers
    for (let f = 0; f < 4; f++) {
      const a = -0.75 + f * 0.5;
      g.beginPath();
      g.arc(x + Math.cos(a) * r * 1.15, h.y + Math.sin(a) * r * 1.15, r * 0.22, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function drawOverlay(t, now) {
  const { W, rollTop, rollH } = view;
  const cx = KEY_W + (W - KEY_W) / 2, cy = rollTop + rollH / 2;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (play.state === "countin") {
    const k = (now - play.countStart) / play.beat;
    if (k >= 0) {
      const beat = Math.min(4, Math.floor(k) + 1), frac = k % 1;
      const size = clamp(rollH * 0.7, 36, 120) * (1.3 - 0.3 * Math.min(1, frac * 3));
      g.globalAlpha = 0.85 * (1 - frac * 0.8);
      g.fillStyle = pal.accent;
      g.font = `800 ${Math.round(size)}px ui-sans-serif, system-ui, sans-serif`;
      g.fillText(String(beat), cx, cy);
      g.globalAlpha = 1;
    }
  } else if (play.state === "tuning") {
    g.globalAlpha = 0.6 + 0.3 * Math.sin(t * 5);
    g.fillStyle = pal.text;
    g.font = "600 14px ui-sans-serif, system-ui, sans-serif";
    g.fillText(`tuning ${instLabel().toLowerCase()}…`, cx, cy);
    g.globalAlpha = 1;
  } else if (!song.notes.length) {
    g.fillStyle = pal.muted;
    g.font = "500 14px ui-sans-serif, system-ui, sans-serif";
    g.fillText("Type a word or paste some ASCII art", cx, cy);
  }
}

function frame(ms) {
  const t = ms / 1000;
  const dt = Math.min(0.05, Math.max(0, t - lastFrame));
  lastFrame = t;
  const now = ctx ? ctx.currentTime : 0;
  updatePhase(t, now);
  processEvents(now);
  layout();
  draw(t, now, dt);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- wiring

let song;

function refresh() {
  song = buildSong();
  if (play.state === "composing") buildIntroCells();
  const scale = els.scale.selectedOptions[0].textContent.toLowerCase();
  const key = NOTE_NAMES[+els.root.value];
  const style = FONT_STYLES[els.font.value];
  els.fontHint.textContent = song.mode === "word" ? style.hint : "Font styles apply to words";
  els.font.closest("label").classList.toggle("dim", song.mode !== "word");
  const oct = +els.octave.value;
  const octLabel = oct ? ` · octave ${oct > 0 ? "+" : "−"}${Math.abs(oct)}` : "";
  els.info.textContent = song.R
    ? `${song.mode} mode${song.mode === "word" ? ` · ${style.label.toLowerCase()} font` : ""}${octLabel} · ${song.R} rows × ${song.C} steps · ${song.notes.length} notes · ${key} ${scale}`
    : "empty";
}

function presetRow(label, items, cls) {
  const row = document.createElement("div");
  row.className = "preset-row";
  const tag = document.createElement("span");
  tag.className = "preset-label";
  tag.textContent = label;
  row.append(tag);
  for (const text of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip " + cls;
    b.textContent = text;
    b.addEventListener("click", () => {
      els.text.value = text;
      refresh();
      scheduleUrlSync();
      trackEvent("preset", { name: text });
    });
    row.append(b);
  }
  els.presets.append(row);
}
presetRow("Words", WORDS, "");
presetRow("Emojis", EMOJIS.map((e) => (/[❤☀]/.test(e) ? e + "\uFE0F" : e)), "emoji");

els.text.value = "❤️";
for (const el of [els.text, els.mode, els.scale, els.root, els.octave, els.font, els.sustain]) el.addEventListener("input", refresh);
els.bpm.addEventListener("input", () => { els.bpmOut.textContent = els.bpm.value; });
els.drums.addEventListener("change", () => {
  els.drumOpts.classList.toggle("off", !els.drums.checked);
  if (els.drums.checked && ctx) loadKit(els.kit.value);
  if (play.state === "playing") setState("playing");
});
els.kit.addEventListener("change", () => { if (ctx) loadKit(els.kit.value); });
els.instrument.addEventListener("change", () => {
  if (!ctx) return;
  const e = loadInstrument(els.instrument.value);
  if (e.loaded) activeInst = e;
  if (play.state === "playing") e.ready.then(() => play.state === "playing" && setState("playing"));
});
els.loop.addEventListener("change", () => {
  // Turning loop back on before the last step ran out keeps the performance going.
  if (els.loop.checked && play.ending && ctx && ctx.currentTime < play.endTime) {
    play.ending = false;
    play.nextStep = 0;
  }
});
els.play.addEventListener("click", () => {
  const busy = play.state !== "idle" && play.state !== "done";
  if (busy) { stopPerformance(); return; }
  els.sharedBanner.hidden = true;
  startPerformance();
  trackEvent("play", { kind: song.mode });
});
els.replay.addEventListener("click", startPerformance);
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target.closest("textarea, select, input, button, dialog")) return;
  e.preventDefault();
  els.play.click();
});

// drag to scroll the roll; a plain click skips the intro / count-in
let drag = null;
els.canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, vx: view.viewX, moved: false }; });
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 4) drag.moved = true;
  if (drag.moved) view.viewX = clamp(drag.vx - dx, 0, view.maxX);
});
window.addEventListener("pointerup", () => {
  if (drag && !drag.moved) skipIntro();
  drag = null;
});
els.canvas.addEventListener("wheel", (e) => {
  const dx = e.shiftKey ? e.deltaY : e.deltaX;
  if (!dx || view.maxX <= 0) return;
  e.preventDefault();
  view.viewX = clamp(view.viewX + dx, 0, view.maxX);
}, { passive: false });

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readTheme);
new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// ---------------------------------------------------------------- drums UI

const RANDOM_OPT = els.pattern.querySelector('option[value="random"]');
function showRandomOption() {
  RANDOM_OPT.hidden = false;
  RANDOM_OPT.textContent = `🎲 Random #${seedLabel(drumSeed)}`;
}
const updateSwingOut = () => { els.swingOut.textContent = `${els.swing.value}%`; };
function setStyleSwing() {
  els.swing.value = Math.round(currentStyle().style.swing * 100);
  updateSwingOut();
}

els.swing.addEventListener("input", updateSwingOut);
els.pattern.addEventListener("change", setStyleSwing);
els.dice.addEventListener("click", () => {
  drumSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  showRandomOption();
  els.pattern.value = "random";
  els.kit.value = KITS[drumSeed % KITS.length];
  setStyleSwing();
  if (!els.drums.checked) { els.drums.checked = true; els.drums.dispatchEvent(new Event("change")); }
  els.kit.dispatchEvent(new Event("change"));
  scheduleUrlSync();
  trackEvent("drums_randomise");
});

// "Surprise me": a random instrument, scale, key, font and beat in one go.
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const optionValues = (sel) => [...sel.options].filter((o) => !o.hidden).map((o) => o.value);
els.surprise.addEventListener("click", () => {
  els.instrument.value = pickOne(optionValues(els.instrument));
  els.scale.value = pickOne(["pentatonic", "pentatonic", "major", "minor", "blues"]);
  els.root.value = pickOne(optionValues(els.root));
  els.font.value = pickOne(optionValues(els.font));
  els.drums.checked = Math.random() < 0.8;
  els.pattern.value = pickOne(Object.keys(STYLES));
  els.kit.value = pickOne(KITS);
  setStyleSwing();
  for (const el of [els.instrument, els.drums, els.kit]) el.dispatchEvent(new Event("change"));
  refresh();
  scheduleUrlSync();
  trackEvent("surprise");
});

// ---------------------------------------------------------------- MIDI export

function songSlug() {
  if (song.mode === "word") return els.text.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "song";
  return song.mode === "emoji" ? "emoji" : "drawing";
}

els.midi.addEventListener("click", () => {
  if (!song.notes.length) return;
  const notes = song.notes.map((n) => ({ step: n.start, len: n.len, midi: n.midi, vel: chordVel(song.notesByStep[n.start].length) }));
  const drums = [];
  if (els.drums.checked) {
    for (let step = 0; step < song.totalSteps; step++)
      for (const hit of drumHitsAt(step)) drums.push({ step, note: GM_DRUM[hit.role], vel: drumVel(hit), roll: hit.roll });
  }
  const bytes = buildMidi({
    bpm: +els.bpm.value, program: GM_PROGRAM[els.instrument.value] ?? 0, swing: swingAmount(), notes, drums,
  });
  downloadBytes(bytes, `musiciate-${songSlug()}.mid`);
  trackEvent("midi_export");
});

// ---------------------------------------------------------------- song state in the link

function collectState() {
  return {
    v: 1,
    t: els.text.value, m: els.mode.value, f: els.font.value, i: els.instrument.value,
    sc: els.scale.value, k: +els.root.value, o: +els.octave.value, b: +els.bpm.value,
    su: els.sustain.checked ? 1 : 0, l: els.loop.checked ? 1 : 0,
    d: {
      on: els.drums.checked ? 1 : 0, p: els.pattern.value, kt: els.kit.value,
      lv: +els.drumVol.value, sw: +els.swing.value, sd: drumSeed,
    },
  };
}

// Shared links are untrusted input: only accept values the controls already offer.
function setSelect(el, v) {
  if (v == null) return;
  const val = String(v);
  if ([...el.options].some((o) => o.value === val)) el.value = val;
}
function setRange(el, v) {
  const n = Number(v);
  if (v != null && Number.isFinite(n)) el.value = String(clamp(Math.round(n), +el.min, +el.max));
}
const setCheck = (el, v) => { if (v != null) el.checked = !!v; };

function applyState(st) {
  if (typeof st.t === "string") els.text.value = st.t.slice(0, 2000);
  setSelect(els.mode, st.m);
  setSelect(els.font, st.f);
  setSelect(els.instrument, st.i);
  setSelect(els.scale, st.sc);
  setSelect(els.root, st.k);
  setSelect(els.octave, st.o);
  setRange(els.bpm, st.b);
  setCheck(els.sustain, st.su);
  setCheck(els.loop, st.l);
  const d = st.d && typeof st.d === "object" ? st.d : {};
  if (Number.isInteger(d.sd) && d.sd >= 0) drumSeed = d.sd >>> 0;
  if (d.p === "random") showRandomOption();
  setSelect(els.pattern, d.p);
  setSelect(els.kit, d.kt);
  setRange(els.drumVol, d.lv);
  setRange(els.swing, d.sw);
  setCheck(els.drums, d.on);
  els.bpmOut.textContent = els.bpm.value;
  updateSwingOut();
  els.drumOpts.classList.toggle("off", !els.drums.checked);
}

let urlTimer = null;
function scheduleUrlSync() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(async () => {
    history.replaceState(null, "", `${location.pathname}?s=${await encodeState(collectState())}`);
  }, 400);
}
for (const type of ["input", "change"]) document.querySelector(".grid").addEventListener(type, scheduleUrlSync);

async function loadFromUrl() {
  const param = new URLSearchParams(location.search).get("s");
  if (!param) return;
  const st = await decodeState(param);
  if (!st) { history.replaceState(null, "", location.pathname); return; }
  applyState(st);
  refresh();
  els.sharedBanner.hidden = false;
  trackEvent("shared_open");
}
els.sharedPlay.addEventListener("click", () => els.play.click());

// ---------------------------------------------------------------- share dialog

function shareText() {
  const t = els.text.value.trim();
  if (song.mode === "word") return `This is what "${t.slice(0, 40)}" sounds like 🎹`;
  if (song.mode === "emoji") return `This is what ${t.slice(0, 16)} sounds like 🎹`;
  return "This is what my drawing sounds like 🎹";
}

els.share.addEventListener("click", async () => {
  const url = `${location.origin}/?s=${await encodeState(collectState())}`;
  const text = shareText();
  const targets = shareTargets(url, text);
  els.shareUrl.value = url;
  for (const a of els.shareLinks) a.href = targets[a.dataset.net];
  const label = currentStyle().style.label;
  const drums = els.drums.checked ? ` · ${label[0].toLowerCase() + label.slice(1)} drums` : "";
  els.shareSummary.textContent = `${text.replace(/ 🎹$/, "")} · ${instLabel()}${drums}`;
  els.nativeShare.hidden = !navigator.share;
  els.nativeShare.onclick = () => {
    navigator.share({ title: "musiciate", text, url }).catch(() => {});
    trackEvent("share", { network: "device" });
  };
  els.shareDialog.showModal();
  trackEvent("share_open");
});
for (const a of els.shareLinks) a.addEventListener("click", () => trackEvent("share", { network: a.dataset.net }));
els.copyLink.addEventListener("click", async () => {
  const ok = await copyText(els.shareUrl.value, els.shareUrl);
  els.copyLink.textContent = ok ? "Copied ✓" : "Press ⌘C";
  setTimeout(() => { els.copyLink.textContent = "Copy link"; }, 1600);
  trackEvent("copy_link");
});

// ---------------------------------------------------------------- start

els.version.textContent = `v${VERSION}`;
els.version.href = CHANGELOG_URL;
initAnalytics();
readTheme();
refresh();
setStyleSwing();
setState("idle");
loadFromUrl();
requestAnimationFrame(frame);
