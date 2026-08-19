// MEASURED violin acoustics targets.
//
// Every number below marked `measured:` came from running the scripts in this
// directory over the University of Iowa Musical Instrument Samples (MIS) violin
// recordings (free for any use), analysed with the same FFT/`spectrum()` code
// the lab's own `analyse()` uses, so the figures are directly comparable to a
// candidate's render. Numbers marked `lit:` are from the acoustics literature
// and are cited in the comment. Numbers marked `est:` are my inference.
//
// Reproduce with:
//   node tools/violin-lab/reference/fetch.mjs        # downloads + converts
//   node tools/violin-lab/reference/aggregate.mjs tools/violin-lab/reference/audio/*.wav
//   node tools/violin-lab/reference/onset.mjs        tools/violin-lab/reference/audio/*.wav
//
// Corpus: 22 sustained notes, f0 294-497 Hz, mf and ff, arco, no vibrato,
// D and A strings, one violin, one room.

// --- 1. steady-state harmonic structure -----------------------------------

/** measured: mean level (dB re h1) over the 22-note corpus, h1..h16. */
export const HARMONICS_MEAN_DB = [
  0, -10.6, -16.7, -16.4, -15.3, -15.9, -15.6, -19.0, -24.4, -24.8, -26.3, -28.8, -34.4, -36.8, -41.0, -39.6,
];

/** measured: standard deviation across the 22 notes, h1..h16 (dB). */
export const HARMONICS_SD_DB = [
  0, 7.3, 7.0, 8.5, 8.9, 8.4, 7.2, 5.4, 7.0, 5.9, 7.2, 6.7, 7.9, 7.8, 8.8, 8.0,
];

/** measured: two individual notes, verbatim. The mean above is a fiction that
 *  no single note resembles — candidates must aim at this kind of jaggedness. */
export const HARMONICS_D4_294 = [
  0, -15.7, -18.4, -23.1, -29.1, -25.8, -9.2, -15.3, -27.6, -23.0, -16.0, -36.0, -33.0, -31.3, -41.5, -36.7,
];
export const HARMONICS_A4_441 = [
  0, -5.3, -17.0, -10.7, -14.8, -15.2, -23.7, -20.7, -28.1, -22.3, -30.4, -34.1, -35.9, -45.5, -56.3, -47.6,
];

/** reference shapes to contrast against. */
export const SAWTOOTH_1_OVER_N_DB = [
  0, -6.0, -9.5, -12.0, -14.0, -15.6, -16.9, -18.1, -19.1, -20.0, -20.8, -21.6, -22.3, -22.9, -23.5, -24.1,
];
/** measured: Iowa MIS Bb trumpet, novib mf, D4 (292 Hz). Note the fundamental
 *  is 20 dB BELOW the peak and the curve is glassy-smooth. */
export const TRUMPET_D4_292_DB = [
  0, 11.4, 18.0, 19.9, 18.5, 15.2, 13.3, 11.3, 7.9, 4.6, 1.0, -1.3, -4.0, -6.0, -8.7, -12.8,
];

/**
 * measured: median | h[k] - mean(h[k-1..k+1]) | over h2..h15, in dB.
 * The single most discriminating static measure found. A candidate must clear
 * VIOLIN_MIN or it is spectrally smoother than a trumpet.
 */
export const SPECTRAL_IRREGULARITY_DB = {
  idealSawtooth: 0.0,
  rejectedBaseline: 0.1,
  realTrumpet: 0.6, // 0.5-0.7 across notes
  realViolinMedian: 2.5, // per-note medians run 3.1-4.1
  realViolinP90: 6.0,
  realViolinMax: 10.9,
  VIOLIN_MIN: 2.5,
};

/** measured: over 15 adjacent-harmonic steps in h1..h16, how many go UP. */
export const HARMONIC_RISES = {
  idealSawtooth: 0,
  rejectedBaseline: 0,
  realTrumpet: 2.8,
  realViolin: 4.8, // median rise 4.3 dB, p90 11.6 dB, max 21.7 dB
  VIOLIN_MIN: 3,
};

// --- 2. the fixed body -----------------------------------------------------

/**
 * lit: signature modes of one measured violin (Euphonics 5.3), Hz.
 * Survey ranges: A0 275 +/- 9, CBR 380-440, A1 470-490, B1- 430-490
 * (476 +/- 16), B1+ 510-570.
 */
