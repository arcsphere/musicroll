// Bass track: styles, the seeded bass randomiser, and the bass line that follows the melody.
// Pattern rows are strings, one character per 16th step (repeating with step % length):
//   "R" chord root   "2" chord third   "3" / "5" chord fifth   "8" octave
//   "a" approach note (the scale note just below the next root)   "g" ghost (short, quiet root)
// Every bass note stays in the chosen key and scale.
//   "-" hold the previous note   "." rest
import { mulberry32, seedLabel } from "./drums.js";

// [GM soundfont name, label, GM program for MIDI export]
export const BASS_SOUNDS = [
  ["electric_bass_finger", "Fingered electric", 33],
  ["electric_bass_pick", "Picked electric", 34],
  ["fretless_bass", "Fretless", 35],
  ["slap_bass_1", "Slap", 36],
  ["acoustic_bass", "Upright (acoustic)", 32],
  ["contrabass", "Contrabass (bowed)", 43],
  ["synth_bass_1", "Synth bass", 38],
  ["synth_bass_2", "Synth bass 2", 39],
];
export const BASS_PROGRAM = Object.fromEntries(BASS_SOUNDS.map(([name, , program]) => [name, program]));

export const BASS_STYLES = {
  follow:  { label: "Follow the melody" },
  root:    { label: "Long roots",       row: "R-------R-------" },
  pulse:   { label: "Driving eighths",  row: "R.R.R.R.R.R.R.R." },
  rock:    { label: "Rock",             row: "R...R.R.R...R.R." },
  octave:  { label: "Disco octaves",    row: "R.8.R.8.R.8.R.8." },
  funk:    { label: "Funk",             row: "R..g..R.8.g.R.5." },
  walking: { label: "Walking (jazz)",   row: "R...2...3...a..." },
  bossa:   { label: "Bossa nova",       row: "R--.5-..R--.5-.." },
  reggae:  { label: "Reggae",           row: "R--.R.5.....5-a." },
  synth:   { label: "Synth pulse",      row: "RgRgRgRgRgRgRgRg" },
  slides:  { label: "808 slides",       row: "R-------...R-5--" },
  waltz:   { label: "Waltz (3/4)",      row: "R...5...5..." },
};

// A random bass groove from a seed, so a shared link replays the same line.
export function randomBass(seed) {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const cells = [];
  for (let i = 0; i < 16; i++) {
    const chance = i === 0 ? 1 : i % 4 === 0 ? 0.7 : i % 2 === 0 ? 0.35 : 0.12;
    if (r() >= chance) { cells.push("."); continue; }
    const t = r();
    cells.push(i === 0 ? "R" : i >= 12 && t > 0.92 ? "a" : t < 0.55 ? "R" : t < 0.7 ? "5" : t < 0.85 ? "8" : "g");
    // sometimes let the note ring for a step or three
    if (cells[i] !== "g" && r() < 0.3) {
      const hold = 1 + Math.floor(r() * 3);
      for (let k = 0; k < hold && i + 1 < 16; k++) { cells.push("-"); i++; }
    }
  }
  return { label: `Random #${seedLabel(seed)}`, row: cells.join("") };
}

// Harmony. Each scale borrows chords from its parent key; candidate chord roots are given as
// semitones above the key, with a bias towards the home chord (I / i), then IV and V.
const PARENT = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const HARMONY = {
  pentatonic: { parent: "major", roots: { 0: 0.6, 7: 0.3, 9: 0.25, 2: 0, 4: 0 } },
  major:      { parent: "major", roots: { 0: 0.6, 5: 0.3, 7: 0.3, 9: 0.25, 2: 0.05, 4: 0 } },
  minor:      { parent: "minor", roots: { 0: 0.6, 5: 0.3, 7: 0.3, 8: 0.25, 10: 0.2, 3: 0.1 } },
  blues:      { parent: "minor", roots: { 0: 0.6, 5: 0.35, 7: 0.3, 10: 0.15, 3: 0.1 } },
  chromatic:  { parent: "major", roots: { 0: 0.6, 5: 0.3, 7: 0.3, 9: 0.25, 2: 0.05, 4: 0 } },
};

// Triad on a root (semitones above the key) built from the parent scale: [root, third, fifth].
function triad(root, parent) {
  const has = (x) => parent.includes(((x % 12) + 12) % 12);
  const third = has(root + 4) ? root + 4 : root + 3;
  const fifth = has(root + 7) ? root + 7 : root + 6;
  return [root % 12, third % 12, fifth % 12];
}

// How strongly chords lean towards the home chord / IV / V, and how hard clashes are penalised.
const HOME_PULL = 0.45;
const CLASH = 1.5;

