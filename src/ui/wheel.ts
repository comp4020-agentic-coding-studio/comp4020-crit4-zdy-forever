// The liquid-glass wheel: an eight-sector dial shared by every register. The
// same class renders the two docked wheels (mouse/touch/keyboard, always on
// screen) and the floating echoes that appear over the camera feed and
// follow/lock to a tracked hand — only `interactive` and position differ.
import type { MusicEngine } from "../music/state";
import type { Mode, Register } from "../music/tables";
import { KEY_LABEL, notesFor } from "../music/tables";
import { bindSectorPointer } from "../input/pointer";

const SECTOR_COUNT = 8;
const SECTOR_DEGREES = 360 / SECTOR_COUNT;

function wedgeClipPath(sector: number, arcSteps = 10, radius = 52): string {
  const startDeg = sector * SECTOR_DEGREES - SECTOR_DEGREES / 2;
  const endDeg = sector * SECTOR_DEGREES + SECTOR_DEGREES / 2;
  const points = [`50% 50%`];
  for (let step = 0; step <= arcSteps; step += 1) {
    const deg = startDeg + ((endDeg - startDeg) * step) / arcSteps;
    const rad = (deg * Math.PI) / 180;
    const x = 50 + radius * Math.sin(rad);
    const y = 50 - radius * Math.cos(rad);
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${points.join(", ")})`;
}

export interface WheelOptions {
  register: Register;
  caption: string; // e.g. "LOW · C3–C4"
  engine: MusicEngine;
  interactive: boolean;
  onGesture?: () => void;
}

export class Wheel {
  readonly element: HTMLDivElement;
  private readonly sectorEls: HTMLButtonElement[] = [];
  private readonly modeLabel: HTMLSpanElement;
  private centerButton?: HTMLButtonElement;
  private readonly heldCount = Array.from<number>({ length: SECTOR_COUNT }).fill(0);
  private readonly unsubscribers: (() => void)[] = [];

  constructor(private readonly options: WheelOptions) {
    const { register, caption, engine, interactive } = options;
    const notes = notesFor(register);
    const keys = KEY_LABEL[register];

    this.element = document.createElement("div");
    this.element.className = "wheel";
    this.element.dataset.register = register;
    if (!interactive) this.element.classList.add("wheel-floating");

    const glass = document.createElement("div");
    glass.className = "wheel-glass";
    glass.setAttribute("aria-hidden", "true");
    this.element.append(glass);

    const sectors = document.createElement("div");
    sectors.className = "wheel-sectors";
    if (interactive) {
      sectors.setAttribute("role", "group");
      sectors.setAttribute("aria-label", `${caption} sectors`);
    } else {
      sectors.setAttribute("aria-hidden", "true");
    }

    for (let sector = 0; sector < SECTOR_COUNT; sector += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sector";
      button.dataset.sector = String(sector);
      button.style.clipPath = wedgeClipPath(sector);
      button.style.setProperty("--sector-index", String(sector));

      // The label sits at a fixed radius inside the wedge, not centred on the
      // button box — the box's true centre is the shared apex of all eight
      // wedges, where a clip-path would cut the text away.
      const label = document.createElement("span");
      label.className = "sector-label";
      const angle = (sector * SECTOR_DEGREES * Math.PI) / 180;
      const radius = 34;
      label.style.left = `${50 + radius * Math.sin(angle)}%`;
      label.style.top = `${50 - radius * Math.cos(angle)}%`;

      const note = document.createElement("span");
      note.className = "sector-note";
      note.textContent = notes[sector].replace(/\d+$/, "");
      const key = document.createElement("kbd");
      key.className = "sector-key";
      key.textContent = keys[sector];
      label.append(note, key);
      button.append(label);

      if (interactive) {
        button.setAttribute("aria-label", `${notes[sector]} — key ${keys[sector]}`);
        bindSectorPointer(button, register, sector, engine, options.onGesture ?? (() => {}));
      } else {
        button.tabIndex = -1;
        button.style.pointerEvents = "none";
      }

      sectors.append(button);
      this.sectorEls.push(button);
    }
    this.element.append(sectors);

    const center = document.createElement(interactive ? "button" : "div");
    center.className = "wheel-center";
    this.modeLabel = document.createElement("span");
    this.modeLabel.className = "wheel-mode";
    this.modeLabel.textContent = engine.getMode(register).toUpperCase();
    const captionEl = document.createElement("span");
    captionEl.className = "wheel-caption";
    captionEl.textContent = caption;
    center.append(this.modeLabel, captionEl);
    if (interactive && center instanceof HTMLButtonElement) {
      center.type = "button";
      center.setAttribute(
        "aria-label",
        `${caption}: toggle between Note and Chord mode (or press ${register === "low" ? "1" : "0"})`,
      );
      center.addEventListener("click", () => {
        options.onGesture?.();
        engine.toggleMode(register);
      });
    } else {
      center.setAttribute("aria-hidden", "true");
    }
    this.centerButton = interactive && center instanceof HTMLButtonElement ? center : undefined;
    this.element.append(center);

    this.unsubscribers.push(
      engine.on("modechange", (payload) => {
        if (payload.register !== register) return;
        this.setMode(payload.mode);
      }),
      engine.on("attack", (payload) => {
        if (payload.register !== register) return;
        this.markHeld(payload.sector, true);
      }),
      engine.on("release", (payload) => {
        if (payload.register !== register) return;
        this.markHeld(payload.sector, false);
      }),
    );
  }

  private markHeld(sector: number, held: boolean): void {
    this.heldCount[sector] = Math.max(0, this.heldCount[sector] + (held ? 1 : -1));
    const el = this.sectorEls[sector];
    el.classList.toggle("sector-active", this.heldCount[sector] > 0);
    if (held) {
      el.classList.remove("sector-pulse");
      // Re-trigger the attack pulse animation even on a rapid retrigger.
      void el.offsetWidth;
      el.classList.add("sector-pulse");
    }
  }

  setMode(mode: Mode): void {
    this.modeLabel.textContent = mode.toUpperCase();
    this.element.classList.toggle("wheel-chord", mode === "chord");
  }

  /** Disables just the Note/Chord toggle — used while Violin forces NOTE. */
  setModeToggleDisabled(disabled: boolean): void {
    this.element.classList.toggle("wheel-mode-locked", disabled);
    if (this.centerButton) this.centerButton.disabled = disabled;
  }

  setPosition(x: number, y: number): void {
    this.element.style.transform = `translate(${x}px, ${y}px)`;
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle("wheel-visible", visible);
  }

  setActiveSector(sector: number | null): void {
    this.sectorEls.forEach((el, index) => {
      el.classList.toggle("sector-live", index === sector);
    });
  }

  destroy(): void {
    for (const off of this.unsubscribers) off();
    this.element.remove();
  }
}
