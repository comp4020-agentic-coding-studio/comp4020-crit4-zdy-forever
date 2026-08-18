import { describe, expect, it } from "vitest";
import { getNotesForSector, sectorFromDisplacement } from "./mapping";
import { HIGH_CHORDS, HIGH_NOTES, LOW_CHORDS, LOW_NOTES } from "./tables";

describe("getNotesForSector", () => {
  it("plays the eight diatonic low-register notes in order", () => {
    LOW_NOTES.forEach((note, sector) => {
      expect(getNotesForSector("low", sector, "note")).toEqual([note]);
    });
  });

  it("plays the eight diatonic high-register notes in order", () => {
    HIGH_NOTES.forEach((note, sector) => {
      expect(getNotesForSector("high", sector, "note")).toEqual([note]);
    });
  });

  it("plays the matching triad in chord mode", () => {
    LOW_CHORDS.forEach((chord, sector) => {
      expect(getNotesForSector("low", sector, "chord")).toEqual(chord);
    });
    HIGH_CHORDS.forEach((chord, sector) => {
      expect(getNotesForSector("high", sector, "chord")).toEqual(chord);
    });
  });

  it("wraps out-of-range sectors onto the eight valid ones", () => {
    expect(getNotesForSector("low", 8, "note")).toEqual(["C3"]);
    expect(getNotesForSector("low", -1, "note")).toEqual(getNotesForSector("low", 7, "note"));
  });
});

describe("sectorFromDisplacement", () => {
  it("maps the four cardinal directions to N/E/S/W sectors", () => {
    expect(sectorFromDisplacement(0, -100)).toBe(0); // up = N
    expect(sectorFromDisplacement(100, 0)).toBe(2); // right = E
    expect(sectorFromDisplacement(0, 100)).toBe(4); // down = S
    expect(sectorFromDisplacement(-100, 0)).toBe(6); // left = W
  });

  it("maps the diagonals to NE/SE/SW/NW", () => {
    expect(sectorFromDisplacement(70, -70)).toBe(1);
    expect(sectorFromDisplacement(70, 70)).toBe(3);
    expect(sectorFromDisplacement(-70, 70)).toBe(5);
    expect(sectorFromDisplacement(-70, -70)).toBe(7);
  });

  it("is stable near a sector boundary", () => {
    // Just inside the N/NE boundary (22.5deg) should still read as N.
    const justInsideN = sectorFromDisplacement(Math.sin(0.3) * 100, -Math.cos(0.3) * 100);
    expect(justInsideN).toBe(0);
  });
});
