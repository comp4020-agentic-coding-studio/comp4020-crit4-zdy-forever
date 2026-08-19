// The instrument's two registers, their eight diatonic positions, and the
// triad each position builds in Chord mode. Everything downstream (wheel
// sectors, keyboard keys, camera directions) indexes into these same eight
// positions, so this file is the one place the note content lives.

export type Register = "low" | "high";
export type Mode = "note" | "chord";

/** Sector 0 = N (top), clockwise: N, NE, E, SE, S, SW, W, NW. */
export const LOW_NOTES = ["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4"] as const;
export const HIGH_NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"] as const;

// Every sector's chord is the same shape — a plain major ("do-mi-so") triad,
// root + major 3rd + perfect 5th — rooted at that sector's note, not the
// diatonic triad the major scale would harmonize there. So D's triad is
// D-F#-A (major), not D-F-A (minor): several roots need a sharp third.
export const LOW_CHORDS: readonly (readonly string[])[] = [
  ["C3", "E3", "G3"],
  ["D3", "F#3", "A3"],
  ["E3", "G#3", "B3"],
  ["F3", "A3", "C4"],
  ["G3", "B3", "D4"],
  ["A3", "C#4", "E4"],
  ["B3", "D#4", "F#4"],
  ["C4", "E4", "G4"],
];

export const HIGH_CHORDS: readonly (readonly string[])[] = [
  ["C4", "E4", "G4"],
  ["D4", "F#4", "A4"],
  ["E4", "G#4", "B4"],
  ["F4", "A4", "C5"],
  ["G4", "B4", "D5"],
  ["A4", "C#5", "E5"],
  ["B4", "D#5", "F#5"],
  ["C5", "E5", "G5"],
];

export function notesFor(register: Register): readonly string[] {
  return register === "low" ? LOW_NOTES : HIGH_NOTES;
}

export function chordsFor(register: Register): readonly (readonly string[])[] {
  return register === "low" ? LOW_CHORDS : HIGH_CHORDS;
}

/** Keyboard key (lowercase) -> which register and sector it plays. */
export const KEYBOARD_NOTE_MAP: Record<string, { register: Register; sector: number }> = {
  a: { register: "low", sector: 0 },
  s: { register: "low", sector: 1 },
  d: { register: "low", sector: 2 },
  f: { register: "low", sector: 3 },
  z: { register: "low", sector: 4 },
  x: { register: "low", sector: 5 },
  c: { register: "low", sector: 6 },
  v: { register: "low", sector: 7 },
  j: { register: "high", sector: 0 },
  k: { register: "high", sector: 1 },
  l: { register: "high", sector: 2 },
  ";": { register: "high", sector: 3 },
  m: { register: "high", sector: 4 },
  ",": { register: "high", sector: 5 },
  ".": { register: "high", sector: 6 },
  "/": { register: "high", sector: 7 },
};

/** Key that toggles a register between Note and Chord mode. */
export const TOGGLE_KEY: Record<string, Register> = {
  "1": "low",
  "0": "high",
};

export const KEY_LABEL: Record<Register, string[]> = {
  low: ["A", "S", "D", "F", "Z", "X", "C", "V"],
  high: ["J", "K", "L", ";", "M", ",", ".", "/"],
};
