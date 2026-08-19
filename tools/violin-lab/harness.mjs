// Violin timbre lab. Four in-browser attempts at a bowed-string patch were
// each rejected by ear ("brass", "big brass", "synth", "electric guitar +
// synth"), and the loop of "edit -> rebuild -> ask the human to listen" is
// far too slow to converge on a perceptual target.
//
// So: candidates are written as PURE SAMPLE-LEVEL JAVASCRIPT with no Web
// Audio nodes at all. The exact same code runs here in Node (rendered to a
// WAV you can play immediately) and, once a winner is picked, inside an
// AudioWorkletProcessor in the browser. Nothing is re-implemented between
// the two, so what you hear in the WAV is what the page will make.
//
// Nothing in this directory ships: it is a bench, not part of the site.

import { writeFileSync } from "node:fs";

// --- candidate contract ---------------------------------------------------
//
// Each candidate module exports:
//   export const name  = "short-slug"
//   export const notes = "one paragraph: what technique this is and why it
//                         should read as a bowed string"
//   export function makeVoice({ sampleRate, frequency, velocity, rng }) {
//     return {
//       next(): number,      // ONE output sample, roughly -1..1
//       release(): void,     // begin the release tail
//       finished(): boolean, // true once fully silent (render may stop)
//     }
//   }
//
// `rng` is a seeded uniform [0,1) generator — use it instead of Math.random()
// so a re-render is bit-identical and a reviewer can reproduce the numbers.

/** Mulberry32: tiny, fast, decent-quality seeded PRNG. */
export function makeRng(seed = 0x9e3779b9) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- WAV output -----------------------------------------------------------

/** Writes mono 16-bit PCM. `samples` is a Float32Array in roughly -1..1. */
export function writeWav(path, samples, sampleRate = 48000) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // format = PCM
  buffer.writeUInt16LE(1, 22); // channels
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  writeFileSync(path, buffer);
  return path;
}

/** Peak-normalises in place to `target` (leaves silence alone). */
export function normalise(samples, target = 0.89) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak < 1e-6) return samples;
  const scale = target / peak;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
  return samples;
}

// --- rendering ------------------------------------------------------------

export const NOTE = {
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
};

/**
 * Renders one sustained note into a fresh buffer. Used both for listening and
 * as the analysis subject (a steady tone is what spectral measures assume).
 */
export function renderNote(makeVoice, { frequency, sampleRate = 48000, holdSec = 2.5, tailSec = 0.8, velocity = 0.9, seed = 1 }) {
  const total = Math.round((holdSec + tailSec) * sampleRate);
  const out = new Float32Array(total);
  const voice = makeVoice({ sampleRate, frequency, velocity, rng: makeRng(seed) });
  const releaseAt = Math.round(holdSec * sampleRate);
  for (let i = 0; i < total; i += 1) {
    if (i === releaseAt) voice.release();
    const s = voice.next();
    out[i] = Number.isFinite(s) ? s : 0;
  }
  return out;
}

/**
 * Renders a monophonic phrase with last-note-priority stealing, exactly like
 * the app's Violin: a new note starts while the previous one is still in its
 * release tail, so note-to-note transitions are audible. Transitions are a
 * large part of what identifies a bowed instrument, so a candidate that only
 * sounds right on a single sustained tone hasn't actually succeeded.
 */
export function renderPhrase(makeVoice, { sequence, sampleRate = 48000, noteSec = 0.55, tailSec = 1.2, velocity = 0.9, seed = 1 }) {
  const noteSamples = Math.round(noteSec * sampleRate);
  const total = noteSamples * sequence.length + Math.round(tailSec * sampleRate);
  const out = new Float32Array(total);
  const rng = makeRng(seed);
  let previous = null;

  for (let n = 0; n < sequence.length; n += 1) {
    const start = n * noteSamples;
    if (previous) previous.release();
    const voice = makeVoice({ sampleRate, frequency: sequence[n], velocity, rng });
    // The stolen voice keeps ringing into the new note's opening, the way the
    // app's STEAL_RELEASE tail does.
    if (previous) {
      const tail = previous;
      for (let i = start; i < total && !tail.finished(); i += 1) {
        const s = tail.next();
        out[i] += Number.isFinite(s) ? s : 0;
        if (i - start > sampleRate * 0.25) break;
      }
    }
    const end = n === sequence.length - 1 ? total : start + noteSamples;
    for (let i = start; i < end; i += 1) {
      const s = voice.next();
      out[i] += Number.isFinite(s) ? s : 0;
    }
    previous = voice;
  }
  return out;
}

/** Concatenates buffers with `gapSec` of silence between them. */
export function join(buffers, sampleRate = 48000, gapSec = 0.45) {
  const gap = Math.round(gapSec * sampleRate);
  const total = buffers.reduce((sum, b) => sum + b.length + gap, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const b of buffers) {
    out.set(b, at);
    at += b.length + gap;
  }
  return out;
}

// --- analysis -------------------------------------------------------------

/** In-place iterative radix-2 FFT. `re`/`im` must have power-of-two length. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Averaged magnitude spectrum (Hann-windowed, 50% overlap) over a region. */
export function spectrum(samples, from, to, size = 8192) {
  const bins = new Float64Array(size / 2);
  let frames = 0;
  for (let start = from; start + size <= to; start += size / 2) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i += 1) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
      re[i] = samples[start + i] * w;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k += 1) bins[k] += Math.hypot(re[k], im[k]);
    frames += 1;
  }
  if (frames > 0) for (let k = 0; k < bins.length; k += 1) bins[k] /= frames;
  return bins;
}

