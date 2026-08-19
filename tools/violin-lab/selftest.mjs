// Calibrates the analyser against signals whose answers are known, so a
// candidate is never tuned against a broken measure. The first version of
// analyse() compared one peak bin per harmonic against the summed energy of
// every bin, which scored a PURE SINE as 34% noise — a floor every candidate
// would have inherited. Run:  node tools/violin-lab/selftest.mjs

import { analyse, makeRng } from "./harness.mjs";

const SR = 48000;
const F0 = 293.66;
const HOLD = 2.5;
const LEN = Math.round((HOLD + 0.8) * SR);

function render(next) {
  const out = new Float32Array(LEN);
  for (let i = 0; i < LEN; i += 1) out[i] = next(i / SR, i);
  return out;
}

const rng = makeRng(7);

const CASES = [
  {
    label: "pure sine",
    expect: "noiseRatio ~0, centroidRatio ~1",
    samples: render((t) => 0.6 * Math.sin(2 * Math.PI * F0 * t)),
  },
  {
    label: "white noise",
    expect: "noiseRatio ~1",
    samples: render(() => 0.6 * (rng() * 2 - 1)),
  },
  {
    label: "sine + equal-power noise",
    expect: "noiseRatio ~0.5",
    samples: render((t) => 0.42 * Math.sin(2 * Math.PI * F0 * t) + 0.42 * (rng() * 2 - 1)),
  },
  {
    label: "ideal sawtooth (16 harmonics, 1/n)",
    expect: "noiseRatio ~0, harmonicsDb ~ -6dB/octave, matches the rejected patch",
    samples: render((t) => {
      let y = 0;
      for (let k = 1; k <= 16; k += 1) y += Math.sin(2 * Math.PI * F0 * k * t) / k;
      return 0.4 * y;
    }),
  },
  {
    label: "dead-flat sine (no modulation)",
    expect: "sustainWobblePct ~0",
    samples: render((t) => 0.6 * Math.sin(2 * Math.PI * F0 * t)),
  },
];

for (const { label, expect, samples } of CASES) {
  const m = analyse(samples, { sampleRate: SR, frequency: F0, holdSec: HOLD });
  console.log(`\n--- ${label}`);
  console.log(`    expect: ${expect}`);
  console.log(
    `    noiseRatio=${m.noiseRatio}  centroidRatio=${m.centroidRatio}  ` +
      `sustainWobblePct=${m.sustainWobblePct}  upperVsLowerDb=${m.upperVsLowerDb}`,
  );
  console.log(`    harmonicsDb=${m.harmonicsDb.slice(0, 8).join(", ")}`);
}
