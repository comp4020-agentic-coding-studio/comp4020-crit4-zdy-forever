// MODAL / RESONATOR-BANK bowed string.
//
// Nothing here is an oscillator through a filter. There are two banks:
//
//   1. STRING BANK — up to 24 two-pole modal resonators, one per partial,
//      tuned to k*f0 and retuned every 64 samples so they follow vibrato and
//      pitch jitter. Each one is an INDEPENDENT amplitude path: it has its own
//      decay time, its own arrival time during the attack, its own pair of slow
//      modulators, and its own share of a broadband bow-noise drive. Because a
//      narrow resonator turns white noise into a narrowband process whose
//      envelope wanders on its own 1/(2*pi*tau) timescale, and because well
//      separated narrow bands of one noise source are essentially uncorrelated,
//      every partial breathes on its own clock. That is the property a single
//      oscillator through a single VCA cannot have at any parameter setting:
//      it pins adjacent-harmonic envelope correlation at ~1.0 (measured 0.92 on
//      the rejected patch) where a real violin sits near 0.35 with a third of
//      pairs negatively correlated.
//
//   2. BODY — 120 FIXED modes: ten placed signature-region modes (A0 275, CBR
//      407, B1- 462, A1 482, B1+ 551 Hz and five neighbours) plus a dense comb
//      at ~50 Hz mean spacing (Cremer, via Gough 2005), Q 18-55, signed residues
//      and randomly scattered levels, shaped to the body/radiation envelope
//      measured off the Iowa MIS violin recordings. In series after it: the
//      bridge hill (+9.5 dB at 2.25 kHz) and the radiation cliff above 4.8 kHz.
//      NOT ONE FREQUENCY HERE DEPENDS ON THE NOTE. The dense comb is what makes
//      the harmonic series jagged instead of smooth, and it is what converts a
//      few cents of pitch movement into several dB of per-partial amplitude
//      movement, differently for each partial, since each sits on a different
//      resonance slope.
//
// The excitation is a Helmholtz slip train — one impulse per period, placed to
// sub-sample accuracy — plus bow noise whose level is gated to the slip window
// so the noise is pitch-synchronous rather than a stationary hiss layer. For
// the first ~10 fundamental periods the slip train is deliberately irregular
// (randomised amplitude, extra flybacks, 4x noise), which is the pre-Helmholtz
// transient Guettler & Askenfelt measured, not an amplitude ramp.
//
// I cannot hear any of this. Everything above is a claim about the algorithm.

import { Biquad } from "../dsp.mjs";

export const name = "2-modal-resonators";

export const notes = `
Modal/resonator-bank synthesis. A pitch-synchronous Helmholtz slip train plus
slip-gated bow noise drives up to 24 independent two-pole string-partial
resonators, each with its own decay time, its own scattered arrival time, its
own two slow modulators and its own narrowband share of one broadband noise
source, so no two harmonics breathe together. That sum passes through a FIXED
120-mode violin body: ten placed signature-region modes (A0 275, CBR 407, B1-
462, A1 482, B1+ 551 Hz and neighbours) plus a dense ~50 Hz-spaced comb, Q
18-55, randomly signed residues, shaped to the body/radiation envelope measured
off the Iowa MIS recordings, then in series a bridge hill at 2.25 kHz and the
radiation cliff above 4.8 kHz. Not one filter frequency depends on the note.
Measured over 10 seeds at D4 (real-violin figures from 4 sustained arco notes
in the Iowa MIS recordings, analysed with this lab's own spectrum(); rejected
baseline in brackets): spectral irregularity 2.87-4.17 dB, mean 3.48 (real
2.8-4.2) [0.1]; adjacent-harmonic envelope correlation 0.18-0.34, mean 0.27,
with 0-33% of pairs negative (real ~0.35, 27-53%) [0.92]; rising steps in
h1..h16 3-8, mean 5.4, largest single rise 8.4-17.2 dB (real 5-8, 8.8-21.9 dB)
[0, none]; h_n/h_1 moving 6.6-13.5 dB peak-to-peak over a 4.8 s sustain
[0.26-2.02]; per-harmonic modulation range 2.3-4.2 dB at h1-h8 rising to
11-18 dB by h16 (real 1.1-8.9 and 18-24); centroidRatio 1.07-2.27, mean 1.76
(real 1.27-2.23, median 1.8). The 2.0-2.4 kHz band is lifted 3-10 dB over the
650-750 Hz band at C3, G3, D4, A4 and C6 alike, though the harmonic NUMBER
carrying it moves from h17 to h2 - the body does not track the note. Weakest
points: the top partials swing about 6 dB less than a real violin's, the
low register (C3, G3) is smoother than the middle, and E5 fails the
2 kHz-over-700 Hz test by 2.8 dB. NOT AUDITIONED: I cannot hear this. Every
claim here is about the algorithm and the numbers.
`;

