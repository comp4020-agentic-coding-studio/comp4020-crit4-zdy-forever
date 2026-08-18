// Per-hand gesture state machine: turns a stream of (shape, position, time)
// samples into wheel/play/toggle events. Pure and framerate-agnostic — it
// takes whatever samples it's given, so it's fully unit-testable without a
// camera, a video element, or MediaPipe itself.
import { clamp, sectorFromDisplacement } from "../music/mapping";
import type { HandShape } from "./gesture-classifier";

export interface HandSample {
  shape: HandShape;
  x: number;
  y: number;
  t: number; // ms
}

type Phase = "idle" | "following" | "locked";

export interface HandGestureState {
  phase: Phase;
  anchor: { x: number; y: number } | null;
  lockedAt: number | null;
  maxDisplacement: number;
  activeSector: number | null;
  missedFrames: number;
}

export const INITIAL_HAND_GESTURE_STATE: HandGestureState = {
  phase: "idle",
  anchor: null,
  lockedAt: null,
  maxDisplacement: 0,
  activeSector: null,
  missedFrames: 0,
};

export interface HandGestureConfig {
  /** Fist movement below this radius (normalized 0-1 image space) selects no sector. */
  deadZone: number;
  /** Radius at which expressive gain reaches its maximum. */
  activationRadius: number;
  /** OPEN->FIST->OPEN faster than this, with low displacement, is a mode toggle. */
  toggleMaxDurationMs: number;
  /** Displacement (from the lock anchor) below this still counts as "didn't move" for a toggle. */
  toggleMaxDisplacement: number;
  /** Consecutive unreadable/missing samples before the hand is treated as gone. */
  missedFrameLimit: number;
}

export const DEFAULT_HAND_GESTURE_CONFIG: HandGestureConfig = {
  deadZone: 0.035,
  activationRadius: 0.22,
  toggleMaxDurationMs: 700,
  toggleMaxDisplacement: 0.03,
  missedFrameLimit: 6,
};

export type HandGestureEvent =
  | { type: "wheel-show"; x: number; y: number }
  | { type: "wheel-move"; x: number; y: number }
  | { type: "wheel-lock"; x: number; y: number }
  | { type: "play"; sector: number; gain: number }
  | { type: "silence" }
  | { type: "toggle" }
  | { type: "wheel-hide" };

export interface HandGestureResult {
  state: HandGestureState;
  events: HandGestureEvent[];
}

function lockAt(x: number, y: number, t: number): HandGestureState {
  return {
    phase: "locked",
    anchor: { x, y },
    lockedAt: t,
    maxDisplacement: 0,
    activeSector: null,
    missedFrames: 0,
  };
}

function following(): HandGestureState {
  return {
    phase: "following",
    anchor: null,
    lockedAt: null,
    maxDisplacement: 0,
    activeSector: null,
    missedFrames: 0,
  };
}

/** Advances one hand's gesture state by a single sample. Never throws, never touches the DOM. */
export function stepHandGesture(
  state: HandGestureState,
  sample: HandSample,
  config: HandGestureConfig = DEFAULT_HAND_GESTURE_CONFIG,
): HandGestureResult {
  if (sample.shape === "unknown") {
    const missedFrames = state.missedFrames + 1;
    if (state.phase === "idle" || missedFrames < config.missedFrameLimit) {
      return { state: { ...state, missedFrames }, events: [] };
    }
    const events: HandGestureEvent[] = [];
    if (state.activeSector !== null) events.push({ type: "silence" });
    events.push({ type: "wheel-hide" });
    return { state: INITIAL_HAND_GESTURE_STATE, events };
  }

  if (sample.shape === "open") {
    if (state.phase === "locked") {
      const anchor = state.anchor as { x: number; y: number };
      const finalDisplacement = Math.max(
        state.maxDisplacement,
        Math.hypot(sample.x - anchor.x, sample.y - anchor.y),
      );
      const duration = state.lockedAt === null ? Infinity : sample.t - state.lockedAt;
      const events: HandGestureEvent[] = [];
      if (state.activeSector !== null) events.push({ type: "silence" });
      if (duration <= config.toggleMaxDurationMs && finalDisplacement <= config.toggleMaxDisplacement) {
        events.push({ type: "toggle" });
      }
      events.push({ type: "wheel-move", x: sample.x, y: sample.y });
      return { state: following(), events };
    }
    if (state.phase === "following") {
      return { state, events: [{ type: "wheel-move", x: sample.x, y: sample.y }] };
    }
    return { state: following(), events: [{ type: "wheel-show", x: sample.x, y: sample.y }] };
  }

  // shape === "fist"
  if (state.phase !== "locked") {
    return { state: lockAt(sample.x, sample.y, sample.t), events: [{ type: "wheel-lock", x: sample.x, y: sample.y }] };
  }

  const anchor = state.anchor as { x: number; y: number };
  const dx = sample.x - anchor.x;
  const dy = sample.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  const maxDisplacement = Math.max(state.maxDisplacement, distance);
  const missedFrames = 0;

  if (distance <= config.deadZone) {
    const events: HandGestureEvent[] = state.activeSector !== null ? [{ type: "silence" }] : [];
    return { state: { ...state, maxDisplacement, activeSector: null, missedFrames }, events };
  }

  const sector = sectorFromDisplacement(dx, dy);
  const gain = clamp((distance - config.deadZone) / (config.activationRadius - config.deadZone), 0, 1);
  return {
    state: { ...state, maxDisplacement, activeSector: sector, missedFrames },
    events: [{ type: "play", sector, gain }],
  };
}
