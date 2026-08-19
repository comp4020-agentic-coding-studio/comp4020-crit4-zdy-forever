import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAND_GESTURE_CONFIG,
  INITIAL_HAND_GESTURE_STATE,
  type HandGestureEvent,
  type HandGestureState,
  stepHandGesture,
} from "./gesture-state-machine";

function run(samples: { shape: "open" | "fist" | "unknown"; x: number; y: number; t: number }[]): {
  state: HandGestureState;
  eventsPerStep: HandGestureEvent[][];
} {
  let state = INITIAL_HAND_GESTURE_STATE;
  const eventsPerStep: HandGestureEvent[][] = [];
  for (const sample of samples) {
    const result = stepHandGesture(state, sample);
    state = result.state;
    eventsPerStep.push(result.events);
  }
  return { state, eventsPerStep };
}

describe("stepHandGesture: open palm shows and follows the wheel", () => {
  it("emits wheel-show the first time an open palm appears", () => {
    const { eventsPerStep } = run([{ shape: "open", x: 0.5, y: 0.5, t: 0 }]);
    expect(eventsPerStep[0]).toEqual([{ type: "wheel-show", x: 0.5, y: 0.5 }]);
  });

  it("emits wheel-move (not wheel-show again) while the palm stays open and moves", () => {
    const { eventsPerStep } = run([
      { shape: "open", x: 0.5, y: 0.5, t: 0 },
      { shape: "open", x: 0.55, y: 0.52, t: 16 },
    ]);
    expect(eventsPerStep[1]).toEqual([{ type: "wheel-move", x: 0.55, y: 0.52 }]);
  });
});

describe("stepHandGesture: fist locks the wheel and selects sectors", () => {
  it("locks at the fist's position", () => {
    const { eventsPerStep } = run([
      { shape: "open", x: 0.5, y: 0.5, t: 0 },
      { shape: "fist", x: 0.5, y: 0.5, t: 100 },
    ]);
    expect(eventsPerStep[1]).toEqual([{ type: "wheel-lock", x: 0.5, y: 0.5 }]);
  });

  it("selects no sector inside the dead zone", () => {
    const { eventsPerStep } = run([
      { shape: "fist", x: 0.5, y: 0.5, t: 0 },
      { shape: "fist", x: 0.51, y: 0.505, t: 16 }, // tiny move, inside dead zone
    ]);
    expect(eventsPerStep[1]).toEqual([]);
  });

  it("plays the north (up) sector when the fist moves straight up past the dead zone", () => {
    const { eventsPerStep } = run([
      { shape: "fist", x: 0.5, y: 0.5, t: 0 },
      { shape: "fist", x: 0.5, y: 0.3, t: 16 }, // up (screen y decreases)
    ]);
    expect(eventsPerStep[1]).toEqual([{ type: "play", sector: 0, gain: expect.any(Number) }]);
  });

  it("plays the east sector when the fist moves right", () => {
    const { eventsPerStep } = run([
      { shape: "fist", x: 0.5, y: 0.5, t: 0 },
      { shape: "fist", x: 0.7, y: 0.5, t: 16 },
    ]);
    const event = eventsPerStep[1][0];
    expect(event).toMatchObject({ type: "play", sector: 2 });
  });

  it("clamps expressive gain to [0, 1] even far past the activation radius", () => {
    const { eventsPerStep } = run([
      { shape: "fist", x: 0.5, y: 0.5, t: 0 },
      { shape: "fist", x: 0.5, y: 0, t: 16 }, // way past activationRadius
    ]);
    const event = eventsPerStep[1][0] as Extract<HandGestureEvent, { type: "play" }>;
    expect(event.gain).toBeLessThanOrEqual(1);
    expect(event.gain).toBeGreaterThan(0);
  });

  it("silences once the fist returns to the dead zone after playing", () => {
    const { eventsPerStep } = run([
      { shape: "fist", x: 0.5, y: 0.5, t: 0 },
      { shape: "fist", x: 0.5, y: 0.3, t: 16 }, // play
      { shape: "fist", x: 0.5, y: 0.5, t: 32 }, // back to center
    ]);
    expect(eventsPerStep[2]).toEqual([{ type: "silence" }]);
  });
});

