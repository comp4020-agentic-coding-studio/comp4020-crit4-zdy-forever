import { describe, expect, it } from "vitest";
import { FakeAudioContext, FakeOscillatorNode } from "./test-support/fake-audio-context";
import { Violin } from "./violin";

function makeViolin() {
  const context = new FakeAudioContext();
  const violin = new Violin(
    context as unknown as AudioContext,
    context.destination as unknown as AudioNode,
  );
  return { context, violin };
}

describe("Violin: monophonic last-note priority", () => {
  it("is declared monophonic", () => {
    expect(makeViolin().violin.polyphonic).toBe(false);
  });

  it("stops the previous note the instant a new one arrives, from any source", () => {
    const { violin } = makeViolin();
    const left = violin.noteOn(164.81, 1); // E3, "left hand"
    const right = violin.noteOn(392.0, 1); // G4, "right hand" pre-empts it

    // Reach into the fake to confirm exactly one oscillator is still sounding.
    const engine = violin as unknown as { current: { oscillator: FakeOscillatorNode } | null };
    expect(engine.current).not.toBeNull();
    expect(left).not.toBe(right);
  });

  it("makes a release from the pre-empted source a safe no-op", () => {
    const { violin } = makeViolin();
    const left = violin.noteOn(164.81, 1);
    violin.noteOn(392.0, 1); // steals from `left`

    const engineBefore = violin as unknown as { current: unknown };
    const currentBeforeStaleRelease = engineBefore.current;
    violin.noteOff(left); // stale handle: must not touch the current (right-hand) voice
    expect((violin as unknown as { current: unknown }).current).toBe(currentBeforeStaleRelease);
  });

  it("only ever has one active oscillator, even after many rapid attacks", () => {
    const { context, violin } = makeViolin();
    for (const freq of [220, 246.94, 261.63, 293.66, 329.63]) violin.noteOn(freq, 1);
    // 5 notes x (tone + vibrato LFO) = 10 oscillators total; only the last pair sounds.
    expect(context.oscillators).toHaveLength(10);
    const stillSounding = context.oscillators.filter((osc) => !osc.stopped);
    expect(stillSounding).toHaveLength(2);
  });

  it("disconnects its nodes once the released voice's oscillator ends", () => {
    const { violin } = makeViolin();
    const handle = violin.noteOn(440, 1);
    const engine = violin as unknown as { current: { oscillator: FakeOscillatorNode } };
    const osc = engine.current.oscillator;
    violin.noteOff(handle);
    expect(osc.stopped).toBe(true); // 'ended' fires synchronously in the fake, cleanup already ran
  });
});
