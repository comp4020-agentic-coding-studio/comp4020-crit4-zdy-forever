import { chordsFor, type Mode, notesFor, type Register } from "./tables";

export const SECTOR_COUNT = 8;
export const SECTOR_ANGLE = (2 * Math.PI) / SECTOR_COUNT;

/** The note names a sector plays in the given register/mode. Always >=1 note. */
export function getNotesForSector(register: Register, sector: number, mode: Mode): string[] {
  const index = ((sector % SECTOR_COUNT) + SECTOR_COUNT) % SECTOR_COUNT;
  if (mode === "chord") return [...chordsFor(register)[index]];
  return [notesFor(register)[index]];
}

/**
 * Maps a displacement from a wheel's centre to one of eight sectors, indexed
 * clockwise from 0 = up (N), 1 = NE, ... 7 = NW — matching the keyboard/chord
 * tables above. `dx`/`dy` are in screen space (y grows downward).
 */
export function sectorFromDisplacement(dx: number, dy: number): number {
  // atan2(dx, -dy): 0 rad points up (N) and angle grows clockwise, since in
  // screen coordinates "up" is -y and clockwise rotation from up sweeps
  // toward +x first.
  const angle = Math.atan2(dx, -dy);
  const normalized = (angle + 2 * Math.PI) % (2 * Math.PI);
  return Math.round(normalized / SECTOR_ANGLE) % SECTOR_COUNT;
}

export function radialDistance(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
