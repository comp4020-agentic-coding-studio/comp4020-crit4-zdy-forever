// Aggregate the per-note measurements across the Iowa MIS violin samples:
//  - irregularity of the harmonic series
//  - independence of harmonic amplitude envelopes (neighbour correlation)
//  - the body's fixed spectral envelope, recovered by binning every measured
//    harmonic by its ABSOLUTE frequency across many different notes
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
  const on = peak * 0.1;
  const off = peak * 0.04;
  const notes = [];
  let start = -1;
  for (let i = 0; i < env.length; i += 1) {
    if (start < 0 && env[i] > on) start = i;
    else if (start >= 0 && env[i] < off) {
      if ((i - start) * win > 0.35 * sr) notes.push([start * win, i * win]);
      start = -1;
    }
  }
  if (start >= 0) notes.push([start * win, env.length * win]);
  return notes;
}

/** Harmonic-product-spectrum f0 with an FFT — robust against octave errors. */
function f0Fft(x, from, sr) {
  const size = 16384;
  const bins = spectrum(x, from, from + size * 2, size);
  const hz = sr / size;
  let best = 0;
  let bestScore = -Infinity;
  for (let f = 120; f < 1100; f += 0.25) {
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

const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));

const NH = 24;
const bodyBins = new Map(); // 1/6-octave bin -> array of dB-relative-to-note-h1
const allLevels = [];
const allCorr = [];
const allModRange = [];

for (const file of process.argv.slice(2)) {
  const { samples, sampleRate: sr } = readWavFloat32(file);
  for (const [a, b] of segment(samples, sr)) {
    if ((b - a) / sr < 1.3) continue;
    const sFrom = a + Math.round(0.4 * sr);
    const sTo = Math.min(b - Math.round(0.2 * sr), sFrom + Math.round(1.4 * sr));
    if (sTo - sFrom < sr * 0.6) continue;
    const f0 = f0Fft(samples, sFrom, sr);
    if (f0 < 250 || f0 > 1000) continue;

    const size = 8192;
    const hop = Math.round(0.02 * sr);
    const frames = [];
    for (let s = sFrom; s + size <= sTo; s += hop) {
      const bins = spectrum(samples, s, s + size, size);
      const hz = sr / size;
      const row = [];
      for (let k = 1; k <= NH; k += 1) {
        const c = Math.round((f0 * k) / hz);
        if (c + 3 >= bins.length) {
          row.push(0);
          continue;
        }
        let p = 0;
        for (let bb = c - 3; bb <= c + 3; bb += 1) p = Math.max(p, bins[bb] ?? 0);
        row.push(p);
      }
      frames.push(row);
    }
    if (frames.length < 10) continue;
    const mean = [];
    for (let k = 0; k < NH; k += 1) {
      const vals = frames.map((f) => f[k]);
      mean.push(Math.sqrt(vals.reduce((s, v) => s + v * v, 0) / vals.length));
    }
    const h1 = mean[0];
    if (!(h1 > 0)) continue;
    const lv = mean.map((v) => Number((db(v) - db(h1)).toFixed(1)));
    allLevels.push({ f0: Number(f0.toFixed(1)), lv });

    for (let k = 0; k < NH; k += 1) {
      const f = f0 * (k + 1);
      if (f > 12000) break;
      const bin = Math.round(6 * Math.log2(f / 100));
      if (!bodyBins.has(bin)) bodyBins.set(bin, []);
      // divide out the 1/n source law so what remains is the body/radiation shape
      bodyBins.get(bin).push(lv[k] + 20 * Math.log10(k + 1));
    }

    for (let k = 0; k + 1 < 16; k += 1) {
      const A = frames.map((f) => db(f[k]));
      const B = frames.map((f) => db(f[k + 1]));
      const ma = A.reduce((s, v) => s + v, 0) / A.length;
      const mb = B.reduce((s, v) => s + v, 0) / B.length;
      let num = 0;
      let da = 0;
      let dbb = 0;
      for (let i = 0; i < A.length; i += 1) {
        num += (A[i] - ma) * (B[i] - mb);
        da += (A[i] - ma) ** 2;
        dbb += (B[i] - mb) ** 2;
      }
      const c = num / Math.sqrt(Math.max(1e-12, da * dbb));
      if (Number.isFinite(c)) allCorr.push(c);
    }
    for (let k = 0; k < 16; k += 1) {
      const dbs = frames.map((f) => db(f[k])).sort((x, y) => x - y);
      allModRange.push({ h: k + 1, r: dbs[Math.floor(dbs.length * 0.95)] - dbs[Math.floor(dbs.length * 0.05)] });
    }
  }
}

function pct(arr, p) {
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

console.log(`notes analysed: ${allLevels.length}`);
console.log("\n--- per-note harmonic levels (dB re h1) ---");
for (const { f0, lv } of allLevels) console.log(`f0=${String(f0).padStart(6)}  ${lv.slice(0, 16).join(", ")}`);

// Irregularity: deviation of each harmonic from a 3-point running mean.
const irr = [];
const nonMono = [];
for (const { lv } of allLevels) {
  for (let k = 1; k < 15; k += 1) {
    const smooth = (lv[k - 1] + lv[k] + lv[k + 1]) / 3;
    irr.push(Math.abs(lv[k] - smooth));
  }
  for (let k = 1; k < 16; k += 1) if (lv[k] > lv[k - 1]) nonMono.push(lv[k] - lv[k - 1]);
}
console.log(`\nirregularity |h - 3pt smooth|: median ${pct(irr, 0.5).toFixed(1)} dB, p90 ${pct(irr, 0.9).toFixed(1)} dB, max ${Math.max(...irr).toFixed(1)} dB`);
console.log(`rises (h[k] > h[k-1]) per note: ${(nonMono.length / allLevels.length).toFixed(1)} of 15; median rise ${pct(nonMono, 0.5).toFixed(1)} dB, p90 ${pct(nonMono, 0.9).toFixed(1)} dB, max ${Math.max(...nonMono).toFixed(1)} dB`);

console.log("\n--- neighbour-harmonic envelope correlation (h1..h16) ---");
console.log(
  `n=${allCorr.length}  p10 ${pct(allCorr, 0.1).toFixed(2)}  median ${pct(allCorr, 0.5).toFixed(2)}  p90 ${pct(allCorr, 0.9).toFixed(2)}  fraction < 0.5: ${(allCorr.filter((c) => c < 0.5).length / allCorr.length).toFixed(2)}  fraction < 0: ${(allCorr.filter((c) => c < 0).length / allCorr.length).toFixed(2)}`,
);

console.log("\n--- per-harmonic amplitude modulation range (p5..p95, dB) ---");
for (let h = 1; h <= 16; h += 1) {
  const vals = allModRange.filter((v) => v.h === h).map((v) => v.r);
  console.log(`  h${String(h).padStart(2)}  median ${pct(vals, 0.5).toFixed(1)}  p90 ${pct(vals, 0.9).toFixed(1)}`);
}

console.log("\n--- recovered body/radiation envelope (harmonic level + 20log10(n), by absolute freq) ---");
const keys = [...bodyBins.keys()].sort((a, b) => a - b);
const ref = [];
for (const k of keys) {
  const v = bodyBins.get(k);
  if (v.length < 3) continue;
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  ref.push([Math.round(100 * 2 ** (k / 6)), Number(m.toFixed(1)), v.length]);
}
const maxv = Math.max(...ref.map((r) => r[1]));
for (const [f, v, n] of ref) console.log(`  ${String(f).padStart(6)} Hz  ${(v - maxv).toFixed(1)} dB  (n=${n})`);