function db(x) {
  return 20 * Math.log10(Math.max(x, 1e-12));
}

function peakOf(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  return peak;
}

function rmsOver(samples, from, to) {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

/**
 * Objective measures for a sustained note. These do not decide whether
 * something "sounds like a violin" — only an ear does that — but they do
 * catch the specific failure modes the rejected attempts had: a spectrum
 * dominated by high harmonics (reads brassy/distorted), a perfectly steady
 * sustain (reads synthetic), and an instant clean attack (reads synthetic).
 */
export function analyse(samples, { sampleRate = 48000, frequency, holdSec = 2.5 } = {}) {
  const size = 8192;
  const steadyFrom = Math.round(0.6 * sampleRate);
  const steadyTo = Math.round((holdSec - 0.1) * sampleRate);
  const bins = spectrum(samples, steadyFrom, steadyTo, size);
  const hz = sampleRate / size;

  // A windowed sinusoid's energy is spread over its whole main lobe, not
  // concentrated in one bin, so a harmonic's contribution has to be
  // INTEGRATED over a band. Comparing a single peak bin against the summed
  // energy of every bin (the first version of this) made even a pure sine
  // measure as 34% "noise", which is nonsense and would have had every
  // candidate optimising against a constant.
  const halfWidth = Math.max(2, Math.min(4, Math.floor(frequency / hz / 3)));
  const harmonics = [];
  let harmonicEnergy = 0;
  for (let k = 1; k <= 20; k += 1) {
    const target = frequency * k;
    if (target > sampleRate / 2 - hz * (halfWidth + 1)) break;
    const centre = Math.round(target / hz);
    let peak = 0;
    let band = 0;
    for (let b = centre - halfWidth; b <= centre + halfWidth; b += 1) {
      const v = bins[b] ?? 0;
      peak = Math.max(peak, v);
      band += v * v;
    }
    harmonics.push(peak);
    harmonicEnergy += band;
  }

  let totalEnergy = 0;
  let weighted = 0;
  for (let b = 1; b < bins.length; b += 1) {
    totalEnergy += bins[b] * bins[b];
    weighted += b * hz * bins[b] * bins[b];
  }
  const centroid = totalEnergy > 0 ? weighted / totalEnergy : 0;
  const noiseRatio = totalEnergy > 0 ? Math.max(0, 1 - harmonicEnergy / totalEnergy) : 0;

  // Where the spectral weight sits: how much lives above harmonic 6 relative
  // to the fundamental. A violin is strong in 1-6; a brass/distorted-guitar
  // spectrum keeps a lot of level well above that.
  const h1 = harmonics[0] ?? 1e-12;
  const upperSum = harmonics.slice(6).reduce((s, v) => s + v * v, 0);
  const lowerSum = harmonics.slice(0, 6).reduce((s, v) => s + v * v, 0);

  // Sustain steadiness: RMS in short windows across the hold. A dead-flat
  // value is itself a synth tell; a real bow always breathes a little.
  const windows = [];
  const winLen = Math.round(0.05 * sampleRate);
  for (let s = steadyFrom; s + winLen < steadyTo; s += winLen) windows.push(rmsOver(samples, s, s + winLen));
  const meanRms = windows.reduce((a, b) => a + b, 0) / Math.max(1, windows.length);
  const varRms = windows.reduce((a, b) => a + (b - meanRms) ** 2, 0) / Math.max(1, windows.length);
  const sustainWobblePct = meanRms > 0 ? (Math.sqrt(varRms) / meanRms) * 100 : 0;

  // Attack: how long to reach 90% of the steady level, and how noisy the
  // onset is compared to the steady state.
  const steadyRms = meanRms;
  let riseSamples = 0;
  const step = Math.round(0.005 * sampleRate);
  for (let s = 0; s + step < steadyFrom; s += step) {
    if (rmsOver(samples, s, s + step) >= steadyRms * 0.9) {
      riseSamples = s;
      break;
    }
    riseSamples = s;
  }
  const onsetBins = spectrum(samples, 0, Math.min(size * 2, steadyFrom), size);
  let onsetHarmonic = 0;
  let onsetTotal = 0;
  for (let b = 1; b < onsetBins.length; b += 1) onsetTotal += onsetBins[b] * onsetBins[b];
  for (let k = 1; k <= 20; k += 1) {
    const centre = Math.round((frequency * k) / hz);
    if (centre >= onsetBins.length - halfWidth - 1) break;
    for (let b = centre - halfWidth; b <= centre + halfWidth; b += 1) {
      const v = onsetBins[b] ?? 0;
      onsetHarmonic += v * v;
    }
  }
  const onsetNoiseRatio = onsetTotal > 0 ? Math.max(0, 1 - onsetHarmonic / onsetTotal) : 0;

  return {
    frequency,
    harmonicsDb: harmonics.map((v) => Number((db(v) - db(h1)).toFixed(1))),
    centroidHz: Math.round(centroid),
    centroidRatio: Number((centroid / frequency).toFixed(2)),
    upperVsLowerDb: Number((db(Math.sqrt(upperSum)) - db(Math.sqrt(lowerSum))).toFixed(1)),
    noiseRatio: Number(noiseRatio.toFixed(3)),
    onsetNoiseRatio: Number(onsetNoiseRatio.toFixed(3)),
    sustainWobblePct: Number(sustainWobblePct.toFixed(1)),
    attackMs: Math.round((riseSamples / sampleRate) * 1000),
    peak: Number(peakOf(samples).toFixed(3)),
  };
}
