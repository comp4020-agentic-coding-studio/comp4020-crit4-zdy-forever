import { describe, expect, it } from "vitest";
import { KEYBOARD_NOTE_MAP, TOGGLE_KEY } from "./tables";

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
