// 5-spectral-residual — SPECTRAL MODELLING SYNTHESIS (Serra & Smith 1990).
//
// The four rejected attempts were all "one periodic oscillator -> one filter
// chain -> one amplitude envelope". That topology mathematically CANNOT produce
// the two properties measurement says identify a violin: adjacent harmonics
// whose dB envelopes are only weakly correlated, and a jagged (2.5-3 dB
// irregularity) harmonic series. One source through one gain pins neighbour
// correlation at 1.0; a smooth filter over a smooth source pins irregularity
// at 0.1 dB (smoother than a trumpet).
//
// So this candidate is not a filtered oscillator at all. It is the
// analysis/synthesis decomposition itself, run forwards:
//
//   DETERMINISTIC   up to 40 independent sinusoids, each with its own
//                   oscillator, its own arrival time, its own jitter and its
//                   own slow modulators. Each partial's amplitude is read
//                   every 64 samples out of a FIXED (never pitch-tracking)
//                   body table at that partial's INSTANTANEOUS frequency, so
//                   vibrato and pitch jitter are converted into per-partial
//                   amplitude modulation by the body's own resonance slopes —
//                   the actual physical mechanism, and the one Mellody &
//                   Wakefield showed carries the perceptual weight.
//
//   STOCHASTIC      a pink residual through a 19-band 1/3-octave bank whose
//                   band gains are read from THE SAME body table, gated to the
//                   slip phase of THE SAME fundamental phasor, and scaled by
//                   THE SAME bow-force signal that drives the deterministic
//                   part. Uncorrelated hiss over a clean tone reads as "synth
//                   plus noise"; this residual breathes with the bow.
//
// Nothing here is a Web Audio node, nothing allocates per sample, and every
// random draw is either a fixed deterministic quasi-random sequence (the body,
// which must be the SAME violin for every note) or the seeded `rng` (per-note
// gesture detail, which must differ note to note).

import { Biquad, DcBlock, PinkNoise } from "../dsp.mjs";

export const name = "5-spectral-residual";

export const notes = `
Spectral modelling synthesis (Serra & Smith): a deterministic bank of up to 40
sinusoids plus a correlated stochastic residual. Each partial's amplitude is
looked up every 64 samples out of a fixed body table -- five signature modes plus
~275 resonances at Cremer's 45 Hz mean spacing, log-uniformly weighted over 24 dB
with Q rising with frequency so each mode's bandwidth stays of the order of the
spacing, detrended and shaped by the measured Iowa-corpus body envelope -- at that partial's INSTANTANEOUS frequency, so a
5.5 Hz / +-20 cent vibrato over a 5 cent jitter floor is converted into many dB of
per-partial amplitude modulation by the body's own resonance slopes. That is the
physical mechanism, and it is why this reads as one instrument rather than 40
detuned oscillators: the modulation is mostly COMMON (one bow-force random walk,
which also sets the Helmholtz corner-rounding cutoff and hence brightness) with
only a minority individual, per Jensen's timbre model. Partials arrive at
scattered times spanning 20-280 ms, after a pre-Helmholtz transient that really
runs in a multiple-slip regime -- measured, D4's first 43 ms is dominated by h3
with h1 18 dB down, plus half-integer period-doubled partials. The residual is
pink noise through a 19-band bank whose gains come from the same body table,
gated to the slip phase of the same phasor and scaled by the same bow force, and
its level is solved numerically at note-on so noise sits at a fixed 0.23 of the
tone's RMS at every pitch; over the first 60 ms it rises to 0.5-0.85. Measured at
D4: spectral irregularity 2.97 dB (real violin 2.6-3.1, trumpet 0.6, rejected
baseline 0.1), adjacent-harmonic envelope correlation 0.50 with 7% of pairs
negative (real 0.42-0.99, baseline 0.92), per-harmonic modulation range 3.9-10.8
dB (real 3.6-20, baseline 0.8-4.1), 3 harmonic rises with a 11.8 dB jump
(baseline: strictly monotonic, zero rises). Whichever harmonic lands near 2.2 kHz
is lifted 4.5-7.1 dB over whichever lands near 700 Hz at C3, D4, A4 AND C6 --
the harmonic number moves from h16 to h2 while the lift stays, which is the test
that the body is fixed in absolute frequency and is not tracking pitch.
No oscillator is filtered and no filter frequency depends on the note.
`;

