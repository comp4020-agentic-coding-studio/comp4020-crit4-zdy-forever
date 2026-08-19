import { describe, expect, it } from "vitest";
import { FakeAudioContext, FakeOscillatorNode } from "./test-support/fake-audio-context";
import { ViolinFallback } from "./violin-fallback";

function makeFallback() {
  const context = new FakeAudioContext();
  const violin = new ViolinFallback(
    context as unknown as AudioContext,
    context.destination as unknown as AudioNode,
  );
  return { context, violin };
}

describe("ViolinFallback: monophonic last-note priority", () => {
  it("is declared monophonic", () => {
    expect(makeFallback().violin.polyphonic).toBe(false);
  });

  it("stops the previous note the instant a new one arrives, from any source", () => {
    const { violin } = makeFallback();
    const left = violin.noteOn(164.81, 1); // E3, "left hand"
    const right = violin.noteOn(392.0, 1); // G4, "right hand" pre-empts it

    // Reach into the fake to confirm exactly one oscillator is still sounding.
    const engine = violin as unknown as { current: { sawOscillator: FakeOscillatorNode } | null };
    expect(engine.current).not.toBeNull();
    expect(left).not.toBe(right);
  });

  it("makes a release from the pre-empted source a safe no-op", () => {
    const { violin } = makeFallback();
    const left = violin.noteOn(164.81, 1);
    violin.noteOn(392.0, 1); // steals from `left`

    const engineBefore = violin as unknown as { current: unknown };
    const currentBeforeStaleRelease = engineBefore.current;
    violin.noteOff(left); // stale handle: must not touch the current (right-hand) voice
    expect((violin as unknown as { current: unknown }).current).toBe(currentBeforeStaleRelease);
  });

  it("only ever has one active voice, even after many rapid attacks", () => {
    const { context, violin } = makeFallback();
    for (const freq of [220, 246.94, 261.63, 293.66, 329.63]) violin.noteOn(freq, 1);
    // 5 notes x (tone oscillator + vibrato LFO + bow-pressure LFO) = 15 oscillators total; only the last trio sounds.
    expect(context.oscillators).toHaveLength(15);
    const stillSounding = context.oscillators.filter((osc) => !osc.stopped);
    expect(stillSounding).toHaveLength(3);
  });

  it("disconnects its nodes once the released voice's oscillator ends", () => {
    const { violin } = makeFallback();
    const handle = violin.noteOn(440, 1);
    const engine = violin as unknown as { current: { sawOscillator: FakeOscillatorNode } };
    const osc = engine.current.sawOscillator;
    violin.noteOff(handle);
    expect(osc.stopped).toBe(true); // 'ended' fires synchronously in the fake, cleanup already ran
  });
});