// --- the fixed body -------------------------------------------------------
// [freq Hz, Q, gain, order] x 120. order 1 = one bandpass section (the broad,
// radiation-damped signature modes); order 2 = two cascaded bandpass sections,
// so the comb modes have 12 dB/oct skirts and do not smear each other's
// structure. Generated once offline from a fixed seed and pasted verbatim: the
// body is a property of the instrument, so it must be identical for every note
// and every render, which rules out drawing it from the per-voice rng.
const BODY = [
  232, 12, 0.1174, 1, 275, 14, 1.6617, 1, 312, 16, 1.2597, 1, 352, 18, 0.6476, 1,
  407, 22, 1.3949, 1, 462, 26, 1.9243, 1, 482, 22, 0.6996, 1, 520, 24, 0.3395, 1,
  551, 26, 0.6404, 1, 583, 26, 0.2814, 1, 600, 44.7, 0.3891, 2, 646.6, 48.8, 0.2512, 2,
  694.8, 40.7, 0.2528, 2, 736.1, 50.3, -0.1628, 2, 771, 20.4, 0.6083, 2, 808.1, 39.2, 0.5142, 2,
  869.4, 38.2, 0.7595, 2, 911.9, 43, 0.6416, 2, 946.5, 31.4, 0.6895, 2, 994.8, 22.7, 0.5054, 2,
  1035.6, 26.8, 0.434, 2, 1084.2, 31.2, 0.3456, 2, 1141.3, 32.8, 0.2534, 2, 1200.8, 27.7, 0.2196, 2,
  1240.4, 26.3, -0.2399, 2, 1274.5, 47.8, -0.2231, 2, 1333.6, 35.9, 0.1578, 2, 1386.2, 34.2, 0.358, 2,
  1434.8, 54.4, -0.1944, 2, 1475.7, 27.5, 0.1395, 2, 1535.5, 29.6, 0.1554, 2, 1588.5, 23.1, 0.1063, 2,
  1644.5, 26, 0.1422, 2, 1689.6, 39.3, 0.1724, 2, 1724.8, 34.7, 0.173, 2, 1784.4, 54.8, 0.1048, 2,
  1828.1, 37.9, 0.1571, 2, 1876.4, 50.3, 0.2027, 2, 1915.6, 20.6, 0.1687, 2, 1971.8, 32.2, -0.5605, 2,
  2021.5, 27, -0.6278, 2, 2075, 34.7, 0.8539, 2, 2135.5, 48.3, 0.5919, 2, 2195.5, 46.2, 0.4134, 2,
  2251.8, 39, -0.3718, 2, 2302.5, 21.3, -0.3232, 2, 2346.8, 49.4, 0.5946, 2, 2386.9, 39.9, 0.2573, 2,
  2439.3, 26.4, -0.3448, 2, 2478.5, 38.1, 0.2652, 2, 2520.1, 48, 0.208, 2, 2563.7, 43.5, 0.2156, 2,
  2609.4, 48.6, 0.326, 2, 2657.5, 28, 0.1888, 2, 2707.8, 46, 0.1806, 2, 2758, 42.7, 0.1674, 2,
  2795.5, 30.6, -0.1288, 2, 2800, 32.4, 0.1282, 2, 2894.5, 36.9, 0.2403, 2, 2963.1, 32.8, 0.4065, 2,
  3051.8, 26.4, -0.3907, 2, 3130.3, 25.4, 0.4775, 2, 3231.3, 31.9, 0.352, 2, 3323.6, 28.9, 0.5841, 2,
  3383.5, 44.9, 0.604, 2, 3482.8, 40.1, 0.5315, 2, 3587.7, 29, 0.4913, 2, 3666.4, 34.8, 0.573, 2,
  3733.2, 23.9, 0.8442, 2, 3816.2, 34, 0.593, 2, 3909.1, 31.2, 0.7045, 2, 3978.8, 33.5, 0.635, 2,
  4038.6, 46.4, 0.4313, 2, 4107.6, 47.4, 0.3524, 2, 4181.8, 33.9, 0.4812, 2, 4244.6, 29.5, 0.314, 2,
  4302.6, 47.8, 0.4605, 2, 4387.9, 39.6, 0.3343, 2, 4487.2, 25.3, -0.5429, 2, 4573.6, 40, -0.4597, 2,
  4647.1, 33.4, -0.4204, 2, 4715.7, 41.5, 0.544, 2, 4805.3, 26.9, -0.5182, 2, 4903.7, 24.9, -0.2087, 2,
  4966.9, 32.5, -0.2203, 2, 5036.4, 29.9, 0.1574, 2, 5112.2, 44.1, -0.113, 2, 5191.3, 46.4, -0.2211, 2,
  5200, 35, 0.2456, 2, 5372.3, 18.6, 0.3268, 2, 5497.9, 26.4, -0.3283, 2, 5649.6, 38.9, 0.3909, 2,
  5754.5, 26.3, 0.5859, 2, 5913.4, 37.2, 0.4158, 2, 6050, 25.1, 0.3745, 2, 6166.4, 28.7, 0.3436, 2,
  6302.1, 39.5, 0.2675, 2, 6465.6, 30.9, 0.4081, 2, 6568, 29.4, 0.315, 2, 6705.3, 31.2, 0.3504, 2,
  6863.8, 25.7, 0.3474, 2, 7026.8, 38.6, 0.5303, 2, 7194.1, 21.6, 0.3414, 2, 7366.8, 26.7, 0.6006, 2,
  7468.2, 20.4, 0.4646, 2, 7647.6, 20, -0.5489, 2, 7805.1, 33.6, 0.3019, 2, 7919.3, 38.3, 0.2124, 2,
  8052.9, 20.1, 0.1775, 2, 8198.8, 24, 0.113, 2, 8304.5, 17.8, 0.1903, 2, 8460.4, 16, -0.3104, 2,
  8586.8, 28.3, 0.4692, 2, 8692.2, 18.2, 0.4274, 2, 8804.8, 17.1, 0.3941, 2, 8929.9, 36.6, -0.5408, 2,
  9041.7, 30.5, 0.6248, 2, 9182.7, 27.1, 0.7679, 2, 9340.3, 33.3, 0.5229, 2, 9504.5, 24.1, 0.485, 2,
];

