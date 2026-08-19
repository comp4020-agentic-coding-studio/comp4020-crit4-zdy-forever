import type { Instrument, VoiceHandle } from "./instrument";
import { ViolinFallback } from "./violin-fallback";

// The violin's sound is made sample by sample on the audio thread, in
// public/violin-worklet.js. Four attempts to build it out of Web Audio nodes
// were rejected by ear in a row (brass, big brass, synthesiser, electric
// guitar), because a node graph can only offer one periodic source through
// one filter chain under one envelope -- a topology that forces every
// harmonic to move in lockstep and yields a smooth, monotonic harmonic
// series. A bowed string is the opposite of that, so the synthesis had to
// move somewhere it could address partials individually.
//
// That worklet is generated, not hand-written: tools/violin-lab renders
// candidate timbres to WAV offline so they can be auditioned without
// rebuilding the page, and build-worklet.mjs assembles the shipped file from
// the candidate that was chosen, verbatim. `node
// tools/violin-lab/verify-worklet.mjs` re-renders both and asserts they are
// sample-identical, so what ships stays what was approved.
//
// This class is the main-thread half: it owns one persistent worklet node
// (the instrument is monophonic, so one node serves every note) and speaks to
// it by message. Until the module loads -- and forever, if the browser has no
// AudioWorklet -- it delegates to the old node-graph implementation, because
// a worse timbre beats a silent instrument.

const PROCESSOR_NAME = "violin-voice";
const MODULE_FILE = "violin-worklet.js";

// Measured through the running page: holding one note, the violin's sustained
// RMS sat 4 dB under the piano's, so switching instruments dropped the volume.
// Corrected here rather than inside the worklet, so the DSP stays byte-for-byte
// the code that was auditioned and approved -- this is a level, not a timbre.
const OUTPUT_GAIN = 1.35;

type ViolinHandle =
  | { readonly viaWorklet: true; readonly generation: number }
  | { readonly viaWorklet: false; readonly inner: VoiceHandle };

export class Violin implements Instrument {
  readonly id = "violin";
  readonly polyphonic = false;
  private node: AudioWorkletNode | null = null;
  private generation = 0;
  private warmFrequencies: number[] = [];
  private readonly fallback: ViolinFallback;

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
  ) {
    this.fallback = new ViolinFallback(context, destination);
    void this.loadWorklet();
  }

  /** True once the worklet is carrying the sound. Exposed for tests and for
   * anything that wants to report which path is live. */
  get usingWorklet(): boolean {
    return this.node !== null;
  }

  /**
   * Pre-builds a voice for each pitch the instrument can play. The synthesis
   * calibrates its noise path the first time it sees a pitch, which costs
   * about a millisecond -- most of a 128-sample render quantum -- so paying it
   * during a note-on risks a dropout on the very first note of each pitch.
   * Safe to call before the module has loaded; the list is sent on arrival.
   */
  warmUp(frequencies: readonly number[]): void {
    this.warmFrequencies = [...frequencies];
    this.node?.port.postMessage({ type: "warm", frequencies: this.warmFrequencies });
  }

  noteOn(frequency: number, velocity: number): VoiceHandle {
    if (this.node) {
      this.generation += 1;
      this.node.port.postMessage({
        type: "noteOn",
        frequency,
        velocity,
        generation: this.generation,
      });
      return { viaWorklet: true, generation: this.generation } satisfies ViolinHandle;
    }
    return { viaWorklet: false, inner: this.fallback.noteOn(frequency, velocity) } satisfies ViolinHandle;
  }

  noteOff(handle: VoiceHandle): void {
    const violinHandle = handle as ViolinHandle;
    // A handle minted by the path that is no longer live is simply inert --
    // the same "already stolen" no-op a monophonic instrument owes any stale
    // release, so a note held across the worklet's arrival can't strand a
    // voice or throw.
    if (violinHandle.viaWorklet) {
      this.node?.port.postMessage({ type: "noteOff", generation: violinHandle.generation });
      return;
    }
    this.fallback.noteOff(violinHandle.inner);
  }

  allNotesOff(): void {
    this.node?.port.postMessage({ type: "allOff" });
    this.fallback.allNotesOff();
  }

  private async loadWorklet(): Promise<void> {
    // Every failure below is a silent downgrade to the fallback, never a
    // throw: no AudioWorklet (old browser, or a non-secure context), a module
    // that 404s, a processor that fails to register.
    if (typeof AudioWorkletNode === "undefined" || !this.context.audioWorklet) return;
    try {
      // Resolved against the document, not this module: the worklet lives in
      // public/ and is copied to the site root, and the site is served from a
      // GitHub Pages sub-path.
      const url = new URL(MODULE_FILE, document.baseURI).href;
      await this.context.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(this.context, PROCESSOR_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const trim = this.context.createGain();
      trim.gain.value = OUTPUT_GAIN;
      node.connect(trim);
      trim.connect(this.destination);
      if (this.warmFrequencies.length > 0) {
        node.port.postMessage({ type: "warm", frequencies: this.warmFrequencies });
      }
      // Anything the fallback is holding would otherwise sustain underneath
      // the worklet's first note, with no handle able to reach it.
      this.fallback.allNotesOff();
      this.node = node;
    } catch {
      this.node = null;
    }
  }
}
