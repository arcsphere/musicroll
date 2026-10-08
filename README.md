# MusicRoll — ASCII Piano Roll

Type a word or paste ASCII art. It's drawn as a piano roll and played on the instrument you pick, with an optional drum track.

- **Rows are pitches** (top = highest) and **columns are 16th-note steps**.
- A word is rendered in a built-in 5×7 pixel font; with ASCII art, every non-space character is a note.
- Scales: pentatonic (default), major, minor, blues, chromatic. Pick a key and a tempo.
- Instruments are General MIDI soundfonts and the drum kits are sampled drum machines, both loaded from [smplr](https://github.com/danigb/smplr). If they can't load, a built-in synth takes over.
- Intro animation (letters fall in → notes solidify → 1-2-3-4 count-in), an "AI is playing" indicator with ghost hands on the keyboard, and a loop on/off switch.

No build step: it's plain `index.html` + `app.js`.

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

**Boston Sense Labs**

## License

[MIT](LICENSE) © 2026 Boston Sense Labs. Free to use, modify and share.
