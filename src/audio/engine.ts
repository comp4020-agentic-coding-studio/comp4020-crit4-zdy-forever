// One AudioContext for the whole page, created lazily and resumed on the
// first user gesture so the browser's autoplay policy never blocks sound.
// Audio-engine state (this file, and the instruments) is kept deliberately
// separate from UI state (src/ui) and musical state (src/music/state.ts).

export class AudioEngine {
  readonly context: AudioContext;
  readonly master: GainNode;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new Ctor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.context.destination);
  }

  /** Safe to call on every gesture; a no-op once the context is running. */
  resume(): void {
    if (this.context.state !== "running") {
      this.context.resume().catch(() => {
        // Ignored: a resume can only fail from another gesture requirement
        // the browser will offer again on the next interaction.
      });
    }
  }
}

let shared: AudioEngine | undefined;

/** Lazily constructs the single shared AudioContext on first use. */
export function getAudioEngine(): AudioEngine {
  shared ??= new AudioEngine();
  return shared;
}
