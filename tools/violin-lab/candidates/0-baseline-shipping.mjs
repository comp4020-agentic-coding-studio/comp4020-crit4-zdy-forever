// BASELINE — a faithful sample-level port of what src/audio/violin.ts ships
// right now (attempt 4). Not a proposal: it is the reference point, so every
// candidate can be A/B'd against the thing the listener already rejected as
// "electric guitar + synthesizer".
//
// Chain: one sawtooth + looped white noise -> four fixed peaking biquads
// (body formants) -> envelope; vibrato on pitch, slow wobble on amplitude.

import { Biquad } from "../dsp.mjs";

export const name = "0-baseline-shipping";
export const notes = `
Sawtooth + white bow noise through four fixed peaking body formants
(300/460/1200/2800 Hz), 90ms linear attack, 5.2Hz vibrato, 3.7Hz amplitude
wobble. This is the currently-shipping patch, included only as the reference
the candidates have to beat.
`;

const FORMANTS = [
  { freq: 300, q: 2.2, gainDb: 7 },
  { freq: 460, q: 2.5, gainDb: 5 },
  { freq: 1200, q: 1.3, gainDb: 4 },
  { freq: 2800, q: 1.1, gainDb: 3 },
];

const ATTACK = 0.09;
const SUSTAIN_LEVEL = 0.55;
const RELEASE = 0.16;
const VIBRATO_RATE = 5.2;
const VIBRATO_DEPTH_CENTS = 6;
const VIBRATO_FADE_IN = 0.35;
const BOW_NOISE_LEVEL = 0.09;
const PRESSURE_WOBBLE_RATE = 3.7;
const PRESSURE_WOBBLE_DEPTH = 0.05;

export function makeVoice({ sampleRate, frequency, velocity, rng }) {
  const peak = 0.55 * Math.max(0.2, Math.min(1, velocity));
  const formants = FORMANTS.map(({ freq, q, gainDb }) => new Biquad(sampleRate).peaking(freq, q, gainDb));

  let phase = 0;
  let vibPhase = 0;
  let wobPhase = 0;
  let t = 0;
  let releasing = false;
  let releaseT = 0;
  let releaseFrom = 0;
  let env = 0;

  return {
    next() {
      const dt = 1 / sampleRate;

      // Envelope: 0 -> peak over ATTACK, then down to peak*SUSTAIN over 0.25s.
      if (!releasing) {
        if (t < ATTACK) env = peak * (t / ATTACK);
        else if (t < ATTACK + 0.25) env = peak * (1 + (SUSTAIN_LEVEL - 1) * ((t - ATTACK) / 0.25));
        else env = peak * SUSTAIN_LEVEL;
      } else {
        env = releaseFrom * Math.exp((-3 * releaseT) / RELEASE);
        releaseT += dt;
      }

      // Vibrato faded in over ATTACK + VIBRATO_FADE_IN.
      const vibDepth = VIBRATO_DEPTH_CENTS * Math.min(1, t / (ATTACK + VIBRATO_FADE_IN));
      const cents = Math.sin(vibPhase) * vibDepth;
      const f = frequency * 2 ** (cents / 1200);
      vibPhase += 2 * Math.PI * VIBRATO_RATE * dt;

      // Bandlimited-ish sawtooth (PolyBLEP) so Node matches OscillatorNode.
      phase += f * dt;
      if (phase >= 1) phase -= 1;
      let saw = 2 * phase - 1;
      const inc = f * dt;
      if (phase < inc) {
        const x = phase / inc;
        saw -= x + x - x * x - 1;
      } else if (phase > 1 - inc) {
        const x = (phase - 1) / inc;
        saw -= x * x + x + x + 1;
      }

      const noise = (rng() * 2 - 1) * BOW_NOISE_LEVEL;
      let y = saw + noise;
      for (const filter of formants) y = filter.process(y);

      const wobble = 1 + Math.sin(wobPhase) * PRESSURE_WOBBLE_DEPTH;
      wobPhase += 2 * Math.PI * PRESSURE_WOBBLE_RATE * dt;

      t += dt;
      if (!releasing) releaseFrom = env;
      return y * env * wobble;
    },
    release() {
      if (!releasing) {
        releasing = true;
        releaseT = 0;
      }
    },
    finished() {
      return releasing && releaseFrom * Math.exp((-3 * releaseT) / RELEASE) < 1e-4;
    },
  };
}
