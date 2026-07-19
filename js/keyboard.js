/* keyboard.js — renders the hexagonal isomorphic grid and handles input.
 *
 * Geometry: pointy-top hexes in a real tessellation. Each row up is shifted
 * half a hex to the right so the up-right neighbour (NE) matches theory.noteAt.
 * Notes are coloured by pitch-class, so the same note is always the same hue —
 * a visual echo of the isomorphic idea.
 */
(function (KB) {
  'use strict';

  const T = KB.theory;

  // Pitch-class -> hue around the colour wheel.
  function pcColor(midi, light, sat) {
    const hue = (((midi % 12) + 12) % 12) * 30;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }

  // Viridis: a perceptually-uniform, colourblind-safe sequential ramp. Used to
  // colour scale degrees so the ascending order of a scale is actually readable.
  const VIRIDIS = [
    [68, 1, 84], [72, 40, 120], [62, 73, 137], [49, 104, 142], [38, 130, 142],
    [31, 158, 137], [53, 183, 121], [110, 206, 88], [181, 222, 43], [253, 231, 37],
  ];
  function viridis(t) {
    t = Math.max(0, Math.min(1, t));
    const x = t * (VIRIDIS.length - 1);
    const i = Math.floor(x), f = x - i;
    const a = VIRIDIS[i], b = VIRIDIS[Math.min(i + 1, VIRIDIS.length - 1)];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  class HexKeyboard {
    constructor(canvas, layout) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.layout = Object.assign({}, layout);
      this.hexSize = 46;

      this.active = new Set();       // keys visually held
      this.highlights = new Map();   // key -> {color, ring, label}
      this.pressListeners = [];
      this.releaseListeners = [];
      this.mouseKey = null;
      this.showNoteNames = true;
      this.theme = 'earthy';         // 'earthy' | 'neon'
      this.colorScheme = 'rainbow';  // 'rainbow' | 'octave' | 'mono' | 'scale'
      this.scaleRoot = 0;            // pitch class used by the 'scale' scheme
      this.scaleType = 'major';      // which scale the 'scale' scheme highlights

      this._buildCells();
      this._bindInput();
      this._raf = null;
      this._loop = this._loop.bind(this);
      this.start();
    }

    onPress(cb) { this.pressListeners.push(cb); }
    onRelease(cb) { this.releaseListeners.push(cb); }

    setTheme(t) { this.theme = t; }
    setColorScheme(s) { this.colorScheme = s; }
    setScaleRoot(pc) { this.scaleRoot = ((pc % 12) + 12) % 12; }
    setScaleType(t) { this.scaleType = t; }

    // Per-theme drawing palette for the canvas.
    _pal() {
      if (this.theme === 'earthy') {
        return {
          text: '#3b2f2a', textDim: 'rgba(59,47,42,0.55)', textActive: '#2a201b',
          border: 'rgba(59,47,42,0.20)', activeBorder: '#3b2f2a', hlBorder: '#5a4632',
          out: 'hsl(38, 18%, 70%)', mono: 40,
          idleSat: 45, idleLight: 60, activeSat: 62, activeLight: 70,
        };
      }
      return { // neon (dark)
        text: 'rgba(255,255,255,0.9)', textDim: 'rgba(255,255,255,0.6)', textActive: '#ffffff',
        border: 'rgba(255,255,255,0.12)', activeBorder: '#ffffff', hlBorder: '#ffffff',
        out: '#242833', mono: 210,
        idleSat: 30, idleLight: 26, activeSat: 85, activeLight: 58,
      };
    }

    // Idle / active fill for a note, honouring the selected colour scheme.
    _noteFill(midi, active) {
      const p = this._pal();
      const pc = ((midi % 12) + 12) % 12;
      const hue = pc * 30;
      const sat = active ? p.activeSat : p.idleSat;
      const light = active ? p.activeLight : p.idleLight;
      switch (this.colorScheme) {
        case 'mono':
          return `hsl(${p.mono}, ${active ? p.activeSat : p.idleSat * 0.4}%, ${light * (active ? 1 : 0.85)}%)`;
        case 'octave': {
          const h = ((Math.floor(midi / 12) - 4) * 48 + 200) % 360;
          return `hsl(${(h + 360) % 360}, ${sat}%, ${light}%)`;
        }
        case 'scale': {
          const set = T.SCALES[this.scaleType] || T.SCALES.major;
          const deg = set.indexOf((((pc - this.scaleRoot) % 12) + 12) % 12);
          if (deg === -1) return active ? `hsl(${hue}, 22%, ${p.idleLight}%)` : p.out; // out of scale: faded
          // colour by scale degree along the perceptual ramp (root..top = purple..yellow)
          const frac = set.length > 1 ? deg / (set.length - 1) : 0;
          let [r, g, b] = viridis(0.1 + frac * 0.85);
          if (active) { r += (255 - r) * 0.4; g += (255 - g) * 0.4; b += (255 - b) * 0.4; }
          return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
        }
        case 'rainbow':
        default:
          return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
    }

    setLayout(layout) {
      this.layout = Object.assign({}, layout);
      this._buildCells();
    }

    // Compute geometry for every cell + resize the canvas to fit.
    _buildCells() {
      const s = this.hexSize;
      const w = Math.sqrt(3) * s;   // flat-to-flat width
      const vert = 1.5 * s;         // vertical spacing between rows
      const pad = s + 8;

      this.cells = T.CELLS.map((c) => {
        // Each row DOWN shifts right (physical QWERTY stagger: `a` is up-left of `z`).
        const cx = pad + c.col * w + c.row * (w / 2);
        const cy = pad + c.row * vert;
        const points = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 180) * (60 * i - 90); // pointy-top
          points.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]);
        }
        return { key: c.key, col: c.col, row: c.row, cx, cy, points };
      });

      let maxX = 0, maxY = 0;
      this.cells.forEach((c) => {
        maxX = Math.max(maxX, c.cx + w / 2);
        maxY = Math.max(maxY, c.cy + s);
      });
      const dpr = window.devicePixelRatio || 1;
      this.cssW = maxX + pad;
      this.cssH = maxY + pad;
      this.canvas.width = this.cssW * dpr;
      this.canvas.height = this.cssH * dpr;
      this.canvas.style.width = this.cssW + 'px';
      this.canvas.style.height = this.cssH + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.byKey = {};
      this.cells.forEach((c) => (this.byKey[c.key] = c));
    }

    noteFor(key) {
      const c = this.byKey[key];
      if (!c) return null;
      return T.noteAt(c.col, c.row, this.layout);
    }

    // Find a key that produces a given MIDI note (for games / highlighting).
    keyForNote(midi) {
      for (const c of this.cells) {
        if (T.noteAt(c.col, c.row, this.layout) === midi) return c.key;
      }
      return null;
    }

    setHighlights(map) { this.highlights = map || new Map(); }
    clearHighlights() { this.highlights = new Map(); }

    /* ---- input ---- */
    _bindInput() {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const key = this._normKey(e);
        if (this.byKey[key]) {
          e.preventDefault();
          this.press(key);
        }
      });
      window.addEventListener('keyup', (e) => {
        const key = this._normKey(e);
        if (this.byKey[key]) this.release(key);
      });

      const pt = (e) => {
        const r = this.canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return { x: src.clientX - r.left, y: src.clientY - r.top };
      };
      const down = (e) => {
        e.preventDefault();
        const { x, y } = pt(e);
        const key = this._keyAt(x, y);
        if (key) { this.mouseKey = key; this.press(key); }
      };
      const up = (e) => {
        if (this.mouseKey) { this.release(this.mouseKey); this.mouseKey = null; }
      };
      this.canvas.addEventListener('mousedown', down);
      window.addEventListener('mouseup', up);
      this.canvas.addEventListener('touchstart', down, { passive: false });
      window.addEventListener('touchend', up);
    }

    _normKey(e) {
      const map = { ';': ';', ',': ',', '.': '.', '/': '/' };
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      return map[k] || k;
    }

    _keyAt(x, y) {
      for (const c of this.cells) {
        if (this._inHex(x, y, c)) return c.key;
      }
      return null;
    }
    _inHex(x, y, c) {
      // point-in-polygon (ray cast)
      let inside = false;
      const p = c.points;
      for (let i = 0, j = 5; i < 6; j = i++) {
        const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }

    /* ---- note events ---- */
    press(key) {
      if (this.active.has(key)) return;
      this.active.add(key);
      const midi = this.noteFor(key);
      KB.audio.noteOn(midi, 0.9);
      const ev = { key, midi, time: performance.now() };
      this.pressListeners.forEach((cb) => cb(ev));
    }
    release(key) {
      if (!this.active.has(key)) return;
      this.active.delete(key);
      const midi = this.noteFor(key);
      KB.audio.noteOff(midi);
      this.releaseListeners.forEach((cb) => cb({ key, midi, time: performance.now() }));
    }

    /* ---- render loop ---- */
    start() { if (!this._raf) this._raf = requestAnimationFrame(this._loop); }
    _loop() {
      this.draw();
      this._raf = requestAnimationFrame(this._loop);
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.cssW, this.cssH);
      const now = performance.now();
      this.cells.forEach((c) => this._drawHex(ctx, c, now));
    }

    _drawHex(ctx, c, now) {
      const midi = T.noteAt(c.col, c.row, this.layout);
      const isActive = this.active.has(c.key);
      const hl = this.highlights.get(c.key);
      const inRange = midi >= 0 && midi <= 127;
      const pal = this._pal();

      const path = new Path2D();
      c.points.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
      path.closePath();

      // fill
      let fill;
      if (!inRange) {
        fill = pal.out;
      } else if (isActive) {
        fill = this._noteFill(midi, true);
      } else if (hl) {
        fill = hl.color;
      } else {
        fill = this._noteFill(midi, false);
      }
      ctx.fillStyle = fill;
      ctx.fill(path);

      // glow for active / highlighted
      if (isActive || hl) {
        ctx.save();
        ctx.shadowColor = isActive ? pcColor(midi, 60, 90) : (hl.ring || hl.color);
        ctx.shadowBlur = 22;
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill(path);
        ctx.restore();
      }

      // border
      ctx.lineWidth = isActive ? 3 : (hl ? 2.5 : 1.5);
      ctx.strokeStyle = isActive ? pal.activeBorder : (hl ? (hl.ring || pal.hlBorder) : pal.border);
      ctx.stroke(path);

      if (!inRange) return;

      // labels — default to theme ink, but on strongly-coloured fills (viridis
      // scale colours) pick black/white by luminance so text stays legible.
      let labelMain = isActive ? pal.textActive : pal.text;
      let labelSub = isActive ? pal.textActive : pal.textDim;
      if (typeof fill === 'string' && fill.charAt(0) === 'r') {
        const n = fill.match(/\d+/g);
        if (n) {
          const L = 0.299 * +n[0] + 0.587 * +n[1] + 0.114 * +n[2];
          labelMain = L > 140 ? '#171717' : '#ffffff';
          labelSub = L > 140 ? 'rgba(0,0,0,0.62)' : 'rgba(255,255,255,0.72)';
        }
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = labelMain;
      ctx.font = `bold ${Math.round(this.hexSize * 0.42)}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(T.keyLabel(c.key), c.cx, c.cy - this.hexSize * 0.18);

      if (this.showNoteNames) {
        ctx.fillStyle = labelSub;
        ctx.font = `${Math.round(this.hexSize * 0.30)}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillText(T.noteName(midi), c.cx, c.cy + this.hexSize * 0.28);
      }

      // chord-role badge (tutorial mode) near the top of the hex
      if (hl && hl.badge) {
        ctx.fillStyle = labelMain;
        ctx.font = `bold ${Math.round(this.hexSize * 0.28)}px system-ui, sans-serif`;
        ctx.fillText(hl.badge, c.cx, c.cy - this.hexSize * 0.52);
      }
    }
  }

  KB.HexKeyboard = HexKeyboard;
  KB.pcColor = pcColor;
  KB.viridis = viridis;
})(window.KB = window.KB || {});
