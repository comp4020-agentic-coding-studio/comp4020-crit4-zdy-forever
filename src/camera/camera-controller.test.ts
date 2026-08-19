import { describe, expect, it } from "vitest";
import type { Register } from "../music/tables";
import { CameraController } from "./camera-controller";
import type { TrackedHand } from "./hand-tracker";

// CameraController glues MediaPipe frames to wheel/engine calls, and every
// bug found here so far (register collisions between two hands, a wheel
// stuck invisible after re-tracking) was invisible to gesture-state-machine's
// tests, because those only exercise one hand's pure state transitions. This
// file drives the actual controller with a fake camera feed instead.

const MCP_DIST = [0.3, 0.32, 0.3, 0.26] as const;
const FINGER_JOINTS: [mcp: number, tip: number][] = [
  [5, 8],
  [9, 12],
  [13, 16],
  [17, 20],
];

function landmarks(extended: readonly boolean[]): { x: number; y: number }[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  FINGER_JOINTS.forEach(([mcp, tip], index) => {
    const d = MCP_DIST[index];
    points[mcp] = { x: 0.5 + d, y: 0.5 };
    points[tip] = { x: 0.5 + d * (extended[index] ? 2 : 1), y: 0.5 };
  });
  return points;
}
const OPEN = landmarks([true, true, true, true]);
const FIST = landmarks([false, false, false, false]);
const shift = (points: { x: number; y: number }[], dx: number, dy: number) =>
  points.map((p) => ({ x: p.x + dx, y: p.y + dy }));

function hand(handedness: "Left" | "Right", points: { x: number; y: number }[]): TrackedHand {
  return { handedness, confidence: 0.9, landmarks: points };
}

function fakeWheel() {
  const calls: string[] = [];
  return {
    calls,
    setVisible: (v: boolean) => calls.push(`setVisible(${v})`),
    setPosition: () => calls.push("setPosition"),
    setLocked: (v: boolean) => calls.push(`setLocked(${v})`),
    setActiveSector: (s: number | null) => calls.push(`setActiveSector(${s})`),
  };
}

function setup() {
  const low = fakeWheel();
  const high = fakeWheel();
  const engineCalls: string[] = [];
  const engine = {
    attack: (...args: unknown[]) => engineCalls.push(`attack(${args.join(",")})`),
    release: (...args: unknown[]) => engineCalls.push(`release(${args.join(",")})`),
    toggleMode: () => engineCalls.push("toggleMode"),
  };
  const layer = { getBoundingClientRect: () => ({ width: 800, height: 600 }) } as HTMLElement;
  const statusEl = { textContent: "" } as HTMLElement;
  const locks: boolean[] = [];
  const wheels = { low, high } as unknown as Record<Register, ReturnType<typeof fakeWheel>>;
  const controller = new CameraController(
    engine as never, // minimal fake: only the methods CameraController calls
    wheels as never,
    layer,
    statusEl,
    () => {},
    (locked) => locks.push(locked),
  );
  const onFrame = (controller as unknown as { onFrame: (hands: TrackedHand[]) => void }).onFrame.bind(controller);
  return { low, high, engineCalls, locks, onFrame };
}

describe("CameraController: two hands don't collide on register", () => {
  it("keeps each hand's own wheel visible when the OTHER hand drops a single frame", () => {
    // Regression: reconciling a hand's register even when it wasn't detected
    // this frame briefly reassigned it to the solo default, colliding with
    // whatever the other, still-visible hand already owned there.
    const { low, high, onFrame } = setup();

    onFrame([hand("Left", OPEN), hand("Right", OPEN)]);
    low.calls.length = 0;
    high.calls.length = 0;

    // Left hand drops for one frame; right hand is still tracked normally.
    onFrame([hand("Right", shift(OPEN, 0.01, 0))]);

    expect(high.calls).not.toContain("setVisible(false)");
    expect(low.calls).not.toContain("setVisible(false)");
  });
});

describe("CameraController: re-tracking after the wheel hides", () => {
  it("makes the wheel visible when the very first thing seen from idle is a fist, not an open palm", () => {
    // Regression: wheel-lock only repositioned the wheel, assuming a prior
    // wheel-show had already made it visible. A hand that timed out (wheel
    // hidden, state reset to idle — the same idle state a controller starts
    // in) and comes back already curled into a fist, with no intervening
    // open-palm frame, never got setVisible(true) called again: it stayed
    // invisible despite being locked and playing.
    const { high, onFrame } = setup();

    onFrame([hand("Right", shift(FIST, 0.1, 0))]);

    expect(high.calls).toContain("setVisible(true)");
    expect(high.calls).toContain("setLocked(true)");
  });
});
