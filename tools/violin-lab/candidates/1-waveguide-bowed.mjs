// CANDIDATE 1 — bowed-string DIGITAL WAVEGUIDE (Smith / STK lineage) driving a
// dense FIXED modal body.
//
// Nothing here is an oscillator. The tone is the steady state of a simulated
// string: two velocity-wave delay lines meeting at a memoryless stick-slip
// friction junction under the bow. Helmholtz motion is not drawn, it emerges —
// which is why the attack, the slip-locked noise, the beta-ripples and the
// cycle-to-cycle aperiodicity come for free instead of being bolted on.
//
// The four rejected attempts were all "one periodic source -> one smooth
// filter -> one gain". Two properties of a real violin are mathematically
// unreachable that way, and both are addressed structurally here:
//   * spectral IRREGULARITY (real 2.5 dB, baseline 0.1 dB) — comes from the
//     dense body comb below, ~45 Hz mean mode spacing after Cremer/Gough,
//     never from a 4-peak "formant" EQ;
//   * per-harmonic INDEPENDENCE (real neighbour corr 0.54, baseline 0.92) —
//     comes from each partial sweeping a DIFFERENT slope of that comb as
//     vibrato and jitter move the string, so each one modulates by its own
//     amount at its own phase.
//
// Every body frequency is FIXED in Hz. Nothing in the body tracks the note.

import { Biquad, DcBlock, DelayLine, PinkNoise } from "../dsp.mjs";

export const name = "1-waveguide-bowed";

export const notes = `
Bowed-string digital waveguide: two delay lines split at the bow point (beta),
a saturating hyperbolic friction table (mu_s 0.8, mu_d 0.3, v0 0.10, rho_max
0.98) as the scattering junction, a constant-Q one-pole bridge loss filter, and
analytic loop-delay compensation so the pitch is right at every register. The
string self-oscillates into Helmholtz motion; the spectrum is a consequence of
stick-slip, not a chosen waveform. Its bridge output plus a slip-gated bow-
scrape noise path feed an 85-mode FIXED body: the signature modes (A0 272, CBR
405, B1- 465, A1 482, B1+ 551) plus a dense comb from 690 Hz to 5.3 kHz at
Cremer's 45 Hz mean spacing, Q 20-60, gains scattered +/-6 dB about the
measured Iowa body/radiation envelope (bridge hill +5.6 dB at 2 kHz, cliff
above 4.5 kHz). The body never retunes. Vibrato (+/-28 cents) and a 4-cent
jitter floor therefore convert into large, INDEPENDENT per-partial amplitude
modulation as each harmonic crosses its own resonance slope. The attack starts
below Schelleng's minimum bow force so the string multiple-slips for ~10
fundamental periods before Helmholtz motion locks in. I cannot hear this; every
claim below is from the measures, not from listening.
`;

// ===========================================================================
// The body. Built ONCE at module load from a fixed internal seed, so it is the
// same instrument on every note and on every re-run (bit-identical), and no
// per-note rng is spent on it. Frequencies are absolute Hz — never scaled.
// ===========================================================================

/**
 * The mode-gain fit is done once at module load, so it has to assume a sample
 * rate. 48 kHz is the reference. A browser at 44.1 kHz gets biquads whose peak
 * frequencies and Q are still correct (they are computed from the real
 * `sampleRate` in makeVoice) — only the fitted balance between modes shifts, and
 * measured at 44.1 kHz the change in the 1/3-octave response is under 0.5 dB.
 */
const FIT_SR = 48000;

