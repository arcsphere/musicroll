// Drum styles, the seeded beat randomiser, and per-step hit lookup.
// Pattern rows are strings, one character per 16th step:
//   "."  rest   "x" hit   "X" accent   "g" ghost   "r" roll (two quick hits)
// A row may be any length (Waltz uses 12); it repeats with step % length.

export const ROLES = ["kick", "snare", "clap", "hat", "open", "perc"];
export const ROLE_LABEL = { kick: "Kick", snare: "Snare", clap: "Clap", hat: "Hat", open: "Open", perc: "Perc" };
export const ROLE_COLOR = { kick: "#ff7a59", snare: "#ffc145", clap: "#b48cff", hat: "#4fd1c5", open: "#5fb8ff", perc: "#ff8fc7" };
export const ROLE_VEL = { kick: 115, snare: 100, clap: 95, hat: 70, open: 78, perc: 85 };
// General MIDI percussion notes, used by the MIDI export.
export const GM_DRUM = { kick: 36, snare: 38, clap: 39, hat: 42, open: 46, perc: 37 };

// Sample-name patterns used to find each role in a drum-machine kit.
export const KIT_ROLE_MATCH = {
  kick: [/kick/],
  snare: [/snare/],
  clap: [/clap/],
  hat: [/hihat-close|hhclosed/, /^hihat$|hh/],
  open: [/hihat-open|hhopen/],
  perc: [/rimshot|stick/, /cowbell|clave/, /conga|tom/],
};

export const KITS = ["TR-808", "LM-2", "Casio-RZ1", "MFB-512", "Roland CR-8000"];

export const STYLES = {
  text:      { label: "From the text", swing: 0 },
  four:      { label: "Four-on-the-floor", swing: 0,
               kick: "X...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x." },
  house:     { label: "House", swing: 0.1,
               kick: "X...x...x...x...", clap: "....x.......x...", hat: "xx.xxx.xxx.xxx.x", open: "..x...x...x...x." },
  rock:      { label: "Rock", swing: 0,
               kick: "X.......x.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", open: "..............x." },
  hiphop:    { label: "Hip-hop", swing: 0.25,
               kick: "X.....x...x..x..", snare: "....X..g....X...", hat: "x.x.x.x.x.x.x.x.", clap: "............x..." },
  funk:      { label: "Funk", swing: 0.15,
               kick: "X..x..x...x.x...", snare: "....X..g.g..X..g", hat: "XxxxXxxxXxxxXxxx", open: "..........x....." },
  disco:     { label: "Disco", swing: 0,
               kick: "X...x...x...x...", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", open: "..x...x...x...x." },
  bossa:     { label: "Bossa nova", swing: 0.1,
               kick: "x..xx..xx..xx..x", perc: "x..x..x...x..x..", hat: "xgxgxgxgxgxgxgxg" },
  samba:     { label: "Samba", swing: 0.1,
               kick: "X.......x.......", perc: "x.xx.x.x.xx.x.x.", hat: "XgxgXgxgXgxgXgxg", snare: "..g...g...g...g." },
  afrobeat:  { label: "Afrobeat", swing: 0.15,
               kick: "X......xX.......", snare: "....x.......x...", hat: "x.xxx.xxx.xxx.xx", perc: "x..x..x...x.x..." },
  reggae:    { label: "Reggae (one drop)", swing: 0.2,
               kick: "........X.......", perc: "........X.......", hat: "..x...x...x...x." },
  trap:      { label: "Trap", swing: 0,
               kick: "X......x..X.....", clap: "........X.......", hat: "x.x.xrx.x.x.rrx.", open: "..............x." },
  breakbeat: { label: "Breakbeat", swing: 0.05,
               kick: "X.x.......xX....", snare: "....X..g.x..X..g", hat: "x.x.x.x.x.x.x.x." },
  dnb:       { label: "Drum & bass", swing: 0,
               kick: "X.........X.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", open: ".......x........" },
  lofi:      { label: "Lo-fi", swing: 0.45,
               kick: "X......x..x.....", snare: "....X.......X...", hat: "x.g.x.g.x.g.x.g.", perc: "..............g." },
  march:     { label: "March", swing: 0,
               kick: "X.......X.......", snare: "X..xX...X.xxX.x." },
  waltz:     { label: "Waltz (3/4)", swing: 0,
               kick: "X...........", snare: "....x...x...", hat: "x.x.x.x.x.x." },
};

const HIT = { x: 1, X: 1.2, g: 0.45, r: 0.8 };

// Small, fast, seedable PRNG so a random beat can be rebuilt from its seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const seedLabel = (seed) => (seed >>> 0).toString(16).padStart(8, "0").slice(-4);

// Build a musical-sounding random beat from a seed.
export function randomStyle(seed) {
  const r = mulberry32(seed);
  const row = (fn) => Array.from({ length: 16 }, (_, i) => fn(i)).join("");
  const kick = row((i) => {
    if (i === 0) return "X";
    if (i === 8) return r() < 0.6 ? "x" : ".";
    return r() < (i % 2 === 0 ? 0.26 : 0.07) ? "x" : ".";
  });
  const backbeat = r() < 0.9;
  const ghosts = r() < 0.5;
  const bb = row((i) => (backbeat && (i === 4 || i === 12) ? "X" : ghosts && r() < 0.08 ? "g" : "."));
  const useClap = r() < 0.4;
  const hatMode = ["8ths", "16ths", "offbeat"][Math.floor(r() * 3)];
  const hat = row((i) => {
    const on = hatMode === "16ths" || (hatMode === "8ths" ? i % 2 === 0 : i % 4 === 2);
    if (!on) return ".";
    if (r() < 0.07) return "r";
    return i % 4 === 0 ? "X" : hatMode === "16ths" && i % 2 ? "g" : "x";
  });
  const open = r() < 0.45 ? row((i) => ((i === 6 || i === 14) && r() < 0.6 ? "x" : ".")) : "";
  const perc = r() < 0.5 ? row(() => (r() < 0.1 ? "x" : ".")) : "";
  return {
    label: `Random #${seedLabel(seed)}`,
    swing: Math.round(r() * 40) / 100,
    kick,
    snare: useClap ? "" : bb,
    clap: useClap ? bb : "",
    hat, open, perc,
  };
}

// Which roles a style actually uses (so the drum lane only shows those).
export function styleRoles(key, style) {
  if (key === "text") return ["kick", "snare", "clap", "hat"];
  return ROLES.filter((role) => style[role] && /[^.]/.test(style[role]));
}

// Hits at one step: [{ role, v (velocity factor), roll }].
export function hitsAt(key, style, step, bottomDensity) {
  if (key === "text") {
    const d = bottomDensity[step] ?? 0;
    const out = [];
    if (step % 16 === 0 || (step % 2 === 0 && d >= 0.6)) out.push({ role: "kick", v: step % 16 === 0 ? 1.2 : 1 });
    if (step % 8 === 4) out.push({ role: "snare", v: 1 });
    if (step % 16 === 12 && d >= 0.3) out.push({ role: "clap", v: 1 });
    if (step % 2 === 0) out.push({ role: "hat", v: step % 4 === 0 ? 1 : 0.8 });
    return out;
  }
  const out = [];
  for (const role of ROLES) {
    const row = style[role];
    if (!row) continue;
    const ch = row[step % row.length];
    if (HIT[ch]) out.push({ role, v: HIT[ch], roll: ch === "r" });
  }
  return out;
}
