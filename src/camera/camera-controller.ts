// Glue: turns HandTracker frames into MusicEngine calls and floating-wheel
// updates. Progressive enhancement only — every failure path here (no
// getUserMedia, permission denied, camera lost mid-session) falls back to
// silence plus a status message, never a crash, and never touches
// keyboard/mouse/touch input.
import type { MusicEngine } from "../music/state";
import type { Register } from "../music/tables";
import type { Wheel } from "../ui/wheel";
import {
  classifyHandShape,
  palmCenter,
  type PhysicalHand,
  physicalHandedness,
  registerForHand,
} from "./gesture-classifier";
import {
  type HandGestureState,
  INITIAL_HAND_GESTURE_STATE,
  stepHandGesture,
} from "./gesture-state-machine";
import { HandTracker, type TrackedHand } from "./hand-tracker";

const MIN_HAND_CONFIDENCE = 0.5;
const DEFAULT_REGISTER_FOR_HAND: Record<PhysicalHand, Register> = { left: "low", right: "high" };

export class CameraController {
  private tracker: HandTracker | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private active = false;
  private handStates: Record<PhysicalHand, HandGestureState> = {
    left: INITIAL_HAND_GESTURE_STATE,
    right: INITIAL_HAND_GESTURE_STATE,
  };
  private handRegister: Record<PhysicalHand, Register> = { ...DEFAULT_REGISTER_FOR_HAND };
  private anyLocked = false;

  constructor(
    private readonly engine: MusicEngine,
    private readonly wheels: Record<Register, Wheel>,
    private readonly layer: HTMLElement,
    private readonly statusEl: HTMLElement,
    private readonly onGesture: () => void,
    private readonly onLockChange: (anyLocked: boolean) => void,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  async enable(): Promise<boolean> {
    if (this.active) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.statusEl.textContent = "Camera isn't supported in this browser — keyboard, mouse, and touch still work.";
      return false;
    }

    this.statusEl.textContent = "Requesting camera…";
    const tracker = new HandTracker();
    this.tracker = tracker;
    try {
      const video = await tracker.start((hands) => this.onFrame(hands));
      if (this.tracker !== tracker) return false; // disabled while starting
      video.className = "camera-feed";
      this.videoEl = video;
      this.layer.prepend(video); // behind the two floating wheels, which are already siblings
      this.layer.classList.add("camera-layer-active");
      this.active = true;
      this.statusEl.textContent =
        "Camera on — open a palm to summon a wheel, make a fist to lock it and reach for a sector.";
      return true;
    } catch (error) {
      if (this.tracker === tracker) this.tracker = null;
      this.statusEl.textContent =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission denied — keyboard, mouse, and touch still work."
          : "Camera unavailable — keyboard, mouse, and touch still work.";
      return false;
    }
  }

  disable(): void {
    this.tracker?.stop();
    this.tracker = null;
    this.active = false;
    this.layer.classList.remove("camera-layer-active");
    this.videoEl?.remove();
    this.videoEl = null;
    this.resetHand("left");
    this.resetHand("right");
    this.statusEl.textContent = "";
  }

  private resetHand(hand: PhysicalHand): void {
    this.engine.release(`camera:${hand}`);
    const wheel = this.wheels[this.handRegister[hand]];
    wheel.setVisible(false);
    wheel.setActiveSector(null);
    wheel.setLocked(false);
    this.handStates[hand] = INITIAL_HAND_GESTURE_STATE;
    this.handRegister[hand] = DEFAULT_REGISTER_FOR_HAND[hand];
    this.updateLockState();
  }

