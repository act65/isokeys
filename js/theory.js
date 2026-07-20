/* theory.js — music theory + isomorphic-grid math.
 *
 * The heart of the app. An isomorphic keyboard is a triangular (hex) lattice
 * where a chord shape is the same everywhere. The whole lattice is defined by
 * just two basis intervals:
 *
 *     right   — semitones when you move ONE key to the right (east neighbour)
 *     upRight — semitones when you move ONE key up-and-to-the-right (NE neighbour)
 *
 * Everything else follows: up-left = upRight - right, and so on. This is exactly
 * the "control over left-right step size and up-down step size" the project wants,
 * instead of hard-coding Wicki-Hayden.
 */
(function (KB) {
  'use strict';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // Physical QWERTY grid: 4 rows of 10 keys. `;` `,` `.` `/` are the row tails.
  const KEY_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  ];
  const NUM_ROWS = KEY_ROWS.length;
  const NUM_COLS = 10;

  // key char -> {col, row}, and a flat list of all cells.
  const KEY_POS = {};
  const CELLS = [];
  KEY_ROWS.forEach((keys, row) => {
    keys.forEach((key, col) => {
      KEY_POS[key] = { col, row };
      CELLS.push({ key, col, row });
    });
  });

  // Human-friendly labels for the punctuation keys.
  const KEY_LABELS = { ';': ';', ',': ',', '.': '.', '/': '/' };
  function keyLabel(key) {
    return (KEY_LABELS[key] || key).toUpperCase();
  }

  function noteName(midi) {
    if (midi == null || midi < 0 || midi > 127) return '';
    const octave = Math.floor(midi / 12) - 1;
    return NOTE_NAMES[((midi % 12) + 12) % 12] + octave;
  }
  // Pitch class name only (no octave) — used for chord labels.
  function pitchClassName(midi) {
    return NOTE_NAMES[((midi % 12) + 12) % 12];
  }

  /* A layout is { right, upRight, base }.
   *
   * The grid is staggered like a physical QWERTY: each row DOWN shifts right, so
   * `a` sits up-and-left of `z`. Under that stagger a cell's neighbours are:
   *     east (col+1, row)      = +right
   *     up-right (col+1, row-1) = +upRight   (the ↗ control)
   *     up-left  (col,  row-1) = +(upRight - right)
   * The bottom row is the anchor (adds 0), keeping low notes at the bottom. */
  function noteAt(col, row, layout) {
    const bottom = NUM_ROWS - 1;
    return layout.base + col * layout.right + (bottom - row) * (layout.upRight - layout.right);
  }

  // Presets, expressed purely as the two basis intervals. `base` is a starting
  // MIDI note for the bottom-left key; the octave control shifts it at runtime.
  const LAYOUT_PRESETS = {
    'Wicki-Hayden':   { right: 2, upRight: 7, base: 41 }, // whole-tone / fifth
    'Tonnetz (Harmonic Table)': { right: 4, upRight: 7, base: 36 }, // major-3rd / fifth / minor-3rd — the Tonnetz
    'Gerhard':        { right: 3, upRight: 7, base: 36 }, // minor-3rd / fifth
    'Fourths (bass)': { right: 5, upRight: 1, base: 33 }, // guitar/bass-like
    'Janko / Chromatic': { right: 2, upRight: 1, base: 43 }, // semitone climb
    'Piano row':      { right: 1, upRight: 5, base: 45 }, // chromatic across, 4ths up
  };

  // Chord recipes: intervals in semitones from the root.
  const CHORD_TYPES = {
    'maj':   { label: 'Major',        intervals: [0, 4, 7] },
    'min':   { label: 'Minor',        intervals: [0, 3, 7] },
    'dim':   { label: 'Diminished',   intervals: [0, 3, 6] },
    'aug':   { label: 'Augmented',    intervals: [0, 4, 8] },
    'maj7':  { label: 'Major 7',      intervals: [0, 4, 7, 11] },
    'min7':  { label: 'Minor 7',      intervals: [0, 3, 7, 10] },
    'dom7':  { label: 'Dominant 7',   intervals: [0, 4, 7, 10] },
    'sus4':  { label: 'Sus4',         intervals: [0, 5, 7] },
  };
  const INVERSION_NAMES = ['root position', '1st inversion', '2nd inversion', '3rd inversion'];

  // Scales for the "highlight scale" colour scheme (semitones from the root).
  const SCALES = {
    major:          [0, 2, 4, 5, 7, 9, 11],
    minor:          [0, 2, 3, 5, 7, 8, 10],
    'major-pent':   [0, 2, 4, 7, 9],
    'minor-pent':   [0, 3, 5, 7, 10],
    blues:          [0, 3, 5, 6, 7, 10],
    dorian:         [0, 2, 3, 5, 7, 9, 10],
    mixolydian:     [0, 2, 4, 5, 7, 9, 10],
    'whole-tone':   [0, 2, 4, 6, 8, 10],
    chromatic:      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };
  const SCALE_LABELS = {
    major: 'Major', minor: 'Natural minor', 'major-pent': 'Major pentatonic',
    'minor-pent': 'Minor pentatonic', blues: 'Blues', dorian: 'Dorian',
    mixolydian: 'Mixolydian', 'whole-tone': 'Whole tone', chromatic: 'Chromatic',
  };

  /* Build the MIDI notes of a chord.
   * Inversion rotates the lowest N notes up an octave. */
  function buildChord(rootMidi, typeKey, inversion) {
    const type = CHORD_TYPES[typeKey];
    let notes = type.intervals.map((iv) => rootMidi + iv);
    for (let i = 0; i < inversion; i++) {
      const low = notes.shift();
      notes.push(low + 12);
    }
    return notes;
  }

  KB.theory = {
    NOTE_NAMES, KEY_ROWS, NUM_ROWS, NUM_COLS, KEY_POS, CELLS,
    keyLabel, noteName, pitchClassName, noteAt,
    LAYOUT_PRESETS, CHORD_TYPES, INVERSION_NAMES, buildChord,
    SCALES, SCALE_LABELS,
  };
})(window.KB = window.KB || {});