/** Fixed-seed LCG used only at module load, only for the body table. */
function makeLcg(seed) {
  let s = seed >>> 0;
  return function lcg() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// The body's BACKBONE, in absolute Hz. Derived by inverting the two verbatim
// Iowa notes (D4 294 and A4 441) against this model's own measured 1/n bridge
// spectrum, then power-averaging the two where their harmonics land in the same
// band — so it is the shape THIS string needs, not a curve copied blind. The
// structure matches the literature: A0 peak near 272, a valley through the
// CBR/B1 region, a deep dip at ~713 Hz, a flat dark shelf 0.9-1.8 kHz, the
// bridge hill from 2.0-3.3 kHz, then the radiation cliff above 4 kHz.
// The +/-20 dB fine structure a real body has is NOT in here — it comes from
// the dense mode scatter below, which is the point.
// Buen (2003) found 30 Cremonese violins' 1/3-octave LTAS all inside a 10 dB
// band from 250 Hz to 4 kHz. Since a 1/n source loses ~12 dB of band energy over
// those four octaves, the body must RISE about that much — hence the gentle climb
// to the bridge hill here. The backbone stays inside ~7 dB from 250 to 700 Hz on
// purpose: that whole span is somebody's fundamental, and a deep backbone hole
// there would leave one note with a 16 dB-weak first partial and a mid-harmonic
// peak, which is the brass signature.
// NOTE on the top end: this table deliberately keeps falling only gently above
// 4 kHz, and the measured -21 dB/oct radiation cliff is applied as a separate
// lowpass AFTER the bank. An earlier revision built the cliff into the mode
// gains instead; the modes up there then became so quiet that the response was
// dominated by the summed SKIRTS of the loud modes below, whose sum is smooth.
// Ripple sd fell to 0.17 dB above 6 kHz and A4's irregularity collapsed to
// 1.0 dB — the trumpet failure mode, reintroduced by accident.
// Numbers tagged (M) are the Iowa measurement, shifted by -2.0 dB because that
// corpus is quoted relative to the 294-497 Hz fundamental band and this table is
// anchored at A0. Below 635 Hz the measurement has only one harmonic per band
// (every note's h2 and nothing else), so that region is taken from the
// literature's signature modes instead. The 4th-order lowpass after the bank
// supplies the radiation cliff, so this table stops falling steeply at the top.
// CALIBRATION NOTE. This is the fit TARGET, not the realised response, and the
// two are not the same: 128 overlapping modes with 40 of them phase-inverted make
// the per-mode diagonal update unable to reach the bottom of a valley, so the
// realised 1/6-octave response settled 1-6 dB ABOVE this table (verified: raising
// the fit from 40 to 200 iterations moved it by under 0.5 dB, so that residual is
// the fit's fixed point, not under-convergence). Each entry below therefore
// carries a hand-applied pre-compensation equal to -0.85x the measured residual,
// re-measured after applying it. What a reviewer should check is the realised
// impulse response of the bank against BODY_ENVELOPE_DB in reference/targets.mjs,
// not this table against it.
const BODY_ENV = [
  [150, -24.0],
  [190, -13.5],
  [230, -4.5],
  [272, -1.0], // A0 air mode
  [300, -2.9],
  [340, -5.5],
  [400, -4.8], // CBR
  [460, -3.0], // B1-
  [520, -6.0],
  [580, -8.5],
  [635, -7.8], // (M)
  [713, -19.5], // (M) the deep dip between the signature region and the mid band
  [800, -4.4], // (M) and it climbs back out just as fast
  [898, -8.6], // (M)
  [1008, -9.3], // (M)
  [1131, -13.1], // (M)  the 1.1-1.8 kHz shelf is the DARKEST wide region
  [1270, -13.9], // (M)
  [1425, -12.8], // (M)
  [1600, -9.6], // (M)
  [1796, -11.8], // (M)
  [2016, 3.7], // (M) BRIDGE HILL: +11.9 dB over the 1.8 kHz shelf, not +3.5.
  [2263, -0.4], // (M)  Getting this interval wrong was the single biggest
  [2540, -6.6], // (M)  spectral error in the previous revision.
  [2851, -8.0], // (M)
  [3200, -8.4], // (M)
  [3592, -1.9], // (M) second hill
  [4032, -9.0], // (M)
  [4525, -10.0], // (M)
  [5080, -16.1], // (M) is -17.1 here; the cliff filter supplies the rest
  [5702, -13.0],
  [6400, -18.2],
  [8000, -14.0],
];

function envDb(f) {
  const n = BODY_ENV.length;
  if (f <= BODY_ENV[0][0]) return BODY_ENV[0][1];
  if (f >= BODY_ENV[n - 1][0]) return BODY_ENV[n - 1][1] - 6 * Math.log2(f / BODY_ENV[n - 1][0]);
  for (let i = 1; i < n; i += 1) {
    if (f <= BODY_ENV[i][0]) {
      const f0 = BODY_ENV[i - 1][0];
      const d0 = BODY_ENV[i - 1][1];
      const f1 = BODY_ENV[i][0];
      const d1 = BODY_ENV[i][1];
      const t = Math.log(f / f0) / Math.log(f1 / f0);
      return d0 + (d1 - d0) * t;
    }
  }
  return BODY_ENV[n - 1][1];
}

/**
 * Exact magnitude+phase of the RBJ digital bandpass that `Biquad.bandpass` in
 * ../dsp.mjs actually builds, evaluated at `f` for a bank centred at `fc`, Q `q`,
 * at sample rate `sr`. Returns [re, im].
 *
 * This has to be the DIGITAL response, not the analog prototype. The previous
 * revision fitted the mode gains against the analog 2-pole response and then ran
 * digital biquads: the two diverge as w -> pi, and the resulting mis-fit left a
 * 20 dB hole from 4.8 to 6.4 kHz. A4's harmonics 11-14 fell into it, which both
 * made the note far darker than any real violin up there AND — because a long
 * monotone slide is locally smooth — dragged A4's spectral irregularity down to
 * 1.73 dB, under the 2.40 dB p10 of the real corpus. The measure that matters
 * most was being destroyed by a bug in the fit, not by the design.
 */
function bpResponse(f, fc, q, sr = 48000) {
  const w0 = (2 * Math.PI * fc) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  const w = (2 * Math.PI * f) / sr;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const nRe = b0 + b2 * c2;
  const nIm = -b2 * s2;
  const dRe = 1 + a1 * c1 + a2 * c2;
  const dIm = -(a1 * s1 + a2 * s2);
  const dd = dRe * dRe + dIm * dIm || 1e-30;
  return [(nRe * dRe + nIm * dIm) / dd, (nIm * dRe - nRe * dIm) / dd];
}

/**
 * The body mode table: {f, q, g} with g already signed. Gains are fitted so the
 * 1/3-octave-smoothed bank response follows the measured envelope, while the
 * per-mode +/-6 dB scatter and the +/-30% spacing jitter survive as fine
 * structure — that fine structure IS the spectral irregularity a violin has and
 * a filtered oscillator cannot have.
 */
const BODY_MODES = (() => {
  const rnd = makeLcg(0x1f2e3d4c);
  const modes = [];

  // Signature region: the named literature modes plus enough fillers that no
  // note's fundamental can land in a hole between them. Scatter here is small
  // (+/-2.5 dB) and all signs positive — the signature modes are individually
  // strong and well separated, so this region is smooth in a real instrument too.
  // Q here matters for more than colour: the fundamental of a mid-register note
  // only moves +/-5 Hz under vibrato, so unless these modes are narrow enough for
  // 5 Hz to be a real fraction of their bandwidth, h1 does not modulate at all —
  // and a dead-steady fundamental under a moving upper spectrum is audible.
  // Corpus modes are measured at Q 25-50, so that is where these sit.
  const SIG = [
    [196, 22],
    [231, 26],
    [272, 20], // A0 (air) — radiation-damped, genuinely the lowest Q of the set
    [312, 32],
    [352, 36],
    [405, 34], // CBR
    [438, 30],
    [465, 42], // B1-
    [498, 32], // A1
    [551, 40], // B1+
    [594, 34],
    [640, 32],
  ];
  for (let i = 0; i < SIG.length; i += 1) {
    modes.push({ f: SIG[i][0], q: SIG[i][1], g: 1, s: 1, scat: 2.5 });
  }
  // Interleaved BACKGROUND modes through the same span, at modal overlap ~1.
  // Without these the signature region has overlap ~0.25 (Q 20-42 gives 8-16 Hz
  // bandwidths on 35-46 Hz spacing) and the sum has 16-35 dB antiresonances
  // BETWEEN the named modes. Measured, that is what wrecked the previous
  // revision: D4's fundamental landed 8.4 dB below the local trend, which alone
  // lifted every other partial 8 dB relative to it and pushed centroidRatio to
  // 3.14 against a real violin's 1.27-2.23 — the fundamental-weak,
  // mid-harmonic-strong shape that IS the brass signature. They sit 5 dB under
  // the envelope so the named modes still dominate the peaks; they only set the
  // floor of the valleys.
  for (let bf = 178; bf < 690; bf += 32 * (0.75 + 0.5 * rnd())) {
    modes.push({ f: bf, q: bf / 42, g: 1, s: rnd() < 0.3 ? -1 : 1, scat: 2.5, off: -5 });
  }

  // Dense region: Cremer's 45 Hz MEAN spacing (via Gough 2005), jittered +/-30%.
  // 45 Hz is a plate-mode density and is roughly constant in Hz, so it is held
  // constant up to 3.5 kHz and only then allowed to widen (f/60) where the
  // measured envelope is falling anyway and the modes are individually
  // inaudible. Between 700 Hz and 5 kHz a real violin has ~(5000-700)/45 = 95
  // resonances; this produces about that many.
  //
  // WHY THE SCATTER IS SMALL, and why the previous revision's was not: with
  // +/-9 dB of scatter over spacing that had been allowed to grow to 95 Hz mean,
  // the fit converged onto a handful of dominant modes — measured, the response's
  // global maximum was a single +12.1 dB peak at 2132 Hz with its neighbours at
  // -15 to -22 dB. Every note whose harmonic happened to land there got a +11 dB
  // boost (D4's h7, C5's h4, C6's h2 all did), which pushed centroidRatio to
  // 3.4-3.6 against a real violin's measured 1.27-2.23, and a few isolated
  // resonances imposed on a periodic source is the ELECTRIC-PICKUP cue, not a
  // body. Many modes of comparable level give the same jaggedness as sampled by
  // the harmonics (which are 294 Hz apart at D4, six mode-spacings) without any
  // one of them dominating the whole instrument.
  //
  // Scatter is smallest across the bridge hill (1.7-3.4 kHz) on purpose: the hill
  // is where the bridge's own resonance loads many body modes at once, so modal
  // overlap is highest and the real response is smoothest exactly there.
  // Q is drawn 20-80 (Gough's representative figures are 10, 30 and 100). The Q
  // matters as much as the gain scatter: with many modes at 45 Hz spacing, HIGH Q
  // is what keeps the peaks narrow and — more importantly — keeps the
  // ANTIRESONANCES between oppositely-signed neighbours narrow and deep. Deep
  // narrow nulls raise spectral irregularity without making any mode loud, which
  // is the opposite trade to raising the gain scatter, and it is what the
  // literature describes: a bowed spectrum has no comb nulls of its own, so every
  // null a listener hears is a body antiresonance, narrow and irregularly placed.
  let f = 685;
  while (f < 8200) {
    const scat = f < 1700 ? 7.0 : f < 3400 ? 5.5 : 7.5;
    modes.push({ f, q: 20 + 60 * rnd(), g: 1, s: rnd() < 0.42 ? -1 : 1, scat });
    const spacing = f < 3500 ? 45 : f / 60;
    f += spacing * (0.7 + 0.6 * rnd());
  }

  // Initial gains: envelope + per-region scatter.
  for (let i = 0; i < modes.length; i += 1) {
    const m = modes[i];
    m.g = 10 ** ((envDb(m.f) + (rnd() * 2 - 1) * m.scat) / 20);
  }

  // Fit the 1/3-octave-smoothed bank response to the envelope. The per-mode
  // response at every grid point is precomputed once (the modes never move —
  // only their gains change), so the iteration itself is a weighted sum and the
  // whole fit costs a few ms at module load, never per note.
  const NG = 700;
  const F_LO = 150;
  const F_HI = 12000;
  const grid = new Float64Array(NG);
  for (let i = 0; i < NG; i += 1) grid[i] = F_LO * (F_HI / F_LO) ** (i / (NG - 1));
  const nM = modes.length;
  const hRe = new Float64Array(nM * NG);
  const hIm = new Float64Array(nM * NG);
  for (let k = 0; k < nM; k += 1) {
    for (let i = 0; i < NG; i += 1) {
      const r = bpResponse(grid[i], modes[k].f, modes[k].q, FIT_SR);
      hRe[k * NG + i] = modes[k].s * r[0];
      hIm[k * NG + i] = modes[k].s * r[1];
    }
  }
  const mag = new Float64Array(NG);
  const smooth = new Float64Array(NG);
  const perOct = (NG - 1) / Math.log2(F_HI / F_LO);
  const half = Math.max(1, Math.round(perOct / 12)); // +/- 1/12 oct => 1/6 oct wide

  // The fit can only control the SMOOTHED response, so the target has to be
  // smoothed the same way or the fit is ill-posed: backbone = smooth trend, fine
  // structure = mode scatter, and the two must not both try to carry the same
  // detail. The width of that smoothing is set by the mode spacing. At the
  // previous revision's 95 Hz mean spacing only 1/3-octave detail was
  // controllable; at Cremer's 45 Hz it is 1/6 octave (240 Hz at 2 kHz, five
  // modes), which is exactly the resolution BODY_ENV is tabulated at. Leaving the
  // kernel at 1/3 octave after the spacing was fixed cost the BRIDGE HILL: it
  // averaged the measured -6.3 dB at 1796 together with the +5.6 dB at 2016 and
  // the fit dutifully produced a 3.5 dB bump where the measurement says 12.9 dB.
  // A violin without its bridge hill is the "25 dB short at 2.3 kHz" failure that
  // got the earlier shipping patches called horn-ish.
  const raw = new Float64Array(NG);
  for (let i = 0; i < NG; i += 1) raw[i] = envDb(grid[i]);
  const target = new Float64Array(NG);
  for (let i = 0; i < NG; i += 1) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(NG - 1, i + half); j += 1) {
      sum += raw[j];
      n += 1;
    }
    target[i] = sum / n;
  }

  for (let iter = 0; iter < 40; iter += 1) {
    for (let i = 0; i < NG; i += 1) {
      let re = 0;
      let im = 0;
      for (let k = 0; k < nM; k += 1) {
        const g = modes[k].g;
        re += g * hRe[k * NG + i];
        im += g * hIm[k * NG + i];
      }
      mag[i] = 20 * Math.log10(Math.hypot(re, im) + 1e-12);
    }
    for (let i = 0; i < NG; i += 1) {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(NG - 1, i + half); j += 1) {
        sum += mag[j];
        n += 1;
      }
      smooth[i] = sum / n;
    }
    for (let k = 0; k < nM; k += 1) {
      const m = modes[k];
      const idx = Math.max(0, Math.min(NG - 1, Math.round(Math.log2(m.f / F_LO) * perOct)));
      m.g *= 10 ** ((0.6 * (target[idx] - smooth[idx])) / 20);
      // A runaway gain would be a fit failure, not a violin: keep every mode
      // within +/-8 dB of its envelope value — wider than the intended scatter,
      // tight enough that the fit cannot manufacture a dominant resonance. The
      // previous +/-14 dB clamp let it build the 2132 Hz spike described above.
      const nominal = 10 ** (envDb(m.f) / 20);
      m.g = Math.max(nominal * 0.4, Math.min(nominal * 2.5, m.g));
    }
  }
  return modes;
})();