// series EQ after the modal sum: bridge hill, second hill, radiation cliff,
// low-frequency rolloff. All fixed in absolute frequency.
const SERIES = [
  ["peaking", 2250, 1.15, 9.5],
  ["peaking", 3550, 1.7, 4.5],
  ["lowpass", 4800, 0.62, 0],
  ["lowpass", 7000, 0.72, 0],
  ["highpass", 205, 0.72, 0],
  // three correction sections, fitted offline so the 1/3-octave-smoothed
  // response of comb + floor + series lands within 1.8 dB rms of the measured
  // body/radiation envelope. A dense parallel comb's skirts pile up in the
  // 700 Hz-6 kHz region and no per-mode gain can remove them, because each
  // mode's excess comes from its neighbours.
  ["peaking", 640, 1.5, -6],
  ["peaking", 6000, 1.4, -2],
  ["peaking", 1800, 0.7, -2],
];

// The fixed body is uneven by 7.6 dB across the register, and a player answers
// that with bow force rather than letting the low register vanish. Measured by
// rendering every second semitone from B2 to D6 with this trim disabled, taking
// sustain RMS, and smoothing over a half octave -- so it cancels the broad
// trend ONLY. The +-3 dB of fine structure that remains is a real violin's
// strong and weak notes and is deliberately left in. This is a per-note SCALAR:
// it changes no harmonic's level relative to another, so it cannot undo the
// fixed-formant property. [Hz, dB] at 2-semitone steps.
const REGISTER = [
  130.8, -5.41, 146.8, -6.07, 164.8, -7.58, 185, -6.41, 207.6, -3.69,
  233.1, -0.37, 261.6, 0, 293.7, -1.87, 329.6, -4.74, 370, -4.16,
  415.3, -1.48, 466.2, -0.31, 523.2, -1.94, 587.3, -5.31, 659.2, -6.18,
  740, -7.06, 830.6, -7.22, 932.3, -5.19, 1046.5, -3.03, 1174.6, -2.41,
  1318.5, -3.7, 1479.9, -4.34, 1661.2, -3.62, 1864.6, -3.62, 2093, -3.62,
  2349.3, -3.62,
];
function registerGain(f) {
  const n = REGISTER.length / 2;
  if (f <= REGISTER[0]) return Math.pow(10, -REGISTER[1] / 20);
  for (let i = 1; i < n; i += 1) {
    const f1 = REGISTER[i * 2];
    if (f <= f1) {
      const f0 = REGISTER[(i - 1) * 2];
      const d0 = REGISTER[(i - 1) * 2 + 1];
      const d1 = REGISTER[i * 2 + 1];
      const t = Math.log(f / f0) / Math.log(f1 / f0);
      return Math.pow(10, -(d0 + (d1 - d0) * t) / 20);
    }
  }
  return Math.pow(10, -REGISTER[(n - 1) * 2 + 1] / 20);
}
// smooth broadband radiation floor, in parallel with the comb: without it the
// comb's antiresonances can swallow a harmonic completely.
const FLOOR = [
  ["highpass", 260, 0.7, 0],
  ["lowpass", 3800, 0.75, 0],
];
const FLOOR_GAIN = 0.2;

