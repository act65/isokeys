/* audio.js — polyphonic piano from real recorded samples.
 *
 * The Salamander Grand Piano (js/piano-samples.js) is sampled every minor third
 * A0..C8 and embedded as base64 (so it loads from file://, where fetch is blocked).
 * Each note plays the nearest sample, pitch-shifted to the target pitch. Decoding
 * happens once up front; the app shows a loading screen until `samplesReady`.
 */
(function (KB) {
  'use strict';

  const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteNameToMidi(name) {
    const m = /^([A-G])(s?)(\d)$/.exec(name); // e.g. A0, C4, Ds1 (D#1), Fs3 (F#3)
    if (!m) return null;
    return (parseInt(m[3], 10) + 1) * 12 + LETTER[m[1]] + (m[2] ? 1 : 0);
  }

  class PianoEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.byMidi = new Map();        // midi -> active { src, g }
      this.enabled = true;
      this._noteNameToMidi = noteNameToMidi;

      this.sampleBuffers = new Map(); // sample-midi -> AudioBuffer
      this.sampleMidis = [];
      this.samplesReady = false;
      this.samplesTotal = 0;
      this.samplesDecoded = 0;
    }

    get progress() { return this.samplesTotal ? this.samplesDecoded / this.samplesTotal : 0; }

    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 3;
      comp.attack.value = 0.003; comp.release.value = 0.25;

      const dry = this.ctx.createGain(); dry.gain.value = 0.92;
      const wet = this.ctx.createGain(); wet.gain.value = 0.08;
      const reverb = this.ctx.createConvolver();
      reverb.buffer = this._impulse(1.1, 3.2);

      this.master.connect(comp);
      comp.connect(dry).connect(this.ctx.destination);
      comp.connect(reverb).connect(wet).connect(this.ctx.destination);

      this._loadSamples();
    }

    _loadSamples(attempt) {
      attempt = attempt || 0;
      const src = KB.PIANO_SAMPLES;
      if (!src) { // the (large) samples script may still be downloading
        if (attempt < 150) setTimeout(() => this._loadSamples(attempt + 1), 150);
        return;
      }
      const names = Object.keys(src);
      this.samplesTotal = names.length;
      names.forEach((name) => {
        const midi = noteNameToMidi(name);
        if (midi == null) { this.samplesTotal--; return; }
        const bin = atob(src[name]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const done = (buf) => {
          if (buf) this.sampleBuffers.set(midi, buf);
          this.samplesDecoded++;
          if (this.samplesDecoded >= this.samplesTotal) {
            this.sampleMidis = Array.from(this.sampleBuffers.keys()).sort((a, b) => a - b);
            this.samplesReady = this.sampleMidis.length > 0;
          }
        };
        try {
          const p = this.ctx.decodeAudioData(bytes.buffer, (b) => done(b), () => done(null));
          if (p && p.then) p.then(done, () => done(null));
        } catch (err) { done(null); }
      });
    }

    _nearestSample(midi) {
      let best = this.sampleMidis[0], bestD = Infinity;
      for (const m of this.sampleMidis) {
        const d = Math.abs(m - midi);
        if (d < bestD) { bestD = d; best = m; }
      }
      return best;
    }

    _impulse(seconds, decay) {
      const rate = this.ctx.sampleRate;
      const len = Math.floor(seconds * rate);
      const buf = this.ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    setVolume(v) { if (this.master) this.master.gain.value = v; }

    noteOn(midi, velocity = 0.85) {
      if (!this.enabled || !this.samplesReady) return;
      this.ensure();
      if (this.byMidi.has(midi)) this.noteOff(midi);
      const srcMidi = this._nearestSample(midi);
      const src = this.ctx.createBufferSource();
      src.buffer = this.sampleBuffers.get(srcMidi);
      src.playbackRate.value = Math.pow(2, (midi - srcMidi) / 12);
      const g = this.ctx.createGain();
      g.gain.value = 0.25 + velocity * 0.55;
      src.connect(g).connect(this.master);
      src.start();
      this.byMidi.set(midi, { src, g });
    }

    noteOff(midi) {
      const v = this.byMidi.get(midi);
      if (!v) return;
      this.byMidi.delete(midi);
      const now = this.ctx.currentTime, rel = 0.28; // damper fall
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setValueAtTime(Math.max(v.g.gain.value, 0.0001), now);
      v.g.gain.exponentialRampToValueAtTime(0.0001, now + rel);
      try { v.src.stop(now + rel + 0.05); } catch (e) {}
    }

    allOff() { Array.from(this.byMidi.keys()).forEach((m) => this.noteOff(m)); }

    blip(midi, dur = 0.6, velocity = 0.8) {
      this.noteOn(midi, velocity);
      setTimeout(() => this.noteOff(midi), dur * 1000);
    }
  }

  KB.audio = new PianoEngine();
})(window.KB = window.KB || {});