  private onFrame(hands: TrackedHand[]): void {
    const seen = new Set<PhysicalHand>();
    const now = performance.now();
    const samples: { physical: PhysicalHand; shape: "open" | "fist" | "unknown"; x: number; y: number }[] = [];
    for (const hand of hands) {
      if (hand.confidence < MIN_HAND_CONFIDENCE || hand.landmarks.length < 21) continue;
      const physical = physicalHandedness(hand.handedness);
      if (seen.has(physical)) continue; // ignore a spurious second detection of the same physical hand
      seen.add(physical);
      const shape = classifyHandShape(hand.landmarks);
      const center = palmCenter(hand.landmarks);
      // MediaPipe reports normalized coordinates in the raw (unmirrored)
      // camera frame; the feed is mirrored on screen with CSS, so flip x to
      // keep the wheel under the hand the player sees, not the sensor sees.
      samples.push({ physical, shape, x: 1 - center.x, y: center.y });
    }
    for (const hand of ["left", "right"] as const) {
      if (!seen.has(hand)) samples.push({ physical: hand, shape: "unknown", x: 0, y: 0 });
    }

    const bothHandsVisible = seen.size === 2;
    for (const sample of samples) {
      // Only reconcile a hand's register when it was actually detected this
      // frame. MediaPipe drops a hand for a frame or two constantly (motion
      // blur, brief occlusion by the other hand) — if a *missing* hand were
      // reconciled too, it would momentarily look "alone" and get reassigned
      // to its solo default register, which collides with whatever the
      // other, still-visible hand already owns there. That collision made
      // both hands fight over one Wheel object: engine.attack still worked
      // for each hand independently, but only the last one applied each
      // frame won the shared wheel's visible/locked DOM state — exactly the
      // "one hand's wheel never shows, though it plays" symptom. A hand that
      // truly leaves is already handled by its own missed-frame countdown in
      // the gesture state machine, on its existing register.
      if (seen.has(sample.physical)) this.reconcileRegister(sample.physical, bothHandsVisible);
      this.applySample(sample.physical, { ...sample, t: now });
    }
    this.updateLockState();
  }

  /** Switches a hand's controlled register when hand-count changes what it should be,
   *  releasing/hiding whatever it held on the old register so nothing gets stuck. */
  private reconcileRegister(hand: PhysicalHand, bothHandsVisible: boolean): void {
    const next = registerForHand(hand, bothHandsVisible);
    const current = this.handRegister[hand];
    if (next === current) return;

    this.engine.release(`camera:${hand}`);
    const oldWheel = this.wheels[current];
    oldWheel.setVisible(false);
    oldWheel.setActiveSector(null);
    oldWheel.setLocked(false);
    this.handStates[hand] = INITIAL_HAND_GESTURE_STATE;
    this.handRegister[hand] = next;
  }

  private updateLockState(): void {
    const anyLocked = this.handStates.left.phase === "locked" || this.handStates.right.phase === "locked";
    if (anyLocked === this.anyLocked) return;
    this.anyLocked = anyLocked;
    this.onLockChange(anyLocked);
  }

  private applySample(hand: PhysicalHand, sample: { shape: "open" | "fist" | "unknown"; x: number; y: number; t: number }): void {
    const register = this.handRegister[hand];
    const source = `camera:${hand}`;
    const wheel = this.wheels[register];
    const result = stepHandGesture(this.handStates[hand], sample);
    this.handStates[hand] = result.state;
    wheel.setLocked(this.handStates[hand].phase === "locked");

    for (const event of result.events) {
      switch (event.type) {
        case "wheel-show":
        case "wheel-lock": {
          // wheel-lock fires whenever a fist is the very first thing seen
          // from idle — not only after an open palm's wheel-show — e.g. a
          // hand that timed out and reappears already curled into a fist,
          // with no intervening open-palm frame. Without this, the wheel
          // stayed hidden (never got its wheel-visible class) even though it
          // was locked and playing: tracking looked dead when it wasn't.
          this.onGesture();
          wheel.setVisible(true);
          this.placeWheel(wheel, event.x, event.y);
          break;
        }
        case "wheel-move": {
          this.placeWheel(wheel, event.x, event.y);
          break;
        }
        case "play": {
          this.onGesture();
          this.engine.attack(source, register, event.sector, event.gain);
          wheel.setActiveSector(event.sector);
          break;
        }
        case "silence": {
          this.engine.release(source);
          wheel.setActiveSector(null);
          break;
        }
        case "toggle": {
          this.onGesture();
          this.engine.toggleMode(register);
          break;
        }
        case "wheel-hide": {
          this.engine.release(source);
          wheel.setVisible(false);
          wheel.setActiveSector(null);
          break;
        }
      }
    }
  }

  private placeWheel(wheel: Wheel, normalizedX: number, normalizedY: number): void {
    const rect = this.layer.getBoundingClientRect();
    wheel.setPosition(normalizedX * rect.width, normalizedY * rect.height);
  }
}
