// Renders every candidate in ./candidates to ./out/<name>.wav and prints the
// objective measures. Run:  node tools/violin-lab/render.mjs [name ...]
//
// Each WAV is: a sustained D4, a sustained A3 (low register), a sustained
// A4 (high register), then a played phrase — so one file exercises sustain
// timbre at three pitches plus note-to-note transitions.

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join as joinPath, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyse, join, NOTE, normalise, renderNote, renderPhrase, writeWav } from "./harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = joinPath(HERE, "candidates");
const OUT = joinPath(HERE, "out");
const SAMPLE_RATE = 48000;
const HOLD = 2.5;
const PHRASE = [NOTE.D4, NOTE.E4, NOTE.F4, NOTE.G4, NOTE.A4, NOTE.G4, NOTE.E4, NOTE.D4];

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
if (!existsSync(CANDIDATES)) mkdirSync(CANDIDATES, { recursive: true });

const only = process.argv.slice(2);
const files = readdirSync(CANDIDATES)
  .filter((f) => f.endsWith(".mjs"))
  .filter((f) => only.length === 0 || only.some((o) => f.includes(o)))
  .sort();

if (files.length === 0) {
  console.log("no candidates found in", CANDIDATES);
  process.exit(0);
}

for (const file of files) {
  const mod = await import(pathToFileURL(resolve(CANDIDATES, file)).href);
  const label = mod.name ?? file.replace(/\.mjs$/, "");
  let d4;
  try {
    d4 = renderNote(mod.makeVoice, { frequency: NOTE.D4, sampleRate: SAMPLE_RATE, holdSec: HOLD });
    const a3 = renderNote(mod.makeVoice, { frequency: NOTE.A3, sampleRate: SAMPLE_RATE, holdSec: HOLD, seed: 2 });
    const a4 = renderNote(mod.makeVoice, { frequency: NOTE.A4, sampleRate: SAMPLE_RATE, holdSec: HOLD, seed: 3 });
    const phrase = renderPhrase(mod.makeVoice, { sequence: PHRASE, sampleRate: SAMPLE_RATE, seed: 4 });
    const all = normalise(join([d4, a3, a4, phrase], SAMPLE_RATE));
    writeWav(joinPath(OUT, `${label}.wav`), all, SAMPLE_RATE);
  } catch (error) {
    console.log(`\n=== ${label} === RENDER FAILED: ${error.message}`);
    continue;
  }

  const measures = analyse(d4, { sampleRate: SAMPLE_RATE, frequency: NOTE.D4, holdSec: HOLD });
  console.log(`\n=== ${label} ===`);
  if (mod.notes) console.log(mod.notes.trim().replace(/\s+/g, " "));
  console.log(JSON.stringify(measures, null, 2));
}

console.log(`\nwrote ${files.length} file(s) to ${OUT}`);
