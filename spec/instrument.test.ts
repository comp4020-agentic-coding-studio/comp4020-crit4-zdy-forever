import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Turns crit-4 ("An instrument")'s published spec into checks. Run `pnpm
// build` first (the `check` script does). Most of the spec is the crit's ear
// to judge -- expressiveness, whether a stranger finds music in it
// uninstructed, feel -- these two lines are the only mechanically checkable
// ones; see the published spec for the rest.
const DIST = resolve("dist");

function filesWithExt(ext: string, dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesWithExt(ext, path);
    return entry.name.endsWith(ext) ? [path] : [];
  });
}

const htmlDocs = filesWithExt(".html").map(
  (path) => new JSDOM(readFileSync(path, "utf8")).window.document,
);
const scripts = filesWithExt(".js").map((path) => readFileSync(path, "utf8"));

describe("the browser is the instrument -- sound made live, not played back", () => {
  it("uses the Web Audio API somewhere in the shipped bundle", () => {
    const usesWebAudio = scripts.some((src) => /AudioContext/.test(src));
    expect(
      usesWebAudio,
      "no AudioContext found in dist/**/*.js -- sound must be synthesised live via the Web Audio API, not played back",
    ).toBe(true);
  });

  it("doesn't fall back to playing pre-rendered audio/video files", () => {
    for (const doc of htmlDocs) {
      expect(
        doc.querySelectorAll("audio, video").length,
        "found <audio>/<video> -- the spec asks for sound made live by the player, not played back from a file",
      ).toBe(0);
    }
  });
});

describe("playable with whatever is at hand -- mouse, keyboard or touch", () => {
  it("has at least one keyboard-reachable control in the instrument itself", () => {
    for (const doc of htmlDocs) {
      // Scoped to <main>, not the whole document -- the starter's nav link is
      // always focusable and would make this pass before any instrument exists.
      const main = doc.querySelector("main");
      const focusable = main?.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      expect(
        focusable?.length ?? 0,
        "no natively focusable control found inside <main> -- a keyboard-only player needs something to reach with Tab",
      ).toBeGreaterThan(0);
    }
  });
});
