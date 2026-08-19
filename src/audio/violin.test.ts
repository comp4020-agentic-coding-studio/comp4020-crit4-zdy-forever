import { describe, expect, it } from "vitest";
import { FakeAudioContext } from "./test-support/fake-audio-context";
import { Violin } from "./violin";

// Violin is a thin main-thread shell around an AudioWorklet (the timbre lives
// in public/violin-worklet.js, exercised by violin-dsp.test.ts). What is worth
// testing here is the shell's contract, and specifically that everything still
// works when the worklet never arrives -- which is exactly the situation in
// jsdom, where there is no AudioWorkletNode. So these tests run the fallback
// path by construction.

function makeViolin() {
  const context = new FakeAudioContext();
  const violin = new Violin(
    context as unknown as AudioContext,
    context.destination as unknown as AudioNode,
  );
  return { context, violin };
}

describe("Violin: worklet shell", () => {
  it("is declared monophonic", () => {
    expect(makeViolin().violin.polyphonic).toBe(false);
  });

  it("reports that it is not using the worklet when the environment has none", () => {
    expect(makeViolin().violin.usingWorklet).toBe(false);
  });

  it("still makes sound with no AudioWorklet, by delegating to the fallback", () => {
    const { context, violin } = makeViolin();
    violin.noteOn(440, 1);
    // sawtooth + vibrato LFO + bow-pressure LFO
    expect(context.oscillators).toHaveLength(3);
    expect(context.oscillators.every((osc) => osc.started)).toBe(true);
  });

  it("keeps last-note priority through the fallback", () => {
    const { context, violin } = makeViolin();
    violin.noteOn(220, 1);
    violin.noteOn(330, 1);
    const stillSounding = context.oscillators.filter((osc) => !osc.stopped);
    expect(stillSounding).toHaveLength(3);
  });

  it("makes a release from a pre-empted source a safe no-op", () => {
    const { context, violin } = makeViolin();
    const stale = violin.noteOn(220, 1);
    violin.noteOn(330, 1); // steals from `stale`
    const soundingBefore = context.oscillators.filter((osc) => !osc.stopped).length;
    violin.noteOff(stale);
    expect(context.oscillators.filter((osc) => !osc.stopped)).toHaveLength(soundingBefore);
  });

  it("releases the current note on its own handle", () => {
    const { context, violin } = makeViolin();
    const handle = violin.noteOn(440, 1);
    violin.noteOff(handle);
    expect(context.oscillators.every((osc) => osc.stopped)).toBe(true);
  });

  it("silences everything on allNotesOff", () => {
    const { context, violin } = makeViolin();
    violin.noteOn(440, 1);
    violin.allNotesOff();
    expect(context.oscillators.every((osc) => osc.stopped)).toBe(true);
  });

  it("accepts a warm-up list before any worklet exists, without throwing", () => {
    const { violin } = makeViolin();
    expect(() => violin.warmUp([261.63, 293.66, 329.63])).not.toThrow();
  });
});