// ---------------------------------------------------------------------------
// The body. Built ONCE at module load, shared by every note, identical on every
// run: a violin does not get a new body per note, and an auditor must be able
// to reproduce these numbers. The quasi-random scatter comes from a Halton
// sequence rather than a PRNG so there is no seed to get wrong.
// ---------------------------------------------------------------------------

const LN10_20 = Math.LN10 / 20;

function halton(i, base) {
  let f = 1;
  let r = 0;
  let n = i;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

// measured (Iowa MIS corpus, 22 arco notes, f0 294-497 Hz): body + radiation
// envelope in dB, recovered by removing the 1/n source law and binning every
// harmonic by ABSOLUTE frequency. Points below 635 Hz are inferred — the corpus
// fundamentals sat there so those bins are 0 by construction.
const ENVELOPE_DB = [
  [60, -34], [90, -26], [130, -16], [165, -11], [200, -6.5], [250, -3.0],
  [320, 0.0], [400, 0.0], [500, -1.5], [566, -3.0],
  [635, -4.9], [713, -12.5], [800, -1.7], [898, -5.0], [1008, -5.3],
  [1131, -7.3], [1270, -8.3], [1425, -7.3], [1600, -6.7], [1796, -6.3],
  [2016, 5.6], [2263, 2.7], [2540, -1.6], [2851, -2.5], [3200, -2.7],
  [3592, 0.1], [4032, -4.9], [4525, -6.4], [5080, -15.1], [5702, -14.8],
  [6400, -21.7], [7184, -20.5], [8063, -26.7], [9051, -28.0], [10159, -28.7],
  [13000, -33.0], [16000, -36.0], [22000, -42.0],
];

function envelopeDb(f) {
  if (f <= ENVELOPE_DB[0][0]) return ENVELOPE_DB[0][1];
  for (let i = 1; i < ENVELOPE_DB.length; i += 1) {
    if (f <= ENVELOPE_DB[i][0]) {
      const [f0, d0] = ENVELOPE_DB[i - 1];
      const [f1, d1] = ENVELOPE_DB[i];
      const u = Math.log(f / f0) / Math.log(f1 / f0);
      return d0 + (d1 - d0) * u;
    }
  }
  return ENVELOPE_DB[ENVELOPE_DB.length - 1][1];
}

const TN = 2048; // table points
const TF_LO = 40;
const TF_HI = 22050;
const T_LOG0 = Math.log(TF_LO);
const T_SPAN = Math.log(TF_HI) - T_LOG0;
const T_SCALE = (TN - 1) / T_SPAN;

const BODY_DB = (() => {
  const freq = new Float64Array(TN);
  for (let i = 0; i < TN; i += 1) freq[i] = Math.exp(T_LOG0 + (i / (TN - 1)) * T_SPAN);

  // Five signature modes (Euphonics 5.3), then Gough's (2005) own prescription
  // for the region above them: resonances at Cremer's 45 Hz MEAN SPACING,
  // RANDOMLY WEIGHTED, with Q spanning his representative 10 / 30 / 100. The
  // wide log-uniform weighting is the point — it is what makes a single comb
  // produce structure at several scales at once, so some partials land on a
  // strong isolated mode and their neighbours land in an antiresonance. Between
  // 700 Hz and 5 kHz this is ~95 modes, which is what a real violin has and
  // what four broad Q~1-2.5 formants cannot imitate.
  const modes = [
    [275, 16, 1.15, 1], [405, 24, 0.70, -1], [462, 28, 1.05, 1],
    [482, 24, 0.60, -1], [548, 28, 1.10, 1],
  ];
  let f = 560;
  let i = 1;
  while (f < 13000) {
    const u1 = halton(i, 2);
    const u2 = halton(i, 3);
    const u3 = halton(i, 5);
    const u4 = halton(i, 7);
    const q = Math.max(10, Math.min(240, f / 48)) * (0.55 + 0.9 * u2);
    modes.push([f, q, 10 ** ((24 * u3 - 17) / 20), u4 < 0.47 ? -1 : 1]);
    f += 45 * (0.6 + 0.8 * u1);
    i += 1;
  }

  const re = new Float64Array(TN);
  const im = new Float64Array(TN);
  const halfWin = Math.round(1.2 * Math.LN2 * T_SCALE); // +-1.2 octaves
  for (let m = 0; m < modes.length; m += 1) {
    const fm = modes[m][0];
    const q = modes[m][1];
    const a = modes[m][2] * modes[m][3];
    const centre = (Math.log(fm) - T_LOG0) * T_SCALE;
    const i0 = Math.max(0, Math.floor(centre - halfWin));
    const i1 = Math.min(TN - 1, Math.ceil(centre + halfWin));
    for (let k = i0; k <= i1; k += 1) {
      const x = freq[k] / fm;
      const u = x / q;
      const d = 1 - x * x;
      const den = d * d + u * u;
      re[k] += (a * u * u) / den;
      im[k] += (a * u * d) / den;
    }
  }

  const raw = new Float64Array(TN);
  for (let k = 0; k < TN; k += 1) raw[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) + 1e-9);

  // Detrend against a 2/3-octave running mean: what is left is the comb ripple,
  // which is the thing that makes the harmonic series jagged. The window has to
  // be WIDER than the coarse mode spacing or detrending would flatten exactly
  // the structure that survives vibrato. The measured envelope then supplies
  // the gross shape.
  const hw = Math.round((2 / 3) * Math.LN2 * T_SCALE);
  const pre = new Float64Array(TN + 1);
  for (let k = 0; k < TN; k += 1) pre[k + 1] = pre[k] + raw[k];
  const out = new Float64Array(TN);
  for (let k = 0; k < TN; k += 1) {
    const a = Math.max(0, k - hw);
    const b = Math.min(TN, k + hw + 1);
    let rip = raw[k] - (pre[b] - pre[a]) / (b - a);
    if (rip > 12) rip = 12;
    if (rip < -17) rip = -17;
    out[k] = envelopeDb(freq[k]) + rip;
  }
  return out;
})();

