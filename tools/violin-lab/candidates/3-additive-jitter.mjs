// 3-additive-jitter — additive resynthesis from a measured violin harmonic
// table, where every partial is an INDEPENDENT voice of its own.
//
// The four rejected attempts were all "one periodic oscillator -> one filter
// -> one gain". That topology mathematically pins adjacent-harmonic envelope
// correlation at ~1.0 and spectral irregularity at ~0.1 dB; the measured real
// violin sits at 0.54 and 2.5 dB. No amount of filter tuning can move either,
// so this candidate throws the oscillator away.
//
// Instead: N sinusoids, each with its own arrival time, its own two slow
// random-amplitude walks, its own few-cent frequency jitter and its own
// stiffness-detuned ratio, all read through a FIXED (never pitch-tracking)
// dense modal body — ~190 resonances at Cremer's 45 Hz mean spacing, Q 20-60,
// random signs — evaluated analytically at each partial's INSTANTANEOUS
// frequency. That last step is the engine of the whole patch: it converts the
// shared vibrato's FM into per-partial AM that differs in depth, phase and
// even rate from partial to partial, because each one sits on a different
// slope of a different resonance.

import { Biquad, PinkNoise } from "../dsp.mjs";

export const name = "3-additive-jitter";

export const notes = `
Additive synthesis with genuinely independent per-harmonic behaviour. Up to 48
sinusoids (adaptively capped below Nyquist, so nothing aliases); each has its
own scattered arrival time (30-320 ms, in no monotonic order), its own pair of
slow band-limited random-amplitude walks (0.4 Hz and 2.5 Hz), its own +/-2.5
cent independent frequency jitter and a stiffness-inharmonic ratio
k*sqrt(1+B k^2). Their levels are not filtered but LOOKED UP, per control
block, from a fixed 190-resonance modal body (45 Hz mean spacing, Q 20-60,
random-sign residues, shaped to the measured Iowa-MIS body envelope) evaluated
at each partial's instantaneous frequency, so the shared 5.5 Hz / +/-22 cent
vibrato turns into large, differently-phased, partial-specific amplitude
modulation instead of pure FM. Bow noise is cyclostationary — pink noise gated
to the slip phase of an irregular slip train that starts at a multiple of f0
(pre-Helmholtz multiple flyback) and settles to f0 — and is coloured by the
same fixed body. No oscillator is filtered anywhere; nothing tracks pitch
except the partials themselves.
`;

/* -------------------------------------------------------------------------
   Small local helpers (kept inside this file so no shared module is touched)
   ------------------------------------------------------------------------- */

/** Mulberry32 — same generator the harness uses, so everything stays seeded. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LN10_20 = Math.LN10 / 20;
const db2lin = (x) => Math.exp(x * LN10_20);

function smoothstep(a, b, x) {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
}

/* -------------------------------------------------------------------------
   The body. FIXED in absolute frequency — the single most identity-bearing
   property of a violin, and the one attempts 1-3 destroyed by making the
   filter track pitch. Built ONCE at module load, because it is one physical
   instrument: every note must be played on the same violin, so this must not
   be re-drawn from the per-voice rng.
   ------------------------------------------------------------------------- */

// Measured body+radiation envelope (Iowa MIS violin, harmonic level with the
// 1/n source law divided out, binned by ABSOLUTE frequency). Below 635 Hz the
// measurement carries no information (those bands are the fundamental's own,
// 0 dB by construction), so the signature-mode region is filled in from the
// literature: A0 ~275, CBR ~405, A1 ~480, B1- ~465, B1+ ~545.
const ENV_F = [
  80, 100, 140, 180, 220, 260, 300, 350, 400, 450, 500, 550, 600, 635, 713, 800, 898, 1008, 1131, 1270, 1425, 1600,
  1796, 2016, 2263, 2540, 2851, 3200, 3592, 4032, 4525, 5080, 5702, 6400, 7184, 8063, 9051, 10159, 12000, 15000,
];
// Above 4 kHz these are the MEASURED values, lightly smoothed: the corpus gives
// 4032 -4.9, 4525 -6.4, 5080 -15.1, 5702 -14.8, 6400 -21.7, 7184 -20.5,
// 8063 -26.7, 9051 -28.0. That is roughly -20 dB/octave from 4.5 to 9 kHz ON
// TOP of the source's own -6 dB/oct, and it is the reason a real D4's h13..h16
// sit at -34..-41 dB. An earlier revision of this file softened the cliff to
// -7/-9/-13 and measured 6 dB too bright across h11..h16 — a violin's top end
// is dark, and getting that wrong is a large part of why a bright additive bank
// reads as a string machine.
const ENV_D = [
  -26, -22, -16, -11, -6.5, -3, -1.5, -3, -2, -1.5, -2, -1, -5, -6.5, -12.5, -4, -6.5, -6, -7.5, -8.5, -7.5, -7,
  -6.5, 7, 4, -1, -2, -2.5, 0, -5, -7.5, -13, -15.5, -19, -21.5, -25, -27.5, -29, -34, -40,
];

