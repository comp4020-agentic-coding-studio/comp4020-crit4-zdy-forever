// Equal-temperament frequency calculation, A4 = 440 Hz.
// Scientific pitch notation (C4 = MIDI 60), naturals plus an optional sharp
// (e.g. "F#3") — chord tables need those for a major triad on every root.

const NATURAL_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Parses e.g. "C3" -> 48, "F#3" -> 54. Throws on anything else. */
export function noteNameToMidi(note: string): number {
  const match = /^([A-G])(#?)(-?\d+)$/.exec(note);
  if (!match) throw new Error(`not a note name: ${note}`);
  const [, letter, sharp, octaveStr] = match;
  const octave = Number.parseInt(octaveStr, 10);
  return (octave + 1) * 12 + NATURAL_SEMITONE[letter] + (sharp ? 1 : 0);
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** e.g. "A4" -> 440, "C4" -> ~261.63 */
export function noteNameToFrequency(note: string): number {
  return midiToFrequency(noteNameToMidi(note));
}
