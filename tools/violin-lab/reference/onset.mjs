// Onset anatomy of real bowed notes: per-harmonic build-up times, noisiness of
// the first tens of ms, and how the spectral centroid evolves through the attack.
import { readFileSync } from "node:fs";
import { spectrum } from "../harness.mjs";

function readWavFloat32(path) {
  const b = readFileSync(path);
  let pos = 12;
  let data = null;
  let sampleRate = 48000;
  while (pos + 8 <= b.length) {
    const id = b.toString("ascii", pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") sampleRate = b.readUInt32LE(body + 4);
    else if (id === "data") data = b.subarray(body, body + size);
    pos = body + size + (size % 2);
  }
  const n = data.length / 4;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = data.readFloatLE(i * 4);
  return { samples: out, sampleRate };
}

function rms(x, from, to) {
  let s = 0;
  for (let i = from; i < to; i += 1) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

function segment(x, sr) {
  const win = Math.round(0.02 * sr);
  const env = [];
  for (let i = 0; i + win < x.length; i += win) env.push(rms(x, i, i + win));
  let peak = 0;
  for (const v of env) peak = Math.max(peak, v);
  const notes = [];
  let start = -1;
  for (let i = 0; i < env.length; i += 1) {
    if (start < 0 && env[i] > peak * 0.1) start = i;
    else if (start >= 0 && env[i] < peak * 0.04) {
      if ((i - start) * win > 0.35 * sr) notes.push([start * win, i * win]);
      start = -1;
    }
  }
  return notes;
}

function f0Fft(x, from, sr) {
  const size = 16384;
  const bins = spectrum(x, from, from + size * 2, size);
  const hz = sr / size;
  let best = 0;
  let bestScore = -Infinity;
  for (let f = 250; f < 1000; f += 0.25) {
    let score = 0;
    for (let k = 1; k <= 8; k += 1) {
      const c = Math.round((f * k) / hz);
      if (c + 2 >= bins.length) break;
      let p = 0;
      for (let b = c - 2; b <= c + 2; b += 1) p = Math.max(p, bins[b]);
      score += Math.log(Math.max(p, 1e-12));
    }
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

/** Goertzel magnitude of a short block at frequency f. */
function goertzel(x, from, len, sr, f) {
  const k = (2 * Math.PI * f) / sr;
  const c = 2 * Math.cos(k);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < len; i += 1) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1));
    const s0 = x[from + i] * w + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.hypot(s1 - s2 * Math.cos(k), s2 * Math.sin(k)) / len;
}

for (const file of process.argv.slice(2)) {
  const { samples: x, sampleRate: sr } = readWavFloat32(file);
  console.log(`\n########## ${file.split("/").pop()}`);
  const notes = segment(x, sr);
  for (const [a0, b] of notes.slice(0, 8)) {
    if ((b - a0) / sr < 1.3) continue;
    const f0 = f0Fft(x, a0 + Math.round(0.4 * sr), sr);
    if (f0 < 250 || f0 > 1000) continue;

    // true onset: walk back from a0 to where broadband RMS drops below 2% of steady
    const steady = rms(x, a0 + Math.round(0.5 * sr), a0 + Math.round(1.2 * sr));
    let onset = a0;
    const step = Math.round(0.002 * sr);
    for (let s = a0; s > a0 - Math.round(0.3 * sr) && s > step; s -= step) {
      if (rms(x, s - step, s) < steady * 0.02) {
        onset = s;
        break;
      }
      onset = s - step;
    }

    const block = Math.round(0.025 * sr); // 25 ms analysis block
    const hop = Math.round(0.005 * sr);
    const nH = 12;
    const steadyLev = [];
    for (let k = 1; k <= nH; k += 1) {
      let acc = 0;
      let cnt = 0;
      for (let s = onset + Math.round(0.6 * sr); s < onset + Math.round(1.2 * sr); s += block) {
        acc += goertzel(x, s, block, sr, f0 * k) ** 2;
        cnt += 1;
      }
      steadyLev.push(Math.sqrt(acc / cnt));
    }
    // time for each harmonic to first cross -6 dB of its steady level
    const t6 = [];
    for (let k = 1; k <= nH; k += 1) {
      let ms = -1;
      for (let s = onset; s < onset + Math.round(0.7 * sr); s += hop) {
        if (goertzel(x, s, block, sr, f0 * k) >= steadyLev[k - 1] * 0.5) {
          ms = ((s - onset) / sr) * 1000;
          break;
        }
      }
      t6.push(Math.round(ms));
    }
    // broadband rise: 10% -> 90% of steady rms
    let t10 = -1;
    let t90 = -1;
    for (let s = onset; s < onset + Math.round(1.0 * sr); s += hop) {
      const r = rms(x, s, s + block);
      if (t10 < 0 && r >= steady * 0.1) t10 = ((s - onset) / sr) * 1000;
      if (t90 < 0 && r >= steady * 0.9) {
        t90 = ((s - onset) / sr) * 1000;
        break;
      }
    }
    // harmonic-vs-total energy in successive 25 ms windows from the onset
    const hr = [];
    for (let w = 0; w < 8; w += 1) {
      const s = onset + w * block;
      let hsum = 0;
      for (let k = 1; k <= 20; k += 1) hsum += goertzel(x, s, block, sr, f0 * k) ** 2;
      const tot = rms(x, s, s + block) ** 2;
      hr.push(Number(Math.max(0, 1 - hsum / Math.max(tot, 1e-18)).toFixed(2)));
    }
    console.log(`\n f0=${f0.toFixed(1)} Hz  period=${(1000 / f0).toFixed(1)} ms`);
    console.log(`  broadband rise: 10%@${t10.toFixed(0)} ms, 90%@${t90.toFixed(0)} ms`);
    console.log(`  time to -6 dB of steady, h1..h12 (ms): ${t6.join(", ")}`);
    console.log(`  non-harmonic energy fraction in 25 ms windows from onset: ${hr.join(", ")}`);
  }
}
