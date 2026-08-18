import type { Instrument, VoiceHandle } from "./instrument";

// A struck-string approximation: a few harmonically-related oscillators
// (fundamental + weaker overtones) summed under one fast-attack, exponentially
// decaying envelope, then a gentle lowpass for warmth. Not a sampled piano,
// but recognisably percussive rather than a bare sine tone.
const HARMONICS: readonly { ratio: number; gain: number; type: OscillatorType }[] = [
  { ratio: 1, gain: 1, type: "triangle" },
  { ratio: 2, gain: 0.35, type: "sine" },
  { ratio: 3, gain: 0.18, type: "sine" },
  { ratio: 4, gain: 0.08, type: "sine" },
];

const ATTACK = 0.006;
const DECAY = 1.1;
const SUSTAIN_LEVEL = 0.18;
const RELEASE = 0.18;
const MAX_HOLD_MS = 25_000;
const MAX_VOICES = 32;

interface PianoVoice {
  stopped: boolean;
  oscillators: OscillatorNode[];
  envelope: GainNode;
  safety: ReturnType<typeof setTimeout>;
}

export class Piano implements Instrument {
  readonly id = "piano";
  readonly polyphonic = true;
  private readonly voices = new Set<PianoVoice>();

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  noteOn(frequency: number, velocity: number): VoiceHandle {
    const t0 = this.context.currentTime;
    const peak = 0.85 * clamp(velocity, 0.15, 1);

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = clamp(frequency * 5, 900, 7000);
    filter.Q.value = 0.6;
    filter.connect(this.destination);

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, t0);
    envelope.gain.linearRampToValueAtTime(peak, t0 + ATTACK);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(peak * SUSTAIN_LEVEL, 0.0001),
      t0 + ATTACK + DECAY,
    );
    envelope.connect(filter);

    const oscillators = HARMONICS.map(({ ratio, gain, type }) => {
      const osc = this.context.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency * ratio;
      const harmonicGain = this.context.createGain();
      harmonicGain.gain.value = gain;
      osc.connect(harmonicGain);
      harmonicGain.connect(envelope);
      osc.start(t0);
      return osc;
    });

    const voice: PianoVoice = {
      stopped: false,
      oscillators,
      envelope,
      safety: setTimeout(() => this.stop(voice, RELEASE), MAX_HOLD_MS),
    };
    this.voices.add(voice);
    this.enforceVoiceCap();
    return voice;
  }

  noteOff(handle: VoiceHandle): void {
    const voice = handle as PianoVoice;
    if (!this.voices.has(voice)) return;
    this.stop(voice, RELEASE);
  }

  allNotesOff(): void {
    for (const voice of this.voices) this.stop(voice, 0.03);
  }

  private enforceVoiceCap(): void {
    while (this.voices.size > MAX_VOICES) {
      const oldest = this.voices.values().next().value as PianoVoice | undefined;
      if (!oldest) break;
      this.stop(oldest, 0.03);
    }
  }

  private stop(voice: PianoVoice, release: number): void {
    if (voice.stopped) return;
    voice.stopped = true;
    clearTimeout(voice.safety);
    this.voices.delete(voice);

    const t0 = this.context.currentTime;
    voice.envelope.gain.cancelScheduledValues(t0);
    voice.envelope.gain.setTargetAtTime(0, t0, release / 3);
    const stopAt = t0 + release + 0.05;
    for (const osc of voice.oscillators) osc.stop(stopAt);
    voice.oscillators[voice.oscillators.length - 1].addEventListener("ended", () => {
      voice.envelope.disconnect();
      for (const osc of voice.oscillators) osc.disconnect();
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
