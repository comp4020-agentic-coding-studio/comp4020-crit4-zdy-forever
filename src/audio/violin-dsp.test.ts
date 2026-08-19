import { describe, expect, it } from "vitest";
import { makeViolinVoice } from "../../public/violin-worklet.js";

// The violin's actual timbre is sample-level DSP running on the audio thread,
// so it is testable the way DSP should be: render samples and assert on them.
// No AudioContext, no mocking. These guard the properties that would make the
// instrument unusable rather than merely wrong-sounding -- silence, NaN, a
// runaway that clips, a note that never stops. Whether it *sounds* like a
// violin is settled by ear against tools/violin-lab's rendered WAVs, and that
// the shipped file still matches the approved candidate is settled by
// tools/violin-lab/verify-worklet.mjs.

const SAMPLE_RATE = 48000;
// C3 and C6 bracket the two registers' note tables with room to spare.
const PITCHES = [130.81, 196.0, 261.63, 440.0, 1046.5];

function makeRng(seed = 12345) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function render(frequency: number, seconds: number, releaseAfter?: number) {
  const total = Math.round(seconds * SAMPLE_RATE);
  const releaseAt = releaseAfter === undefined ? -1 : Math.round(releaseAfter * SAMPLE_RATE);
  const voice = makeViolinVoice({ sampleRate: SAMPLE_RATE, frequency, velocity: 0.9, rng: makeRng() });
  const out = new Float32Array(total);
  let finishedAt = -1;
  for (let i = 0; i < total; i += 1) {
    if (i === releaseAt) voice.release();
    out[i] = voice.next();
    if (finishedAt < 0 && voice.finished()) finishedAt = i;
  }
  return { out, finishedAt };
}

function stats(samples: Float32Array, from = 0, to = samples.length) {
  let peak = 0;
  let sum = 0;
  let nonFinite = 0;
  for (let i = from; i < to; i += 1) {
    const s = samples[i];
    if (!Number.isFinite(s)) {
      nonFinite += 1;
      continue;
    }
    peak = Math.max(peak, Math.abs(s));
    sum += s;
  }
  return { peak, dc: sum / Math.max(1, to - from), nonFinite };
}

describe("violin worklet DSP", () => {
  it.each(PITCHES)("renders a usable signal at %d Hz", (frequency) => {
    const { out } = render(frequency, 2.0);
    const { peak, dc, nonFinite } = stats(out);
    expect(nonFinite).toBe(0);
    expect(peak).toBeGreaterThan(0.05); // audible
    expect(peak).toBeLessThan(2); // nothing runs away
    expect(Math.abs(dc)).toBeLessThan(0.01); // no DC offset to thump the speakers
  });

  it("does not diverge over a long hold", () => {
    const { out } = render(261.63, 8);
    const early = stats(out, SAMPLE_RATE, 2 * SAMPLE_RATE);
    const late = stats(out, 6 * SAMPLE_RATE, 7 * SAMPLE_RATE);
    expect(late.nonFinite).toBe(0);
    // A feedback bug shows up as steady growth; bowing should hold its level.
    expect(late.peak).toBeLessThan(early.peak * 3);
    expect(late.peak).toBeGreaterThan(early.peak * 0.2);
  });

  it.each(PITCHES)("decays to silence after release at %d Hz, and reports itself finished", (frequency) => {
    const releaseAt = 1.5;
    const { out, finishedAt } = render(frequency, 4, releaseAt);
    const afterRelease = (finishedAt - releaseAt * SAMPLE_RATE) / SAMPLE_RATE;

    expect(finishedAt).toBeGreaterThan(releaseAt * SAMPLE_RATE);
    // Measured at ~1.03 s across the whole range. A voice that never finishes
    // is worse than a wrong timbre: the processor would hold it forever.
    expect(afterRelease).toBeLessThan(1.2);

    // Audibility goes long before `finished()` does (~0.5 s), and that is the
    // number a player actually hears.
    const stillAudible = stats(out, Math.round((releaseAt + 0.8) * SAMPLE_RATE));
    expect(stillAudible.peak).toBeLessThan(0.005);
  });

  it("is deterministic for a given seed, so a rendered audition is reproducible", () => {
    const a = render(293.66, 0.5).out;
    const b = render(293.66, 0.5).out;
    expect(Array.from(a.slice(0, 2000))).toEqual(Array.from(b.slice(0, 2000)));
  });

  it("varies with velocity", () => {
    const soft = makeViolinVoice({ sampleRate: SAMPLE_RATE, frequency: 440, velocity: 0.2, rng: makeRng() });
    const loud = makeViolinVoice({ sampleRate: SAMPLE_RATE, frequency: 440, velocity: 1, rng: makeRng() });
    let softPeak = 0;
    let loudPeak = 0;
    for (let i = 0; i < SAMPLE_RATE; i += 1) {
      softPeak = Math.max(softPeak, Math.abs(soft.next()));
      loudPeak = Math.max(loudPeak, Math.abs(loud.next()));
    }
    expect(loudPeak).toBeGreaterThan(softPeak);
  });
});
