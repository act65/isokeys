/* circle.js — an interactive Circle of Fifths.
 *
 * The 12 notes are arranged so each step clockwise is a perfect fifth. The payoff:
 * a major/minor scale (or a mode) is a run of ADJACENT notes — a contiguous slice
 * of the circle. Highlighting a scale here makes that pattern obvious, and it's
 * the same set that lights up on the keyboard.
 */
(function (KB) {
  'use strict';

  const T = KB.theory;
  // pitch classes clockwise from the top, each a fifth apart: C G D A E B F# ...
  const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

  function rgb(a) { return `rgb(${a[0] | 0}, ${a[1] | 0}, ${a[2] | 0})`; }

  class CircleOfFifths {
    constructor(canvas, onNote) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.onNote = onNote || (() => {});
      this.root = 0;
      this.scaleKey = 'major';
      this.theme = 'earthy';
      this.size = 340;
      this._resize();
      canvas.addEventListener('click', (e) => {
        const pc = this._pcAt(e);
        if (pc != null) this.onNote(pc);
      });
    }

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = this.size * dpr;
      this.canvas.height = this.size * dpr;
      this.canvas.style.width = this.size + 'px';
      this.canvas.style.height = this.size + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    setSelection(rootPc, scaleKey) {
      this.root = ((rootPc % 12) + 12) % 12;
      this.scaleKey = scaleKey;
      this.draw();
    }
    setTheme(t) { this.theme = t; this.draw(); }

    _geom() {
      const cx = this.size / 2, cy = this.size / 2;
      const R = this.size * 0.36;      // ring radius (chip centres)
      const chipR = this.size * 0.072;
      return { cx, cy, R, chipR };
    }
    _pos(i, g) {
      const ang = -Math.PI / 2 + i * (Math.PI * 2 / 12);
      return [g.cx + g.R * Math.cos(ang), g.cy + g.R * Math.sin(ang)];
    }

    _pcAt(e) {
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const g = this._geom();
      for (let i = 0; i < 12; i++) {
        const [px, py] = this._pos(i, g);
        if (Math.hypot(x - px, y - py) <= g.chipR * 1.15) return FIFTHS[i];
      }
      return null;
    }

    draw() {
      const ctx = this.ctx, g = this._geom();
      const dark = this.theme !== 'earthy';
      ctx.clearRect(0, 0, this.size, this.size);
      const set = T.SCALES[this.scaleKey] || T.SCALES.major;

      const inScale = (pc) => set.indexOf((((pc - this.root) % 12) + 12) % 12);

      // connectors between adjacent in-scale notes (shows the contiguous arc)
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(59,47,42,0.28)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const a = FIFTHS[i], b = FIFTHS[(i + 1) % 12];
        if (inScale(a) !== -1 && inScale(b) !== -1) {
          const p1 = this._pos(i, g), p2 = this._pos((i + 1) % 12, g);
          ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
        }
      }

      // note chips
      for (let i = 0; i < 12; i++) {
        const pc = FIFTHS[i];
        const [x, y] = this._pos(i, g);
        const deg = inScale(pc);
        const isRoot = pc === this.root;

        let fill, textCol;
        if (deg !== -1) {
          const frac = set.length > 1 ? deg / (set.length - 1) : 0;
          const col = KB.viridis(0.1 + frac * 0.85);
          fill = rgb(col);
          const L = 0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2];
          textCol = L > 140 ? '#171717' : '#ffffff';
        } else {
          fill = dark ? 'rgba(255,255,255,0.06)' : 'rgba(59,47,42,0.08)';
          textCol = dark ? 'rgba(255,255,255,0.4)' : 'rgba(59,47,42,0.45)';
        }

        ctx.beginPath();
        ctx.arc(x, y, g.chipR, 0, Math.PI * 2);
        ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = isRoot ? 3.5 : 1.5;
        ctx.strokeStyle = isRoot ? (dark ? '#ffffff' : '#3b2f2a') : (dark ? 'rgba(255,255,255,0.15)' : 'rgba(59,47,42,0.2)');
        ctx.stroke();

        ctx.fillStyle = textCol;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(g.chipR * 0.78)}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillText(T.NOTE_NAMES[pc], x, y);
      }

      // centre label
      const count = set.length;
      ctx.fillStyle = dark ? '#e8ecf5' : '#3b2f2a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(this.size * 0.058)}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(T.NOTE_NAMES[this.root], g.cx, g.cy - this.size * 0.03);
      ctx.fillStyle = dark ? 'rgba(232,236,245,0.65)' : 'rgba(59,47,42,0.6)';
      ctx.font = `${Math.round(this.size * 0.038)}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText((T.SCALE_LABELS[this.scaleKey] || this.scaleKey) + ' · ' + count + ' notes', g.cx, g.cy + this.size * 0.03);
    }
  }

  KB.CircleOfFifths = CircleOfFifths;
})(window.KB = window.KB || {});
