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

    // A chord press can stack a dozen-plus oscillators (3 notes x 4 piano
    // harmonics) with no headroom management otherwise, which clips into an
    // audible crackle/hiss. Two stages: a gentle "glue" compressor for the
    // musical dynamics, then a fast, hard limiter as a safety net that
    // catches whatever transient the glue stage's 5ms attack still let
    // through (it has no lookahead) before it reaches the speakers.
    const glue = this.context.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.knee.value = 24;
    glue.ratio.value = 6;
    glue.attack.value = 0.005;
    glue.release.value = 0.15;

    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;

    this.master.connect(glue);
    glue.connect(limiter);
    limiter.connect(this.context.destination);
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
