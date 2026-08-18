// The contract every synthesised instrument implements. The musical-intent
// layer (src/music/state.ts) only ever talks to instruments through this
// interface, so keyboard/pointer/camera input never touches synthesis code
// directly and a new timbre never has to change any input controller.

export type VoiceHandle = object;

export interface Instrument {
  readonly id: string;
  readonly polyphonic: boolean;
  /** Starts a voice at `frequency`; `velocity` is 0..1. Never throws. */
  noteOn(frequency: number, velocity: number): VoiceHandle;
  /** Releases a previously-returned handle. Safe to call more than once, and
   * safe to call with a handle a monophonic instrument has since stolen. */
  noteOff(handle: VoiceHandle): void;
  /** Immediately silences every voice this instrument owns. */
  allNotesOff(): void;
}
