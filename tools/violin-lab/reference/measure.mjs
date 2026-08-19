// Measure real violin recordings with the SAME analysis the violin lab uses,
// so the numbers are directly comparable to the lab's baseline measures.
import { readFileSync } from "node:fs";
import { analyse, spectrum } from "../harness.mjs";

function readWavFloat32(path) {
  const b = readFileSync(path);
  if (b.toString("ascii", 0, 4) !== "RIFF") throw new Error("not RIFF");
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString("ascii", pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = {
        format: b.readUInt16LE(body),
        channels: b.readUInt16LE(body + 2),
        sampleRate: b.readUInt32LE(body + 4),
        bits: b.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      data = b.subarray(body, body + size);
    }
    pos = body + size + (size % 2);
  }
  const n = data.length / 4;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = data.readFloatLE(i * 4);
  return { samples: out, sampleRate: fmt.sampleRate };
}

function rms(x, from, to) {
  let s = 0;
  for (let i = from; i < to; i += 1) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Split into notes on an RMS envelope. */
function segment(x, sr) {
  const win = Math.round(0.02 * sr);
  const env = [];
  for (let i = 0; i + win < x.length; i += win) env.push(rms(x, i, i + win));
  let peak = 0;
  for (const v of env) peak = Math.max(peak, v);
  const on = peak * 0.10;
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
  if (start >= 0 && (env.length - start) * win > 0.35 * sr) notes.push([start * win, env.length * win]);
  return notes;
}

/** Autocorrelation f0 over a window. */
function estimateF0(x, from, to, sr, lo = 120, hi = 1200) {
  const n = Math.min(to - from, Math.round(0.15 * sr));
  const minLag = Math.floor(sr / hi);
  const maxLag = Math.ceil(sr / lo);
  let best = minLag;
  let bestV = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let s = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i < n - maxLag; i += 1) {
      const a = x[from + i];
      const c = x[from + i + lag];
      s += a * c;
      e1 += a * a;
      e2 += c * c;
    }
    const v = s / Math.sqrt(Math.max(1e-12, e1 * e2));
    if (v > bestV) {
      bestV = v;
      best = lag;
    }
  }
  // parabolic refine
  return sr / best;
}

function db(v) {
  return 20 * Math.log10(Math.max(v, 1e-12));
}

/** Harmonic levels over the steady part, plus per-harmonic modulation depth. */
function harmonicTrack(x, from, to, sr, f0, nH = 20) {
  const size = 8192;
  const hop = Math.round(0.02 * sr);
  const frames = [];
  for (let s = from; s + size <= to; s += hop) {
    const bins = spectrum(x, s, s + size, size);
    const hz = sr / size;
    const row = [];
    for (let k = 1; k <= nH; k += 1) {
      const c = Math.round((f0 * k) / hz);
      if (c + 3 >= bins.length) {
        row.push(0);
        continue;
      }
      let p = 0;
      for (let b = c - 3; b <= c + 3; b += 1) p = Math.max(p, bins[b] ?? 0);
      row.push(p);
    }
    frames.push(row);
  }
  // mean level per harmonic (energy mean), and modulation range in dB
  const mean = [];
  const modRange = [];
  const modSd = [];
  for (let k = 0; k < nH; k += 1) {
    const vals = frames.map((f) => f[k]).filter((v) => v > 0);
    if (vals.length < 3) {
      mean.push(0);
      modRange.push(0);
      modSd.push(0);
      continue;
    }
    const m = Math.sqrt(vals.reduce((a, v) => a + v * v, 0) / vals.length);
    mean.push(m);
    const dbs = vals.map(db).sort((a, b) => a - b);
    const p05 = dbs[Math.floor(dbs.length * 0.05)];
    const p95 = dbs[Math.floor(dbs.length * 0.95)];
    modRange.push(p95 - p05);
    const mu = dbs.reduce((a, v) => a + v, 0) / dbs.length;
    modSd.push(Math.sqrt(dbs.reduce((a, v) => a + (v - mu) ** 2, 0) / dbs.length));
  }
  // correlation between consecutive-harmonic dB envelopes (lockstep test)
  const corr = [];
  for (let k = 0; k + 1 < nH; k += 1) {
    const a = frames.map((f) => db(f[k]));
    const b = frames.map((f) => db(f[k + 1]));
    if (mean[k] <= 0 || mean[k + 1] <= 0) {
      corr.push(NaN);
      continue;
    }
    const ma = a.reduce((s, v) => s + v, 0) / a.length;
    const mb = b.reduce((s, v) => s + v, 0) / b.length;
    let num = 0;
    let da = 0;
    let dbb = 0;
    for (let i = 0; i < a.length; i += 1) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      dbb += (b[i] - mb) ** 2;
    }
    corr.push(Number((num / Math.sqrt(Math.max(1e-12, da * dbb))).toFixed(2)));
  }
  const h1 = mean[0] || 1e-12;
  return {
    levelsDb: mean.map((v) => Number((db(v) - db(h1)).toFixed(1))),
    modRangeDb: modRange.map((v) => Number(v.toFixed(1))),
    modSdDb: modSd.map((v) => Number(v.toFixed(1))),
    neighbourCorr: corr,
  };
}

