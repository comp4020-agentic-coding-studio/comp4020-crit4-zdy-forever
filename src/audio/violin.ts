import type { Instrument, VoiceHandle } from "./instrument";

// A bowed-string approximation: a sawtooth source (rich in harmonics, like a
// bowed edge) through a gentle lowpass, a slower attack than Piano, a
// sustained plateau, and subtle vibrato that fades in after the attack
// settles. Monophonic by construction: every noteOn steals the previous
// voice, and a handle from a stolen voice becomes permanently inert (its
// generation no longer matches `current`), so a stray noteOff from whichever
// input source lost the race is safely a no-op.

const ATTACK = 0.09;
const SUSTAIN_LEVEL = 0.55;
const NORMAL_RELEASE = 0.16;
const STEAL_RELEASE = 0.04;
const VIBRATO_RATE = 5.2;
const VIBRATO_DEPTH_CENTS = 6;
const VIBRATO_FADE_IN = 0.35;
const MAX_HOLD_MS = 30_000;

interface ViolinVoiceHandle extends VoiceHandle {
  readonly generation: number;
}

interface ActiveVoice {
  generation: number;
  oscillator: OscillatorNode;
  vibratoLfo: OscillatorNode;
  vibratoGain: GainNode;
  envelope: GainNode;
  safety: ReturnType<typeof setTimeout>;
}

export class Violin implements Instrument {
  readonly id = "violin";
  readonly polyphonic = false;
  private generation = 0;
  private current: ActiveVoice | null = null;

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  noteOn(frequency: number, velocity: number): VoiceHandle {
    this.stopCurrent(STEAL_RELEASE);

    const t0 = this.context.currentTime;
    const peak = 0.5 * clamp(velocity, 0.2, 1);
    this.generation += 1;
    const generation = this.generation;

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = clamp(frequency * 4, 700, 4500);
    filter.Q.value = 0.4;
    filter.connect(this.destination);

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, t0);
    envelope.gain.linearRampToValueAtTime(peak, t0 + ATTACK);
    envelope.gain.linearRampToValueAtTime(peak * SUSTAIN_LEVEL, t0 + ATTACK + 0.25);
    envelope.connect(filter);

    const oscillator = this.context.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = frequency;
    oscillator.connect(envelope);
    oscillator.start(t0);

    // Vibrato: an LFO modulating detune, faded in so a short note stays clean.
    const vibratoLfo = this.context.createOscillator();
    vibratoLfo.type = "sine";
    vibratoLfo.frequency.value = VIBRATO_RATE;
    const vibratoGain = this.context.createGain();
    vibratoGain.gain.setValueAtTime(0, t0);
    vibratoGain.gain.linearRampToValueAtTime(VIBRATO_DEPTH_CENTS, t0 + ATTACK + VIBRATO_FADE_IN);
    vibratoLfo.connect(vibratoGain);
    vibratoGain.connect(oscillator.detune);
    vibratoLfo.start(t0);

    this.current = {
      generation,
      oscillator,
      vibratoLfo,
      vibratoGain,
      envelope,
      safety: setTimeout(() => this.stopCurrent(NORMAL_RELEASE), MAX_HOLD_MS),
    };
    return { generation } satisfies ViolinVoiceHandle;
  }

  noteOff(handle: VoiceHandle): void {
    const { generation } = handle as ViolinVoiceHandle;
    if (this.current?.generation !== generation) return; // already stolen
    this.stopCurrent(NORMAL_RELEASE);
  }

  allNotesOff(): void {
    this.stopCurrent(0.03);
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
    voice.oscillator.stop(stopAt);
    voice.vibratoLfo.stop(stopAt);
    voice.oscillator.addEventListener("ended", () => {
      voice.envelope.disconnect();
      voice.oscillator.disconnect();
      voice.vibratoGain.disconnect();
      voice.vibratoLfo.disconnect();
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
