// Standard MIDI File (type 1) writer for a musiciate song.
// 96 ticks per quarter note, so one 16th-note step is 24 ticks.

const PPQ = 96;
const STEP = PPQ / 4;

// General MIDI program numbers for the instruments in the menu.
export const GM_PROGRAM = {
  acoustic_grand_piano: 0, electric_piano_1: 4, celesta: 8, music_box: 10, vibraphone: 11, marimba: 12,
  church_organ: 19, orchestral_harp: 46, string_ensemble_1: 48, choir_aahs: 52, flute: 73,
  lead_1_square: 80, kalimba: 108, steel_drums: 114,
};

const ascii = (s) => [...s].map((c) => c.charCodeAt(0) & 0x7f);
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

function chunk(events) {
  // note-offs (order 0) go before note-ons (order 1) on the same tick
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data = [];
  let last = 0;
  for (const e of events) {
    data.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  data.push(0x00, 0xff, 0x2f, 0x00); // end of track
  return [...ascii("MTrk"), ...u32(data.length), ...data];
}

const meta = (tick, type, bytes) => ({ tick, order: 0, bytes: [0xff, type, ...vlq(bytes.length), ...bytes] });
const name = (s) => meta(0, 0x03, ascii(s));

/**
 * @param {object} o
 * @param {number} o.bpm
 * @param {number} o.program      GM program for the melody
 * @param {number} o.swing        0..1, delays odd steps by swing * half a step
 * @param {{step:number,len:number,midi:number,vel:number}[]} o.notes
 * @param {{step:number,note:number,vel:number,roll?:boolean}[]} o.drums
 * @param {{program:number, notes:{step:number,len:number,midi:number,vel:number}[]}} [o.bass]
 * @returns {Uint8Array}
 */
export function buildMidi({ bpm, program, swing, notes, drums, bass }) {
  const tickOf = (step) => step * STEP + (step % 2 ? Math.round(swing * STEP * 0.5) : 0);

  const usPerQuarter = Math.round(60e6 / bpm);
  const conductor = chunk([
    name("musiciate"),
    meta(0, 0x51, [(usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255]),
    meta(0, 0x58, [4, 2, 24, 8]), // 4/4
  ]);

  // One pitched track on MIDI channel `ch`.
  const pitched = (title, ch, prog, list) => {
    const events = [name(title), { tick: 0, order: 0, bytes: [0xc0 | ch, prog & 0x7f] }];
    for (const n of list) {
      const on = tickOf(n.step);
      const off = Math.max(on + 1, n.step * STEP + Math.round(n.len * STEP * 0.96));
      events.push({ tick: on, order: 1, bytes: [0x90 | ch, n.midi & 0x7f, n.vel & 0x7f] });
      events.push({ tick: off, order: 0, bytes: [0x80 | ch, n.midi & 0x7f, 0] });
    }
    return chunk(events);
  };
  const tracks = [conductor, pitched("Melody", 0, program, notes)];
  if (bass?.notes.length) tracks.push(pitched("Bass", 1, bass.program, bass.notes));

  if (drums.length) {
    const drumEvents = [name("Drums")];
    for (const d of drums) {
      const t = tickOf(d.step);
      const hits = d.roll ? [t, t + STEP / 2] : [t];
      for (const h of hits) {
        drumEvents.push({ tick: h, order: 1, bytes: [0x99, d.note, d.vel & 0x7f] });
        drumEvents.push({ tick: h + STEP / 2 - 1, order: 0, bytes: [0x89, d.note, 0] });
      }
    }
    tracks.push(chunk(drumEvents));
  }

  const header = [...ascii("MThd"), ...u32(6), 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
  return new Uint8Array([...header, ...tracks.flat()]);
}

export function downloadBytes(bytes, filename, type = "audio/midi") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
