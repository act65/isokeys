# Hexboard — an isomorphic keyboard in the browser

A hexagonal [isomorphic keyboard](https://en.wikipedia.org/wiki/Isomorphic_keyboard)
you play with your computer keyboard (or mouse/touch). On an isomorphic layout a
chord *shape* is the same everywhere on the grid — so once you learn one voicing,
you know it in every key.

Sound uses the **Web Audio API** — no MIDI synth, no plugins, nothing to install.
The piano is a real recorded grand (Salamander samples, pitch-shifted per note);
a brief loading screen covers decoding them on startup.

![screenshot](assets/screenshot.png)

## Run it

Just open `index.html` in a browser. That's it — it's a static site.

```
xdg-open index.html      # Linux
open index.html          # macOS
```

(Optional) serve it locally if you prefer a real URL:

```
python3 -m http.server
# then visit http://localhost:8000
```

## Deploy (free)

It's fully static, so any static host works:

- **GitHub Pages** — push to a repo, enable Pages on the `master` branch (root).
  Your site appears at `https://<user>.github.io/<repo>/`.
- **Netlify / Cloudflare Pages / Vercel** — drag-and-drop the folder, or connect
  the repo. No build step, no config.

## How to play

- **Keys:** rows `1`–`0`, `Q`–`P`, `A`–`;`, `Z`–`/` map to the four hex rows.
- **Layout:** pick a preset, or set the two step sizes yourself:
  - **Right step** — semitones between left/right neighbours (→)
  - **Up-right step** — semitones between a key and its up-right neighbour (↗)

  Those two intervals define the *entire* lattice — the up-left interval is just
  `up-right − right`. This is the "control over left-right / up-down step size"
  the instrument is built around. The grid is staggered like a physical QWERTY
  (each row down shifts right, so `A` sits up-left of `Z`).
- **Colour scheme:** Pitch class (rainbow), Octave bands, Monochrome, and a
  "Scale · …" entry for each scale — major, natural minor, major/minor pentatonic,
  blues, dorian, mixolydian, whole-tone, chromatic. Picking a scale reveals a
  **scale root** selector; in-scale notes are coloured by scale degree on a
  perceptual (viridis) ramp so the ascending sequence is readable, the rest fade.
- **Theme:** *Earthy* (warm, default) or *Neon* (dark).
- **Octave / Volume / Note names** — self-explanatory.

### Chords — a layout tutorial

An interactive explainer for whatever layout you've dialled in, with three views:

- **Neighbours** — every key has **6 neighbours**; this shows the signed interval
  to each (→ +2, ↗ +7, ↖ +5, …). Change the layout or the step sizes and watch
  them update — that's the isomorphic idea made concrete.
- **Chord shapes** — pick a root, chord type and inversion to see the chord's
  fixed **shape** on the grid, with `R / 3 / 5 / 7` role badges. The same shape
  plays the same chord anywhere you slide it.
- **Circle of 5ths** — the 12 notes arranged so each clockwise step is a perfect
  fifth. A scale shows up as a **contiguous arc** (the same notes glow on the
  keyboard); click a note to hear it and re-centre.

![tutorial](assets/tutorial.png)

### Games

- **Rhythm Game** — notes scroll toward the hit-line; press the matching key on
  time. Scored by timing accuracy (Perfect / Great / Good / Miss) with a combo
  multiplier. A **Speed** control (0.6× Relaxed → 2× Expert) sets the difficulty
  by compressing the timing — notes arrive faster with less time to react. 12
  13 real melodies (Tetris, Super Mario Bros., Zelda's Lullaby, Für Elise,
  Pachelbel's Canon, Final Fantasy Prelude, Pink Panther, He's a Pirate, Smoke on
  the Water, …) — see **Songs** below for how they're built.
- **Reaction Game** — play the called chord as fast as you can, with two cue
  modes:
  - **Visual** — the chord is named (e.g. "F Major, 1st inversion").
  - **Audio** — you *hear* the chord and must reproduce it (ear training). Use
    **Replay** to hear it again; the answer is revealed once you nail it.

  Scoring matches on **pitch classes**, so *any* voicing/octave/position of the
  right chord counts — there are many ways to play the same chord on an
  isomorphic grid, and they all score. Tracks best & average reaction time.
  Toggle "Show target keys" off for a challenge, and narrow the pool by **chord
  quality** (checkboxes) and suggested **inversion** to drill specifics.

Tip: you can deep-link a mode, e.g. `index.html#tutorial` or `index.html#reaction`.

## Songs

Rhythm-game melodies are **extracted from real MIDI** rather than hand-typed (which
was inaccurate). `tools/build_songs.py` fetches a curated list of MIDI files, picks
the melody line (most monophonic, melodic-register track → top voice → drop bass
leaks → quantise → transpose into a playable octave), and regenerates `js/songs.js`
in the compact `[midi, beats]` format. No MIDI or parser ships at runtime — just the
extracted note data.

To change the set, edit the `CURATED` list (name, [bitmidi](https://bitmidi.com) id,
optional track, note count) and re-run:

```
pip install mido
python3 tools/build_songs.py
```

Note: several pieces are copyrighted compositions (game/film themes), included as
short melodic excerpts for personal/educational use. Swap the list for public-domain
tunes if you plan to distribute.

## Project layout

```
index.html          # page shell
css/styles.css      # neon dark theme
js/
  theory.js         # isomorphic-grid math, note names, chords/inversions, scales
  audio.js          # sampled-piano engine (Web Audio, decode + pitch-shift)
  piano-samples.js  # Salamander Grand Piano samples, base64 (loads from file://)
  keyboard.js       # hex-grid render (Canvas) + input + colour schemes (viridis)
  songs.js          # GENERATED melodies (tools/build_songs.py) — do not hand-edit
  games.js          # RhythmGame + ReactionGame (cues, pitch-class chord matching)
  tutorial.js       # LayoutTutorial — neighbour intervals + chord shapes
  circle.js         # interactive Circle of Fifths
  main.js           # DOM wiring (controls, modes, scoreboards, loading screen)
tools/
  build_songs.py    # fetch MIDI from the web, extract melodies -> js/songs.js
archive/            # Python/tkinter prototype + Karplus-Strong synth (reference)
```

The code uses plain `<script>` tags and a single `window.KB` namespace so it runs
straight from `file://` with no bundler or server.

## Ideas / next steps

- Play the melody as backing audio in the rhythm game (currently you generate the
  sound yourself).
- Better melody extraction (per-track hints, phrase trimming) and more songs.
- Sustain pedal, velocity from key-hold, multi-velocity samples.
- Persist high scores (would need a small backend).

## Credits

Piano samples: **Salamander Grand Piano** by Alexander Holm, licensed
[CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) (via the Tone.js sample
set). Sampled every minor third from A0–C8 and pitch-shifted between points.

## Background

Inspired by *Isomorphic Tessellations for Musical Keyboards*
([ResearchGate](https://www.researchgate.net/publication/233783923_Isomorphic_Tessellations_for_Musical_Keyboards)).
