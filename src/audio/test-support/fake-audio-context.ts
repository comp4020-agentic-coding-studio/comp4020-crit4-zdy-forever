// A minimal stand-in for the Web Audio nodes Piano/Violin use, so their real
// voice-management logic (stealing, envelopes, cleanup) can run in Vitest's
// jsdom environment, which has no real AudioContext. It tracks just enough
// (started/stopped, connections, event listeners) for assertions; it does
// not simulate actual scheduling or signal processing.

class FakeAudioParam {
  value: number;
  constructor(initial: number) {
    this.value = initial;
  }
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number): this {
    this.value = value;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

class FakeAudioNode {
  connections: FakeAudioNode[] = [];
  disconnected = false;
  private listeners = new Map<string, Set<() => void>>();

  connect(destination: FakeAudioNode): FakeAudioNode {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
    this.connections = [];
  }

  addEventListener(type: string, fn: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
  }

  dispatch(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
}

export class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam(1);
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type = "lowpass";
  frequency = new FakeAudioParam(350);
  Q = new FakeAudioParam(1);
}

export class FakeOscillatorNode extends FakeAudioNode {
  type = "sine";
  frequency = new FakeAudioParam(440);
  detune = new FakeAudioParam(0);
  started = false;
  stopped = false;

  start(): void {
    this.started = true;
  }

  /** Fires 'ended' synchronously — real timing doesn't matter for logic tests. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.dispatch("ended");
  }
}

export class FakeAudioContext {
  currentTime = 0;
  destination = new FakeAudioNode();
  /** Every oscillator this context has ever created, in creation order. */
  readonly oscillators: FakeOscillatorNode[] = [];

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    return new FakeBiquadFilterNode();
  }

  createOscillator(): FakeOscillatorNode {
    const osc = new FakeOscillatorNode();
    this.oscillators.push(osc);
    return osc;
  }
}