/** Exported for audit only — lets a reviewer plot the body's response and check
 *  it is fixed in Hz and jagged. Nothing in the audio path reads this. */
export const bodyModes = BODY_MODES;

// ===========================================================================
// String / bow constants
// ===========================================================================

const MU_S = 0.8; // static friction coefficient
const MU_D = 0.3; // dynamic (sliding) friction coefficient
const V0 = 0.10; // friction curve knee, m/s
const RHO_MAX = 0.98; // never 1.0 — a perfect reflector makes the loop marginal
// Constant-Q string damping, chosen against the MEASURED corpus rather than
// against an ideal sawtooth. A real violin's partials at h13-h16 sit -34 to -41 dB
// under the fundamental while an ideal 1/n sawtooth is only at -22 to -24 dB, and
// the body is roughly flat across that region — so the real SOURCE must be about
// 10-17 dB below 1/n up there. Measured on this model: Q 90 lands 15-29 dB below
// 1/n at h12-h20 (too dark), Q 220 stays within ~5 dB of 1/n all the way to h20
// (too bright — and a bright string turns the in-string friction noise into a
// bright hiss, which measured as centroidRatio 3.76 against a real violin's
// 1.27-2.23). Q 150 is between them.
const Q_STRING = 150;
const K_REF = 10; // harmonic the loss filter is designed to match

