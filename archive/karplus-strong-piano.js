/* ARCHIVED — Karplus-Strong physical-model piano.
 *
 * This was the synthesized fallback voice before the app switched to real
 * recorded Salamander piano samples (js/piano-samples.js). Kept for reference:
 * a self-contained, no-samples struck-string model. To use it, render voices
 * through a ScriptProcessorNode (an AudioWorklet module can't load from file://)
 * and sum each voice's next() into the output buffer.
 */
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
  // parameters used by the old engine (pitch/velocity dependent)
  static params(midi, velocity) {
    const t = Math.max(0, Math.min(1, (midi - 21) / 87));
    return {
      freq: 440 * Math.pow(2, (midi - 69) / 12), velocity,
      decay: 0.9995 - t * 0.012, damp: 0.12 + t * 0.32,
      bright: 0.28 + velocity * 0.55, strings: midi < 68 ? 3 : 2, detune: 3.2,
      gain: 0.22 + velocity * 0.20,
    };
  }
}