export const SIGNATURE_MODES_HZ = { A0: 272, CBR: 407, B1minus: 462, B1plus: 551 };

/**
 * lit: Cremer's estimate, quoted by Gough (2005) - the MEAN SPACING between
 * individual body resonances above the signature region. This is the number
 * that kills the four-broad-formants approach: the real body is a dense comb.
 */
export const MODE_SPACING_HZ = 45;

/**
 * lit: Q values Gough (2005) uses as representative of a real violin's
 * resonances when simulating vibrato-induced amplitude modulation.
 */
export const MODE_Q = { low: 10, typical: 30, high: 100, gough300HzExample: 60 };

/** lit: bridge hill, ~20 dB lift in bridge admittance (Euphonics 5.3). */
export const BRIDGE_HILL_HZ = 2300;

/**
 * measured: violin body + radiation envelope for the D4-B4 register, recovered
 * by taking every harmonic of every note, removing the 1/n source law, and
 * binning by ABSOLUTE frequency. dB relative to the fundamental's own band.
 * [hz, dB]. The h1 bands (317-449) are 0 by construction and carry no info.
 */
export const BODY_ENVELOPE_DB = [
  [635, -4.9],
  [713, -12.5],
  [800, -1.7],
  [898, -5.0],
  [1008, -5.3],
  [1131, -7.3],
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
  [5080, -15.1],
  [5702, -14.8],
  [6400, -21.7],
  [7184, -20.5],
  [8063, -26.7],
  [9051, -28.0],
  [10159, -28.7],
];

/**
 * measured: proof the envelope above is FIXED, not pitch-tracking. Mean body
 * level of whichever harmonic happens to land near each frequency, across
 * notes whose f0 spans 294-497 Hz. The harmonic NUMBER changes; the level
 * follows the FREQUENCY.
 */
export const FIXED_FORMANT_PROOF = [
  { nearHz: 700, harmonicNumbersUsed: [2], bodyDb: -12.8, sd: 6.6 },
  { nearHz: 1300, harmonicNumbersUsed: [3, 4], bodyDb: -7.7, sd: 4.9 },
  { nearHz: 2000, harmonicNumbersUsed: [4, 5, 6, 7], bodyDb: 2.2, sd: 8.0 },
  { nearHz: 2400, harmonicNumbersUsed: [5, 6, 7, 8], bodyDb: 1.7, sd: 6.1 },
  { nearHz: 3500, harmonicNumbersUsed: [7, 8, 9, 10, 11, 12], bodyDb: -2.9, sd: 6.9 },
];

// --- 3. the attack ---------------------------------------------------------

/**
 * lit: Guettler & Askenfelt (1997), as summarised by Woodhouse & Galluzzo
 * (2004): "Listeners have a narrow and well-defined 'acceptance band' for
 * transient length, around 50 ms." Lampis et al. (2024) treat <10 fundamental
 * periods as "musically acceptable" and >20 periods (~0.2 s) as a failed
 * attack. At D4 (294 Hz) 10 periods = 34 ms, 20 periods = 68 ms.
 */
export const PRE_HELMHOLTZ_MS = { acceptanceBand: 50, goodMax: 34, failAbove: 68 };

/**
 * measured: time for each harmonic to first reach -6 dB of its own steady
 * level, from true onset. The point is the SPREAD inside one note, not the
 * mean: harmonics do not arrive together and do not arrive in order.
 */
export const HARMONIC_ARRIVAL_MS = {
  median: 90,
  p10: 25,
  p90: 320,
  withinNoteSpreadRatio: 5, // 3:1 to 10:1 between fastest and slowest harmonic
};

/**
 * measured: non-harmonic energy fraction in successive 25 ms windows from
 * onset (25 ms Goertzel blocks are broad, hence the high floor - read the
 * DELTA). Onset is ~1.13x the steady value and settles within 50-75 ms.
 */
export const ONSET_NOISE_FRACTION = [1.0, 0.96, 0.91, 0.9, 0.89, 0.88, 0.88, 0.88];

/**
 * measured: `analyse().attackMs` (time to 90% of steady RMS) on real notes.
 * Real bowing keeps swelling long after Helmholtz motion is established.
 */
