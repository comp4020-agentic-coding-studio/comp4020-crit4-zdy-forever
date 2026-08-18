// Mouse and touch share one code path via the Pointer Events API, so a mouse
// click and a finger tap on the same sector produce the exact same musical
// event. Pointer capture lets each finger independently hold its own sector,
// which is what makes two-finger chords on Piano possible.
import type { MusicEngine } from "../music/state";
import type { Register } from "../music/tables";

export function bindSectorPointer(
  el: HTMLElement,
  register: Register,
  sector: number,
  engine: MusicEngine,
  onGesture: () => void,
): void {
  const sourceId = (pointerId: number): string => `pointer:${pointerId}`;

  el.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    onGesture();
    el.setPointerCapture(event.pointerId);
    engine.attack(sourceId(event.pointerId), register, sector, 0.9);
  });

  const release = (event: PointerEvent): void => {
    engine.release(sourceId(event.pointerId));
  };

  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("lostpointercapture", release);
  el.addEventListener("contextmenu", (event) => event.preventDefault());
}
