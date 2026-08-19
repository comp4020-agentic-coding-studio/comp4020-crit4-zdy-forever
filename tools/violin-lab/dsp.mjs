// Sample-level DSP primitives shared by the candidates. Deliberately plain
// JS with no Web Audio dependency: whatever wins here gets pasted into an
// AudioWorkletProcessor unchanged, so the WAV you audition and the sound the
// page makes come from identical code.

/** RBJ cookbook biquad, direct form I. Coefficients recomputed on retune. */
export class Biquad {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.b0 = 1;
    this.b1 = 0;
    this.b2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  #norm(b0, b1, b2, a0, a1, a2) {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }

  lowpass(freq, q) {
    const w = (2 * Math.PI * Math.min(freq, this.sr * 0.49)) / this.sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    return this.#norm((1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + alpha, -2 * cw, 1 - alpha);
  }

  highpass(freq, q) {
    const w = (2 * Math.PI * Math.min(freq, this.sr * 0.49)) / this.sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    return this.#norm((1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + alpha, -2 * cw, 1 - alpha);
  }

  bandpass(freq, q) {
    const w = (2 * Math.PI * Math.min(freq, this.sr * 0.49)) / this.sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    return this.#norm(alpha, 0, -alpha, 1 + alpha, -2 * cw, 1 - alpha);
  }

  peaking(freq, q, gainDb) {
    const A = 10 ** (gainDb / 40);
    const w = (2 * Math.PI * Math.min(freq, this.sr * 0.49)) / this.sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    return this.#norm(1 + alpha * A, -2 * cw, 1 - alpha * A, 1 + alpha / A, -2 * cw, 1 - alpha / A);
  }

  notch(freq, q) {
    const w = (2 * Math.PI * Math.min(freq, this.sr * 0.49)) / this.sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    return this.#norm(1, -2 * cw, 1, 1 + alpha, -2 * cw, 1 - alpha);
  }

  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Runs a signal through several biquads in series. */
export class BiquadChain {
  constructor(filters) {
    this.filters = filters;
  }
  process(x) {
    let y = x;
    for (const f of this.filters) y = f.process(y);
    return y;
  }
}

/** One-pole lowpass. `coeff` in 0..1: higher = more smoothing. */
export class OnePole {
  constructor(coeff = 0.5) {
    this.a = coeff;
    this.z = 0;
  }
  process(x) {
    this.z = this.z + (1 - this.a) * (x - this.z);
    return this.z;
  }
}

/** DC blocker — waveguide loops accumulate offset without one. */
export class DcBlock {
  constructor(r = 0.995) {
    this.r = r;
    this.x1 = 0;
    this.y1 = 0;
  }
  process(x) {
    const y = x - this.x1 + this.r * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

/** Fractional-delay line with linear interpolation. */
export class DelayLine {
  constructor(maxSamples) {
    this.buf = new Float64Array(Math.max(4, Math.ceil(maxSamples) + 4));
    this.write = 0;
  }
  /** Reads `delay` samples back (may be fractional) without advancing. */
  read(delay) {
    const n = this.buf.length;
    const d = Math.max(1, Math.min(delay, n - 2));
    const pos = this.write - d + n;
    const i0 = Math.floor(pos) % n;
    const i1 = (i0 + 1) % n;
    const frac = pos - Math.floor(pos);
    return this.buf[i0] * (1 - frac) + this.buf[i1] * frac;
  }
  push(x) {
    this.buf[this.write] = x;
    this.write = (this.write + 1) % this.buf.length;
  }
}

/** Smoothly slews a value toward a target — for parameter ramps. */
export class Slew {
  constructor(value = 0, rate = 0.001) {
    this.value = value;
    this.rate = rate;
  }
  to(target) {
    this.value += (target - this.value) * this.rate;
    return this.value;
  }
}

/** Linear/exponential ADSR-ish envelope driven one sample at a time. */
export class Envelope {
  constructor(sampleRate, { attack = 0.06, decay = 0.25, sustain = 0.7, release = 0.16 } = {}) {
    this.sr = sampleRate;
    this.attack = attack;
    this.decay = decay;
    this.sustain = sustain;
    this.release = release;
    this.stage = "attack";
    this.value = 0;
    this.t = 0;
  }
  release_() {
    if (this.stage !== "release") {
      this.stage = "release";
      this.releaseFrom = this.value;
      this.t = 0;
    }
  }
  next() {
    const dt = 1 / this.sr;
    if (this.stage === "attack") {
      this.t += dt;
      this.value = Math.min(1, this.t / Math.max(dt, this.attack));
      if (this.t >= this.attack) {
        this.stage = "decay";
        this.t = 0;
      }
    } else if (this.stage === "decay") {
      this.t += dt;
      const k = Math.min(1, this.t / Math.max(dt, this.decay));
      this.value = 1 + (this.sustain - 1) * k;
      if (this.t >= this.decay) {
        this.stage = "sustain";
        this.value = this.sustain;
      }
    } else if (this.stage === "release") {
      this.t += dt;
      this.value = (this.releaseFrom ?? this.value) * Math.exp((-3 * this.t) / Math.max(dt, this.release));
    }
    return this.value;
  }
  finished() {
    return this.stage === "release" && this.value < 1e-4;
  }
}

/** Pink-ish noise (Voss-McCartney, 3 rows) — closer to bow noise than white. */
export class PinkNoise {
  constructor(rng) {
    this.rng = rng;
    this.b0 = 0;
    this.b1 = 0;
    this.b2 = 0;
  }
  next() {
    const white = this.rng() * 2 - 1;
    this.b0 = 0.99765 * this.b0 + white * 0.099046;
    this.b1 = 0.963 * this.b1 + white * 0.2965164;
    this.b2 = 0.57 * this.b2 + white * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + white * 0.1848) * 0.25;
  }
}

/** Gentle saturation — keeps peaks in range without the crackle of clipping. */
export function softClip(x) {
  return Math.tanh(x);
}