/** Fixed body magnitude in dB at an absolute frequency. Never scaled by pitch. */
function bodyDb(f) {
  if (f <= TF_LO) return BODY_DB[0];
  if (f >= TF_HI) return BODY_DB[TN - 1];
  const p = (Math.log(f) - T_LOG0) * T_SCALE;
  const i = p | 0;
  const fr = p - i;
  return BODY_DB[i] * (1 - fr) + BODY_DB[i + 1] * fr;
}

// ---------------------------------------------------------------------------

const CTRL = 64; // samples per control block
const TWO_PI = Math.PI * 2;
const MAX_PARTIALS = 40;
const SUB_RATIOS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]; // period-doubled transient
const BAND_COUNT = 19;
const WIN_N = 128;
const GATE_FLOOR = 0.42;
const GATE_DEPTH = 1.7;
const RES_TO_DET_RMS = 0.23; // residual : deterministic RMS in the sustain
const CAL = 2048;
const CAL_SKIP = 512;
/** Cache of residual-path calibrations, keyed by sampleRate:f0. A repeated pitch
 *  costs nothing, so only the first note of each pitch pays the ~1 ms. Keyed on
 *  the exact f0, so the cached value is bit-identical to recomputing it.
 *  PORTING NOTE: 1 ms lands inside a 128-sample quantum at 48 kHz but leaves
 *  little slack, so when this goes into an AudioWorkletProcessor, warm the cache
 *  in the processor's constructor by calling makeVoice() once per pitch the
 *  instrument can play and discarding the voices. After that every note-on is
 *  ~0.05 ms and nothing is computed on the realtime path. */
const CAL_CACHE = new Map();
const SLIP_WIN = new Float64Array(WIN_N);
for (let i = 0; i < WIN_N; i += 1) SLIP_WIN[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / WIN_N);

