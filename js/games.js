/* games.js — the two mini-games.
 *
 *  RhythmGame:   notes scroll toward a hit-line; press the matching key on time.
 *  ReactionGame: a chord + inversion is named; play it as fast as you can.
 *
 * Both read note events emitted by the HexKeyboard and drive their own scoring.
 */
(function (KB) {
  'use strict';

  const T = KB.theory;

  // Map any target MIDI note to the best physical key in the current layout:
  // exact match first, then nearest key of the same pitch-class.
  function bestKeyForNote(keyboard, midi) {
    const exact = keyboard.keyForNote(midi);
    if (exact) return { key: exact, note: midi };
    const pc = ((midi % 12) + 12) % 12;
    let best = null, bestDist = Infinity;
    keyboard.cells.forEach((c) => {
      const n = keyboard.noteFor(c.key);
      if (((n % 12) + 12) % 12 !== pc) return;
      const d = Math.abs(n - midi);
      if (d < bestDist) { bestDist = d; best = { key: c.key, note: n }; }
    });
    return best;
  }

  /* ============================ Rhythm Game ============================ */
  class RhythmGame {
    constructor(keyboard, canvas, onScore) {
      this.kb = keyboard;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.onScore = onScore || (() => {});
      this.active = false;
      this.pxPerMs = 0.20;
      this.hitX = 130;
      this.leadInMs = 2200;
      this.speed = 1; // playback speed / difficulty multiplier (>1 = faster)
      this.kb.onPress((ev) => this._onPress(ev));
    }

    // Speed multiplier: compresses note timing so the song plays faster. Notes
    // scroll proportionally faster too, so spacing looks the same but you get
    // less real time to react — i.e. harder.
    setSpeed(s) { this.speed = s > 0 ? s : 1; }

    start(song) {
      const sched = KB.songs.schedule(song);
      this.notes = sched.notes.map((n) => {
        const t = bestKeyForNote(this.kb, n.midi);
        return { start: n.start / this.speed, midi: t ? t.note : n.midi, key: t ? t.key : null, judged: false, result: null };
      });
      this.totalMs = sched.totalMs / this.speed;
      this.songName = song.name;
      this.startTime = performance.now() + this.leadInMs;
      this.state = { score: 0, combo: 0, maxCombo: 0, perfect: 0, great: 0, good: 0, miss: 0, feedback: '', done: false };
      this.active = true;
      this._resize();
      this._loop = this._loop.bind(this);
      this._raf = requestAnimationFrame(this._loop);
      this.onScore(this.state);
    }

    stop() {
      this.active = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this.kb.clearHighlights();
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.clientWidth || 900;
      const h = 150;
      this.w = w; this.h = h;
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    _elapsed() { return performance.now() - this.startTime; }

    _onPress(ev) {
      if (!this.active) return;
      const el = this._elapsed();
      // nearest unjudged note on this key within the miss window
      let cand = null, best = Infinity;
      for (const n of this.notes) {
        if (n.judged || n.key !== ev.key) continue;
        const dt = Math.abs(n.start - el);
        if (dt < best && dt < 220) { best = dt; cand = n; }
      }
      if (!cand) return; // wrong/extra press — ignored (no penalty in MVP)
      cand.judged = true;
      let pts, label;
      if (best <= 55) { pts = 100; label = 'PERFECT'; this.state.perfect++; }
      else if (best <= 110) { pts = 70; label = 'Great'; this.state.great++; }
      else { pts = 40; label = 'Good'; this.state.good++; }
      cand.result = label;
      this.state.combo++;
      this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
      this.state.score += pts * (1 + Math.min(this.state.combo, 20) * 0.05);
      this.state.feedback = label;
      this.onScore(this.state);
    }

    _loop() {
      if (!this.active) return;
      const el = this._elapsed();
      // miss detection
      let changed = false;
      for (const n of this.notes) {
        if (!n.judged && el > n.start + 200) {
          n.judged = true; n.result = 'MISS';
          this.state.miss++; this.state.combo = 0; this.state.feedback = 'Miss';
          changed = true;
        }
      }
      if (changed) this.onScore(this.state);

      this._updateHighlights(el);
      this._draw(el);

      if (el > this.totalMs + 1200 && !this.state.done) {
        this.state.done = true;
        const hits = this.state.perfect + this.state.great + this.state.good;
        const total = hits + this.state.miss;
        this.state.accuracy = total ? Math.round((hits / total) * 100) : 0;
        this.onScore(this.state);
        this.active = false;
        this.kb.clearHighlights();
        return;
      }
      this._raf = requestAnimationFrame(this._loop);
    }

    // Ring the next key(s) to play so learners know where to go.
    _updateHighlights(el) {
      const hl = new Map();
      for (const n of this.notes) {
        if (n.judged || !n.key) continue;
        const dt = n.start - el;
        const win = 700 / this.speed;
        if (dt >= -100 && dt < win) {
          const urgency = Math.max(0, 1 - dt / win);
          hl.set(n.key, {
            color: KB.pcColor(n.midi, 22 + urgency * 18, 45),
            ring: KB.pcColor(n.midi, 65, 90),
          });
        }
      }
      this.kb.setHighlights(hl);
    }

    _draw(el) {
      const ctx = this.ctx, w = this.w, h = this.h;
      ctx.clearRect(0, 0, w, h);

      // track
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, 0, w, h);

      // hit line
      ctx.save();
      ctx.shadowColor = '#4dd0ff'; ctx.shadowBlur = 16;
      ctx.strokeStyle = '#4dd0ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(this.hitX, 8); ctx.lineTo(this.hitX, h - 8); ctx.stroke();
      ctx.restore();

      // notes
      const noteH = 46;
      const midY = h / 2;
      for (const n of this.notes) {
        const x = this.hitX + (n.start - el) * this.pxPerMs * this.speed;
        if (x < -60 || x > w + 60) continue;
        const played = n.judged;
        const col = KB.pcColor(n.midi, played ? 30 : 55, played ? 40 : 85);
        ctx.globalAlpha = played ? 0.35 : 1;
        this._pill(ctx, x - noteH / 2, midY - noteH / 2, noteH, noteH, 10);
        ctx.fillStyle = col; ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0b0e17';
        ctx.font = `bold 18px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.key ? T.keyLabel(n.key) : '·', x, midY - 6);
        ctx.font = `10px system-ui`;
        ctx.fillText(T.noteName(n.midi), x, midY + 12);
      }

      // count-in
      if (el < 0) {
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 34px system-ui';
        ctx.fillText(Math.ceil(-el / (this.leadInMs / 3)), this.hitX, midY + 60);
      }
    }

    _pill(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  /* ============================ Reaction Game ============================ */
  const CHORD_POOL = ['maj', 'min', 'dom7', 'maj7', 'min7', 'dim', 'sus4'];

  class ReactionGame {
    constructor(keyboard, onState) {
      this.kb = keyboard;
      this.onState = onState || (() => {});
      this.active = false;
      this.showHints = true;
      this.mode = 'visual'; // 'visual' = read the name | 'audio' = hear it (ear training)
      this.allowedTypes = CHORD_POOL.slice(); // which chord qualities can appear
      this.invMode = 'all';                   // 'all' | '0' | '1' | '2' | '3'
      this.stats = { round: 0, best: null, times: [], wrong: 0 };
      this.kb.onPress((ev) => this._onPress(ev));
    }

    setMode(m) { this.mode = m; }
    setTypes(arr) { this.allowedTypes = (arr && arr.length) ? arr.slice() : CHORD_POOL.slice(); }
    setInversionMode(m) { this.invMode = m; }

    // Arpeggiate the target chord so its inversion (bass note first) is audible.
    _playTarget() {
      if (!this.target) return;
      KB.audio.ensure();
      this.target.midis.forEach((m, i) => {
        setTimeout(() => KB.audio.noteOn(m, 0.8), i * 95);
        setTimeout(() => KB.audio.noteOff(m), i * 95 + 750);
      });
    }
    replay() { if (this.active && this.mode === 'audio') this._playTarget(); }

    start() {
      this.active = true;
      this.stats = { round: 0, best: null, times: [], wrong: 0 };
      this._next();
    }

    stop() {
      this.active = false;
      this.kb.clearHighlights();
      this.onState({ ...this._summary(), prompt: '', done: true });
    }

    setHints(on) {
      this.showHints = on;
      if (this.active && this.target) this._applyHints();
    }

    _rootRange() {
      // roots that keep the whole chord reachable in the current layout
      const notes = this.kb.cells.map((c) => this.kb.noteFor(c.key)).filter((n) => n >= 0 && n <= 127);
      const min = Math.min(...notes), max = Math.max(...notes);
      return { min: min + 2, max: max - 12 };
    }

    _pick(arr) {
      // no Math.random restriction here (browser runtime), but keep it simple
      return arr[Math.floor(Math.random() * arr.length)];
    }

    _next() {
      if (!this.active) return;
      const { min, max } = this._rootRange();
      const root = min + Math.floor(Math.random() * Math.max(1, max - min));
      const type = this._pick(this.allowedTypes.length ? this.allowedTypes : CHORD_POOL);
      const chord = T.CHORD_TYPES[type];
      // choose inversion, honouring the selected filter (fall back if not valid for this chord)
      let invChoices;
      if (this.invMode === 'all') invChoices = chord.intervals.map((_, i) => i);
      else { const m = parseInt(this.invMode, 10); invChoices = m < chord.intervals.length ? [m] : chord.intervals.map((_, i) => i); }
      const inv = this._pick(invChoices);
      const midis = T.buildChord(root, type, inv);
      const targets = midis.map((m) => bestKeyForNote(this.kb, m)).filter(Boolean);

      this.target = {
        keys: new Set(targets.map((t) => t.key)),
        midis: targets.map((t) => t.note),
        pcs: new Set(midis.map((m) => ((m % 12) + 12) % 12)), // chord as pitch classes
        label: `${T.pitchClassName(root)} ${chord.label}`,
        inv: T.INVERSION_NAMES[inv],
        notes: targets.map((t) => T.noteName(t.note)).join(' · '),
      };
      this.stats.round++;
      this.promptStart = performance.now();

      if (this.mode === 'audio') {
        // Ear training: play it, hide the name until it's solved.
        if (this.showHints) this._applyHints(); else this.kb.clearHighlights();
        this._playTarget();
        this.onState({
          ...this._summary(),
          prompt: '🔊', inversion: 'Listen — then play it', notes: '', audio: true,
        });
      } else {
        this._applyHints();
        this.onState({
          ...this._summary(),
          prompt: this.target.label, inversion: this.target.inv, notes: this.target.notes,
        });
      }
    }

    _applyHints() {
      if (!this.showHints || !this.target) { this.kb.clearHighlights(); return; }
      const hl = new Map();
      this.target.keys.forEach((k) => {
        const midi = this.kb.noteFor(k);
        hl.set(k, { color: KB.pcColor(midi, 24, 40), ring: KB.pcColor(midi, 62, 85) });
      });
      this.kb.setHighlights(hl);
    }

    _onPress(ev) {
      if (!this.active || !this.target) return;
      const pc = ((ev.midi % 12) + 12) % 12;
      if (!this.target.pcs.has(pc)) { // a note that isn't in the chord at all
        this.stats.wrong++;
        this.onState({ ...this._summary(), flash: 'wrong' });
        return;
      }
      // success when the pitch classes currently held match the chord — ANY
      // octave / position / voicing / inversion of the same chord counts.
      const held = new Set([...this.kb.active].map((k) => ((this.kb.noteFor(k) % 12) + 12) % 12));
      const allHeld = held.size === this.target.pcs.size && [...this.target.pcs].every((p) => held.has(p));
      if (allHeld) {
        const dt = performance.now() - this.promptStart;
        this.stats.times.push(dt);
        if (this.stats.best == null || dt < this.stats.best) this.stats.best = dt;
        this.onState({
          ...this._summary(), flash: 'correct', lastTime: Math.round(dt),
          reveal: `${this.target.label} — ${this.target.inv}`, // shows the answer in audio mode
        });
        this.target = null;
        this.kb.clearHighlights();
        setTimeout(() => this._next(), 950);
      }
    }

    _summary() {
      const times = this.stats.times;
      const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
      return {
        round: this.stats.round,
        best: this.stats.best != null ? Math.round(this.stats.best) : null,
        avg,
        wrong: this.stats.wrong,
      };
    }
  }

  KB.RhythmGame = RhythmGame;
  KB.ReactionGame = ReactionGame;
  KB.REACTION_CHORD_POOL = CHORD_POOL;
  KB.bestKeyForNote = bestKeyForNote;
})(window.KB = window.KB || {});
