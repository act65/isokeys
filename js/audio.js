/* audio.js — polyphonic piano.
 *
 * Primary voice: real recorded Salamander Grand Piano samples (js/piano-samples.js),
 * sampled every minor third and pitch-shifted to the target note. This is what
 * makes it actually sound like a piano.
 *
 * Fallback voice: a Karplus-Strong struck-string model (KSVoice), used until the
 * samples finish decoding, or if they fail to load. Rendered by a ScriptProcessor
 * (an AudioWorklet can't be loaded from a file:// page).
 */
(function (KB) {
  'use strict';

  function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteNameToMidi(name) {
    // e.g. "A0", "C4", "Ds1" (D#1), "Fs3" (F#3)
    const m = /^([A-G])(s?)(\d)$/.exec(name);
    if (!m) return null;
    return (parseInt(m[3], 10) + 1) * 12 + LETTER[m[1]] + (m[2] ? 1 : 0);
  }

  /* Karplus-Strong struck-string voice — the fallback. `next()` returns one sample. */
  class KSVoice {
    constructor(sampleRate, p) {
      this.decay = p.decay; this.damp = p.damp; this.gain = p.gain;
      this.released = false; this.relMul = 1; this.attack = 0;
      this.attackInc = 1 / (sampleRate * 0.002); this.silence = 0; this.dead = false;
      const cents = p.strings === 1 ? [0] : p.strings === 2 ? [-p.detune, p.detune] : [0, p.detune, -p.detune];
      this.strings = cents.map((c) => {
        const f = p.freq * Math.pow(2, c / 1200);
        const period = sampleRate / f;
        const len = Math.ceil(period) + 2;
        const buf = new Float32Array(len);
        let last = 0;
        for (let i = 0; i < len; i++) { const n = Math.random() * 2 - 1; last = last + (n - last) * p.bright; buf[i] = last; }
        let mean = 0; for (let i = 0; i < len; i++) mean += buf[i]; mean /= len;
        for (let i = 0; i < len; i++) buf[i] -= mean;
        return { buf, len, period, w: 0, lp: 0 };
      });
    }
    release() { this.released = true; }
    next() {
      let sum = 0;
      for (const st of this.strings) {
        const rp = (st.w - st.period + st.len) % st.len;
        const i0 = Math.floor(rp), frac = rp - i0;
        const x = st.buf[i0 % st.len] + frac * (st.buf[(i0 + 1) % st.len] - st.buf[i0 % st.len]);
        st.lp = x * (1 - this.damp) + st.lp * this.damp;
        let fb = this.decay; if (this.released) fb *= 0.9;
        st.buf[st.w % st.len] = st.lp * fb; st.w++;
        sum += x;
      }
      if (this.attack < 1) this.attack += this.attackInc;
      let y = sum * this.gain * (this.attack < 1 ? this.attack : 1);
      if (this.released) { this.relMul *= 0.9994; y *= this.relMul; }
      if (Math.abs(y) < 1e-4) this.silence++; else this.silence = 0;
      if (this.silence > 3200) this.dead = true;
      return y;
    }
  }

  class PianoEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.proc = null;
      this.ksVoices = [];             // active KS fallback voices
      this.byMidi = new Map();        // midi -> active voice (sample or ks)
      this.enabled = true;
      this._KSVoice = KSVoice;
      this._noteNameToMidi = noteNameToMidi;

      this.sampleBuffers = new Map(); // sample-midi -> AudioBuffer
      this.sampleMidis = [];          // sorted list of decoded sample pitches
      this.samplesReady = false;
    }

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

      // ScriptProcessor renders the KS fallback polyphony
      this.proc = this.ctx.createScriptProcessor(512, 1, 1);
      this.proc.onaudioprocess = (e) => {
        const out = e.outputBuffer.getChannelData(0);
        const vs = this.ksVoices;
        for (let i = 0; i < out.length; i++) {
          let s = 0;
          for (let v = 0; v < vs.length; v++) if (!vs[v].dead) s += vs[v].next();
          out[i] = s;
        }
        if (vs.some((v) => v.dead)) this.ksVoices = vs.filter((v) => !v.dead);
      };

      this.proc.connect(this.master);
      this.master.connect(comp);
      comp.connect(dry).connect(this.ctx.destination);
      comp.connect(reverb).connect(wet).connect(this.ctx.destination);

      this._loadSamples();
    }

    // Decode the embedded base64 samples into AudioBuffers (async, non-blocking).
    _loadSamples(attempt) {
      attempt = attempt || 0;
      const src = KB.PIANO_SAMPLES;
      if (!src) { // the (large) samples script may still be downloading
        if (attempt < 80) setTimeout(() => this._loadSamples(attempt + 1), 200);
        return;
      }
      let pending = 0;
      Object.keys(src).forEach((name) => {
        const midi = noteNameToMidi(name);
        if (midi == null) return;
        const bin = atob(src[name]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        pending++;
        const done = (buf) => {
          if (buf) { this.sampleBuffers.set(midi, buf); }
          if (--pending === 0) {
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

    _ksParams(midi, velocity) {
      const t = Math.max(0, Math.min(1, (midi - 21) / 87));
      return {
        freq: midiToFreq(midi), velocity,
        decay: 0.9995 - t * 0.012, damp: 0.12 + t * 0.32,
        bright: 0.28 + velocity * 0.55, strings: midi < 68 ? 3 : 2, detune: 3.2,
        gain: 0.22 + velocity * 0.20,
      };
    }

    noteOn(midi, velocity = 0.85) {
      if (!this.enabled) return;
      this.ensure();
      if (this.byMidi.has(midi)) this._releaseVoice(midi);

      if (this.samplesReady) {
        const srcMidi = this._nearestSample(midi);
        const buffer = this.sampleBuffers.get(srcMidi);
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = Math.pow(2, (midi - srcMidi) / 12);
        const g = this.ctx.createGain();
        g.gain.value = 0.25 + velocity * 0.55;
        src.connect(g).connect(this.master);
        src.start();
        this.byMidi.set(midi, { type: 'sample', src, g });
      } else {
        const v = new KSVoice(this.ctx.sampleRate, this._ksParams(midi, velocity));
        this.ksVoices.push(v);
        this.byMidi.set(midi, { type: 'ks', voice: v });
      }
    }

    noteOff(midi) { this._releaseVoice(midi); }

    _releaseVoice(midi) {
      const v = this.byMidi.get(midi);
      if (!v) return;
      this.byMidi.delete(midi);
      if (v.type === 'sample') {
        const now = this.ctx.currentTime;
        const rel = 0.28; // damper fall
        v.g.gain.cancelScheduledValues(now);
        v.g.gain.setValueAtTime(Math.max(v.g.gain.value, 0.0001), now);
        v.g.gain.exponentialRampToValueAtTime(0.0001, now + rel);
        try { v.src.stop(now + rel + 0.05); } catch (e) {}
      } else {
        v.voice.release();
      }
    }

    allOff() { Array.from(this.byMidi.keys()).forEach((m) => this._releaseVoice(m)); }

    blip(midi, dur = 0.6, velocity = 0.8) {
      this.noteOn(midi, velocity);
      setTimeout(() => this.noteOff(midi), dur * 1000);
    }
  }

  KB.audio = new PianoEngine();
})(window.KB = window.KB || {});
