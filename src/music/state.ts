// The single authoritative musical-state model. Every input controller
// (keyboard, pointer/touch, camera) calls the same handful of methods here;
// none of them know about oscillators, and none of them keep their own copy
// of "what mode is LOW register in". That lives here, once.
import type { Instrument, VoiceHandle } from "../audio/instrument";
import { noteNameToFrequency } from "../audio/note-utils";
import { getNotesForSector } from "./mapping";
import type { Mode, Register } from "./tables";

export type InstrumentId = "piano" | "violin";

export type SourceId = string;

export interface MusicEngineEvents {
  modechange: { register: Register; mode: Mode };
  instrumentchange: { instrument: InstrumentId };
  attack: { source: SourceId; register: Register; sector: number; mode: Mode; velocity: number };
  release: { source: SourceId; register: Register; sector: number };
}

type Listener<K extends keyof MusicEngineEvents> = (payload: MusicEngineEvents[K]) => void;

interface ActiveVoice {
  register: Register;
  sector: number;
  handles: VoiceHandle[];
}

export class MusicEngine {
  private mode: Record<Register, Mode> = { low: "note", high: "note" };
  private instrumentId: InstrumentId = "piano";
  private readonly active = new Map<SourceId, ActiveVoice>();
  private readonly listeners: {
    [K in keyof MusicEngineEvents]: Set<Listener<K>>;
  } = {
    modechange: new Set(),
    instrumentchange: new Set(),
    attack: new Set(),
    release: new Set(),
  };

  constructor(private instruments: Record<InstrumentId, Instrument>) {}

  on<K extends keyof MusicEngineEvents>(event: K, fn: Listener<K>): () => void {
    this.listeners[event].add(fn as never);
    return () => this.listeners[event].delete(fn as never);
  }

  private emit<K extends keyof MusicEngineEvents>(event: K, payload: MusicEngineEvents[K]): void {
    for (const fn of this.listeners[event]) fn(payload);
  }

  getMode(register: Register): Mode {
    return this.mode[register];
  }

  getInstrumentId(): InstrumentId {
    return this.instrumentId;
  }

  private get instrument(): Instrument {
    return this.instruments[this.instrumentId];
  }

  /** Violin has no chords: forced NOTE, and toggling is ignored while it's active. */
  toggleMode(register: Register): void {
    if (!this.instrument.polyphonic) return;
    this.mode[register] = this.mode[register] === "note" ? "chord" : "note";
    this.emit("modechange", { register, mode: this.mode[register] });
  }

  setInstrument(id: InstrumentId): void {
    if (id === this.instrumentId) return;
    this.releaseAll();
    this.instrumentId = id;
    if (!this.instruments[id].polyphonic) {
      for (const register of ["low", "high"] as const) {
        if (this.mode[register] !== "note") {
          this.mode[register] = "note";
          this.emit("modechange", { register, mode: "note" });
        }
      }
    }
    this.emit("instrumentchange", { instrument: id });
  }

  /**
   * Starts (or restarts) a note/chord for one input source. A polyphonic
   * instrument just adds voices; a monophonic one steals its single voice
   * from whichever source held it before — see Violin's own generation
   * counter, which makes a stale release() from the old source a no-op.
   */
  attack(source: SourceId, register: Register, sector: number, velocity = 1): void {
    this.releaseSource(source);
    const mode = this.instrument.polyphonic ? this.mode[register] : "note";
    const notes = getNotesForSector(register, sector, mode);
    const handles = notes.map((note) =>
      this.instrument.noteOn(noteNameToFrequency(note), velocity),
    );
    this.active.set(source, { register, sector, handles });
    this.emit("attack", { source, register, sector, mode, velocity });
  }

  release(source: SourceId): void {
    const voice = this.active.get(source);
    this.releaseSource(source);
    if (voice) this.emit("release", { source, register: voice.register, sector: voice.sector });
  }

  private releaseSource(source: SourceId): void {
    const voice = this.active.get(source);
    if (!voice) return;
    for (const handle of voice.handles) this.instrument.noteOff(handle);
    this.active.delete(source);
  }

  releaseAll(): void {
    for (const source of this.active.keys()) this.releaseSource(source);
    for (const instrument of Object.values(this.instruments)) instrument.allNotesOff();
  }

  isSourceActive(source: SourceId): boolean {
    return this.active.has(source);
  }
}
