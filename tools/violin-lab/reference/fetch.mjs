// Downloads the reference recordings the numbers in targets.mjs were measured
// from, and converts them to 48 kHz mono float WAV (needs ffmpeg on PATH).
//
// Source: University of Iowa Electronic Music Studios, Musical Instrument
// Samples (MIS). Free for any use. https://theremin.music.uiowa.edu/MIS.html
//
// Nothing here ships; it is bench material, and the audio is deliberately not
// committed (tens of MB). Run this when you want to re-derive the targets.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIO = join(HERE, "audio");

const FILES = [
  "MIS/Strings/violin2012/Violin.arco.mf.sulD.D4B4.mono.aif",
  "MIS/Strings/violin2012/Violin.arco.ff.sulD.D4B4.mono.aif",
  "MIS/Strings/violin2012/Violin.arco.mf.sulA.A4B4.mono.aif",
  // brass reference, for the "does this read as a horn" comparison
  "MIS/Brass/Bbtrumpet/Trumpet.novib.mf.C4B4.aiff",
];

if (!existsSync(AUDIO)) mkdirSync(AUDIO, { recursive: true });

for (const path of FILES) {
  const base = path.split("/").pop();
  const aif = join(AUDIO, base);
  const wav = join(AUDIO, base.replace(/\.aiff?$/, ".wav"));
  if (existsSync(wav)) {
    console.log("have", wav);
    continue;
  }
  const url = `https://theremin.music.uiowa.edu/sound%20files/${path.split("/").map(encodeURIComponent).join("/")}`;
  console.log("GET", url);
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  writeFileSync(aif, Buffer.from(await res.arrayBuffer()));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aif, "-ar", "48000", "-ac", "1", "-c:a", "pcm_f32le", wav]);
  console.log("wrote", wav);
}
