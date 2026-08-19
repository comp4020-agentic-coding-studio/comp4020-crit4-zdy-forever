// EXCITATION + BODY — a hybrid model that mirrors the real instrument's own
// division of labour: a slip-stick *excitation* (what the string does to the
// bridge) driving a *fixed* modal body (what the wood does to that force).
//
// Nothing here is "an oscillator through a filter". The excitation is built
// from an explicit slip SCHEDULE — a list of stick/slip events whose timing,
// count-per-period and flyback sharpness are all state — and the body is a
// 140-mode fixed resonance field at Cremer's 45 Hz mean spacing, never scaled
// by the note. Every property the four rejected patches lacked falls out of
// that pairing rather than being bolted on.
//
// The two mistakes all four rejections shared, and what replaces them here:
//   1. a smooth filter over a smooth source, which pins spectral irregularity
//      near 0 dB — replaced by a comb finer than the harmonic spacing, so
//      neighbouring partials sample independent points of the response;
//   2. one scalar envelope on a summed signal, which pins adjacent-harmonic
//      envelope correlation near 1.0 — replaced by three per-partial
//      mechanisms (vibrato swept across sharp fixed modes, a second detuned
//      string polarisation beating at k*df, and slip-timing jitter whose
//      phase effect scales with k).

import { Biquad, DcBlock, PinkNoise, softClip } from "../dsp.mjs";

export const name = "4-excitation-body";

export const notes = `
Hybrid excitation + body physical model, in two stages that mirror the real
instrument's own division of labour.

EXCITATION: the Helmholtz bridge force, generated from an explicit slip
SCHEDULE rather than an oscillator. A linear stick ramp is punctuated by
flybacks of finite duration tau -- Cremer's corner-rounding width, fixed in
absolute time rather than as a fraction of the period -- and tau is driven
continuously by a simulated bow-force signal (two slow LFOs plus a random
walk), so the harmonic corner and therefore the TIMBRE breathes several dB
while the loudness moves by 5%. Verified against a numeric DFT of one period:
at tau = 100 us the source is 0, -6.0, -9.6, -12.2, -14.2 dB, i.e. the 1/n
sawtooth a bowed bridge force should be, with the corner near 4 kHz.

Because the waveform is driven by a schedule, the ATTACK is a different REGIME
rather than a quieter version of the sustain. For the first ~9 fundamental
periods (18-55 ms, inside Guettler & Askenfelt's ~50 ms acceptance band) the
schedule breaks the period into 2 or 3 slips -- multiple flyback -- and
scatters the slip instants by +/-22%, while the corner runs over-sharp for
~20 ms then over-round at 40-120 ms before settling, so the partials do not
arrive together or in order (measured arrival spread 4.5-5.0x, real 3-10x).
Bow noise runs ~5x hot there but at a QUIET absolute level, so the onset is
noise-dominated while total RMS is still ~20% of steady, reaching 90% only at
150-360 ms (real 110-540, median 315). A second, weaker transverse
polarisation runs its own schedule 0.26% detuned; harmonic k of the sum beats
at k*df with its own phase, which is a per-harmonic AM generator that is
independent by construction.

BODY: a FIXED bank of 140 two-pole resonances -- five signature modes placed
explicitly (A0 274 Hz Q12, CBR 405, B1- 462, A1 483, B1+ 549) then a dense
comb at Cremer's 45 Hz mean spacing out to 10.5 kHz, gains scattered +/-4.5 dB
and signs alternating, shaped by the measured Iowa body/radiation envelope.
Q is pinned to ~1.15 bandwidths per spacing (11 at 700 Hz to 60 above 3 kHz)
so the comb covers without leaving 18 dB nulls. The gains are then corrected
against the composite's OWN +/-1/6-octave trend, because aiming each mode at
the envelope and summing lands 4-10 dB off it and by a different amount at
every frequency; the correction is smooth, so it fixes the broad shape and
leaves the narrow jaggedness alone. Every frequency is absolute and is NEVER
scaled by the note, and the table is drawn from a fixed seed, so one instrument
has one body. Because the comb is far finer than the harmonic
spacing, each partial lands on an arbitrary mode flank: that is what makes the
series jagged, and what converts the +/-33 cent vibrato and the 4 cent jitter
floor into several dB of AM that differs for every partial.

Measured against the reference corpus with identical code, pooled over 6 notes
against 11 real ones (candidate / real violin / rejected baseline): spectral
irregularity 3.0 / 2.5 / 0.1 dB; neighbour correlation 0.36 / 0.65 / 0.91 with
28% / 18% / 6% negative; per-harmonic modulation range h1-h8 6.5 / 5.9 / 1.8 dB
and h9-h16 8.2 / 11.3 / 4.0 dB; harmonic rises per note 4.5 / 5.3 / 0.0 with a
largest rise of 21.1 / 21.6 / 0.0 dB. With vibrato disabled to match the novib
corpus, D4 upperVsLowerDb is -12.7 against the real -10.1 to -14.0.

CAVEAT on the harness numbers: analyse() tracks each harmonic in a fixed +/-4
bin window, but +/-33 cents of vibrato moves h7 of a D4 by +/-6.5 bins, so with
vibrato on, part of every upper partial is booked as "noise". That is why the
reported noiseRatio here is 0.03-0.31 while the same code with vibrato off
reads 0.005-0.011, and why upperVsLowerDb reads 5 dB darker with vibrato on
than off. An ablation with the bow noise removed entirely changed noiseRatio by
less than 0.001, so that field is not measuring bow noise at all. Stable over 20 s holds at
130-1050 Hz and at 44.1 and 48 kHz: zero non-finite samples, DC ~1e-6, RMS
ratio 0.88-1.20, inharmonic energy above 12 kHz 64-81 dB down. 1.9% of one
core for a monophonic voice.
NOT LISTENED TO. Judged only by the algorithm and these measures.
`;