function envSmoothDb(f) {
  if (f <= ENV_F[0]) return ENV_D[0];
  const last = ENV_F.length - 1;
  if (f >= ENV_F[last]) return ENV_D[last];
  let i = 0;
  while (i < last && ENV_F[i + 1] < f) i += 1;
  const t = (Math.log(f) - Math.log(ENV_F[i])) / (Math.log(ENV_F[i + 1]) - Math.log(ENV_F[i]));
  return ENV_D[i] + (ENV_D[i + 1] - ENV_D[i]) * t;
}

// The 1/6-octave measurement above is itself a smoothed view: the raw data
// jumps 10.8 dB between the 713 and 800 Hz bins. Real radiation efficiency
// wanders irregularly on a scale of a few semitones (Buen 2003 finds 30
// Cremonese violins' 1/3-octave LTAS spread over a 10 dB band), and that
// coarse wander is the part of the irregularity a vibrato sweep CANNOT average
// away — a +/-22 cent excursion smooths detail finer than about a semitone but
// leaves a 1/4-octave ripple intact. Four fixed log-frequency ripples, drawn
// once for this instrument.
// Amplitudes are deliberately modest. Measured on the reference recordings with
// this file's own probe, the harmonic series of a real note has a median
// irregularity of 2.6 dB and a median largest adjacent RISE of 8.8 dB. An
// earlier revision used four ripples of 0.8-1.7 dB and scored 3.5 dB / 14.6 dB
// — i.e. it overshot the target as badly as the rejected baseline (0.1 dB)
// undershot it. Too jagged is its own artefact: partials scattered over 15 dB
// steps stop reading as one string and start reading as a ring modulator, and
// individual partials get parked 12-19 dB down in a null they cannot vibrato
// out of (measured: A4's h2 at -19.4 dB where a real A4's is -5 to -7).
const RIPPLE = (() => {
  const rnd = mulberry32(0x1234abcd);
  const t = [];
  for (let j = 0; j < 3; j += 1) t.push({ nu: 2.1 + 3.2 * rnd(), amp: 0.52 + 0.66 * rnd(), phi: 2 * Math.PI * rnd() });
  return t;
})();

function envDb(f) {
  let rip = 0;
  if (f > 600) {
    const l = Math.log2(f);
    for (let j = 0; j < RIPPLE.length; j += 1) rip += RIPPLE[j].amp * Math.sin(2 * Math.PI * RIPPLE[j].nu * l + RIPPLE[j].phi);
    rip *= smoothstep(600, 950, f);
  }
  return envSmoothDb(f) + rip;
}

const F_LO = 55;
const F_HI = 16000;
const TABLE_N = 8192;
const LOG_LO = Math.log2(F_LO);
const PPO = (TABLE_N - 1) / (Math.log2(F_HI) - LOG_LO); // ~1.1 cents per point

/** Linear magnitude of the fixed body, sampled on a log-frequency grid. */
const BODY_LIN = buildBody();