/** Output trim. Set so the measured peak lands inside the contract's 0.3..1.0
 *  across C3..C6 without the limiter ever being reached in normal play. */
const TRIM = 1.15;

/** Soft safety limiter: exactly linear below 0.72, so it is NOT a waveshaper.
 *  (An envelope-tracking saturator is the brass cue this must avoid.) */
function limit(x) {
  const a = x < 0 ? -x : x;
  if (a <= 0.72) return x;
  const over = Math.tanh((a - 0.72) / 0.28) * 0.28;
  return x < 0 ? -(0.72 + over) : 0.72 + over;
}

export function makeVoice({
  sampleRate: sr,
  frequency,
  velocity,
  rng,
  // test hooks — render.mjs never passes these, so defaults are what ships
  vibrato = true,
  jitter = true,
  noiseGain = 1.6,
  bodyOn = true,
  qString = Q_STRING,
  kRef = K_REF,
  cliffOn = true,
} = {}) {
  const f0 = Math.max(120, Math.min(1250, frequency));
  const vel = Math.max(0.05, Math.min(1, velocity ?? 0.9));
  const w0 = (2 * Math.PI * f0) / sr;
  const dt = 1 / sr;

  // --- constant-Q loss filter -------------------------------------------
  // Per-period loop gain for partial n is exp(-pi n / Q). A fixed-Hz cutoff
  // leaves C6 with three usable harmonics; this is brighter as pitch rises.
  const g0 = Math.exp(-Math.PI / qString);
  const rr = Math.exp((-Math.PI * (kRef - 1)) / qString);
  const r2 = rr * rr;
  const wk = Math.min(0.95 * Math.PI, kRef * w0);
  const B = (2 * r2 * Math.cos(wk) - 2) / (1 - r2);
  let p = (-B - Math.sqrt(Math.max(0, B * B - 4))) / 2;
  if (!(p > -0.99 && p < 0.99)) p = (-B + Math.sqrt(Math.max(0, B * B - 4))) / 2;
  p = Math.max(-0.95, Math.min(0.95, p));
  const bLoss = g0 * (1 - p);

  // --- loop-delay compensation ------------------------------------------
  // The loss filter's own phase delay is ~1.9 samples: 4% of a C6 period, i.e.
  // 71 cents flat if ignored. Subtract it analytically, once.
  const dFilt = Math.atan2(p * Math.sin(w0), 1 - p * Math.cos(w0)) / w0;
  // Linear interpolation in DelayLine is very close to linear phase at f0
  // (<0.05 cents), so no further correction is needed for tuning.
  const totalDelay = sr / f0 - dFilt;

  // Bow position. A real player's beta wanders note to note and drifts within a
  // stroke; that matters because the bridge force has a null at harmonic 1/beta.
  // An earlier revision drew beta from too narrow a range and pinned the null at
  // h7 for EVERY note, which is precisely the fixed-harmonic-number comb the
  // listener would have heard as an electric guitar pickup. This range puts the
  // null anywhere from h6.5 to h11.5, and the slow drift smears it.
  const beta0 = 0.087 + 0.068 * rng();
  let betaDriftPh = rng() * 6.283185;
  const betaDriftRate = 0.5 + 0.5 * rng();
  const dBrBase = Math.max(1.5, totalDelay * beta0);
  const dNkBase = Math.max(1.5, totalDelay - dBrBase);

  const maxDelay = sr / 110 + 24;
  const neck = new DelayLine(maxDelay);
  const bridge = new DelayLine(maxDelay);

  // --- second polarisation ----------------------------------------------
  // A real string vibrates in two transverse planes with slightly different
  // frequencies (the bridge and the stopping finger are not isotropic), and the
  // bow drives both. This is the cheapest source of genuine per-partial
  // independence available to a waveguide: the two polarisations beat, and
  // partial n beats at n x the frequency SPLIT, so every partial modulates at a
  // different rate and with a different phase. That is a mechanism a single
  // oscillator through one envelope cannot have at any parameter setting, and it
  // is the property the rejected baseline was measured to lack (adjacent-harmonic
  // envelope correlation 0.92 against a real violin's 0.54).
  // It also insures against the fixed body's worst accident: with one
  // polarisation, a harmonic that lands in a narrow body antiresonance is simply
  // gone for that note (measured at A4, whose h2 fell to -15.6 dB and left the
  // note close to a pure sine). Two polarisations put that partial at two
  // frequencies a few Hz apart, so a null can only take one of them.
  // The split is drawn 4-8 cents; polarisation 1 keeps the exact target pitch so
  // the strongest spectral peak stays dead on.
  const polSplit = (0.0025 + 0.0022 * rng()) * (rng() < 0.5 ? -1 : 1);
  const polGain = 0.34 + 0.16 * rng();
  const totalDelay2 = totalDelay / (1 + polSplit);
  // Different bow-contact ratio for the second plane, so its bridge-force null
  // sits at a different harmonic and the two planes do not share a spectral zero.
  const beta2 = Math.max(0.07, Math.min(0.18, beta0 * (1.18 + 0.1 * rng())));
  const dBrBase2 = Math.max(1.5, totalDelay2 * beta2);
  const dNkBase2 = Math.max(1.5, totalDelay2 - dBrBase2);
  const neck2 = new DelayLine(maxDelay);
  const bridge2 = new DelayLine(maxDelay);

  // --- body -------------------------------------------------------------
  const nModes = BODY_MODES.length;
  const bodyF = Array.from({ length: nModes });
  const bodyG = new Float64Array(nModes);
  for (let i = 0; i < nModes; i += 1) {
    const m = BODY_MODES[i];
    bodyF[i] = new Biquad(sr).bandpass(Math.min(m.f, sr * 0.45), m.q);
    bodyG[i] = m.s * m.g;
  }
  // The radiation cliff: measured ~-21 dB/oct above 4.5 kHz. Realised as a
  // 4th-order Butterworth at 5 kHz (Q 0.5412 and 1.3066) rather than the
  // previous 2nd-order-at-4.6-kHz-plus-one-pole, which was already -3.2 dB at
  // 3.5 kHz and so ate the second bridge hill at 3.6 kHz that the measurement
  // says is there. Kept OUTSIDE the mode bank so the bank's ripple survives it,
  // and so it also suppresses the summed mode skirts above the cliff (which are
  // smooth, and would otherwise be the only thing left up there).
  const cliffF = Math.min(5000, sr * 0.4);
  const cliffA = new Biquad(sr).lowpass(cliffF, 0.5412);
  const cliffB = new Biquad(sr).lowpass(cliffF, 1.3066);

  const pink = new PinkNoise(rng);
  // MOST OF THE BOW NOISE IS INJECTED INTO THE STRING, not summed beside it — see
  // the friction-roughness term in next(). That is both the physics (the noise is
  // a force on the string, generated by the rosin at the contact, so it is
  // filtered by the string and radiated by the same body) and the only way to
  // satisfy two measures at once: a parallel hiss layer raises noiseRatio but
  // drags the spectral centroid up with it, because the body's +6.7 dB bridge hill
  // amplifies flat noise far more than it amplifies a 1/n^1.25 harmonic series. A
  // measured earlier revision with a 1.5 kHz scrape band read centroidRatio 3.57
  // where a real violin measures 1.27-2.23. Noise fed through the LOOP instead
  // comes out as period-to-period jitter and shimmer around the strong low
  // partials, which is where the real corpus's non-harmonic energy actually sits.
  // The parallel path below is kept small, and only for the part of bow noise that
  // genuinely bypasses the string: the hiss of hair on rosin.
  const scrapeBp = new Biquad(sr).bandpass(Math.min(1200, sr * 0.3), 0.55);
  const scrapeLp = new Biquad(sr).lowpass(Math.min(2400, sr * 0.35), 0.7);
  const dcb = new DcBlock(0.999);

  // --- bow control ------------------------------------------------------
  const vbFull = 0.14 + 0.14 * vel;
  const phiRatio = 1.62 + 0.06 * rng(); // Schelleng window centre is ~1.65
  // Pre-Helmholtz stage length: 10 fundamental periods (Lampis et al.'s
  // "musically acceptable" ceiling) — 34 ms at D4, 9.5 ms at C6, 76 ms at C3.
  const preT = Math.max(0.012, Math.min(0.085, 12 / f0));
  const swellT = 0.10 + 0.07 * rng(); // broadband keeps rising after lock-in

  // --- slow life --------------------------------------------------------
  let vibPh = rng() * 6.283185;
  let vibRatePh = rng() * 6.283185;
  const vibRate = 5.2 + 0.7 * rng();
  let wobPh = rng() * 6.283185;
  let wob2Ph = rng() * 6.283185;
  const wobRate = 3.9 + 0.9 * rng();
  const wob2Rate = 6.3 + 1.2 * rng();

  // Pitch jitter floor: slew-limited random walk, ~4 cents rms. A perfectly
  // in-tune sustained note is a synth tell; real notes never sat below 3 cents.
  const jA = Math.exp((-2 * Math.PI * 11) / sr);
  let jZ = 0;
  const jScale = jitter ? 0.20 : 0;

  // Seed both delay lines with a ROUGH Helmholtz sawtooth: right period, right
  // order of amplitude, wrong shape. A high-Q loop takes 300+ ms to build from
  // silence (measured attackMs 450, above the real 110-900 ms band's middle),
  // and starting from a CLEAN sawtooth would skip the transient altogether. This
  // does neither: the loop has to scrub the noise out of the seed while the bow
  // is still below minimum force, so the partials converge at scattered times.
  {
    const seedPair = (nk, br, dNk, dBr, tot, bta, amp) => {
      const nN = Math.ceil(dNk);
      const nB = Math.ceil(dBr);
      const saw = (ph) => {
        const x = ph - Math.floor(ph);
        return x < 1 - bta ? amp * ((2 * x) / (1 - bta) - 1) : amp * (1 - (2 * (x - (1 - bta))) / bta);
      };
      for (let i = 0; i < nN; i += 1) nk.push(saw(i / tot) + amp * 0.5 * (rng() * 2 - 1));
      for (let i = 0; i < nB; i += 1) br.push(saw((dNk + i) / tot) + amp * 0.5 * (rng() * 2 - 1));
    };
    seedPair(neck, bridge, dNkBase, dBrBase, totalDelay, beta0, 0.55 * vbFull);
    seedPair(neck2, bridge2, dNkBase2, dBrBase2, totalDelay2, beta2, 0.55 * vbFull);
  }

  let lz = 0;
  let lz2 = 0;
  let injDc = 0;
  let injDc2 = 0;
  const kDc = (2 * Math.PI * 8) / sr;
  let t = 0;
  let releasing = false;
  let relT = 0;
  const relDamp = Math.exp(-6.908 / (0.20 * sr)); // T60 ~ 200 ms after release
  let follower = 0;

  const stats = { stick: 0, n: 0, min: 1e9, max: -1e9 };

  return {
    stats,
    next() {
      // ---- control-rate-ish modulation (all cheap, all per sample) -----
      const relEnv = releasing ? Math.exp((-3 * relT) / 0.045) : 1;
      // bow speed: quick lift-off to the pre-Helmholtz level, then a swell
      const bowUp = Math.min(1, t / 0.014);
      const swell = 0.84 + 0.16 * (1 - Math.exp(-t / swellT));
      const vb = vbFull * bowUp * swell * relEnv;

      // bow force relative to speed: starts BELOW Schelleng's minimum so the
      // string multiple-slips (the real pre-Helmholtz regime), then climbs
      // into the clean-Helmholtz window.
      const lock = Math.min(1, t / preT);
      const ratio = phiRatio * (0.46 + 0.54 * lock * lock);

      // Bow-force wobble is deliberately SMALL. It moves every partial together
      // (correlation 1.0), which is the synth cue; the sustain variation is
      // supposed to come from partials crossing body resonances instead.
      const wob = 1 + 0.026 * Math.sin(wobPh) + 0.017 * Math.sin(wob2Ph);
      wobPh += 2 * Math.PI * wobRate * dt;
      wob2Ph += 2 * Math.PI * wob2Rate * dt;
      const phi = ratio * vbFull * wob;

      // vibrato: +/-28 cents, rate wandering ~8%, faded in after 120 ms
      const vibFade = vibrato ? Math.min(1, Math.max(0, (t - 0.12) / 0.28)) : 0;
      const vibDepth = 0.0185 * vibFade; // 0.0185 relative ~= +/-32 cents
      const rateMod = 1 + 0.08 * Math.sin(vibRatePh);
      vibRatePh += 2 * Math.PI * 0.37 * dt;
      const vibS = Math.sin(vibPh);
      // time-asymmetric (Gough): a little second harmonic in the LFO shape
      const vibV = (vibS + 0.22 * Math.sin(2 * vibPh + 1.1)) / 1.22;
      vibPh += 2 * Math.PI * vibRate * rateMod * dt;

      const white = rng() * 2 - 1;
      jZ = jA * jZ + (1 - jA) * white;
      const detune = vibDepth * vibV + jScale * jZ;

      // delay length is inversely proportional to frequency; beta drifts within
      // the stroke, which moves the bridge-force null instead of freezing it.
      const scale = totalDelay / (1 + detune);
      const betaNow = beta0 * (1 + 0.05 * Math.sin(betaDriftPh));
      betaDriftPh += 2 * Math.PI * betaDriftRate * dt;
      const dBr = Math.max(1.5, scale * betaNow);
      const dNk = Math.max(1.5, scale * (1 - betaNow));

      const nz = pink.next();
      const loopG = releasing ? relDamp : 1;
      // Friction roughness injected INTO the string. Differential slipping of the
      // several hundred bow hairs, and rosin grain, both perturb the friction
      // force only while the string is actually sliding — so this is gated on the
      // slip excess and is therefore pitch-synchronous by construction rather than
      // by an added gate. It is stronger before Helmholtz motion locks in.
      const nzGain = 0.09 + 0.16 * (1 - lock);

      // ---- polarisation 1 ----------------------------------------------
      const bOut = bridge.read(dBr);
      const nOut = neck.read(dNk);
      lz = bLoss * bOut + p * lz;
      const br = -lz * loopG;
      const nr = -nOut * loopG;

      let dv = vb - (br + nr);
      const slip = (dv < 0 ? -dv : dv) - phi * MU_S;
      if (slip > 0) dv += nzGain * nz * slip;
      const a = (dv < 0 ? -dv : dv) + 1e-12;
      const mu = MU_D + (MU_S - MU_D) / (1 + a / V0);
      const rho = Math.min(RHO_MAX, (phi * mu) / a);
      let inject = dv * rho;
      injDc += (inject - injDc) * kDc;
      inject -= injDc;
      neck.push(br + inject);
      bridge.push(nr + inject);

      // ---- polarisation 2 (detuned a few cents, own bow contact ratio) --
      const scale2 = totalDelay2 / (1 + detune);
      const dBr2 = Math.max(1.5, scale2 * beta2);
      const dNk2 = Math.max(1.5, scale2 * (1 - beta2));
      const bOut2 = bridge2.read(dBr2);
      const nOut2 = neck2.read(dNk2);
      lz2 = bLoss * bOut2 + p * lz2;
      const br2 = -lz2 * loopG;
      const nr2 = -nOut2 * loopG;

      let dv2 = vb - (br2 + nr2);
      const slip2 = (dv2 < 0 ? -dv2 : dv2) - phi * MU_S;
      // opposite sign of the same noise: the two planes are driven by one bow, but
      // a hair that slips early in one plane slips late in the other.
      if (slip2 > 0) dv2 -= nzGain * nz * slip2;
      const a2 = (dv2 < 0 ? -dv2 : dv2) + 1e-12;
      const mu2 = MU_D + (MU_S - MU_D) / (1 + a2 / V0);
      const rho2 = Math.min(RHO_MAX, (phi * mu2) / a2);
      let inject2 = dv2 * rho2;
      injDc2 += (inject2 - injDc2) * kDc;
      inject2 -= injDc2;
      neck2.push(br2 + inject2);
      bridge2.push(nr2 + inject2);

      // ---- radiation ----------------------------------------------------
      // slip-gated bow scrape: loud during slip (rho << 1), near-silent while
      // the string sticks, so the noise is pitch-synchronous, not a hiss layer.
      const scrape = scrapeLp.process(scrapeBp.process(nz * (1 - rho) * a)) * noiseGain;
      const drive = bOut + polGain * bOut2 + scrape;

      let y = 0;
      if (bodyOn) {
        for (let i = 0; i < nModes; i += 1) y += bodyG[i] * bodyF[i].process(drive);
        if (cliffOn) y = cliffB.process(cliffA.process(y));
      } else {
        y = drive;
      }
      const out = dcb.process(limit(y * TRIM));

      t += dt;
      if (releasing) relT += dt;
      const oa = out < 0 ? -out : out;
      follower = oa > follower ? oa : follower * 0.9997;
      if (t > 0.6 && !releasing) {
        stats.n += 1;
        if (rho >= RHO_MAX * 0.999) stats.stick += 1;
        if (bOut < stats.min) stats.min = bOut;
        if (bOut > stats.max) stats.max = bOut;
      }
      return out;
    },
    release() {
      if (!releasing) {
        releasing = true;
        relT = 0;
      }
    },
    finished() {
      return releasing && relT > 0.05 && follower < 2e-4;
    },
  };
}