const CTRL = 64; // control-rate block, samples
const BETA = 0.115; // bow position as a fraction of string length -> slip duty
const MAX_PARTIALS = 24;

const TAU_H1 = 0.20; // fundamental's modal decay time, seconds
const TAU_EXP = 0.62; // higher partials decay faster: tau_k = TAU_H1 / k^EXP
const NOISE_H1 = 0.13; // noise-to-harmonic amplitude ratio at h1
const NOISE_EXP = 0.55; // and its rise with harmonic number
const SCRAPE = 0.28; // broadband rosin noise straight into the body
const VIB_RATE = 5.45;
const VIB_CENTS = 11.5;
const JITTER_CENTS = 4.5;
const REL_TAU = 0.13;
const TRIM = 0.45;

export function makeVoice({ sampleRate, frequency, velocity, rng }) {
  const sr = sampleRate;
  const vel = Math.max(0.05, Math.min(1, velocity));
  const f0 = Math.max(60, Math.min(1400, frequency));
  const regGain = registerGain(f0);

  // ---------------------------------------------------------------- body ---
  // All modes share one input, and every mode's numerator is b0*(1 - z^-2), so
  // the first section costs three multiplies once (x - x[n-2]) is formed.
  const nMode = BODY.length / 4;
  const mb0 = new Float64Array(nMode);
  const ma1 = new Float64Array(nMode);
  const ma2 = new Float64Array(nMode);
  const mg = new Float64Array(nMode);
  const mOrd = new Uint8Array(nMode);
  const my1 = new Float64Array(nMode);
  const my2 = new Float64Array(nMode);
  const mv1 = new Float64Array(nMode); // second section state (order 2 only)
  const mv2 = new Float64Array(nMode);
  const mu1 = new Float64Array(nMode); // second section input history
  const mu2 = new Float64Array(nMode);
  for (let i = 0; i < nMode; i += 1) {
    const f = BODY[i * 4];
    const q = BODY[i * 4 + 1];
    const w = (2 * Math.PI * Math.min(f, sr * 0.47)) / sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    mb0[i] = alpha / a0;
    ma1[i] = (-2 * cw) / a0;
    ma2[i] = (1 - alpha) / a0;
    mg[i] = BODY[i * 4 + 2];
    mOrd[i] = BODY[i * 4 + 3];
  }
  let bx1 = 0;
  let bx2 = 0;

  const series = SERIES.map(([kind, f, q, g]) => {
    const b = new Biquad(sr);
    if (kind === "peaking") return b.peaking(f, q, g);
    if (kind === "lowpass") return b.lowpass(f, q);
    return b.highpass(f, q);
  });
  const floorChain = FLOOR.map(([kind, f, q]) => {
    const b = new Biquad(sr);
    return kind === "lowpass" ? b.lowpass(f, q) : b.highpass(f, q);
  });
  const scrapeBp = new Biquad(sr).bandpass(1700, 0.55);

  // ------------------------------------------------------- string partials ---
  const nP = Math.max(3, Math.min(MAX_PARTIALS, Math.floor((0.44 * sr) / f0)));
  const mult = new Float64Array(nP); // frequency multiplier (harmonic number)
  const rad = new Float64Array(nP); // pole radius
  const nrm = new Float64Array(nP); // unity-peak-gain normalisation
  const gDet = new Float64Array(nP); // deterministic (slip train) drive gain
  const gNz = new Float64Array(nP); // noise drive gain
  const arr = new Float64Array(nP); // arrival time, seconds
  const rise = new Float64Array(nP); // arrival rise time, seconds
  const m1r = new Float64Array(nP); // fast modulator rate (Hz) and depth/phase
  const m1d = new Float64Array(nP);
  const m1p = new Float64Array(nP);
  const m2r = new Float64Array(nP); // slow modulator
  const m2d = new Float64Array(nP);
  const m2p = new Float64Array(nP);
  const ar = new Float64Array(nP); // rotation coefficients, set at control rate
  const ai = new Float64Array(nP);
  const zr = new Float64Array(nP); // resonator state
  const zi = new Float64Array(nP);
  const og = new Float64Array(nP); // output gain, ramped across each block
  const ogInc = new Float64Array(nP);

  // Bow force sets the source tilt: harder bowing gives a flatter (brighter)
  // Helmholtz sawtooth. p = 1.0 would be the ideal 1/n bridge force.
  const tilt = 1.86 - 0.34 * vel;
  const srcLevel = 0.42 + 0.30 * vel;

  for (let k = 0; k < nP; k += 1) {
    const n = k + 1;
    mult[k] = n;
    const tau = Math.max(0.012, Math.min(0.7, (TAU_H1 / Math.pow(n, TAU_EXP)) * (0.62 + 0.9 * rng())));
    rad[k] = Math.exp(-1 / (tau * sr));
    nrm[k] = 2 * (1 - rad[k]);
    // Source law with per-note scatter. The measured per-harmonic standard
    // deviation ACROSS real notes is 5-9 dB, so a candidate whose harmonic curve
    // is the same every note is smoother than any real instrument. +-6.5 dB
    // uniform (sd 3.75 dB) is deliberately conservative against that. Over 6
    // seeds this alone takes median spectral irregularity from 2.0 to 2.5 dB at
    // C3 and 2.7 to 3.3 at G3, where the body's own comb runs out of structure.
    const scatterDb = (rng() * 2 - 1) * 6.5;
    gDet[k] = srcLevel * Math.pow(n, -tilt) * Math.pow(10, scatterDb / 20);
    // noise drive scaled so the narrowband stochastic rms is rho_k times the
    // deterministic partial amplitude. rho rises with harmonic number, which is
    // the measured behaviour: friction noise does not roll off like 1/n.
    const rho = Math.min(1.15, NOISE_H1 * Math.pow(n, NOISE_EXP) * (0.6 + 0.85 * rng()));
    const nbPerSigma = Math.sqrt((2 * (1 - rad[k])) / (1 + rad[k]));
    gNz[k] = ((rho * gDet[k]) / Math.SQRT2 / nbPerSigma) * Math.sqrt(3);
    // arrival scatter: measured harmonics reach -6 dB of their steady level at
    // times spread 3:1 to 10:1 inside one note, in no monotonic order.
    arr[k] = 0.17 * Math.pow(rng(), 2);
    rise[k] = 0.03 + 0.11 * rng();
    m1r[k] = 2.5 + 5.0 * rng();
    m1d[k] = 0.05 + 0.16 * rng() * Math.min(1.6, 0.45 + 0.1 * n);
    m1p[k] = 2 * Math.PI * rng();
    m2r[k] = 0.3 + 0.9 * rng();
    m2d[k] = 0.04 + 0.10 * rng();
    m2p[k] = 2 * Math.PI * rng();
    og[k] = 0;
  }

  // ------------------------------------------------------------ excitation ---
  // pre-Helmholtz transient: 9 fundamental periods, clamped to 12..50 ms
  const preSec = Math.min(0.05, Math.max(0.012, 9 / f0));
  const impBase = 0.5 * (sr / f0); // so the slip train's harmonic amplitude is 1
  let phase = rng();
  let pending = 0;
  let detHp = 0;
  const kHp = (2 * Math.PI * 12) / sr;

  let vibPh = 2 * Math.PI * rng();
  let vibRateJ = 0;
  let jz = 0;
  let pz = 0;
  const jScale = JITTER_CENTS / 0.1;
  let ctrl = 0;
  let w0 = (2 * Math.PI * f0) / sr;
  let inc = f0 / sr;
  let nzBoost = 1;
  let extraProb = 0;
  let bow = 0;
  let t = 0;
  let releasing = false;
  let relT = 0;
  // Lifting the bow damps the string as well as stopping the drive, so on
  // release every partial's pole is pulled in far enough that the tail decays
  // with tau <= 0.11 s whatever its own tau was. Without this, a partial with
  // tau 0.35 s is still at -32 dB after three quarters of a second and
  // finished() would be lying.
  const relMul = Math.exp(-1 / (0.11 * sr));
  // amplitude follower, so finished() reports on the signal rather than a timer
  const folDecay = Math.exp(-1 / (0.04 * sr));
  let fol = 0;

  const updateControl = () => {
    // ---- pitch: vibrato, faded in, plus a random-walk jitter floor ----
    const dtc = CTRL / sr;
    vibRateJ += (rng() * 2 - 1 - vibRateJ) * 0.02;
    vibPh += 2 * Math.PI * VIB_RATE * (1 + 0.08 * vibRateJ) * dtc;
    if (vibPh > 2 * Math.PI) vibPh -= 2 * Math.PI;
    const fade = Math.min(1, Math.max(0, (t - 0.11) / 0.30));
    // not a pure sine: the amplitude fluctuation a real vibrato induces is
    // measurably asymmetric in time (Gough 2005)
    const shape = (Math.sin(vibPh) + 0.17 * Math.sin(2 * vibPh + 1.1)) / 1.17;
    jz += (rng() * 2 - 1 - jz) * 0.06;
    const cents = VIB_CENTS * fade * shape + jScale * jz;
    const fInst = f0 * Math.pow(2, cents / 1200);
    w0 = (2 * Math.PI * fInst) / sr;
    inc = fInst / sr;

    // ---- bow force / pressure random walk ----
    pz += (rng() * 2 - 1 - pz) * 0.05;

    // ---- envelope: engage, then keep swelling for ~350 ms, then hold ----
    if (!releasing) {
      const e = t < 0.014 ? 0.55 * (t / 0.014) : 0.55 + 0.45 * (1 - Math.exp(-(t - 0.014) / 0.065));
      bow = e * (1 + 0.12 * pz);
    } else {
      bow = Math.exp(-relT / REL_TAU) * (1 + 0.12 * pz);
    }

    // ---- pre-Helmholtz transient state ----
    if (t < preSec) {
      const rem = 1 - t / preSec;
      nzBoost = 1 + 3.4 * rem;
      extraProb = 2.6 * rem * inc;
    } else {
      nzBoost = 1;
      extraProb = 0;
    }

    // ---- retune every partial, and set its output gain for this block ----
    // Retuning a complex one-pole is a change of rotation RATE, so the state's
    // magnitude and phase are untouched: no zipper, no coefficient transient,
    // which is why this and not a biquad carries the vibrato.
    const damp = releasing ? relMul : 1;
    for (let k = 0; k < nP; k += 1) {
      const w = mult[k] * w0;
      const r = rad[k] * damp;
      ar[k] = r * Math.cos(w);
      ai[k] = r * Math.sin(w);
      const u = (t - arr[k]) / rise[k];
      const gate = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
      const target =
        gate *
        (1 + m1d[k] * Math.sin(2 * Math.PI * m1r[k] * t + m1p[k])) *
        (1 + m2d[k] * Math.sin(2 * Math.PI * m2r[k] * t + m2p[k]));
      ogInc[k] = (target - og[k]) / CTRL;
    }
  };

  updateControl();

  const bodyProcess = (x) => {
    const dx = x - bx2;
    bx2 = bx1;
    bx1 = x;
    let sum = 0;
    for (let i = 0; i < nMode; i += 1) {
      const y = mb0[i] * dx - ma1[i] * my1[i] - ma2[i] * my2[i];
      my2[i] = my1[i];
      my1[i] = y;
      if (mOrd[i] === 2) {
        const v = mb0[i] * (y - mu2[i]) - ma1[i] * mv1[i] - ma2[i] * mv2[i];
        mu2[i] = mu1[i];
        mu1[i] = y;
        mv2[i] = mv1[i];
        mv1[i] = v;
        sum += mg[i] * v;
      } else {
        sum += mg[i] * y;
      }
    }
    let fl = x;
    for (let i = 0; i < floorChain.length; i += 1) fl = floorChain[i].process(fl);
    let y = sum + FLOOR_GAIN * fl;
    for (let i = 0; i < series.length; i += 1) y = series[i].process(y);
    return y;
  };

  return {
    next() {
      if (ctrl === 0) updateControl();
      ctrl = ctrl + 1 === CTRL ? 0 : ctrl + 1;

      // ---- two rng draws per sample, always, so a re-render is identical ----
      const w = rng() * 2 - 1;
      const u2 = rng();

      // ---- Helmholtz slip train, placed to sub-sample accuracy ----
      let det = pending;
      pending = 0;
      phase += inc;
      if (phase >= 1) {
        phase -= 1;
        const frac = phase / inc;
        // during the pre-Helmholtz transient the slip amplitude is erratic
        const a = impBase * (t < preSec ? 0.3 + 1.5 * u2 : 1);
        det += a * (1 - frac);
        pending = a * frac;
      }
      // extra flybacks: more than one slip per nominal period, which is what a
      // bow actually does before Helmholtz motion locks in
      if (extraProb > 0 && u2 < extraProb) det += impBase * (0.25 + 1.1 * (u2 / extraProb));
      detHp += (det - detHp) * kHp;
      det = (det - detHp) * bow;

      // ---- bow noise, gated to the slip window ----
      // Multiplying noise by a periodic window adds no deterministic partial
      // (the product has zero mean at every harmonic), so this makes the bow
      // noise pitch-synchronous without putting a buzz into the spectrum.
      const ph = phase < BETA ? phase / BETA : 1;
      const win = phase < BETA ? 4 * ph * (1 - ph) : 0;
      const nz = w * (0.55 + 1.5 * win) * 1.121 * bow * nzBoost;

      // ---- string modal bank ----
      let s = 0;
      for (let k = 0; k < nP; k += 1) {
        const drive = det * gDet[k] + nz * gNz[k];
        const nr = ar[k] * zr[k] - ai[k] * zi[k] + drive;
        const ni = ai[k] * zr[k] + ar[k] * zi[k];
        zr[k] = nr;
        zi[k] = ni;
        og[k] += ogInc[k];
        s += ni * nrm[k] * og[k];
      }

      // ---- rosin scrape straight into the body, plus the bridge force ----
      const scrape = scrapeBp.process(nz) * SCRAPE;
      const y = bodyProcess(s + scrape) * TRIM * regGain;

      const ay = y < 0 ? -y : y;
      fol = ay > fol ? ay : fol * folDecay;
      t += 1 / sr;
      if (releasing) relT += 1 / sr;
      return y;
    },
    release() {
      if (!releasing) {
        releasing = true;
        relT = 0;
      }
    },
    finished() {
      return releasing && relT > 0.08 && fol < 2e-4;
    },
  };
}