function buildBody() {
  const rnd = mulberry32(0x5eed1a7e);
  const mf = [];
  const mq = [];
  const mg = [];

  // Signature modes, placed explicitly (Euphonics 5.3 / Gough 2005 survey).
  const SIG = [
    [275, 18, 4.5],
    [405, 26, 2.5],
    [465, 32, 4.5],
    [483, 26, 2.0],
    [545, 30, 5.0],
    [608, 26, 1.0],
    [668, 24, 0.0],
  ];
  for (let i = 0; i < SIG.length; i += 1) {
    const [f, q, extra] = SIG[i];
    mf.push(f);
    mq.push(q);
    // Signature modes keep a consistent sign so B1-/B1+ cannot cancel.
    mg.push(db2lin(envDb(f) + extra) * (i % 2 === 0 ? 1 : -1));
  }

  // Above the signature region a violin has, on Cremer's estimate (quoted by
  // Gough 2005), a MEAN SPACING of 45 Hz between individual body resonances.
  // That is ~190 modes up to 9 kHz — a dense comb, not four broad formants.
  let f = 700;
  while (f < 11000) {
    const q = 20 + 40 * rnd();
    const g = db2lin(envDb(f) + (rnd() * 18 - 9)) * (rnd() < 0.5 ? 1 : -1);
    mf.push(f);
    mq.push(q);
    mg.push(g);
    f += 45 * (0.7 + 0.6 * rnd());
  }

  // Accumulate the complex modal sum on the log grid. Each mode only touches
  // the band where it matters (+/- 1.3 octaves), which keeps the build cheap.
  const re = new Float64Array(TABLE_N);
  const im = new Float64Array(TABLE_N);
  for (let m = 0; m < mf.length; m += 1) {
    const wm = 2 * Math.PI * mf[m];
    const invQ = 1 / mq[m];
    const g = mg[m];
    const c = (Math.log2(mf[m]) - LOG_LO) * PPO;
    const lo = Math.max(0, Math.floor(c - 1.35 * PPO));
    const hi = Math.min(TABLE_N - 1, Math.ceil(c + 1.35 * PPO));
    for (let i = lo; i <= hi; i += 1) {
      const w = 2 * Math.PI * 2 ** (LOG_LO + i / PPO);
      const A = wm * wm - w * w;
      const B = w * wm * invQ;
      const den = A * A + B * B;
      if (den < 1e-9) continue;
      const s = g / den;
      re[i] += s * B * B;
      im[i] += s * A * B;
    }
  }

  const dB = new Float64Array(TABLE_N);
  for (let i = 0; i < TABLE_N; i += 1) dB[i] = 20 * Math.log10(Math.max(1e-9, Math.hypot(re[i], im[i])));

  // A dense random-sign modal sum has a bias: a mode's neighbours contribute
  // g/(2 Q dF/f) at offset dF, so with a FIXED 45 Hz spacing the number of
  // significant contributors grows with frequency and the composite drifts
  // roughly +4 dB/octave above the level the mode gains asked for. Measured
  // here as +7 dB at 2 kHz and +15 dB at 3.6 kHz, which both tilted the
  // spectrum and flattened the fine structure.
  //
  // So: split the two things this bank is for. The GROSS shape comes from the
  // measured envelope (which is what a real violin's 1/6-octave LTAS is), and
  // only the modal sum's deviation from its own 1/3-octave running mean is kept
  // as fine structure. Deep antiresonances are clamped — a real radiated
  // response has narrow but finite ones.
  const halfWin = Math.round(PPO / 3);
  const smooth = new Float64Array(TABLE_N);
  let acc = 0;
  for (let i = 0; i < Math.min(TABLE_N, halfWin + 1); i += 1) acc += dB[i];
  let n = Math.min(TABLE_N, halfWin + 1);
  for (let i = 0; i < TABLE_N; i += 1) {
    if (i > halfWin) {
      acc -= dB[i - halfWin - 1];
      n -= 1;
    }
    if (i + halfWin < TABLE_N) {
      acc += dB[i + halfWin];
      n += 1;
    }
    smooth[i] = acc / n;
  }
  // The log-magnitude of a random complex sum is skewed negative (deep nulls,
  // bounded peaks), so the raw deviation has a negative mean. Left in, it
  // darkens every note by whatever its harmonics happen to land on. Centre it,
  // then clamp: measured on the reference recordings, a real note's harmonic
  // series has a median irregularity of 1.2-3.3 dB, so unbounded nulls
  // over-shoot the target as badly as a smooth filter under-shoots it.
  let fmean = 0;
  for (let i = 0; i < TABLE_N; i += 1) fmean += dB[i] - smooth[i];
  fmean /= TABLE_N;

  // The limiter is a SOFT saturator, not a hard clamp, and that distinction is
  // measurable. Pooled over ten rendered pitches, a hard clamp reproduced the
  // median irregularity (2.1 dB against a real 2.6) but left the largest
  // adjacent RISE at 16.1 dB where a real note's is 8.8 — because a hard clamp
  // does nothing to a deviation until it hits the rail and then stacks a full
  // -6.5 dB null against a full +6.5 dB peak on the next harmonic. A tanh keeps
  // the small and medium deviations that make up the median while squashing the
  // rare extremes that make up the maximum, which is the shape of the real
  // distribution (median 2.6, p90 6.0, max 10.9).
  //
  // It is deliberately ASYMMETRIC, wide on top and narrow underneath.
  // On the reference recordings the big excursions are upward — a harmonic that
  // lands on a strong mode gains 8-17 dB (real D4: h7 sits +7.5 dB above its own
  // local trend) — while antiresonances are narrow enough that a vibrato sweep
  // never parks a partial in one. A symmetric clamp reproduced the irregularity
  // but darkened every note by whatever its harmonics happened to fall into,
  // measured here as centroidRatio 1.50 against a real 1.87-4.13.
  const out = new Float64Array(TABLE_N);
  for (let i = 0; i < TABLE_N; i += 1) {
    const fr = 2 ** (LOG_LO + i / PPO);
    // Mode overlap (bandwidth f/Q against a fixed 45 Hz spacing) grows with
    // frequency, so the more contributors a null has to cancel the shallower it
    // gets. Let the floor rise from -7.5 dB at 1 kHz to -4 dB at 6 kHz.
    const aNeg = 4.6 + 1.6 * smoothstep(1000, 6000, fr);
    const dev = dB[i] - smooth[i] - fmean;
    const fine = dev >= 0 ? 6.2 * Math.tanh(dev / 6.2) : -aNeg * Math.tanh(-dev / aNeg);
    out[i] = db2lin(envDb(fr) + fine);
  }
  return out;
}

