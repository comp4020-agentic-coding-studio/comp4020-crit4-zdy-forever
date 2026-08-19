// Proves the shipped worklet makes the SAME sound as the candidate the
// listener approved. Renders both through the same harness and compares the
// output sample by sample -- a rename or a stray edit that changed the audio
// would otherwise be invisible until someone noticed the instrument sounded
// different again.
//
// Run:  node tools/violin-lab/verify-worklet.mjs

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyse, NOTE, renderNote } from "./harness.mjs";
import { makeVoice as candidateVoice } from "./candidates/8-spectral-bite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIPPED = join(HERE, "..", "..", "public", "violin-worklet.js");
const { makeViolinVoice } = await import(pathToFileURL(SHIPPED).href);

const SR = 48000;
const HOLD = 2.5;
const PITCHES = [130.81, 196.0, NOTE.D4, NOTE.A4, 1046.5];

let failures = 0;

for (const frequency of PITCHES) {
  const a = renderNote(candidateVoice, { frequency, sampleRate: SR, holdSec: HOLD });
  const b = renderNote(makeViolinVoice, { frequency, sampleRate: SR, holdSec: HOLD });

  let maxDiff = 0;
  for (let i = 0; i < a.length; i += 1) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));

  let bad = 0;
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < b.length; i += 1) {
    if (!Number.isFinite(b[i])) bad += 1;
    peak = Math.max(peak, Math.abs(b[i]));
    sum += b[i];
  }
  const dc = sum / b.length;

  const identical = maxDiff === 0;
  const clean = bad === 0 && peak > 0.05 && peak < 4 && Math.abs(dc) < 0.01;
  if (!identical || !clean) failures += 1;

  console.log(
    `${frequency.toFixed(2).padStart(8)} Hz  identical=${identical}  ` +
      `maxDiff=${maxDiff.toExponential(2)}  peak=${peak.toFixed(3)}  dc=${dc.toExponential(2)}  ` +
      `nonFinite=${bad}`,
  );
}

const measures = analyse(renderNote(makeViolinVoice, { frequency: NOTE.D4, sampleRate: SR, holdSec: HOLD }), {
  sampleRate: SR,
  frequency: NOTE.D4,
  holdSec: HOLD,
});
console.log("\nshipped worklet, D4:", JSON.stringify(measures));

if (failures > 0) {
  console.error(`\nFAIL: ${failures} pitch(es) differ from the approved candidate or render badly.`);
  process.exit(1);
}
console.log("\nOK: shipped worklet is sample-identical to the approved candidate at every pitch tested.");