// --- measured body / radiation envelope ------------------------------------
// [Hz, dB]. 635 Hz and above are MEASURED (Iowa MIS violin corpus, harmonic
// levels with the 1/n source law divided out, binned by absolute frequency).
// Below 635 Hz is INFERRED from the same corpus by a different route: an h1 at
// f0 and an h2 at 2*f0 pin body(2*f0) - body(f0), so four notes at f0 294-352
// (measured h2 = -15.8, -6.4, -16.3, -25.4 dB) chained against the measured
// 587-713 Hz bins put body(290-350) at +1.3 to +6.9 dB, mean ~+3.5. Scatter is
// +/-7 dB, so treat the sub-635 shape as a level anchor, not a transfer curve.
const BODY_ENV_DB = [
  [150, -19],
  [200, -10],
  [250, 0],
  [290, 1],
  [340, 1],
  [400, -2],
  [460, 1],
  [520, -3],
  [580, -4],
  [635, -4.9],
  [713, -12.5], // measured antiresonance between B1+ and the mid band
  // 800 Hz measures -1.7 against 713's -12.5 -- a 10.8 dB step between
  // ADJACENT 1/6-octave bins, which is one strong mode of one instrument, not
  // a transfer-function feature. Smoothed here by 2 dB, well inside the bins'
  // own +/-5 dB scatter, because a 10 dB notch there lands on h2 of every note
  // in the middle of the violin's range.
  [800, -3.5],
  [898, -4.5],
  [1008, -4.0],
  [1131, -6.0],
  [1270, -8.3],
  [1425, -7.3],
  [1600, -6.7],
  [1796, -6.3],
  [2016, 5.6], // bridge hill
  [2263, 2.7],
  [2540, -1.6],
  [2851, -2.5],
  [3200, -2.7],
  [3592, 0.1], // second hill
  [4032, -4.9],
  [4525, -6.4],
  // The corpus recovered this envelope by dividing out an exactly-1/n source.
  // A real bowed source is NOT 1/n at high harmonic number -- corner rounding
  // takes over -- so part of the measured cliff above 4.5 kHz is source, not
  // body, and applying all of it on top of this model's own corner would
  // double-count it. Softened by ~3 dB for that reason; measured values in the
  // comments.
  [5080, -13.0], // measured -15.1
  [5702, -13.0], // measured -14.8
  [6400, -18.5], // measured -21.7
  [7184, -18.0], // measured -20.5
  [8063, -23.0], // measured -26.7
];