export const ATTACK_MS = { realMedian: 315, realRange: [110, 900], rejectedBaseline: 40 };

// --- 4. sustain micro-fluctuation ------------------------------------------

/** lit: vibrato. Gough (2005) 4-6 Hz; Allen/Geringer/MacLeod (2009) 5.7 Hz in
 *  first position, 6.3 Hz in fifth; MacLeod et al. four soloists mean width
 *  63 cents peak-to-peak; 40 cents first position, 108 cents fifth. */
export const VIBRATO = { rateHz: [4.5, 6.5], widthCentsPeakToPeak: [40, 110], typicalWidthCents: 60 };

/**
 * lit: how much each PARTIAL's amplitude swings under vibrato. Meyer, quoted
 * by Gough (2005): typically 3-15 dB, sometimes exceeding 25 dB; Gough
 * measures modulation "as large as 100%" (partials pass through zero).
 * Mellody & Wakefield (2000): 15 dB AM depth is typical, and an AM-only
 * resynthesis is perceptually identical to the original while an FM-only one
 * is "flat and lifeless".
 */
export const PARTIAL_AM_DEPTH_DB = { typical: [3, 15], extreme: 25 };

/**
 * measured: per-harmonic amplitude modulation range (p5..p95, dB) during a
 * NON-VIBRATO sustained note. Even with the left hand still, bow noise and
 * bow-force micro-variation move every partial independently.
 * [median, p90] per harmonic h1..h16.
 */
export const HARMONIC_MOD_RANGE_DB = [
  [3.8, 11.3],
  [5.1, 15.1],
  [6.9, 12.9],
  [5.4, 20.6],
  [5.1, 15.4],
  [4.1, 12.0],
  [6.7, 15.8],
  [5.8, 22.3],
  [5.4, 18.2],
  [7.8, 20.9],
  [10.8, 25.4],
  [11.4, 28.7],
  [12.8, 28.3],
  [15.7, 27.2],
  [14.4, 28.1],
  [18.7, 35.9],
];
/** measured, same statistic on the rejected baseline: 0.8 (h1) to 4.5 (h16). */
export const BASELINE_MOD_RANGE_DB = [0.8, 1.6, 1.6, 1.8, 1.8, 1.9, 2.0, 2.2, 2.9, 3.0, 2.9, 3.6, 3.9, 3.7, 4.1, 4.1];

/**
 * measured: Pearson correlation between the dB envelopes of ADJACENT harmonics
 * over the sustain. THE decisive dynamic measure. A single oscillator through
 * one amplitude envelope forces this to ~1.0 by construction.
 */
export const NEIGHBOUR_CORRELATION = {
  realViolin: { p10: -0.37, median: 0.54, p90: 0.94, fractionBelowHalf: 0.47, fractionNegative: 0.24 },
  realTrumpet: { median: 0.71, fractionNegative: 0.19 },
  rejectedBaseline: { median: 0.92 },
  VIOLIN_MAX_MEDIAN: 0.7,
  VIOLIN_MIN_FRACTION_NEGATIVE: 0.15,
};

/** measured: f0 wander on a NON-vibrato sustained note, cents rms about the
 *  note mean. This is the jitter floor a candidate needs even with vibrato
 *  switched off. Peak-to-peak excursions reached 16 cents. */
export const PITCH_JITTER_CENTS = { rms: [3, 7], peakToPeak: 16 };

/** measured: `analyse().sustainWobblePct` on real notes vs the baseline. */
export const SUSTAIN_WOBBLE_PCT = { realMf: [6.5, 22], realFf: [5, 64], realMedian: 12, rejectedBaseline: 3.4 };

// --- 5. measures that do NOT discriminate ----------------------------------

/**
 * measured: these three `analyse()` outputs put the rejected baseline INSIDE
 * the real-violin range. Tuning them further is wasted effort - the failure is
 * elsewhere.
 */
export const NON_DISCRIMINATING = {
  centroidRatio: { real: [1.27, 2.23], realMedian: 1.8, rejectedBaseline: 1.65 },
  noiseRatio: { real: [0.34, 0.53], realMedian: 0.44, rejectedBaseline: 0.376 },
  onsetNoiseRatio: { real: [0.39, 0.68], realMedian: 0.51, rejectedBaseline: 0.391 },
};
