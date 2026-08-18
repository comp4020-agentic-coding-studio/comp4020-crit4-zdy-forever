import { describe, expect, it } from "vitest";
import type { Instrument, VoiceHandle } from "../audio/instrument";
import { MusicEngine } from "./state";

class FakeInstrument implements Instrument {
  onCalls: { frequency: number; velocity: number }[] = [];
  offCalls: VoiceHandle[] = [];
  allOffCount = 0;

  constructor(
    public readonly id: string,
    public readonly polyphonic: boolean,
  ) {}

  noteOn(frequency: number, velocity: number): VoiceHandle {
    this.onCalls.push({ frequency, velocity });
    return { frequency };
  }

  noteOff(handle: VoiceHandle): void {
    this.offCalls.push(handle);
  }

  allNotesOff(): void {
    this.allOffCount += 1;
  }
}

function makeEngine() {
  const piano = new FakeInstrument("piano", true);
  const violin = new FakeInstrument("violin", false);
  const engine = new MusicEngine({ piano, violin });
  return { engine, piano, violin };
}

describe("MusicEngine routing", () => {
  it("starts a single note for NOTE mode", () => {
    const { engine, piano } = makeEngine();
    engine.attack("key:a", "low", 0, 1);
    expect(piano.onCalls).toHaveLength(1);
  });

  it("starts three voices for CHORD mode", () => {
    const { engine, piano } = makeEngine();
    engine.toggleMode("low");
    engine.attack("key:a", "low", 0, 1);
    expect(piano.onCalls).toHaveLength(3);
  });

  it("keeps LOW and HIGH register modes independent", () => {
    const { engine } = makeEngine();
    engine.toggleMode("low");
    expect(engine.getMode("low")).toBe("chord");
    expect(engine.getMode("high")).toBe("note");
  });

  it("lets two sources sound simultaneously and releases them independently (polyphony)", () => {
    const { engine, piano } = makeEngine();
    engine.attack("key:a", "low", 0);
    engine.attack("key:j", "high", 0);
    expect(piano.onCalls).toHaveLength(2);
    engine.release("key:a");
    expect(piano.offCalls).toHaveLength(1);
    engine.release("key:j");
    expect(piano.offCalls).toHaveLength(2);
  });

  it("forces both registers to NOTE and ignores toggles while Violin is active", () => {
    const { engine } = makeEngine();
    engine.toggleMode("low"); // chord, on piano
    engine.setInstrument("violin");
    expect(engine.getMode("low")).toBe("note");
    expect(engine.getMode("high")).toBe("note");
    engine.toggleMode("low");
    expect(engine.getMode("low")).toBe("note"); // toggle rejected for a monophonic instrument
  });

  it("only ever plays a single note through Violin, never a chord", () => {
    const { engine, violin } = makeEngine();
    engine.setInstrument("violin");
    engine.attack("key:a", "low", 0);
    expect(violin.onCalls).toHaveLength(1);
  });

  it("releases the previous source's voice when Violin steals it (UI must not show a stolen note as still sounding)", () => {
    const { engine, violin } = makeEngine();
    engine.setInstrument("violin");
    const released: string[] = [];
    engine.on("release", ({ source }) => released.push(source));

    engine.attack("key:a", "low", 0); // E3, say
    engine.attack("key:s", "low", 1); // steals the single violin voice

    expect(violin.onCalls).toHaveLength(2);
    expect(released).toEqual(["key:a"]); // the stolen source is released, not just the new one
    expect(engine.isSourceActive("key:a")).toBe(false);
    expect(engine.isSourceActive("key:s")).toBe(true);
  });

  it("releases every held voice and clears state when switching instruments", () => {
    const { engine, piano } = makeEngine();
    engine.attack("key:a", "low", 0);
    engine.setInstrument("violin");
    expect(piano.offCalls).toHaveLength(1);
    expect(piano.allOffCount).toBeGreaterThan(0);
    expect(engine.isSourceActive("key:a")).toBe(false);
  });
});
