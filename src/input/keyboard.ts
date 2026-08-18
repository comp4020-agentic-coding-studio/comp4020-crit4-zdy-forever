// Turns physical keyboard events into musical-intent calls. Knows nothing
// about audio or rendering — it only ever calls MusicEngine methods.
import { KEYBOARD_NOTE_MAP, TOGGLE_KEY } from "../music/tables";
import type { MusicEngine } from "../music/state";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export interface KeyboardController {
  destroy(): void;
}

export function createKeyboardController(
  engine: MusicEngine,
  onGesture: () => void,
): KeyboardController {
  const held = new Set<string>();

  function keydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();

    const toggleRegister = TOGGLE_KEY[key];
    if (toggleRegister) {
      event.preventDefault();
      if (!event.repeat) engine.toggleMode(toggleRegister);
      return;
    }

    const mapping = KEYBOARD_NOTE_MAP[key];
    if (!mapping) return;
    event.preventDefault();
    // Browser key-repeat must not spawn duplicate voices while a key is held.
    if (event.repeat || held.has(key)) return;
    held.add(key);
    onGesture();
    engine.attack(`key:${key}`, mapping.register, mapping.sector, 0.9);
  }

  function keyup(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (!held.has(key)) return;
    held.delete(key);
    engine.release(`key:${key}`);
  }

  // Stuck-note guard: a keyup can be lost entirely (alt-tab, OS-level focus
  // steal), so drop every held key the instant the window stops receiving input.
  function releaseAllHeld(): void {
    for (const key of held) engine.release(`key:${key}`);
    held.clear();
  }

  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", releaseAllHeld);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAllHeld();
  });

  return {
    destroy(): void {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", releaseAllHeld);
    },
  };
}
