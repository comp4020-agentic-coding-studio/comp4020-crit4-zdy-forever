import { describe, expect, it } from "vitest";
import { midiToFrequency, noteNameToFrequency, noteNameToMidi } from "./note-utils";

describe("equal-temperament frequency calculation", () => {
  it("anchors A4 at exactly 440 Hz", () => {
    expect(noteNameToFrequency("A4")).toBe(440);
  });

  it("matches standard scientific-pitch MIDI numbers", () => {
    expect(noteNameToMidi("C4")).toBe(60);
    expect(noteNameToMidi("A4")).toBe(69);
    expect(noteNameToMidi("C3")).toBe(48);
  });

  it("doubles frequency exactly one octave up", () => {
    expect(noteNameToFrequency("C4")).toBeCloseTo(midiToFrequency(60), 6);
    expect(noteNameToFrequency("C5") / noteNameToFrequency("C4")).toBeCloseTo(2, 6);
    expect(noteNameToFrequency("C4") / noteNameToFrequency("C3")).toBeCloseTo(2, 6);
  });

  it("rejects anything that isn't a natural note name", () => {
    expect(() => noteNameToFrequency("C#4")).toThrow();
    expect(() => noteNameToFrequency("H4")).toThrow();
  });
});
