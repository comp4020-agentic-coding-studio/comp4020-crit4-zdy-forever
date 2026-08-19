// Assembles public/violin-worklet.js from the candidate the listener picked,
// VERBATIM. The whole point of the lab is that the WAV they auditioned and the
// sound the page makes come from the same code; retyping the DSB by hand into
// the app would throw that guarantee away. So this concatenates, with no
// reformatting:
//
//   1. the three primitives the candidate imports from dsp.mjs
//   2. the candidate itself, minus its one import line
//   3. the AudioWorkletProcessor glue (message handling, voice stealing)
//
// Regenerate with:  node tools/violin-lab/build-worklet.mjs
// Verify with:      node tools/violin-lab/verify-worklet.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const CANDIDATE = join(HERE, "candidates", "8-spectral-bite.mjs");
const DSP = join(HERE, "dsp.mjs");
const TARGET = join(ROOT, "public", "violin-worklet.js");

const NEEDED = ["Biquad", "DcBlock", "PinkNoise"];

/** Pulls `class <name> { ... }` out of a source file by matching braces. */
function extractClass(source, name) {
  const start = source.indexOf(`export class ${name} {`);
  if (start < 0) throw new Error(`class ${name} not found in dsp.mjs`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1).replace(/^export /, "");
    }
  }
  throw new Error(`unbalanced braces reading class ${name}`);
}

const dspSource = readFileSync(DSP, "utf8");
const primitives = NEEDED.map((n) => extractClass(dspSource, n)).join("\n\n");

let candidate = readFileSync(CANDIDATE, "utf8");
const importLine = /^import \{[^}]*\} from "\.\.\/dsp\.mjs";\n/m;
if (!importLine.test(candidate)) throw new Error("candidate's dsp.mjs import line not found");
candidate = candidate.replace(importLine, "");
if (/\bfrom "/.test(candidate)) throw new Error("candidate still has an import; the worklet must be self-contained");

const renamed = candidate.replace("export function makeVoice({", "export function makeViolinVoice({");
if (renamed === candidate) throw new Error("makeVoice entry point not found");
// Only code matters here; the candidate's comments mention makeVoice by name
// (including its porting note about warming the calibration cache) and
// rewriting prose would be a pointless diff against the audited source.
const codeOnly = renamed.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
if (/\bmakeVoice\b/.test(codeOnly)) throw new Error("a stray reference to makeVoice survived the rename");

const glue = `
// ---------------------------------------------------------------------------
// AudioWorklet glue. The instrument is monophonic, so ONE persistent node
// serves the whole Violin: note-on/note-off arrive as messages and the
// processor owns voice stealing, exactly as the lab's phrase renderer did.
// ---------------------------------------------------------------------------

/** Mulberry32, matching the lab's harness so a note is reproducible. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stolen voices keep ringing while they release; more than this many at once
 *  can only come from an input storm, and dropping the oldest is inaudible. */
const MAX_TAILS = 4;

// Guarded so this file is also a plain ES module Node and Vitest can import
// for testing -- AudioWorkletProcessor exists only on the audio thread.
if (typeof AudioWorkletProcessor !== "undefined") {
  class ViolinProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.voice = null;
      this.tails = [];
      this.generation = -1;
      this.seed = 0x2f6e2b1;
      this.warmQueue = [];
      this.port.onmessage = (event) => this.handle(event.data);
    }

    handle(message) {
      if (!message) return;
      if (message.type === "warm") {
        // The residual path calibrates itself the first time it sees a pitch,
        // which costs ~1 ms -- most of a 2.67 ms render quantum, so paying it
        // during a note-on would risk a dropout on the very first note. The
        // main thread sends the pitches its note tables can produce and we
        // pre-build (and discard) a voice for each while idle.
        this.warmQueue = Array.isArray(message.frequencies) ? message.frequencies.slice() : [];
      } else if (message.type === "noteOn") {
        if (this.voice) {
          this.voice.release();
          this.tails.push(this.voice);
          if (this.tails.length > MAX_TAILS) this.tails.shift();
        }
        this.seed = (this.seed + 0x9e3779b9) >>> 0;
        this.voice = makeViolinVoice({
          sampleRate,
          frequency: message.frequency,
          velocity: message.velocity,
          rng: makeRng(this.seed),
        });
        this.generation = message.generation;
      } else if (message.type === "noteOff") {
        // A handle from a voice that has since been stolen must be inert, so
        // the release only lands if the generation still matches.
        if (message.generation === this.generation && this.voice) {
          this.voice.release();
          this.tails.push(this.voice);
          if (this.tails.length > MAX_TAILS) this.tails.shift();
          this.voice = null;
        }
      } else if (message.type === "allOff") {
        if (this.voice) {
          this.voice.release();
          this.tails.push(this.voice);
          this.voice = null;
        }
        for (const tail of this.tails) tail.release();
      }
    }

    process(_inputs, outputs) {
      const output = outputs[0];
      if (!output || output.length === 0) return true;
      const channel = output[0];
      channel.fill(0);

      // Warm exactly one pitch per quantum, and only while nothing is
      // sounding: one calibration fits inside a quantum, a batch would not.
      if (this.warmQueue.length > 0 && !this.voice && this.tails.length === 0) {
        const frequency = this.warmQueue.pop();
        makeViolinVoice({ sampleRate, frequency, velocity: 1, rng: makeRng(1) });
        return true;
      }

      if (this.voice) {
        for (let i = 0; i < channel.length; i += 1) {
          const s = this.voice.next();
          channel[i] += Number.isFinite(s) ? s : 0;
        }
        if (this.voice.finished()) this.voice = null;
      }

      if (this.tails.length > 0) {
        for (let t = this.tails.length - 1; t >= 0; t -= 1) {
          const tail = this.tails[t];
          for (let i = 0; i < channel.length; i += 1) {
            const s = tail.next();
            channel[i] += Number.isFinite(s) ? s : 0;
          }
          if (tail.finished()) this.tails.splice(t, 1);
        }
      }

      for (let c = 1; c < output.length; c += 1) output[c].set(channel);
      return true; // persistent node: stays alive between notes
    }
  }

  registerProcessor("violin-voice", ViolinProcessor);
}
`;

const header = `// GENERATED FILE -- do not edit by hand.
//
// Assembled by tools/violin-lab/build-worklet.mjs from
// tools/violin-lab/candidates/8-spectral-bite.mjs, which is the candidate the
// listener picked after auditioning eight rendered WAVs. The DSP below is
// byte-for-byte the code that produced the audio they approved; only the
// import line was removed and the entry point renamed. Regenerate rather than
// editing, and re-run tools/violin-lab/verify-worklet.mjs afterwards.
//
// Lives in public/ so Vite copies it verbatim: an AudioWorklet module is
// loaded by URL at runtime, not bundled, and public/ is the one place whose
// paths behave identically in dev and under a GitHub Pages sub-path.

`;

writeFileSync(
  TARGET,
  `${header}/* --- primitives, verbatim from tools/violin-lab/dsp.mjs --- */\n\n${primitives}\n\n/* --- candidate 8-spectral-bite, verbatim --- */\n\n${renamed}\n${glue}`,
);

console.log(`wrote ${TARGET}`);
