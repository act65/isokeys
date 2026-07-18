/* tutorial.js — an interactive explainer for the CURRENT isomorphic layout.
 *
 * Two views:
 *   'neighbours' — every key has 6 neighbours; this shows their signed intervals
 *                  (→ +2, ↗ +7, ↖ +5, …). They change when you change the layout,
 *                  which is the whole point of an isomorphic grid.
 *   'chords'     — the fixed geometric SHAPE of a chord (major, minor, …) and its
 *                  inversions, with R / 3 / 5 / 7 role badges.
 */
(function (KB) {
  'use strict';

  const T = KB.theory;

  // 6 hex directions as (dCol, dRow) offsets, with a display arrow.
  const DIRS = [
    { name: 'NW', arrow: '↖', d: [0, -1] },
    { name: 'NE', arrow: '↗', d: [1, -1] },
    { name: 'W', arrow: '←', d: [-1, 0] },
    { name: 'E', arrow: '→', d: [1, 0] },
    { name: 'SW', arrow: '↙', d: [-1, 1] },
    { name: 'SE', arrow: '↘', d: [0, 1] },
  ];

  const ROLE = { 0: 'R', 1: '♭9', 2: '9', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7' };
  const DESC = {
    maj: 'Root + major 3rd + perfect 5th.',
    min: 'Root + minor 3rd + perfect 5th.',
    dim: 'Root + minor 3rd + diminished 5th.',
    aug: 'Root + major 3rd + augmented 5th.',
    maj7: 'Major triad + major 7th.',
    min7: 'Minor triad + minor 7th.',
    dom7: 'Major triad + minor 7th — the bluesy dominant.',
    sus4: 'Root + perfect 4th + perfect 5th (no 3rd).',
  };

  class LayoutTutorial {
    constructor(keyboard, onState) {
      this.kb = keyboard;
      this.onState = onState || (() => {});
      this.view = 'neighbours';
      this.rootPc = 0;
      this.type = 'maj';
      this.inv = 0;
      this.active = false;
    }

    enter() { this.active = true; this.show(); }
    leave() { this.active = false; this.kb.clearHighlights(); }
    setView(v) { this.view = v; this.show(); }

    setRoot(pc) { this.rootPc = ((pc % 12) + 12) % 12; this.inv = 0; this.show(); }
    setType(t) { this.type = t; this.inv = 0; this.show(); }
    setInversion(i) { this.inv = i; this.show(); }
    numInversions() { return T.CHORD_TYPES[this.type].intervals.length; }
    nextInv() { this.inv = (this.inv + 1) % this.numInversions(); this.show(); }

    show() {
      if (!this.active) return;
      if (this.view === 'neighbours') this._showNeighbours();
      else this._showChord();
    }

    /* ---- neighbours ---- */
    _centerCell() {
      // a visually central key that has all 6 neighbours present
      return this.kb.byKey['g'] || this.kb.byKey['t'];
    }

    _showNeighbours() {
      const center = this._centerCell();
      const centerNote = this.kb.noteFor(center.key);
      const cellAt = (col, row) => this.kb.cells.find((c) => c.col === col && c.row === row);

      const hl = new Map();
      hl.set(center.key, { color: KB.pcColor(centerNote, this.kb.theme === 'earthy' ? 60 : 30, 50), ring: '#ffffff', badge: '•' });

      const neighbours = [];
      DIRS.forEach((dir) => {
        const nb = cellAt(center.col + dir.d[0], center.row + dir.d[1]);
        if (!nb) return;
        const delta = this.kb.noteFor(nb.key) - centerNote;
        hl.set(nb.key, {
          color: KB.pcColor(this.kb.noteFor(nb.key), this.kb.theme === 'earthy' ? 60 : 28, 46),
          ring: delta >= 0 ? '#e8b04d' : '#5aa9d6',
          badge: (delta >= 0 ? '+' : '') + delta,
        });
        neighbours.push({ arrow: dir.arrow, delta, key: nb.key });
      });
      // order for the legend: up row, middle, down row
      const order = ['↖', '↗', '←', '→', '↙', '↘'];
      neighbours.sort((a, b) => order.indexOf(a.arrow) - order.indexOf(b.arrow));

      this.kb.setHighlights(hl);
      this.onState({ view: 'neighbours', center: T.noteName(centerNote), neighbours });
    }

    /* ---- chord shapes ---- */
    _rootMidi() {
      const notes = this.kb.cells.map((c) => this.kb.noteFor(c.key)).filter((n) => n >= 0 && n <= 127);
      const center = (Math.min(...notes) + Math.max(...notes)) / 2;
      let m = this.rootPc;
      while (m < center - 8) m += 12;
      while (m > center + 4) m -= 12;
      return m;
    }

    play() {
      if (!this.active) return;
      KB.audio.ensure();
      const midis = this.view === 'chords' ? this._midis : [this.kb.noteFor(this._centerCell().key)];
      (midis || []).forEach((m, i) => {
        setTimeout(() => KB.audio.noteOn(m, 0.85), i * 90);
        setTimeout(() => KB.audio.noteOff(m), i * 90 + 800);
      });
    }

    _showChord() {
      const rootMidi = this._rootMidi();
      const midis = T.buildChord(rootMidi, this.type, this.inv);
      this._midis = midis;

      const hl = new Map();
      const items = midis.map((m) => {
        const t = KB.bestKeyForNote(this.kb, m);
        const interval = (((m - rootMidi) % 12) + 12) % 12;
        const role = ROLE[interval] || '?';
        if (t) {
          hl.set(t.key, {
            color: KB.pcColor(m, this.kb.theme === 'earthy' ? 60 : 30, this.kb.theme === 'earthy' ? 55 : 45),
            ring: interval === 0 ? '#ffffff' : KB.pcColor(m, 62, 90),
            badge: role,
          });
        }
        return { name: T.noteName(m), role, key: t ? t.key : '—' };
      });
      this.kb.setHighlights(hl);

      const chord = T.CHORD_TYPES[this.type];
      this.onState({
        view: 'chords',
        root: T.pitchClassName(rootMidi), typeLabel: chord.label,
        inversion: T.INVERSION_NAMES[this.inv], invIndex: this.inv, numInv: this.numInversions(),
        desc: DESC[this.type] || '', items,
      });
    }
  }

  KB.LayoutTutorial = LayoutTutorial;
})(window.KB = window.KB || {});
