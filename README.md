# musiciate

Type a word, an emoji or some ASCII art. It's drawn as a piano roll and played on the instrument you pick, with optional bass and drum tracks. Live at [musiciate.com](https://www.musiciate.com).

- **Rows are pitches** (top = highest) and **columns are 16th-note steps**.
- Words use a built-in 5×7 pixel font in seven styles (each one changes the sound). Emojis have hand-drawn shapes. In ASCII art, every non-space character is a note.
- Scales: pentatonic (default), major, minor, blues, chromatic. Pick a key, an octave and a tempo.
- Optional bass track: 12 styles that follow your melody, 8 bass sounds, and a 🎲 bass randomiser.
- 17 drum styles, swing, and a 🎲 beat randomiser.
- **Share**: the whole song is stored in the link (`?s=`), so there's no database. One-click X, LinkedIn, Facebook, WhatsApp and email.
- **Export MIDI** for FL Studio, GarageBand, Ableton and similar apps.
- Instruments are General MIDI soundfonts and the kits are sampled drum machines, both loaded from [smplr](https://github.com/danigb/smplr). If they can't load, a built-in synth takes over.
- Intro animation, count-in, an "AI is playing" indicator with ghost hands, and a loop switch.

See [CHANGELOG.md](CHANGELOG.md) for what's new.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page, styles, dialogs |
| `app.js` | Text → grid → notes, audio, piano-roll drawing, wiring |
| `drums.js` | Drum styles, beat randomiser |
| `bass.js` | Bass styles, bass randomiser, bass line that follows the melody |
| `share.js` | Song-in-the-link encoding, share links |
| `midi.js` | MIDI file export |
| `analytics.js` | Umami (set `UMAMI_WEBSITE_ID` to turn it on) |
| `version.js` | Version shown in the footer |

No build step: plain HTML and ES modules.

## Run locally

```bash
python3 -m http.server 5173
```

Open http://localhost:5173. ES modules need http://, so opening the file with file:// won't work.

## Deploy to Vercel

```bash
npx vercel --prod
```

Or push this folder to GitHub and import it in Vercel: Framework preset **Other**, no build command, output directory `.`.

## Author

**[Boston Sense Labs](https://bostonsense.com)**

## License

[MIT](LICENSE) © 2026 Boston Sense Labs. Free to use, modify and share.
