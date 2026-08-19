// Wires the independent modules together: audio engine + instruments feed a
// MusicEngine, which every input controller (keyboard, pointer, camera) and
// every UI element (wheels, instrument selector) talks to. No module here
// owns synthesis, and no input controller talks to audio directly.
import { getAudioEngine } from "../audio/engine";
import type { Instrument } from "../audio/instrument";
import { noteNameToFrequency } from "../audio/note-utils";
import { Piano } from "../audio/piano";
import { Violin } from "../audio/violin";
import { CameraController } from "../camera/camera-controller";
import { createKeyboardController } from "../input/keyboard";
import { type InstrumentId, MusicEngine } from "../music/state";
import { HIGH_NOTES, LOW_NOTES } from "../music/tables";
import { Wheel } from "./wheel";

export function startApp(): void {
  const wheelsContainer = document.querySelector<HTMLDivElement>("#wheels");
  if (!wheelsContainer) return;

  const audio = getAudioEngine();
  const onGesture = (): void => audio.resume();

  const violin = new Violin(audio.context, audio.master);
  // Violin synthesis calibrates itself per pitch on first use, which is too
  // slow to do inside the render quantum that starts a note. It's monophonic
  // so it never plays a chord: the two note tables are every pitch it can
  // reach.
  violin.warmUp([...LOW_NOTES, ...HIGH_NOTES].map(noteNameToFrequency));

  const instruments: Record<InstrumentId, Instrument> = {
    piano: new Piano(audio.context, audio.master),
    violin,
  };
  const engine = new MusicEngine(instruments);

  const lowWheel = new Wheel({
    register: "low",
    caption: "LOW · C3–C4",
    engine,
    interactive: true,
    onGesture,
  });
  const highWheel = new Wheel({
    register: "high",
    caption: "HIGH · C4–C5",
    engine,
    interactive: true,
    onGesture,
  });
  wheelsContainer.append(lowWheel.element, highWheel.element);

  const applyInstrumentLock = (id: InstrumentId): void => {
    const locked = !instruments[id].polyphonic;
    lowWheel.setModeToggleDisabled(locked);
    highWheel.setModeToggleDisabled(locked);
  };
  applyInstrumentLock(engine.getInstrumentId());
  engine.on("instrumentchange", ({ instrument }) => applyInstrumentLock(instrument));

  createKeyboardController(engine, onGesture);

  const instrumentButtons = document.querySelectorAll<HTMLButtonElement>(
    ".instrument-select [data-instrument]",
  );
  for (const button of instrumentButtons) {
    button.addEventListener("click", () => {
      onGesture();
      const id = button.dataset.instrument as InstrumentId;
      engine.setInstrument(id);
      for (const other of instrumentButtons) {
        other.setAttribute("aria-pressed", String(other === button));
      }
    });
  }

  // First-gesture safety net, in case a click lands somewhere with no more
  // specific handler (e.g. a future control) before any note has sounded.
  window.addEventListener("pointerdown", onGesture, { once: true });
  window.addEventListener("keydown", onGesture, { once: true });

  setUpCamera(engine, onGesture, wheelsContainer);
  setUpIntroModal(onGesture);
}

/** Shown on every visit (not just the first) so a player never has to go
 * hunting for how the wheels work; dismissing it doubles as the very first
 * user gesture, so it also unlocks audio. */
function setUpIntroModal(onGesture: () => void): void {
  const modal = document.querySelector<HTMLDialogElement>("#intro-modal");
  if (!modal) return;
  modal.addEventListener("close", onGesture, { once: true });
  modal.showModal();
}

/**
 * Camera is progressive enhancement: two non-interactive "echo" wheels that
 * float over the video and mirror whichever sector a tracked hand is
 * reaching for. Wired up separately from the always-on keyboard/pointer path
 * above, and never required for it.
 */
function setUpCamera(engine: MusicEngine, onGesture: () => void, wheelsContainer: HTMLDivElement): void {
  const layer = document.querySelector<HTMLDivElement>("#camera-layer");
  const statusEl = document.querySelector<HTMLParagraphElement>("#camera-status");
  const toggle = document.querySelector<HTMLButtonElement>("#camera-toggle");
  if (!layer || !statusEl || !toggle) return;

  const echoLow = new Wheel({ register: "low", caption: "LOW · C3–C4", engine, interactive: false });
  const echoHigh = new Wheel({ register: "high", caption: "HIGH · C4–C5", engine, interactive: false });
  layer.append(echoLow.element, echoHigh.element);

  const onLockChange = (anyLocked: boolean): void => {
    wheelsContainer.classList.toggle("wheels-hidden", anyLocked);
  };
  const camera = new CameraController(
    engine,
    { low: echoLow, high: echoHigh },
    layer,
    statusEl,
    onGesture,
    onLockChange,
  );

  toggle.addEventListener("click", async () => {
    onGesture();
    toggle.disabled = true;
    if (camera.isActive) {
      camera.disable();
      toggle.textContent = "Enable Camera";
      toggle.setAttribute("aria-pressed", "false");
      document.body.classList.remove("camera-active");
    } else {
      const started = await camera.enable();
      toggle.textContent = started ? "Disable Camera" : "Enable Camera";
      toggle.setAttribute("aria-pressed", String(started));
      // The title docking to the top is purely a cue that the camera has the
      // floor now; a failed enable() (permission denied, no getUserMedia)
      // must leave the page exactly as it was.
      document.body.classList.toggle("camera-active", started);
    }
    toggle.disabled = false;
  });
}