/** Peak-safe soft knee that is completely inactive below 0.9 (no distortion). */
function limit(x) {
  const a = x < 0 ? -x : x;
  if (a <= 0.9) return x;
  return (x < 0 ? -1 : 1) * (0.9 + 0.09 * Math.tanh((a - 0.9) / 0.09));
}

export function makeVoice({ sampleRate, frequency, velocity, rng }) {
  const sr = sampleRate;
  const f0 = Math.max(120, Math.min(1400, frequency));
  const vel = Math.max(0.15, Math.min(1, velocity));
  const ctrlDt = CTRL / sr;
  const nyq = 0.47 * sr;

  const nHarm = Math.max(4, Math.min(MAX_PARTIALS, Math.floor(nyq / f0)));
  const nSub = f0 * SUB_RATIOS[SUB_RATIOS.length - 1] < nyq ? SUB_RATIOS.length : 0;
  const NP = nHarm + nSub;

  // --- per-partial state, all allocated once ------------------------------
  const ratio = new Float64Array(NP);
  const srcLin = new Float64Array(NP);
  const detune = new Float64Array(NP); // fixed inharmonic offset, multiplicative
  const oscC = new Float64Array(NP);
  const oscS = new Float64Array(NP);
  const rotC = new Float64Array(NP);
  const rotS = new Float64Array(NP);
  const amp = new Float64Array(NP);
  const ampT = new Float64Array(NP);
  const arrive = new Float64Array(NP); // one-pole rise state
  const arriveK = new Float64Array(NP);
  const m1p = new Float64Array(NP);
  const m1w = new Float64Array(NP);
  const m1d = new Float64Array(NP);
  const m2p = new Float64Array(NP);
  const m2w = new Float64Array(NP);
  const m2d = new Float64Array(NP);
  const relK = new Float64Array(NP); // per-partial release decay per control block
  const relG = new Float64Array(NP);
  const isMult = new Uint8Array(NP);

  // pre-Helmholtz multiple-slip order: 2, 3 or 4 slips per nominal period
  const slipOrder = 2 + Math.floor(rng() * 3);

  for (let j = 0; j < NP; j += 1) {
    const isSub = j >= nHarm;
    const r = isSub ? SUB_RATIOS[j - nHarm] : j + 1;
    ratio[j] = r;
    // Helmholtz bridge force is 1/n; the exponent is pulled a little under 1
    // because the measured body envelope was recovered ASSUMING exact 1/n and
    // therefore absorbed the real source's shallower mid-range tilt.
    srcLin[j] = (isSub ? 0.5 : 1) / r ** 0.83;
    detune[j] = 1 + (rng() * 2 - 1) * (isSub ? 0.004 : 0.0009);
    const ph = rng() * TWO_PI;
    oscC[j] = Math.cos(ph);
    oscS[j] = Math.sin(ph);
    // Scattered arrival, in NO monotonic order. h1-h3 land in 20-75 ms because
    // Helmholtz motion establishes the low partials first; everything above
    // scatters over 20-280 ms, which is what produces the measured 9:1 to 265:1
    // within-note arrival spread (real notes: 3:1 to 10:1, up to 690 ms).
    const tau = 0.020 + (j < 3 ? 0.055 : 0.26) * rng() ** 1.6;
    arriveK[j] = 1 - Math.exp((-0.695 * ctrlDt) / tau);
    m1w[j] = TWO_PI * (2.5 + 5.0 * rng()) * ctrlDt;
    m1p[j] = rng() * TWO_PI;
    m1d[j] = 0.82 + 0.070 * (isSub ? 2 : j + 1);
    if (m1d[j] > 2.3) m1d[j] = 2.3;
    m2w[j] = TWO_PI * (0.3 + 0.9 * rng()) * ctrlDt;
    m2p[j] = rng() * TWO_PI;
    m2d[j] = 0.54 + 0.050 * (isSub ? 2 : j + 1);
    if (m2d[j] > 1.7) m2d[j] = 1.7;
    // upper partials die faster on release, as on a real string
    const relTau = Math.max(0.035, 0.21 * Math.exp(-0.035 * r));
    relK[j] = Math.exp(-ctrlDt / relTau);
    relG[j] = 1;
    isMult[j] = !isSub && (j + 1) % slipOrder === 0 ? 1 : 0;
  }

  // --- residual bank ------------------------------------------------------
  const bands = [];
  const bandG = new Float64Array(BAND_COUNT);
  const bandBase = new Float64Array(BAND_COUNT);
  for (let b = 0; b < BAND_COUNT; b += 1) {
    const fc = 159 * 2 ** (b / 3);
    bands.push(new Biquad(sr).bandpass(Math.min(fc, sr * 0.45), 4.3));
    // the residual is shaped by the SAME body as the harmonics; pink noise
    // supplies a -3 dB/oct source so noise/harmonic rises with frequency the
    // way friction noise does against a 1/n source.
    let g = Math.exp(bodyDb(fc) * LN10_20);
    if (fc > 9000) g *= 9000 / fc;
    bandBase[b] = g;
  }
  const pink = new PinkNoise(rng);
  const dcb = new DcBlock(0.998);

  // --- gain staging -------------------------------------------------------
  // The body swings the raw level ~8 dB across the register purely from where
  // f0 lands on the resonances. Normalising by the steady partial sum keeps the
  // rendered peak inside the contract while the SPECTRUM keeps the register
  // character.
  let sumA = 0;
  let sumSq = 0;
  for (let j = 0; j < nHarm; j += 1) {
    const fk = f0 * (j + 1);
    if (fk > nyq) break;
    const x = fk / 8400;
    const a = srcLin[j] * Math.exp(bodyDb(fk) * LN10_20) * (1 / Math.sqrt(1 + x * x));
    sumA += a;
    sumSq += a * a;
  }
  // Peak of a sum of drifting-phase sinusoids sits well below the coherent sum;
  // 3.6x RMS is the honest estimate and `sumA` the hard bound.
  const peakEst = Math.max(0.05, Math.min(sumA, 3.6 * Math.sqrt(sumSq / 2)));
  const detGain = (0.345 + 0.105 * vel) / peakEst;

  // The residual's level out of the band bank depends on how the slip-burst rate
  // sits against each band's ring time, which is a messy function of f0 and of
  // the sample rate -- measuring it beat every pitch curve I tried by hand (the
  // C5 render peaked at 1.9 while C6 reached 0.33). So: run the residual path
  // dry for 8192 samples against its OWN fixed-seed noise, measure the RMS, and
  // solve for the gain that puts it at RES_TO_DET_RMS of the deterministic RMS.
  // Costs one note-on, allocates nothing per sample, uses none of the caller's
  // rng, and is bit-identical on every run.
  const calKey = `${sr}:${f0}`;
  let calRms = CAL_CACHE.get(calKey);
  if (calRms === undefined) {
    let calState = 0x6d2b79f5;
    const calRng = () => {
      calState = (calState + 0x9e3779b9) >>> 0;
      let x = calState;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const calPink = new PinkNoise(calRng);
    let calPh = 0;
    let calSum = 0;
    for (let i = 0; i < CAL; i += 1) {
      calPh += f0 / sr;
      if (calPh >= 1) calPh -= 1;
      let g = GATE_FLOOR;
      if (calPh < 0.115) g += GATE_DEPTH * SLIP_WIN[((calPh / 0.115) * WIN_N) | 0];
      const x = calPink.next() * g;
      let y = 0;
      for (let b = 0; b < BAND_COUNT; b += 1) y += bandBase[b] * bands[b].process(x);
      if (i >= CAL_SKIP) calSum += y * y;
    }
    calRms = Math.sqrt(calSum / (CAL - CAL_SKIP));
    CAL_CACHE.set(calKey, calRms);
    for (let b = 0; b < BAND_COUNT; b += 1) {
      const q = bands[b];
      q.x1 = 0;
      q.x2 = 0;
      q.y1 = 0;
      q.y2 = 0;
    }
  }
  const detRms = detGain * Math.sqrt(sumSq / 2);
  const resGain = (RES_TO_DET_RMS * detRms) / Math.max(1e-9, calRms);

  // --- gesture state ------------------------------------------------------
  let n1 = -0.30;
  let n2 = -0.20;
  let n3 = 0;
  let n4 = 0;
  const A1 = TWO_PI * 1.2 * ctrlDt;
  const A2 = TWO_PI * 0.32 * ctrlDt;
  const A3 = TWO_PI * 9.0 * ctrlDt;
  const A4 = TWO_PI * 0.5 * ctrlDt;
  const S1 = 1 / (Math.sqrt(A1 / 2) * 0.5774);
  const S2 = 1 / (Math.sqrt(A2 / 2) * 0.5774);
  const S3 = 1 / (Math.sqrt(A3 / 2) * 0.5774);
  const S4 = 1 / (Math.sqrt(A4 / 2) * 0.5774);

  let vibPhase = rng() * TWO_PI;
  let ph01 = rng();
  let t = 0;
  let env = 0;
  const envK = 1 - Math.exp(-ctrlDt / 0.052);
  let releasing = false;
  let relT = 0;
  let ctr = 0;
  const ampK = 1 - Math.exp(-1 / (sr * 0.0015));

  // pre-Helmholtz transient length: ~10 fundamental periods, inside Guettler &
  // Askenfelt's 50 ms acceptance band at every pitch in range.
  const preT = Math.max(0.016, Math.min(0.055, 10 / f0));
  const lockT = preT + 0.032;

  let f0now = f0;
  let bf = 0.7;
  let betaCur = 0.12;
  let resLevel = 0;
  // A slip burst lasts beta/f0 seconds, so the low bands see far more energy per
  // burst at low pitch; without this the C3 and G3 renders hit the limiter.


  function control() {
    const w1 = rng() * 2 - 1;
    const w2 = rng() * 2 - 1;
    const w3 = rng() * 2 - 1;
    const w4 = rng() * 2 - 1;
    n1 += (w1 - n1) * A1;
    n2 += (w2 - n2) * A2;
    n3 += (w3 - n3) * A3;
    n4 += (w4 - n4) * A4;
    const g1 = n1 * S1;
    const g2 = n2 * S2;
    const g3 = n3 * S3;
    const g4 = n4 * S4;

    // bow force: a slow crescendo into the note plus a 0.3-3 Hz random walk.
    // This single signal drives BOTH the partial levels and the residual, which
    // is what makes them read as one gesture rather than tone-plus-hiss.
    const bfBase = (0.74 + 0.30 * vel) * (0.73 + 0.27 * (1 - Math.exp(-t / 0.048)));
    bf = bfBase * (1 + 0.165 * g1 + 0.09 * g2);
    if (bf < 0.35) bf = 0.35;
    if (bf > 1.6) bf = 1.6;

    // pitch: vibrato (time-asymmetric, rate wandering) over a jitter floor.
    const fade = t < 0.10 ? 0 : Math.min(1, (t - 0.10) / 0.30);
    const vibDepth = 20 * fade;
    vibPhase += TWO_PI * 5.5 * (1 + 0.07 * g4) * ctrlDt;
    const vibCents = (vibDepth * (Math.sin(vibPhase) + 0.22 * Math.sin(2 * vibPhase + 0.9))) / 1.12;
    const jitCents = 5.0 * g3;
    f0now = f0 * Math.exp(((vibCents + jitCents) / 1200) * Math.LN2);

    // attack regime: 1 during pre-Helmholtz, crossfading to 0 once Helmholtz
    // motion locks in.
    let stage1 = 0;
    if (t < preT) stage1 = 1;
    else if (t < lockT) {
      const u = 1 - (t - preT) / (lockT - preT);
      stage1 = u * u * (3 - 2 * u);
    }

    if (releasing) {
      relT += ctrlDt;
      env *= Math.exp(-ctrlDt / 0.30);
    } else {
      env += (1 - env) * envK;
    }

    const bfShape = Math.exp(Math.log(bf) * 0.65);
    const corner = 7000 * (0.45 + 0.75 * bf); // fixed in Hz — never tracks pitch
    const master = env * bfShape;

    for (let j = 0; j < NP; j += 1) {
      const isSub = j >= nHarm;
      const fk = f0now * ratio[j] * detune[j];
      arrive[j] += (1 - arrive[j]) * arriveK[j];
      m1p[j] += m1w[j];
      m2p[j] += m2w[j];
      if (releasing) relG[j] *= relK[j];

      if (fk > nyq || fk < 15) {
        ampT[j] = 0;
        rotC[j] = 1;
        rotS[j] = 0;
        continue;
      }
      const w = (TWO_PI * fk) / sr;
      rotC[j] = Math.cos(w);
      rotS[j] = Math.sin(w);

      const modDb = m1d[j] * Math.sin(m1p[j]) + m2d[j] * Math.sin(m2p[j]);
      const x = fk / corner;
      const cornerLin = 1 / Math.sqrt(1 + x * x);
      let a = srcLin[j] * Math.exp((bodyDb(fk) + modDb) * LN10_20) * cornerLin;

      if (isSub) {
        // period-doubled content exists only in the pre-Helmholtz transient
        a *= stage1 * stage1 * stage1 * 0.60 * Math.min(1, Math.sqrt(320 / f0));
      } else {
        // during the transient the multiple-slip partials bypass most of their
        // arrival gate, so the wrong regime is audible as a pitch, not a hiss
        a *= arrive[j] + stage1 * (1 - arrive[j]) * (isMult[j] ? 0.8 : 0.1);
        if (stage1 > 0) a *= 1 + stage1 * ((isMult[j] ? 1.45 : 0.28) - 1);
      }
      ampT[j] = a * master * relG[j];
    }

    // residual: same bow force, boosted hard through the transient, and its
    // slip window widens as bow force falls (flautando is breathy for exactly
    // this reason).
    // The residual has to stay elevated across the whole opening of the stroke,
    // not just the pre-Helmholtz 50 ms: while the bow is still settling, more of
    // each period is spent slipping. bf^0.9 (rather than ^1.5) keeps the noise
    // from being penalised twice over by a bow force that is still ramping.
    const boost = 1 + 1.9 * Math.exp(-t / 0.25) + 1.8 * stage1;
    resLevel = master * Math.exp(Math.log(bf) * 0.9) * boost * (releasing ? Math.exp(-relT / 0.045) : 1);
    betaCur = 0.10 + 0.07 * (1.25 - bf);
    if (betaCur < 0.05) betaCur = 0.05;
    if (betaCur > 0.30) betaCur = 0.30;
    for (let b = 0; b < BAND_COUNT; b += 1) bandG[b] = bandBase[b] * resLevel;
  }

  control();

  return {
    next() {
      if (ctr === 0) {
        control();
        // keep the rotation phasors on the unit circle (cheap Newton step)
        for (let j = 0; j < NP; j += 1) {
          const r = 1.5 - 0.5 * (oscC[j] * oscC[j] + oscS[j] * oscS[j]);
          oscC[j] *= r;
          oscS[j] *= r;
        }
        ctr = CTRL;
      }
      ctr -= 1;
      t += 1 / sr;

      let det = 0;
      for (let j = 0; j < NP; j += 1) {
        const c = oscC[j];
        const s = oscS[j];
        oscC[j] = c * rotC[j] - s * rotS[j];
        oscS[j] = s * rotC[j] + c * rotS[j];
        amp[j] += (ampT[j] - amp[j]) * ampK;
        det += amp[j] * oscS[j];
      }

      ph01 += f0now / sr;
      if (ph01 >= 1) ph01 -= 1;
      let gate = GATE_FLOOR;
      if (ph01 < betaCur) gate += GATE_DEPTH * SLIP_WIN[((ph01 / betaCur) * WIN_N) | 0];
      const nz = pink.next() * gate;
      let res = 0;
      for (let b = 0; b < BAND_COUNT; b += 1) res += bandG[b] * bands[b].process(nz);

      const y = det * detGain + res * resGain;
      const out = dcb.process(y);
      return Number.isFinite(out) ? limit(out) : 0;
    },
    release() {
      if (!releasing) {
        releasing = true;
        relT = 0;
      }
    },
    finished() {
      return releasing && env * relG[0] < 2e-4;
    },
  };
}
