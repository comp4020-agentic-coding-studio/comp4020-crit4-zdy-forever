// Wires the independent modules together: audio engine + instruments feed a
// MusicEngine, which every input controller (keyboard, pointer, camera) and
// every UI element (wheels, instrument selector) talks to. No module here
// owns synthesis, and no input controller talks to audio directly.
import { getAudioEngine } from "../audio/engine";
import type { Instrument } from "../audio/instrument";
import { Piano } from "../audio/piano";
import { Violin } from "../audio/violin";
import { createKeyboardController } from "../input/keyboard";
import { type InstrumentId, MusicEngine } from "../music/state";
import { Wheel } from "./wheel";

export function startApp(): void {
  const wheelsContainer = document.querySelector<HTMLDivElement>("#wheels");
  if (!wheelsContainer) return;

  const audio = getAudioEngine();
  const onGesture = (): void => audio.resume();

  const instruments: Record<InstrumentId, Instrument> = {
    piano: new Piano(audio.context, audio.master),
    violin: new Violin(audio.context, audio.master),
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
}
