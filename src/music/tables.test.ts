import { describe, expect, it } from "vitest";
import { noteNameToMidi } from "../audio/note-utils";
import { HIGH_CHORDS, KEYBOARD_NOTE_MAP, HIGH_NOTES, LOW_CHORDS, LOW_NOTES, TOGGLE_KEY } from "./tables";

describe("chord tables", () => {
  it("builds a plain major (do-mi-so) triad on every sector's root, both registers", () => {
    for (const [notes, chords] of [
      [LOW_NOTES, LOW_CHORDS],
      [HIGH_NOTES, HIGH_CHORDS],
    ] as const) {
      chords.forEach((chord, sector) => {
        expect(chord[0]).toBe(notes[sector]);
        const [root, third, fifth] = chord.map(noteNameToMidi);
        expect(third - root).toBe(4);
        expect(fifth - root).toBe(7);
      });
    }
  });
});

describe("keyboard mapping", () => {
  it("maps exactly the 8 low-register keys to sectors 0-7", () => {
    const low = Object.entries(KEYBOARD_NOTE_MAP).filter(([, v]) => v.register === "low");
    expect(low.map(([k]) => k)).toEqual(["a", "s", "d", "f", "z", "x", "c", "v"]);
    expect(low.map(([, v]) => v.sector)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("maps exactly the 8 high-register keys to sectors 0-7", () => {
    const high = Object.entries(KEYBOARD_NOTE_MAP).filter(([, v]) => v.register === "high");
    expect(high.map(([k]) => k)).toEqual(["j", "k", "l", ";", "m", ",", ".", "/"]);
    expect(high.map(([, v]) => v.sector)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("assigns 1 to LOW and 0 to HIGH mode toggles", () => {
    expect(TOGGLE_KEY["1"]).toBe("low");
    expect(TOGGLE_KEY["0"]).toBe("high");
  });
});