/** Linear body magnitude at an arbitrary frequency (log-grid interpolation). */
function bodyAt(f) {
  const x = (Math.log2(f) - LOG_LO) * PPO;
  if (!(x > 0)) return BODY_LIN[0];
  if (x >= TABLE_N - 1) return BODY_LIN[TABLE_N - 1];
  const i = x | 0;
  const fr = x - i;
  return BODY_LIN[i] + (BODY_LIN[i + 1] - BODY_LIN[i]) * fr;
}

/* -------------------------------------------------------------------------
   Voice
   ------------------------------------------------------------------------- */

const MAXH = 48;
const CTRL = 32; // control-block length in samples (~1.5 kHz)
const STIFF_B = 1.5e-5; // string stiffness -> slight inharmonicity

// Fixed body colouration for the bow-noise path. Parallel bandpasses at the
// same absolute frequencies as the harmonic path's body — never pitch-scaled.
const NOISE_MODES = [
  [300, 6],
  [462, 9],
  [545, 9],
  [800, 7],
  [1150, 5],
  [1500, 5],
  [2016, 9],
  [2350, 9],
  [2851, 7],
  [3592, 7],
  [4400, 5],
  [5600, 4],
  [7200, 3],
];

export function makeVoice({ sampleRate, frequency, velocity, rng }) {
  const sr = sampleRate;
  const f0 = Math.max(110, Math.min(1400, frequency));
  const vel = Math.max(0.15, Math.min(1, velocity));

  // ONE draw from the shared rng (renderPhrase hands the same generator to
  // every voice, so a fixed draw count keeps a phrase bit-reproducible), then
  // every other random number in this note comes from a private stream.
  const r = mulberry32(Math.floor(rng() * 4294967296) ^ 0x9e3779b9);

  // --- how many partials fit under Nyquist (this is also the anti-aliasing) -
  const nPart = Math.max(2, Math.min(MAXH, Math.floor((0.45 * sr) / f0)));

  // --- per-partial state, all allocated once ------------------------------
  const ratio = new Float64Array(MAXH);
  const srcLin = new Float64Array(MAXH);
  const phase = new Float64Array(MAXH);
  const inc = new Float64Array(MAXH);
  const gain = new Float64Array(MAXH);
  const gInc = new Float64Array(MAXH);
  const tauArr = new Float64Array(MAXH); // arrival time constant
  const tauRel = new Float64Array(MAXH);
  const wFast = new Float64Array(MAXH);
  const wSlow = new Float64Array(MAXH);
  const wFreq = new Float64Array(MAXH);
  const dFast = new Float64Array(MAXH); // dB depth of the fast walk
  const dSlow = new Float64Array(MAXH);
  const dFreq = new Float64Array(MAXH); // cents depth of the freq jitter

  // Source spectrum: the Helmholtz bridge force is 1/n, softened above two
  // corners. The first (one-pole) is the rounding of the stick-slip corner by
  // the finite width of the bow's hair ribbon — it moves up with bow force, so
  // it is the one thing velocity is allowed to change about the timbre. The
  // second (steeper) stands in for the fact that no real bow produces an
  // ideal discontinuity: measured D4 notes fall to -34..-41 dB by h13..h16,
  // which 1/n times the body envelope alone does not reach.
  //
  // Both corners are properties of the EXCITATION, not of the body, so a small
  // dependence on pitch is legitimate here in a way that a pitch-tracking body
  // filter (which is what got attempts 1-3 rejected) is not: a shorter, thinner
  // string is rounded less by the same ribbon. The exponent is deliberately
  // small (0.15, i.e. a factor of 1.2 across three octaves) so the register
  // character comes from the FIXED body, not from this.
  //
  // CALIBRATION. Pooled over ten rendered pitches from D4 to B4 and compared
  // against the corpus mean, corners at 2150/3800 Hz put h7 4.8 dB, h11 9.1 dB
  // and h16 7.6 dB below the measured violin while h1..h6 matched to within
  // 1.9 dB — i.e. the corners were eating the bridge-hill region (2.0-2.4 kHz)
  // and the second hill (3.6 kHz), which is exactly the 25 dB hole the research
  // found in the rejected baseline, only 5-10 dB deep instead. Moving them to
  // 4400/7400 Hz recovers that band without letting upperVsLowerDb leave the
  // measured -8..-24 window.
  const fc = (4400 + 1500 * vel) * (f0 / 293.66) ** 0.15;
  const fc2 = (7400 + 1600 * vel) * (f0 / 293.66) ** 0.15;

  // Random-walk coefficients at control rate, scaled to unit rms output.
  const ctrlRate = sr / CTRL;
  const mk = (hz) => {
    const c = 1 - Math.exp((-2 * Math.PI * hz) / ctrlRate);
    const g = 1 / (0.5774 * Math.sqrt(c / (2 - c)));
    return { c, g, raw: 1 / g };
  };
  const kFast = mk(2.6);
  const kSlow = mk(0.45);
  const kFreqW = mk(1.1);
  const kPitch = mk(9.0);
  const kPress = mk(1.3);

  // Draw a FIXED number of randoms (MAXH sets) whatever nPart turns out to be.
  for (let k = 0; k < MAXH; k += 1) {
    const n = k + 1;
    const detuneCents = (r() * 2 - 1) * 1.0;
    ratio[k] = n * Math.sqrt(1 + STIFF_B * n * n) * 2 ** (detuneCents / 1200);
    const fk = f0 * ratio[k];
    srcLin[k] = (1 / ratio[k]) / Math.sqrt(1 + (fk / fc) ** 2) / Math.sqrt(1 + (fk / fc2) ** 4);
    phase[k] = r() * 2 * Math.PI;
    // Arrival times: log-uniform 28-320 ms, drawn independently so the order
    // in which partials appear is scrambled, as measured on real notes.
    const t6 = 0.024 * Math.exp(r() * Math.log(210 / 24));
    tauArr[k] = t6 / Math.LN2;
    tauRel[k] = 0.145 / (1 + 0.06 * k);
    // Upper partials swing far more than lower ones on a real instrument, and
    // the gradient is steep: measured per-harmonic p95-p5 ranges are 3.8, 5.1,
    // 6.9, 5.4, 5.1, 4.1, 6.7, 5.8 dB for h1..h8 but 5.4, 7.8, 10.8, 11.4,
    // 12.8, 15.7, 14.4, 18.7 dB for h9..h16 — roughly 2.5x more swing up top.
    // A flat-in-k depth (which an earlier revision used) measured 6.4 dB low
    // and 7.3 dB high, i.e. the low partials wobbled too much and the high ones
    // too little: a violin's fundamental is comparatively steady and its top
    // end is wild, and getting that backwards makes the whole tone seem to
    // breathe as a block. So the depth grows strongly with k.
    dFast[k] = 0.26 + 0.075 * k + 0.16 * k * r();
    dSlow[k] = 0.3 + 0.09 * k + 0.2 * k * r();
    dFreq[k] = 0.55 + 0.05 * k + 0.9 * r();
    // A random walk's steady-state rms in raw units is 1/g, so seed it there —
    // seeding at +/-1 would start the note tens of dB out.
    wFast[k] = (r() * 2 - 1) * kFast.raw;
    wSlow[k] = (r() * 2 - 1) * kSlow.raw;
    wFreq[k] = (r() * 2 - 1) * kFreqW.raw;
  }

  // --- shared (correlated) modulators ------------------------------------
  let vibPhase = r() * 2 * Math.PI;
  let vibRate = 5.2 + 0.7 * r();
  let vibSkewPhase = r() * 2 * Math.PI;
  const vibDepth = 20 + 6 * r(); // cents, peak (40-52 cents peak-to-peak)
  let vibRateWalk = 0;
  let pitchWalk = 0;
  let pressWalk = 0;

  // --- bow noise ---------------------------------------------------------
  const pink = new PinkNoise(r);
  const nBands = NOISE_MODES.length;
  const bands = [];
  const bandG = new Float64Array(nBands);
  for (let i = 0; i < nBands; i += 1) {
    bands.push(new Biquad(sr).bandpass(NOISE_MODES[i][0], NOISE_MODES[i][1]));
    bandG[i] = db2lin(envDb(NOISE_MODES[i][0]));
  }
  // A parallel bandpass bank fed with pink noise has a chain gain of ~0.015,
  // not 1 — gain-staging the noise as a fraction of OUT_RMS without measuring
  // that put the bow noise 50 dB too low (noiseRatio was identical with the
  // noise deleted). So measure the chain's own rms once, here, and normalise.
  // 2048 samples, fixed count, seeded generator: still bit-reproducible.
  let nzPrev = 0;
  let chainRms = 1;
  {
    let acc = 0;
    for (let i = 0; i < 2048; i += 1) {
      const z = pink.next();
      const zt = z - 0.82 * nzPrev;
      nzPrev = z;
      let v = 0;
      for (let j = 0; j < nBands; j += 1) v += bands[j].process(zt) * bandG[j];
      if (i >= 256) acc += v * v;
    }
    chainRms = Math.sqrt(acc / 1792) || 1;
  }
  let slipPhase = r();
  let slipJit = 1;
  let slipAlt = 1;

  // Pre-Helmholtz window: ~10 fundamental periods (Guettler & Askenfelt's
  // acceptance band), clamped to the 18-58 ms the literature calls playable.
  const preT = Math.max(0.018, Math.min(0.058, 10 / f0));
  // Guettler & Askenfelt describe two distinct failure-to-lock regimes before
  // Helmholtz motion establishes: MULTIPLE FLYBACK (the period is divided into
  // 2+ parts, so the slip train runs at a multiple of f0) and PROLONGED PERIODS
  // (slips are late, so the train runs BELOW f0, putting energy at subharmonic
  // frequencies). Both are real and they sound different, so which one this
  // note starts in is drawn per note rather than fixed. A subharmonic start is
  // the part no amount of hiss can imitate — it is inharmonic, not just noisy.
  const flyback = r() < 0.55;
  const slipMult0 = flyback ? 2.2 + 2.3 * r() : 0.42 + 0.26 * r();

  // --- gain staging ------------------------------------------------------
  // Estimate the steady RMS of the partial sum so every note lands in range
  // whatever the body does to its fundamental.
  let sumSq = 0;
  for (let k = 0; k < nPart; k += 1) {
    const a = srcLin[k] * bodyAt(f0 * ratio[k]);
    sumSq += a * a;
  }
  const rmsEst = Math.sqrt(0.5 * sumSq);
  // Velocity has to do something. Normalising every note to one rms (which an
  // earlier revision did) made the instrument's dynamics dead: measured peak
  // was 0.432 at velocity 0.05 and 0.440 at velocity 1.0. A bow that is pressed
  // harder and drawn faster is both louder and brighter (the stick-slip corner
  // is rounded less), so velocity moves level here and the two source corners
  // above.
  const OUT_RMS = 0.072 + 0.088 * vel;
  const outGain = OUT_RMS / Math.max(1e-6, rmsEst);
  // Bow noise as a target rms RATIO of the harmonic sum. 0.285 is the rms of
  // the slip gate itself (0.16 floor plus a raised-cosine burst over a 0.14
  // duty), divided out so NOISE_RMS_RATIO means what it says. It FALLS with
  // velocity: light bow force lengthens the slip phase and is what makes
  // flautando breathy, so quiet notes are proportionally noisier. Real notes
  // measure 0.002-0.046 on the harness's noiseRatio (recomputed here on the
  // Iowa recordings after the measure was fixed — the research's 0.34-0.53 was
  // the old broken version's leakage floor and must not be targeted).
  const NOISE_RMS_RATIO = 0.105 - 0.042 * vel;
  const noiseGain = (NOISE_RMS_RATIO * OUT_RMS) / (chainRms * 0.285);

  const dt = 1 / sr;
  let t = 0;
  let ctrl = 0;
  let swellNow = 0;
  let releasing = false;
  let relT = 0;
  let relEnvBroad = 1;

  return {
    next() {

      /* ---- control-rate block: everything slow lives here ---- */
      if (ctrl === 0) {
        const cdt = CTRL / sr;

        // Vibrato. Rate wanders; the shape is deliberately not a pure sine
        // (Gough measures the resulting fluctuations as time-asymmetric).
        vibRateWalk += kFreqW.c * (r() * 2 - 1 - vibRateWalk);
        const rate = vibRate * (1 + 0.10 * vibRateWalk * kFreqW.g * 0.35);
        vibPhase += 2 * Math.PI * rate * cdt;
        if (vibPhase > 2 * Math.PI) vibPhase -= 2 * Math.PI;
        vibSkewPhase += 2 * Math.PI * 0.37 * cdt;
        const vibFade = smoothstep(0.10, 0.42, t);
        const vshape = Math.sin(vibPhase) + 0.24 * Math.sin(2 * vibPhase + vibSkewPhase);
        const vibCents = vibDepth * vibFade * vshape * 0.87;

        // Pitch jitter floor: a violin is never dead in tune, even with the
        // left hand still (measured 3-7 cents rms on non-vibrato notes).
        pitchWalk += kPitch.c * (r() * 2 - 1 - pitchWalk);
        const jitterCents = pitchWalk * kPitch.g * 4.2;

        const fNow = f0 * 2 ** ((vibCents + jitterCents) / 1200);

        // Bow-pressure walk: shared, small, and NOT a sinusoid.
        pressWalk += kPress.c * (r() * 2 - 1 - pressWalk);
        const press = 1 + 0.075 * pressWalk * kPress.g;

        // Broadband swell. Bowed notes keep growing well past the transient;
        // there is no peak-then-decay-to-a-fixed-fraction anywhere here.
        const swell = (1 - Math.exp(-t / 0.06)) * (0.96 + 0.04 * (1 - Math.exp(-t / 0.9)));
        swellNow = swell;
        // Helmholtz lock. Until the stick-slip cycle is periodic there is no
        // harmonic series to speak of, so the partial bank is held right down
        // through the pre-Helmholtz window and released over it. This is a
        // change of REGIME, not a gain ramp: for the first ~10 periods the
        // output is the slip noise and its subharmonics, and the harmonics
        // arrive afterwards, individually.
        const lock = 0.03 + 0.97 * smoothstep(0.12 * preT, 1.15 * preT, t);

        if (releasing) relEnvBroad = Math.exp(-relT / 0.13);

        for (let k = 0; k < nPart; k += 1) {
          wFast[k] += kFast.c * (r() * 2 - 1 - wFast[k]);
          wSlow[k] += kSlow.c * (r() * 2 - 1 - wSlow[k]);
          wFreq[k] += kFreqW.c * (r() * 2 - 1 - wFreq[k]);

          const jc = wFreq[k] * kFreqW.g * dFreq[k];
          const fk = fNow * ratio[k] * 2 ** (jc / 1200);
          inc[k] = (2 * Math.PI * fk) / sr;

          let drift = wFast[k] * kFast.g * dFast[k] + wSlow[k] * kSlow.g * dSlow[k];
          if (drift > 14) drift = 14;
          else if (drift < -14) drift = -14;
          const arrive = 1 - Math.exp(-t / tauArr[k]);
          const rel = releasing ? Math.exp(-relT / tauRel[k]) : 1;

          const target = srcLin[k] * bodyAt(fk) * db2lin(drift) * arrive * lock * swell * press * rel * outGain;
          gInc[k] = (target - gain[k]) / CTRL;
        }
      }

      ctrl += 1;
      if (ctrl >= CTRL) ctrl = 0;

      /* ---- audio rate ---- */
      let y = 0;
      for (let k = 0; k < nPart; k += 1) {
        phase[k] += inc[k];
        if (phase[k] > 2 * Math.PI) phase[k] -= 2 * Math.PI;
        gain[k] += gInc[k];
        y += gain[k] * Math.sin(phase[k]);
      }

      /* ---- bow noise: cyclostationary, gated to the slip phase ---- */
      // The slip train starts at a multiple of f0 with heavy period jitter
      // (multiple flyback / prolonged periods) and settles onto f0.
      const preMix = t < preT ? 1 - smoothstep(0, preT, t) : 0;
      const mult = 1 + (slipMult0 - 1) * preMix;
      const jitAmt = 0.02 + 0.38 * preMix;
      slipPhase += f0 * mult * slipJit * dt;
      if (slipPhase >= 1) {
        slipPhase -= 1;
        slipJit = 1 + (r() * 2 - 1) * jitAmt;
        slipAlt = 1 + (r() * 2 - 1) * 0.55 * preMix;
      }
      const duty = 0.14 + 0.16 * preMix;
      const gate =
        slipPhase < duty ? 0.16 + 0.84 * (0.5 - 0.5 * Math.cos((2 * Math.PI * slipPhase) / duty)) : 0.16;

      const nz = pink.next();
      const nzT = nz - 0.82 * nzPrev; // tilt: bow noise rises against the harmonics
      nzPrev = nz;
      let nb = 0;
      for (let i = 0; i < nBands; i += 1) nb += bands[i].process(nzT) * bandG[i];

      // Two decay times, because the real thing has two: the slipping-noise
      // burst of the pre-Helmholtz transient (tens of ms) and the much longer
      // settling of the non-harmonic fraction, measured on the Iowa notes as
      // ~1.13x the steady value in the first 25 ms window and still elevated at
      // 50-75 ms. Measured on the reference recordings with the harness's own
      // analyse(), a real note's onsetNoiseRatio is 1.8x to 14x its steady
      // noiseRatio; an earlier revision of this file scored 0.97x, i.e. its
      // onset was spectrally identical to its sustain, which is a synth tell.
      const onsetBoost = 1 + 8 * Math.exp(-t / 0.032) + 2.8 * Math.exp(-t / 0.15);
      // Bow noise rides a share of the broadband swell, but starts near full
      // level: the bow is already scraping before the string is speaking.
      const nEnv = releasing ? Math.exp(-relT / 0.05) : Math.min(1, t / 0.004) * (0.72 + 0.28 * swellNow);
      y += nb * gate * slipAlt * onsetBoost * nEnv * noiseGain;

      t += dt;
      if (releasing) relT += dt;
      return y;
    },

    release() {
      if (!releasing) {
        releasing = true;
        relT = 0;
      }
    },

    finished() {
      return releasing && relEnvBroad < 3e-3;
    },
  };
}
