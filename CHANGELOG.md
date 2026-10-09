# Changelog

## 2.1.2 — 2026-10-09
- The bass now plays real chords: each half bar it picks the chord (I, IV, V, vi… from the chosen key) that best fits the melody notes, leans towards the home chord, and resolves home at the end. Before, it could sit on an in-scale but off-centre note for whole bars, especially on random lines, which made the song sound like it was in another key.
- Walking bass steps through chord notes (root, third, fifth) instead of plain scale steps.

## 2.1.1 — 2026-10-09
- Bass always stays in the chosen key and scale. Fifths and approach notes now snap to the scale instead of landing outside it.

## 2.1.0 — 2026-10-09

### Bass
- **Bass track**, switched on and off like the drums. It follows the shape of your words, so it always fits the melody.
- 12 bass styles: Follow the melody, Long roots, Driving eighths, Rock, Disco octaves, Funk, Walking (jazz), Bossa nova, Reggae, Synth pulse, 808 slides, Waltz.
- 8 bass sounds: fingered, picked, fretless, slap, upright, bowed contrabass, and two synth basses.
- **🎲 Randomise bass**: a new bass line and sound. Shared links replay it exactly.
- A bass lane on the piano roll, a bass level slider, and bass in Surprise me and the MIDI export.

### Fixes
- Sound on iPhone and iPad: instruments load as MP3 and drums as M4A where Ogg can't be decoded. Audio plays even with the silent switch on, and if samples still fail the built-in synth takes over instead of silence.
- Umami analytics turned on.

## 2.0.0 — 2026-10-08

### Share
- **Share** button: the whole song (text, sounds, beat, swing, random seed) is stored in the link itself, so nothing is saved on a server.
- One-click sharing to X, LinkedIn, Facebook, WhatsApp and email, a **Copy link** button, and the phone's own share menu where it's available.
- Opening a shared link restores the song exactly and shows a "Someone shared a song with you" banner.
- Link previews: a preview image, title and description for social posts and chats.

### Drums
- 17 drum styles in four groups: Dance, Band, Groove and World. New: House, Disco, Drum & bass, Funk, Breakbeat, March, Waltz (3/4), Trap, Lo-fi, Reggae, Samba and Afrobeat.
- New drum sounds: open hi-hat and percussion (rimshot, cowbell, clave), plus accents, ghost notes and hi-hat rolls.
- **Swing** slider. It moves the melody and drums together, and each style sets its own default.
- **🎲 Randomise beat**: makes up a new beat and kit. Every random beat has an ID, so a shared link plays it back exactly.
- The drum lane only shows the drums the current style uses.

### More
- **Export MIDI**: download a `.mid` file with the melody, instrument and drums, ready for FL Studio, GarageBand, Ableton and other music apps.
- **✨ Surprise me**: random instrument, scale, key, font and beat.
- Anonymous, cookie-free usage stats (Umami). What you type is never sent.
- The version number is shown in the footer.

## 1.3.0
- Octave selector.
- Font styles for words (Classic, Bold, Italic, Tall, Wide, Dotted, Mixed). Each one changes how the word sounds.
- "Boston Sense" now links to bostonsense.com.

## 1.2.0
- Quick picks: 10 words and 10 emojis, each emoji with its own hand-drawn shape.

## 1.1.0
- Renamed to **musiciate**, with a new logo, favicon and page title.
- How it works and About popups, and a Sense Labs footer.

## 1.0.0
- First release: words and ASCII art become a piano roll and play on 14 instruments.
- Intro animation, count-in, "AI is playing" indicator, loop, and an optional drum track.