// Pick, for each window, the chord that best fits the melody notes sounding in it.
function chooseChords(song, win, scaleName) {
  const h = HARMONY[scaleName] ?? HARMONY.major;
  const parent = PARENT[h.parent];
  const cands = Object.keys(h.roots).map(Number);
  const steps = song.totalSteps;
  const windows = Math.ceil(steps / win);
  const chords = [];
  let prev = 0;
  for (let w = 0; w < windows; w++) {
    const a = w * win, b = a + win;
    const weights = new Array(12).fill(0);
    let total = 0;
    for (const n of song.notes) {
      const overlap = Math.min(b, n.start + n.len) - Math.max(a, n.start);
      if (overlap <= 0) continue;
      weights[n.rel] += overlap;
      total += overlap;
    }
    if (!total) { chords.push(prev); continue; }
    let best = prev, bestScore = -Infinity;
    for (const root of cands) {
      const [r, t, f] = triad(root, parent);
      let score = 0;
      for (let pc = 0; pc < 12; pc++) {
        if (!weights[pc]) continue;
        const fit = pc === r ? 1 : pc === t || pc === f ? 0.75
          : pc === (r + 1) % 12 || pc === (f + 1) % 12 ? -CLASH // a semitone above a chord note: harsh
          : -0.2;
        score += fit * weights[pc];
      }
      score = score / total + HOME_PULL * h.roots[root] + (root === prev ? 0.15 : 0) + (w === windows - 1 && root === 0 ? 0.4 : 0);
      if (score > bestScore) { bestScore = score; best = root; }
    }
    chords.push(best);
    prev = best;
  }
  return chords.map((root) => triad(root, parent));
}

// Bass register: put a pitch class between E1 (28) and D#2 (39).
const bassPitch = (pc) => 28 + ((pc - 4 + 24) % 12);

/**
 * Build the bass line for a song.
 * @returns {Array<{midi:number,len:number,vel:number}|null>} one entry per step (note starts only)
 */
export function bassLine(song, styleKey, style, keyPc, scale, scaleName = "major") {
  const steps = song.totalSteps;
  const out = new Array(steps).fill(null);
  if (!song.notes.length) return out;
  const scalePcs = new Set(scale.map((x) => (keyPc + x) % 12));
  // Nearest scale note to a pitch class (ties go down), and the semitone gap to it.
  const snap = (pc) => {
    for (let d = 0; d <= 6; d++) {
      if (scalePcs.has((pc - d + 12) % 12)) return (pc - d + 12) % 12;
      if (scalePcs.has((pc + d) % 12)) return (pc + d) % 12;
    }
    return pc;
  };
  const above = (from, to) => (to - from + 12) % 12; // semitones up from one pitch class to another

  // "Follow the melody": the lowest note of each chord, two octaves down, held until the next one.
  if (styleKey === "follow") {
    const starts = [];
    for (let s = 0; s < steps; s++) if (song.notesByStep[s]?.length) starts.push(s);
    starts.forEach((s, i) => {
      const low = Math.min(...song.notesByStep[s].map((n) => n.midi));
      const next = starts[i + 1] ?? steps;
      out[s] = { midi: bassPitch(low % 12), len: Math.min(8, next - s), vel: s % 4 === 0 ? 108 : 96 };
    });
    return out;
  }

  // Harmony: one chord per half bar (or 3/4 bar), chosen to fit the melody notes in it.
  const row = style.row;
  const win = row.length === 12 ? 12 : 8;
  const rel = { ...song, notes: song.notes.map((n) => ({ ...n, rel: (((n.midi - keyPc) % 12) + 12) % 12 })) };
  const chords = chooseChords(rel, win, scaleName).map((c) => c.map((x) => (x + keyPc) % 12));
  const inScale = (pc) => (scalePcs.has(pc) ? pc : snap(pc));

  for (let s = 0; s < steps; s++) {
    const ch = row[s % row.length];
    if (ch === "." || ch === "-") continue;
    const w = Math.floor(s / win);
    const [root, third, fifth] = chords[w];
    const base = bassPitch(root);
    let midi;
    switch (ch) {
      case "3":
      case "5": midi = base + (above(root, inScale(fifth)) || 7); break;
      case "2": midi = base + above(root, inScale(third)); break;
      case "8": midi = base + 12; break;
      case "a": {
        // step into the next chord's root from the scale note just below it
        const next = (chords[w + 1] ?? chords[0])[0];
        let below = next;
        for (let d = 1; d <= 12; d++) if (scalePcs.has((next - d + 12) % 12)) { below = (next - d + 12) % 12; break; }
        midi = bassPitch(next) - (above(below, next) || 12);
        break;
      }
      default: midi = base;
    }
    let len = 1;
    while (s + len < steps && row[(s + len) % row.length] === "-") len++;
    const ghost = ch === "g";
    out[s] = { midi, len: ghost ? 0.5 : len, vel: ghost ? 50 : s % 4 === 0 ? 110 : 95 };
  }
  return out;
}
