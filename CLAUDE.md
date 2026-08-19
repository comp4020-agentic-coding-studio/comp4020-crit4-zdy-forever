# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Run `pnpm check` before you push.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't.
- When a check fails, read its output before you change anything.
- Never commit a red state.

## Background processes (pnpm/node)

- At the start of every conversation, check for stray background processes
  left running from earlier sessions before starting new ones:
  `ps -eo pid,etime,command | grep -E 'pnpm|vite|node' | grep -v grep`.
- Only one `pnpm dev` should be running for this repo at a time. Check the
  dev port isn't already bound (`lsof -i :5173`) before starting another.
- Kill any `pnpm`/`vite`/`node` background process for this repo that's been
  idle for more than 15 minutes (no recent log output, no one actively using
  it) instead of leaving it running indefinitely.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it, alongside a `description` meta `spec/invariants.test.ts`
also checks for. The card URL resolves against the page that names it, like
any link --- `./card.png` is wrong one directory down.

## The violin is an AudioWorklet, and it is generated

`public/violin-worklet.js` is a **generated file --- never edit it by hand.**
It holds the violin's synthesis as sample-level DSP running on the audio
thread. Four attempts to build that timbre out of Web Audio nodes were
rejected by ear in a row (brass, big brass, synthesiser, electric guitar),
because a node graph gives you one periodic source through one filter chain
under one envelope, and that topology forces every harmonic to move in
lockstep and produces a smooth, monotonic harmonic series. A bowed string is
the opposite of both.

    node tools/violin-lab/render.mjs [slug]     # render candidates to WAV
    node tools/violin-lab/build-worklet.mjs     # regenerate the shipped file
    node tools/violin-lab/verify-worklet.mjs    # assert it still matches
    node tools/violin-lab/selftest.mjs          # calibrate the analyser

### Audition timbres offline, not through the browser

`tools/violin-lab/` renders candidates to WAV in Node so a timbre can be
judged with `afplay` instead of a rebuild-and-replay round trip. Candidates
are pure sample-level JS with no Web Audio nodes, so the same code runs in
Node and in the worklet --- `verify-worklet.mjs` asserts the shipped file is
sample-identical to the approved candidate at every pitch. A rendered
baseline was confirmed by ear to match the browser exactly, so the lab is a
faithful proxy. `tools/violin-lab/out/` is gitignored (1.6 MB per WAV).

Two traps this cost real time on:

- **Trust a measure only after calibrating it.** The analyser's first
  `noiseRatio` scored a pure sine as 34% noise, because it compared one peak
  bin per harmonic against every bin's energy. `selftest.mjs` renders signals
  whose answers are known, and exists so no candidate is ever tuned against a
  broken number again.
- **AudioWorklet module fetches are invisible** to the CDP network log and to
  `performance.getEntriesByType("resource")`. Their absence proves nothing.
  To check the module really loaded, construct an `AudioWorkletNode` for the
  processor on the page's own `AudioContext` --- it throws if it never
  registered.

### Level, not timbre, is tuned on the main thread

`src/audio/violin.ts` trims the worklet's output with a gain node, measured
against the piano through the running page (they now sit within ~0.3 dB).
Level changes belong there so the DSP stays byte-for-byte what was approved.
The violin's own sustain wobbles ±7%, so a single RMS reading means nothing
--- average several.

## Camera hand-loss timing is wall-clock, not frame count

`gesture-state-machine.ts` used to hide a hand's wheel after N consecutive
"unknown" samples. That reads fine in tests, where samples arrive on a fixed
16ms tick, but real `detectForVideo` calls run at whatever rate the CPU can
manage, and a closed fist genuinely reads as lower-confidence to MediaPipe
than an open palm (fewer visible landmarks) — so a live camera hits brief,
routine drops mid-play, and a frame-count threshold fires at a wildly
different wall-clock delay depending on machine load. That showed up as the
tracked wheel intermittently vanishing (and the lock/enlarge effect
cancelling) during ordinary single-hand play, on real hardware, not in the
test suite. Fixed by timing the grace period from `HandGestureState.lastSeenAt`
instead of counting samples (`missingGraceMs`, currently 400ms). If this ever
needs re-tuning, do it against a real camera, not by staring at the frame
math — this class of bug is invisible in `gesture-state-machine.test.ts`'s
fixed-tick samples by construction.

## Two CSS transitions added on the same tick can silently race

Fixing the wheel re-tracking bug above (adding `wheel-visible` and
`wheel-locked` together, in the same frame, when a hand reappears already a
fist) exposed a subtler problem: the wheel's grow transition (0.25s) was
finishing before its fade-in (0.35s) even completed, so most of the "enlarge"
played out while the wheel was still mostly transparent — it read as
"appeared already big," not as growing. Fixed with a `transition-delay` on
`width` so the grow only starts once the fade is mostly done
(`styles.css`, `.wheel-floating.wheel-locked`). When two state changes can
land in the same tick, checking that each transition *individually* fires
isn't enough — check what the combination looks like against the clock
(`getComputedStyle` sampled every frame, not just before/after).

## The checks

`typecheck`, `build`, `deploy`, `spec`, `lint`, `tests`, `evidence`, `links`,
`secrets`. `pnpm check` runs the local ones (`pnpm check:evidence` is the
extra gate before you ship); CI runs the same plus `links`, `secrets` and the
`deploy`. Read the failure.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook. As you learn what your prototype needs --- a
convention the work has to hold to, a sensor that keeps catching you out, a fact
about the stack that is easy to get wrong --- write it down here. Growing this
file is the work.