/** f0 track (cents relative to mean) for jitter / vibrato. */
function pitchTrack(x, from, to, sr, f0) {
  const win = Math.round(0.04 * sr);
  const hop = Math.round(0.01 * sr);
  const out = [];
  for (let s = from; s + win + Math.ceil(sr / (f0 * 0.7)) < to; s += hop) {
    const f = estimateF0(x, s, s + win, sr, f0 * 0.75, f0 * 1.35);
    out.push(f);
  }
  return out;
}

const files = process.argv.slice(2);
for (const file of files) {
  const { samples, sampleRate: sr } = readWavFloat32(file);
  const notes = segment(samples, sr);
  console.log(`\n########## ${file.split("/").pop()}  (${notes.length} notes, sr=${sr})`);
  for (let i = 0; i < notes.length; i += 1) {
    const [a, b] = notes[i];
    const dur = (b - a) / sr;
    if (dur < 0.8) continue;
    const f0 = estimateF0(samples, a + Math.round(0.3 * sr), b, sr);
    // steady region: skip first 0.35 s, stop 0.25 s before the end
    const sFrom = a + Math.round(0.35 * sr);
    const sTo = Math.min(b - Math.round(0.25 * sr), sFrom + Math.round(1.6 * sr));
    if (sTo - sFrom < sr * 0.5) continue;
    const h = harmonicTrack(samples, sFrom, sTo, sr, f0);
    const pt = pitchTrack(samples, sFrom, sTo, sr, f0);
    const meanF = pt.reduce((s2, v) => s2 + v, 0) / Math.max(1, pt.length);
    const cents = pt.map((v) => 1200 * Math.log2(v / meanF));
    const cmin = Math.min(...cents);
    const cmax = Math.max(...cents);
    const csd = Math.sqrt(cents.reduce((s2, v) => s2 + v * v, 0) / Math.max(1, cents.length));

    // envelope wobble + attack, using the lab's own analyse() on a copy
    const seg = samples.subarray(a - Math.min(a, Math.round(0.05 * sr)), b);
    const copy = new Float32Array(seg.length);
    copy.set(seg);
    let m = null;
    try {
      m = analyse(copy, { sampleRate: sr, frequency: f0, holdSec: Math.min(2.5, (b - a) / sr - 0.2) });
    } catch {
      m = null;
    }
    console.log(
      `\n--- note ${i}  f0=${f0.toFixed(1)} Hz  dur=${dur.toFixed(2)}s`,
    );
    console.log("  levelsDb h1..h20 :", JSON.stringify(h.levelsDb));
    console.log("  modRangeDb (p5-p95, per harmonic):", JSON.stringify(h.modRangeDb));
    console.log("  modSdDb    :", JSON.stringify(h.modSdDb));
    console.log("  neighbourCorr:", JSON.stringify(h.neighbourCorr));
    console.log(`  f0 excursion: ${cmin.toFixed(1)} .. ${cmax.toFixed(1)} cents, sd ${csd.toFixed(1)} cents`);
    if (m)
      console.log(
        `  centroidHz=${m.centroidHz} ratio=${m.centroidRatio} upperVsLowerDb=${m.upperVsLowerDb} noiseRatio=${m.noiseRatio} onsetNoise=${m.onsetNoiseRatio} wobble%=${m.sustainWobblePct} attackMs=${m.attackMs}`,
      );
  }
}
