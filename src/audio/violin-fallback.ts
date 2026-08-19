import type { Instrument, VoiceHandle } from "./instrument";

// The Web Audio *node graph* violin, kept only as a fallback for a browser
// where AudioWorklet is missing or its module fails to load. The real timbre
// now lives in public/violin-worklet.js (see violin.ts).
//
// Keep expectations low for this one: four successive versions of this
// approach were rejected by ear as brass, then big brass, then synthesiser,
// then electric guitar. That is not a tuning failure but a structural one --
// one periodic oscillator through one filter chain under one amplitude
// envelope forces every harmonic to move in lockstep and produces a smooth,
// monotonic harmonic series, which is precisely what a bowed string is not.
// A worse timbre still beats a silent instrument, so it stays; nothing else
// here is worth further effort.
//
// Monophonic by construction: every noteOn steals the previous voice, and a
// handle from a stolen voice becomes permanently inert (its generation no
// longer matches `current`), so a stray noteOff from whichever input source
// lost the race is safely a no-op.

const ATTACK = 0.09;
const SUSTAIN_LEVEL = 0.55;
const NORMAL_RELEASE = 0.16;
const STEAL_RELEASE = 0.04;
const VIBRATO_RATE = 5.2;
const VIBRATO_DEPTH_CENTS = 6;
const VIBRATO_FADE_IN = 0.35;
const BOW_NOISE_LEVEL = 0.09;
const NOISE_BUFFER_SECONDS = 2;
const PRESSURE_WOBBLE_RATE = 3.7;
const PRESSURE_WOBBLE_DEPTH = 0.05;
const MAX_HOLD_MS = 30_000;

/** Fixed body resonances: main wood mode, main air mode, a mid-body mode, and
 * the "bridge hill". None of these move with the note. */
const FORMANTS: readonly { freq: number; q: number; gainDb: number }[] = [
  { freq: 300, q: 2.2, gainDb: 7 },
  { freq: 460, q: 2.5, gainDb: 5 },
  { freq: 1200, q: 1.3, gainDb: 4 },
  { freq: 2800, q: 1.1, gainDb: 3 },
];

interface FallbackVoiceHandle extends VoiceHandle {
  readonly generation: number;
}

interface ActiveVoice {
  generation: number;
  sawOscillator: OscillatorNode;
  noiseSource: AudioBufferSourceNode;
  noiseGain: GainNode;
  vibratoLfo: OscillatorNode;
  vibratoGain: GainNode;
  pressureLfo: OscillatorNode;
  pressureLfoGain: GainNode;
  envelope: GainNode;
  formants: BiquadFilterNode[];
  safety: ReturnType<typeof setTimeout>;
}

export class ViolinFallback implements Instrument {
  readonly id = "violin";
  readonly polyphonic = false;
  private generation = 0;
  private current: ActiveVoice | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  noteOn(frequency: number, velocity: number): VoiceHandle {
    this.stopCurrent(STEAL_RELEASE);

    const t0 = this.context.currentTime;
    const peak = 0.55 * clamp(velocity, 0.2, 1);
    this.generation += 1;
    const generation = this.generation;

    const formants = FORMANTS.map(({ freq, q, gainDb }) => {
      const filter = this.context.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = freq;
      filter.Q.value = q;
      filter.gain.value = gainDb;
      return filter;
    });
    for (let i = 0; i < formants.length - 1; i += 1) formants[i].connect(formants[i + 1]);

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, t0);
    envelope.gain.linearRampToValueAtTime(peak, t0 + ATTACK);
    envelope.gain.linearRampToValueAtTime(peak * SUSTAIN_LEVEL, t0 + ATTACK + 0.25);
    formants[formants.length - 1].connect(envelope);
    envelope.connect(this.destination);

    const sawOscillator = this.context.createOscillator();
    sawOscillator.type = "sawtooth";
    sawOscillator.frequency.value = frequency;
    sawOscillator.connect(formants[0]);
    sawOscillator.start(t0);

    const noiseSource = this.context.createBufferSource();
    noiseSource.buffer = this.getNoiseBuffer();
    noiseSource.loop = true;
    const noiseGain = this.context.createGain();
    noiseGain.gain.value = BOW_NOISE_LEVEL;
    noiseSource.connect(noiseGain);
    noiseGain.connect(formants[0]);
    noiseSource.start(t0);

    const vibratoLfo = this.context.createOscillator();
    vibratoLfo.type = "sine";
    vibratoLfo.frequency.value = VIBRATO_RATE;
    const vibratoGain = this.context.createGain();
    vibratoGain.gain.setValueAtTime(0, t0);
    vibratoGain.gain.linearRampToValueAtTime(VIBRATO_DEPTH_CENTS, t0 + ATTACK + VIBRATO_FADE_IN);
    vibratoLfo.connect(vibratoGain);
    vibratoGain.connect(sawOscillator.detune);
    vibratoLfo.start(t0);

    const pressureLfo = this.context.createOscillator();
    pressureLfo.type = "sine";
    pressureLfo.frequency.value = PRESSURE_WOBBLE_RATE;
    const pressureLfoGain = this.context.createGain();
    pressureLfoGain.gain.value = peak * PRESSURE_WOBBLE_DEPTH;
    pressureLfo.connect(pressureLfoGain);
    pressureLfoGain.connect(envelope.gain);
    pressureLfo.start(t0);

    this.current = {
      generation,
      sawOscillator,
      noiseSource,
      noiseGain,
      vibratoLfo,
      vibratoGain,
      pressureLfo,
      pressureLfoGain,
      envelope,
      formants,
      safety: setTimeout(() => this.stopCurrent(NORMAL_RELEASE), MAX_HOLD_MS),
    };
    return { generation } satisfies FallbackVoiceHandle;
  }

  noteOff(handle: VoiceHandle): void {
    const { generation } = handle as FallbackVoiceHandle;
    if (this.current?.generation !== generation) return; // already stolen
    this.stopCurrent(NORMAL_RELEASE);
  }

  allNotesOff(): void {
    this.stopCurrent(0.03);
  }

  /** Built once and reused (looped) across notes — a fresh random buffer per note buys nothing audible. */
  private getNoiseBuffer(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.floor(this.context.sampleRate * NOISE_BUFFER_SECONDS);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  private stopCurrent(release: number): void {
    const voice = this.current;
    if (!voice) return;
    this.current = null;
    clearTimeout(voice.safety);

    const t0 = this.context.currentTime;
    voice.envelope.gain.cancelScheduledValues(t0);
    voice.envelope.gain.setTargetAtTime(0, t0, release / 3);
    const stopAt = t0 + release + 0.05;
    voice.sawOscillator.stop(stopAt);
    voice.noiseSource.stop(stopAt);
    voice.vibratoLfo.stop(stopAt);
    voice.pressureLfo.stop(stopAt);
    voice.sawOscillator.addEventListener("ended", () => {
      voice.envelope.disconnect();
      voice.sawOscillator.disconnect();
      voice.noiseSource.disconnect();
      voice.noiseGain.disconnect();
      voice.vibratoGain.disconnect();
      voice.vibratoLfo.disconnect();
      voice.pressureLfoGain.disconnect();
      voice.pressureLfo.disconnect();
      for (const formant of voice.formants) formant.disconnect();
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