function bodyDbAt(f) {
  const first = BODY_ENV_DB[0];
  const last = BODY_ENV_DB[BODY_ENV_DB.length - 1];
  if (f <= first[0]) return first[1] - 12 * Math.log2(first[0] / Math.max(30, f));
  if (f >= last[0]) return last[1] - 18 * Math.log2(f / last[0]);
  for (let i = 1; i < BODY_ENV_DB.length; i += 1) {
    if (f <= BODY_ENV_DB[i][0]) {
      const a = BODY_ENV_DB[i - 1];
      const b = BODY_ENV_DB[i];
      const t = Math.log(f / a[0]) / Math.log(b[0] / a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return last[1];
}

/** The envelope smoothed over +/- half an octave: the broad shelf, without the
 *  narrow hill and valley features sitting on top of it. */
function trendDbAt(f) {
  let s = 0;
  for (let i = -10; i <= 10; i += 1) s += bodyDbAt(f * 2 ** (i / 20));
  return s / 21;
}

/**
 * The envelope with the contrast of its NARROW features expanded about the
 * local trend (see ENV_CONTRAST). Expanding about a single global pivot -- the
 * first thing tried here -- pushed the broad 1.2-1.8 kHz shelf 4 dB further
 * down along with everything else below the pivot, which cost h4-h8 about
 * 9 dB and drove upperVsLowerDb to -21 against the real -10 to -14. Below
 * 600 Hz nothing is sharpened: that region is inferred, not measured, so its
 * features have no claim to being real.
 */
function shapedDbAt(f) {
  const raw = bodyDbAt(f);
  if (f < 600) return raw;
  const tr = trendDbAt(f);
  const dev = Math.max(-ENV_DEV_CAP, Math.min(ENV_DEV_CAP, ENV_CONTRAST * (raw - tr)));
  return tr + dev;
}

// lit: Euphonics 5.3 signature modes of one measured violin, plus A1.
const SIGNATURE = [
  { f: 274, q: 12, boostDb: 3.5 }, // A0 Helmholtz air - radiation-damped, low Q
  { f: 405, q: 22, boostDb: 1.5 }, // CBR
  { f: 462, q: 26, boostDb: 3.0 }, // B1-
  { f: 483, q: 20, boostDb: 1.0 }, // A1
  { f: 549, q: 24, boostDb: 3.0 }, // B1+
];

// A comb whose gains follow an interpolated envelope, then read back through
// 1/6-octave smoothing, comes out with about half the envelope's contrast: the
// narrow measured features (the 713 Hz antiresonance, the 2 kHz bridge hill,
// the cliff above 4.5 kHz) are only 1-2 modes wide, so their neighbours fill
// them in. Expanding each mode's gain about a mid-level reference restores the
// measured contrast at the composite level. Verified with the probe: 1.0 gave
// 5.8 dB of 700 Hz -> 2 kHz contrast against the measured 18.1 dB.
const ENV_CONTRAST = 1.8;
// The bridge hill and the 713 Hz antiresonance are each ~+/-8 dB off the local
// trend before expansion; capping the expanded deviation stops a 1/6-octave
// bin measured on one instrument from becoming a 13 dB feature that puts h2 of
// a high E-string note above its own fundamental.
const ENV_DEV_CAP = 9;

const MODE_SPACING_HZ = 45; // lit: Cremer, via Gough 2005
const COMB_FROM_HZ = 168; // below the signature region the density is lower
const COMB_TO_HZ = 10500;
const SPACING_LOW_HZ = 58; // 205-600 Hz
const SPACING_KNEE_HZ = 2600; // constant 45 Hz below, proportional above

/**
 * Parallel bank of two-pole bandpass resonators, summed. Flat typed-array
 * state and a shared input differentiator (bandpass numerator is a*(1 - z^-2)
 * for every section) so ~100 modes cost ~7 flops each and nothing allocates
 * per sample.
 */
class ModalBank {
  constructor(sampleRate, specs) {
    const n = specs.length;
    this.n = n;
    this.c = new Float64Array(n);
    this.a1 = new Float64Array(n);
    this.a2 = new Float64Array(n);
    this.y1 = new Float64Array(n);
    this.y2 = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const f = Math.min(specs[i].f, sampleRate * 0.46);
      const w = (2 * Math.PI * f) / sampleRate;
      const alpha = Math.sin(w) / (2 * specs[i].q);
      const a0 = 1 + alpha;
      this.c[i] = (specs[i].g * alpha) / a0;
      this.a1[i] = (-2 * Math.cos(w)) / a0;
      this.a2[i] = (1 - alpha) / a0;
    }
    this.x1 = 0;
    this.x2 = 0;
  }
  process(x) {
    const d = x - this.x2;
    const n = this.n;
    const c = this.c;
    const a1 = this.a1;
    const a2 = this.a2;
    const y1 = this.y1;
    const y2 = this.y2;
    let s = 0;
    for (let i = 0; i < n; i += 1) {
      const y = c[i] * d - a1[i] * y1[i] - a2[i] * y2[i];
      y2[i] = y1[i];
      y1[i] = y;
      s += y;
    }
    this.x2 = this.x1;
    this.x1 = x;
    return s;
  }
}

/**
 * Mulberry32 on a FIXED seed. The body is the instrument's identity: one
 * violin has one set of modes, so the mode table must NOT be redrawn per note
 * from the performance rng. Drawing it per note was a real bug in an earlier
 * pass here -- it gave every note a different body, which destroys the fixed-
 * formant property that is the single most identity-bearing thing a violin
 * has. This is deterministic and reproducible; it is not Math.random().
 */
function bodyRng() {
  let a = 0x5eed7101 >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Composite magnitude of a sum of two-pole bandpasses, evaluated on the ANALOG
 * prototype H(jw) = (jr/Q) / (1 - r^2 + jr/Q), r = f/f_i. Sample-rate free, so
 * the trend correction below can be computed once at module load rather than
 * per note, and accurate enough for a broad trend at f << Nyquist.
 */
function compositeDb(specs, f) {
  let re = 0;
  let im = 0;
  for (let i = 0; i < specs.length; i += 1) {
    const m = specs[i];
    const r = f / m.f;
    const nq = r / m.q;
    const dr = 1 - r * r;
    const d2 = dr * dr + nq * nq;
    // (j*nq) / (dr + j*nq) = (nq^2 + j*nq*dr) / d2
    re += (m.g * nq * nq) / d2;
    im += (m.g * nq * dr) / d2;
  }
  return 10 * Math.log10(Math.max(re * re + im * im, 1e-24));
}

/** Power-average of a dB function over +/- 1/6 octave. */
function smoothDb(fn, f) {
  let s = 0;
  for (let i = -6; i <= 6; i += 1) s += 10 ** (fn(f * 2 ** (i / 36)) / 10);
  return 10 * Math.log10(s / 13);
}

/**
 * The body mode table: 5 signature modes + a dense fixed comb, then a trend
 * correction so the composite's SMOOTHED response actually follows the measured
 * envelope.
 *
 * The correction matters more than it sounds. Aiming each mode's gain at the
 * envelope and hoping the sum lands there was wrong by 4-10 dB and by a
 * different amount at every frequency: overlapping randomly-signed sections
 * partly cancel, and the analytic sqrt(f/(Q*spacing)) density estimate is only
 * approximate. That error read out as h7 of a D4 sitting 10 dB below the
 * corpus. Correcting against the composite's own +/-1/6-octave trend fixes the
 * broad shape while leaving the narrow jaggedness -- which is the whole point
 * of the comb -- untouched, because the correction itself is smooth.
 *
 * Frequencies are absolute Hz and are NEVER scaled by the played note.
 * Exported so the lab can probe the response without re-deriving it.
 */
export const BODY_MODES = (() => {
  const rng = bodyRng();
  const specs = [];
  for (const m of SIGNATURE) {
    const f = m.f * (1 + 0.02 * (rng() * 2 - 1));
    const q = m.q * (0.85 + 0.3 * rng());
    const g = 10 ** ((shapedDbAt(f) + m.boostDb) / 20) * 0.9;
    specs.push({ f, q, g });
  }
  let f = COMB_FROM_HZ;
  while (f < COMB_TO_HZ) {
    const low = f < 700;
    let spacing;
    if (f < 600) spacing = SPACING_LOW_HZ;
    else if (f < SPACING_KNEE_HZ) spacing = MODE_SPACING_HZ;
    else spacing = MODE_SPACING_HZ * (f / SPACING_KNEE_HZ);
    // Q is pinned to give a modal OVERLAP of ~1.15 bandwidths per spacing
    // rather than to a constant: at a fixed Q 30-75 the comb under-covers
    // below 1.5 kHz (bandwidth 14-35 Hz against 45 Hz spacing) and the gaps
    // between modes become 18 dB nulls, one of which landed on C6's own
    // fundamental and put h2 15 dB above h1. The resulting Q runs 11 (700 Hz)
    // to 60 (3 kHz+), inside Gough's representative 10/30/100 span, and still
    // more than an order of magnitude sharper than the rejected "formants".
    const q = Math.max(11, Math.min(62, (f / (spacing * 1.15)) * (0.8 + 0.4 * rng())));
    const scatterDb = low ? 3.5 : f < 3000 ? 4.5 : 5.5;
    const shape = 10 ** ((shapedDbAt(f) + scatterDb * (rng() * 2 - 1)) / 20);
    // Signs alternate quasi-randomly in a real transfer admittance, which is
    // where a violin's narrow antiresonances come from. Kept positive below
    // 1.4 kHz, where overlap is lowest and a sign flip makes a null instead of
    // a ripple.
    const sign = f < 1400 ? 1 : rng() < 0.35 ? -1 : 1;
    specs.push({ f, q, g: shape * Math.sqrt((q * spacing) / f) * sign });
    f += spacing * (0.7 + 0.6 * rng());
  }

  // --- trend correction ---
  // Reference the target to the geometric centre of the corpus's own h1 band
  // (317-449 Hz -> 377 Hz), which is what its dB figures are relative to.
  const refDb = smoothDb(shapedDbAt, 377);
  const realisedRef = smoothDb((x) => compositeDb(specs, x), 377);
  const knots = [];
  for (let i = 0; ; i += 1) {
    const fk = 150 * 2 ** (i / 6);
    if (fk > 13000) break;
    const want = smoothDb(shapedDbAt, fk) - refDb;
    const got = smoothDb((x) => compositeDb(specs, x), fk) - realisedRef;
    knots.push([fk, Math.max(-12, Math.min(12, want - got))]);
  }
  for (const m of specs) {
    let corr = knots[knots.length - 1][1];
    if (m.f <= knots[0][0]) corr = knots[0][1];
    else {
      for (let i = 1; i < knots.length; i += 1) {
        if (m.f <= knots[i][0]) {
          const t = Math.log(m.f / knots[i - 1][0]) / Math.log(knots[i][0] / knots[i - 1][0]);
          corr = knots[i - 1][1] + (knots[i][1] - knots[i - 1][1]) * t;
          break;
        }
      }
    }
    m.g *= 10 ** (corr / 20);
  }
  return specs;
})();

// --- excitation ------------------------------------------------------------

/**
 * One transverse polarisation of the bowed string, rendered as an explicit
 * slip SCHEDULE rather than an oscillator.
 *
 * The bridge force in Helmholtz motion is a sawtooth: the string sticks to the
 * bow while the force ramps linearly, then the Helmholtz corner passes and the
 * force flies back. The flyback is not instantaneous -- Cremer's corner
 * rounding gives it a finite width tau, fixed in absolute TIME rather than as
 * a fraction of the period, and set by how hard the bow presses. So tau is the
 * one knob that makes the TIMBRE breathe with bow force while the loudness
 * hardly moves, and it is the model's headline parameter.
 *
 * Because the waveform is driven by a schedule, the onset can be a different
 * REGIME rather than a quieter version of the sustain: `multiProb` makes the
 * period break into 2 or 3 slips (Guettler & Askenfelt's multiple flyback),
 * `jit` scatters the slip instants, and both decay away as Helmholtz motion
 * locks in. Nothing about that is expressible as an envelope on an oscillator.
 */
class Slipper {
  constructor(dt) {
    this.dt = dt;
    this.u = 0;
    this.interval = 0.001;
    this.tau = 0.0002;
    this.drop = 0;
    this.rise = 0;
    this.start = 0;
    this.force = 0;
    this.segsLeft = 0;
    this.remain = 0;
    this.slope = 0;
    this.gate = 0;
    this.gateDecay = Math.exp(-dt / 0.00045);
  }

  /** Schedules the next stick/slip segment. */
  slip(period, tauWanted, multiProb, jit, rng) {
    if (this.segsLeft <= 0) {
      this.remain = period;
      this.slope = 2 / period;
      let m = 1;
      const r = rng();
      if (r < multiProb) m = r < multiProb * 0.62 ? 2 : 3;
      this.segsLeft = m;
    }
    let frac = 1;
    if (this.segsLeft > 1) {
      frac = 1 / this.segsLeft + 0.34 * (rng() - 0.5);
      frac = Math.max(0.18, Math.min(0.82, frac));
    }
    let iv = this.remain * frac * (1 + jit * (rng() * 2 - 1));
    this.remain = Math.max(0, this.remain - iv);
    this.segsLeft -= 1;

    const tau = Math.max(0.00007, Math.min(tauWanted, 0.00075));
    const minIv = tau * 2.5 + 4 * this.dt;
    if (iv < minIv) iv = minIv;
    this.interval = iv;
    this.tau = Math.min(tau, iv * 0.4);
    // Constant stick slope within a nominal period, so an extra flyback reads
    // as a real extra slip of the sawtooth, not as an amplitude change.
    this.drop = this.slope * iv;
    this.rise = this.drop / (this.interval - this.tau);
    this.start = this.force;
    this.gate = 1;
  }

  next(period, tauWanted, multiProb, jit, rng) {
    this.u += this.dt;
    if (this.u >= this.interval) {
      const over = this.u - this.interval;
      this.slip(period, tauWanted, multiProb, jit, rng);
      this.u = over;
    }
    const u = this.u;
    if (u < this.tau) {
      const p = u / this.tau;
      // Smoothstep flyback: value-continuous with zero slope at both ends, so
      // the source follows 1/n below ~0.4/tau and 1/n^2 above it. Verified
      // against a numeric DFT of one period: at tau = 100 us the table is
      // 0, -6.0, -9.6, -12.2, -14.2 ... indistinguishable from an ideal
      // sawtooth through h16, which is what a bowed bridge force should be.
      this.force = this.start - this.drop * p * p * (3 - 2 * p);
      this.gate = 1;
    } else {
      this.force = this.start - this.drop + this.rise * (u - this.tau);
      this.gate *= this.gateDecay;
    }
    return this.force;
  }
}

// --- voice -----------------------------------------------------------------

const CTRL = 32; // control-rate decimation (1.5 kHz at 48 k)
const TRIM = 0.34;
// Relative amplitude and detune of the string's SECOND transverse
// polarisation. A real bowed string vibrates in two planes whose bridge
// admittance differs, so the two are slightly detuned and beat. This matters
// far beyond realism bookkeeping: harmonic k of the sum beats at k*df with its
// own phase, so it is a per-harmonic AM generator that is independent BY
// CONSTRUCTION -- no two neighbours can move together. It is also exactly the
// structure Mellody & Wakefield measured, with the partials' amplitude-envelope
// spectra peaking at integer multiples of a base rate. Kept at 0.20 (a 4.4 dB
// swing) because a stronger second copy would read as a detuned-synth chorus.
const POL2_AMP = 0.2;
const POL2_DETUNE = 0.0026;

export function makeVoice({ sampleRate, frequency, velocity, rng }) {
  const sr = sampleRate;
  const dt = 1 / sr;
  const f0 = Math.max(120, Math.min(1250, frequency));
  const vel = Math.max(0.15, Math.min(1, velocity));

  const body = new ModalBank(sr, BODY_MODES);
  const dcb = new DcBlock(0.998);
  // String damping + radiation rolloff. Also the anti-alias guard: the
  // excitation's flyback leaves slope discontinuities, so it needs a real
  // ceiling before it folds.
  const lp1 = new Biquad(sr).lowpass(Math.min(9400, sr * 0.4), 0.66);
  const lp2 = new Biquad(sr).lowpass(Math.min(13000, sr * 0.45), 0.62);
  // Bow noise is HF-weighted relative to the harmonics (friction noise does
  // not roll off the way the Helmholtz corner does). Split into two bands with
  // independent slow level walks: one broadband envelope over the whole noise
  // floor made every noise-dominated partial move together, which pinned the
  // neighbour correlation at 0.9+ across the top of the spectrum.
  const nzHp = new Biquad(sr).highpass(750, 0.7);
  const nzSplit = new Biquad(sr).lowpass(2600, 0.7);
  const nzTilt = new Biquad(sr).peaking(3400, 0.9, 7);
  const pink = new PinkNoise(rng);

  // --- pre-drawn per-note character (all from the seeded rng, once) --------
  const vibRate = 5.2 + 0.7 * rng();
  const vibPhase0 = rng() * 2 * Math.PI;
  const vibSkewPhase = rng() * 2 * Math.PI;
  const vibDepthCents = 29 + 8 * rng();
  const vibOnset = 0.09 + 0.06 * rng();
  const vibFade = 0.26 + 0.14 * rng();
  const rateLfoRate = 0.29 + 0.22 * rng();
  const rateLfoPhase = rng() * 2 * Math.PI;
  const depthLfoRate = 0.37 + 0.26 * rng();
  const depthLfoPhase = rng() * 2 * Math.PI;
  const bowLfoARate = 0.55 + 0.5 * rng();
  const bowLfoAPhase = rng() * 2 * Math.PI;
  const bowLfoBRate = 1.9 + 1.1 * rng();
  const bowLfoBPhase = rng() * 2 * Math.PI;
  const tauBase = (0.0001 + 0.000035 * rng()) * (294 / f0) ** 0.3;
  // Calibrated by ablation against the reference corpus under MATCHED
  // conditions (vibrato off, so analyse()'s +/-4-bin harmonic window is valid
  // for both): at the first level tried, a novib render measured noiseRatio
  // 0.002-0.005 against the real novib 0.030-0.048, i.e. ~10 dB light, so this
  // is +7 dB on that. It cannot be pushed to the measured figure honestly --
  // part of the real number is the room the corpus was recorded in, and
  // slip-GATED noise is pitch-synchronous, so most of its energy lands on the
  // harmonics and the measure cannot see it at all (raising the level 4x moved
  // the sustain figure by 0.01). This is the least verifiable number here.
  // Friction noise also does not get relatively louder as the note goes up,
  // while the harmonics get fewer, hence the mild inverse-pitch scaling.
  const noiseBase = 2.2 * (0.075 + 0.035 * rng()) * Math.min(1.25, (294 / f0) ** 0.75);
  const pol2Detune = 1 + POL2_DETUNE * (0.7 + 0.6 * rng());
  const preSec = Math.max(0.018, Math.min(0.055, 9 / f0));

  const pol1 = new Slipper(dt);
  const pol2 = new Slipper(dt);

  // --- state ---------------------------------------------------------------
  let t = 0;
  let n = 0;
  let releasing = false;
  let tRel = 0;
  let level = 0;

  // control-rate values, held between updates
  let periodNow = 1 / f0;
  let tauNow = tauBase;
  let multiProb = 0.66;
  let jitAmt = 0.22;
  let bowAmp = 0;
  let noiseLo = 0;
  let noiseHi = 0;
  let wanderZ = 0;
  let bowWalk = 0;
  let nzLoWalk = 0;
  let nzHiWalk = 0;
  const wanderA = Math.exp((-2 * Math.PI * 7 * CTRL) / sr);
  const bowWalkA = Math.exp((-2 * Math.PI * 1.3 * CTRL) / sr);
  const nzWalkA = Math.exp((-2 * Math.PI * 2.2 * CTRL) / sr);

  function control() {
    const rel = releasing ? Math.exp(-(t - tRel) / 0.085) : 1;

    // pitch: vibrato + a jitter floor that never switches off. Measured real
    // notes never sat below 3 cents rms even with the left hand still, so the
    // walk is scaled to ~4 cents rms and is present at vibrato depth zero.
    wanderZ = wanderZ * wanderA + (1 - wanderA) * (rng() * 2 - 1);
    const vibAmt = Math.max(0, Math.min(1, (t - vibOnset) / vibFade));
    const depthMod = 1 + 0.2 * Math.sin(2 * Math.PI * depthLfoRate * t + depthLfoPhase);
    const rateMod = 1 + 0.075 * Math.sin(2 * Math.PI * rateLfoRate * t + rateLfoPhase);
    const vp = vibPhase0 + 2 * Math.PI * vibRate * rateMod * t;
    // deliberately not a pure sine: Gough measures the induced fluctuation as
    // time-asymmetric, so the second partial of the vibrato shape is present.
    const vshape = (Math.sin(vp) + 0.19 * Math.sin(2 * vp + vibSkewPhase)) / 1.09;
    const cents = vibAmt * vibDepthCents * depthMod * vshape + 57 * wanderZ;
    periodNow = 1 / (f0 * 2 ** (cents / 1200));

    // bow force: two slow LFOs plus a random walk. Drives the CORNER, so the
    // timbre breathes several dB while the level barely moves.
    bowWalk = bowWalk * bowWalkA + (1 - bowWalkA) * (rng() * 2 - 1);
    const bowF =
      1 +
      0.17 * Math.sin(2 * Math.PI * bowLfoARate * t + bowLfoAPhase) +
      0.11 * Math.sin(2 * Math.PI * bowLfoBRate * t + bowLfoBPhase) +
      1.4 * bowWalk;
    const bowFc = Math.max(0.45, Math.min(1.75, bowF));

    // Onset corner path: over-sharp for the first ~20 ms (the bite), then
    // over-round at ~40-120 ms, settling last. Non-monotonic on purpose, so
    // the partials do not all arrive in order or on one curve.
    const tauShape = 1 + 0.8 * Math.exp(-t / 0.09) - 1.15 * Math.exp(-t / 0.022);
    const relRound = releasing ? 1 + 1.6 * (1 - rel) : 1;
    tauNow = (tauBase * tauShape * relRound) / bowFc ** 0.8;

    // slip-schedule regime: multiple flyback and heavy timing scatter for the
    // first ~9 fundamental periods, then one clean slip per period.
    multiProb = 0.66 * Math.exp(-t / (preSec * 0.55));
    // The scatter does not go straight to its floor: measured real notes have
    // partials still arriving 30-320 ms in and the broadband envelope still
    // swelling at 110-900 ms, so a small residual aperiodicity is carried well
    // past the pre-Helmholtz window before settling to the 4-7 cent jitter
    // floor that a real sustained note never drops below.
    jitAmt = 0.007 + 0.22 * Math.exp(-t / (preSec * 0.8)) + 0.022 * Math.exp(-t / 0.26);

    // amplitude: a curved swell that keeps rising for ~250 ms and then holds.
    // No peak-then-decay-to-a-fraction: that shape is a plucked-string cue.
    // Squared, so the very start is slow: measured real notes reach only ~20%
    // of steady RMS by 25 ms yet are ~100% non-harmonic there, and reach 90% of
    // steady only at 110-900 ms (median 315). A plain exponential was at 21% by
    // 25 ms and 90% by 250, which left no room for the onset to be
    // noise-dominated at a QUIET absolute level -- the first attempt at that
    // made the burst louder than the tone, which is a scratch, not a bow.
    const swell = (1 - Math.exp(-t / 0.085)) ** 2;
    // Almost no LEVEL dependence on bow force. Anything more makes every
    // partial breathe in lockstep, which is the defining synth cue.
    bowAmp = vel * rel * swell * (1 + 0.05 * (bowFc - 1));

    // bow noise: a big burst through the pre-Helmholtz window plus a slower
    // settling excess (measured non-harmonic fraction settles by 50-75 ms but
    // the tone keeps swelling for another 250), louder when the bow is light
    // (flautando), gone once the bow leaves the string.
    const onsetNoise = 1 + 3.2 * Math.exp(-t / (preSec * 1.3)) + 1.6 * Math.exp(-t / 0.28);
    nzLoWalk = nzLoWalk * nzWalkA + (1 - nzWalkA) * (rng() * 2 - 1);
    nzHiWalk = nzHiWalk * nzWalkA + (1 - nzWalkA) * (rng() * 2 - 1);
    const base = noiseBase * vel * onsetNoise * (1.6 - 0.6 * bowFc) * rel * rel * (1 - Math.exp(-t / 0.015));
    noiseLo = base * (1 + 2 * nzLoWalk);
    noiseHi = base * (1 + 2 * nzHiWalk);
  }

  control();
  pol1.slip(periodNow, tauNow, multiProb, jitAmt, rng);
  pol2.slip(periodNow * pol2Detune, tauNow, multiProb, jitAmt, rng);

  return {
    next() {
      if (n % CTRL === 0) control();
      n += 1;

      const f1 = pol1.next(periodNow, tauNow, multiProb, jitAmt, rng);
      // The second polarisation gets its own jitter draws and a slightly
      // rounder corner (the bridge is more compliant in that plane), so it is
      // a genuinely separate motion rather than a detuned copy.
      const f2 = pol2.next(periodNow * pol2Detune, tauNow * 1.35, multiProb, jitAmt, rng);

      // Friction noise is generated BY the slip, so it is gated to it rather
      // than laid over the tone as a stationary hiss.
      const nz = nzTilt.process(nzHp.process(pink.next()));
      const lo = nzSplit.process(nz);
      const gate = 0.28 + 0.9 * pol1.gate;
      const x = (f1 + POL2_AMP * f2) * bowAmp + (lo * noiseLo + (nz - lo) * noiseHi) * gate;

      let y = body.process(lp2.process(lp1.process(x)));
      y = softClip(y * TRIM);
      y = dcb.process(y);

      const a = y < 0 ? -y : y;
      level = a > level ? a : level * 0.9997;
      t += dt;
      return y;
    },
    release() {
      if (!releasing) {
        releasing = true;
        tRel = t;
      }
    },
    finished() {
      return releasing && t - tRel > 0.08 && (level < 1.5e-4 || t - tRel > 1.6);
    },
  };
}
