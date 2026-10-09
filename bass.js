// Bass track: styles, the seeded bass randomiser, and the bass line that follows the melody.
// Pattern rows are strings, one character per 16th step (repeating with step % length):
//   "R" root   "2" next scale note up   "3" two scale notes up   "5" fifth   "8" octave
//   "a" approach note (a semitone below the next root)   "g" ghost (short, quiet root)
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

// Bass register: put a pitch class between E1 (28) and D#2 (39).
const bassPitch = (pc) => 28 + ((pc - 4 + 24) % 12);

/**
 * Build the bass line for a song.
 * @returns {Array<{midi:number,len:number,vel:number}|null>} one entry per step (note starts only)
 */
export function bassLine(song, styleKey, style, keyPc, scale) {
  const steps = song.totalSteps;
  const out = new Array(steps).fill(null);
  if (!song.notes.length) return out;
  const scalePcs = new Set(scale.map((x) => (keyPc + x) % 12));
  const scaleUp = (pc, n) => {
    let p = pc;
    for (let k = 0; k < n; k++) {
      for (let d = 1; d <= 12; d++) if (scalePcs.has((p + d) % 12)) { p = (p + d) % 12; break; }
    }
    return p;
  };

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

  // Harmony: the middle note of what plays in each half bar (or 3/4 bar) sets that window's root,
  // so the bass moves with the shape of the letters instead of sitting on the bottom row.
  const row = style.row;
  const win = row.length === 12 ? 12 : 8;
  const roots = [];
  let prev = keyPc;
  for (let w = 0; w * win < steps; w++) {
    const pitches = song.notes
      .filter((n) => n.start < (w + 1) * win && n.start + n.len > w * win)
      .map((n) => n.midi)
      .sort((a, b) => a - b);
    if (pitches.length) prev = pitches[Math.floor((pitches.length - 1) / 2)] % 12;
    roots.push(prev);
  }

  for (let s = 0; s < steps; s++) {
    const ch = row[s % row.length];
    if (ch === "." || ch === "-") continue;
    const w = Math.floor(s / win);
    const root = roots[w];
    let midi;
    switch (ch) {
      case "5": midi = bassPitch(root) + 7; break;
      case "8": midi = bassPitch(root) + 12; break;
      case "2": midi = bassPitch(scaleUp(root, 1)); break;
      case "3": midi = bassPitch(scaleUp(root, 2)); break;
      case "a": midi = bassPitch(roots[w + 1] ?? roots[0]) - 1; break;
      default: midi = bassPitch(root);
    }
    let len = 1;
    while (s + len < steps && row[(s + len) % row.length] === "-") len++;
    const ghost = ch === "g";
    out[s] = { midi, len: ghost ? 0.5 : len, vel: ghost ? 50 : s % 4 === 0 ? 110 : 95 };
  }
  return out;
}