describe("stepHandGesture: OPEN->FIST->OPEN disambiguation", () => {
  it("classifies a quick, stationary fist as a mode toggle", () => {
    const { eventsPerStep } = run([
      { shape: "open", x: 0.5, y: 0.5, t: 0 },
      { shape: "fist", x: 0.5, y: 0.5, t: 100 },
      { shape: "open", x: 0.505, y: 0.5, t: 300 }, // well under 600-800ms, negligible move
    ]);
    expect(eventsPerStep[2]).toContainEqual({ type: "toggle" });
  });

  it("does NOT toggle when the fist moved far enough to play a note first", () => {
    const { eventsPerStep } = run([
      { shape: "open", x: 0.5, y: 0.5, t: 0 },
      { shape: "fist", x: 0.5, y: 0.5, t: 100 },
      { shape: "fist", x: 0.5, y: 0.3, t: 200 }, // moved out to play a note
      { shape: "open", x: 0.5, y: 0.3, t: 260 }, // released quickly, but it moved
    ]);
    const toggleEvents = eventsPerStep[3].filter((event) => event.type === "toggle");
    expect(toggleEvents).toHaveLength(0);
    expect(eventsPerStep[3]).toContainEqual({ type: "silence" });
  });

  it("does NOT toggle when the fist was held too long, even with no movement", () => {
    const { eventsPerStep } = run([
      { shape: "open", x: 0.5, y: 0.5, t: 0 },
      { shape: "fist", x: 0.5, y: 0.5, t: 100 },
      { shape: "open", x: 0.5, y: 0.5, t: 1000 }, // held for 900ms, past the 700ms threshold
    ]);
    const toggleEvents = eventsPerStep[2].filter((event) => event.type === "toggle");
    expect(toggleEvents).toHaveLength(0);
  });

  it("returns to the following phase (wheel still visible) after a release", () => {
    const { state } = run([
      { shape: "open", x: 0.5, y: 0.5, t: 0 },
      { shape: "fist", x: 0.5, y: 0.5, t: 100 },
      { shape: "open", x: 0.5, y: 0.5, t: 300 },
    ]);
    expect(state.phase).toBe("following");
  });
});

describe("stepHandGesture: hand loss", () => {
  it("ignores brief unknown blips without hiding the wheel", () => {
    const { eventsPerStep, state } = run([
      { shape: "open", x: 0.5, y: 0.5, t: 0 },
      { shape: "unknown", x: 0.5, y: 0.5, t: 16 },
    ]);
    expect(eventsPerStep[1]).toEqual([]);
    expect(state.phase).toBe("following");
  });

  it("hides the wheel and silences once the hand has been missing past the grace period", () => {
    const samples: { shape: "open" | "fist" | "unknown"; x: number; y: number; t: number }[] = [
      { shape: "fist", x: 0.5, y: 0.3, t: 0 },
    ];
    // A handful of misses spread over exactly the grace window must NOT hide
    // the wheel yet — only the tick that actually crosses the threshold does.
    const step = 16;
    for (let t = step; t < DEFAULT_HAND_GESTURE_CONFIG.missingGraceMs; t += step) {
      samples.push({ shape: "unknown" as const, x: 0.5, y: 0.3, t });
    }
    const { eventsPerStep: beforeTimeout } = run(samples);
    expect(beforeTimeout.flat()).not.toContainEqual({ type: "wheel-hide" });

    samples.push({ shape: "unknown", x: 0.5, y: 0.3, t: DEFAULT_HAND_GESTURE_CONFIG.missingGraceMs + step });
    const { eventsPerStep, state } = run(samples);
    const lastEvents = eventsPerStep.at(-1) ?? [];
    expect(lastEvents).toContainEqual({ type: "wheel-hide" });
    expect(state.phase).toBe("idle");
  });

  it("tolerates the same total number of missed samples when they arrive slowly (irregular real-camera timing)", () => {
    // Real detectForVideo calls don't land on a fixed cadence — a machine
    // under load might only manage a handful of frames per second. The
    // timeout has to be about elapsed time, not sample count, or a slow
    // machine would hide the wheel far sooner (in wall-clock terms) than a
    // fast one.
    const samples: { shape: "open" | "fist" | "unknown"; x: number; y: number; t: number }[] = [
      { shape: "fist", x: 0.5, y: 0.3, t: 0 },
      { shape: "unknown", x: 0.5, y: 0.3, t: 100 },
      { shape: "unknown", x: 0.5, y: 0.3, t: 200 },
      { shape: "unknown", x: 0.5, y: 0.3, t: 300 }, // still under the 400ms grace period
    ];
    const { eventsPerStep, state } = run(samples);
    expect(eventsPerStep.flat()).not.toContainEqual({ type: "wheel-hide" });
    expect(state.phase).toBe("locked");
  });
});
