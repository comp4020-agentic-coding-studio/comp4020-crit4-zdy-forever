import { describe, expect, it } from "vitest";
import { Piano } from "./piano";
import { FakeAudioContext } from "./test-support/fake-audio-context";

function makePiano() {
  const context = new FakeAudioContext();
  const piano = new Piano(
    context as unknown as AudioContext,
    context.destination as unknown as AudioNode,
  );
  return { context, piano };
}

describe("Piano: polyphony and cleanup", () => {
  it("is declared polyphonic", () => {
    expect(makePiano().piano.polyphonic).toBe(true);
  });

  it("lets many notes sound at once, independently releasable", () => {
    const { piano } = makePiano();
    const handles = [261.63, 329.63, 392.0].map((f) => piano.noteOn(f, 1));
    // Distinct handles, and releasing one must not throw or affect the rest.
    expect(new Set(handles).size).toBe(3);
    expect(() => piano.noteOff(handles[1])).not.toThrow();
  });

  it("stops every oscillator a voice owns once released", () => {
    const { context, piano } = makePiano();
    const before = context.oscillators.length;
    const handle = piano.noteOn(440, 1);
    const created = context.oscillators.slice(before);
    expect(created.length).toBeGreaterThan(1); // multiple harmonics per voice
    piano.noteOff(handle);
    expect(created.every((osc) => osc.stopped)).toBe(true);
  });

  it("ignores a second release of the same handle instead of double-stopping", () => {
    const { piano } = makePiano();
    const handle = piano.noteOn(440, 1);
    piano.noteOff(handle);
    expect(() => piano.noteOff(handle)).not.toThrow();
  });

  it("allNotesOff silences every currently held voice", () => {
    const { context, piano } = makePiano();
    piano.noteOn(261.63, 1);
    piano.noteOn(329.63, 1);
    piano.allNotesOff();
    expect(context.oscillators.every((osc) => osc.stopped)).toBe(true);
  });
});
