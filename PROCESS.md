# Process overview

A reading-guide to how the work came together --- a map to your process, not an
essay about it. Markers read this file and follow its citations; they don't
trawl the repo for evidence you didn't point at, so if a moment mattered, cite
it.

This file is the shape; the course site's
[assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
is the requirement, and its
[word counts](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#word-counts)
cover every deliverable.

## What I built

Two Hands: a browser instrument with no backend and no prerecorded audio.
Two independently controllable registers (LOW C3--C4, HIGH C4--C5), each an
eight-sector "liquid-glass" wheel that plays a note per sector in NOTE mode or
a triad in CHORD mode, live through the Web Audio API. Piano is polyphonic;
Violin is strictly monophonic with last-note-priority voice stealing, and its
timbre is sample-level DSP running in an `AudioWorkletProcessor` rather than a
Web Audio node graph. Keyboard, mouse, and touch (via Pointer Events) all
drive the same central
`MusicEngine`, and an optional camera mode layers two-hand tracking
(MediaPipe Tasks Vision) on top as progressive enhancement: an open palm
summons a floating echo of a register's wheel, a fist locks it and reaching
in a direction plays that sector with distance-driven expressive gain, and a
quick, stationary OPEN-FIST-OPEN toggles NOTE/CHORD instead.

## The moments that mattered

1. **The spec's own audio/video ban shaped the camera architecture, not just
   its DOM.** `spec/instrument.test.ts` fails the whole build if any built
   HTML contains an `<audio>`/`<video>` tag, and the camera feature needs a
   `<video>` element to feed MediaPipe. The obvious move was to drop one in
   `index.html` and let the check catch anything that made it a fallback for
   real audio; instead `hand-tracker.ts` creates the element at runtime, only
   once the player explicitly clicks "Enable Camera", so the static markup
   never contains one at all, on or off
   ([`abd7d40`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-zdy-forever/commit/abd7d40)).
   I knew it held because I re-ran `pnpm build` and grepped `dist/**/*.html`
   for `<video`/`<audio>` by hand before trusting the automated check again.

2. **A real browser caught a bug a green `pnpm check` couldn't, and the fix
   went into the test suite, not just the code.** Holding two keys on the
   same Violin register at once left both sectors lit on the wheel, even
   though the audio was correct (voice-stealing had silenced the older
   note). The obvious fix was Violin-specific --- patch its own UI
   reporting --- but the bug wasn't really Violin's: `MusicEngine.attack()`
   tracked "active" per input source, not per instrument voice, so *any*
   monophonic instrument would eventually show the same lie. I fixed it at
   that layer instead: releasing every other source once a monophonic
   instrument's note lands. I knew it held because I added a unit test for
   exactly that behaviour, watched it fail against the old code, then
   reopened the same two-keys-held sequence in the browser and watched only
   the newer sector stay lit
   ([`06da29f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-zdy-forever/commit/06da29f)).

3. **Four rejections in a row meant the problem was the technique, not the
   numbers, so instead of a fifth retry I built a check that could tell them
   apart.** Every Violin patch so far was a Web Audio node graph --- one
   oscillator through one filter chain under one envelope --- and each
   rewrite was rejected by ear in turn: wind instrument, then brass, then
   synthesiser, then electric guitar:

   > 小提琴音色还是不对 还是管乐 彻底换个方向

   The obvious next move was another tuned variant of the same shape; instead
   I built `tools/violin-lab/`, which renders candidate DSP to WAV in plain
   Node (no Web Audio nodes at all) so a timbre could be judged by ear in
   seconds instead of a rebuild-and-replay round trip, and I calibrated the
   lab's own spectral-noise measure against signals with known answers
   (`selftest.mjs`) before trusting it to judge anything, after it first
   scored a pure sine as 34% noise. `build-worklet.mjs` now assembles the
   shipped `public/violin-worklet.js` from whichever candidate file was
   approved, verbatim, and `verify-worklet.mjs` is a standing check that
   re-renders both and fails if they ever stop being sample-identical
   ([`f6cd0e5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-zdy-forever/commit/f6cd0e5)).
   That check is the actual deliverable of this moment: it turns "trust me,
   it still sounds like the approved take" into something that goes red the
   moment it stops being true.

4. **A camera bug that "sometimes" happened pointed at a wrong assumption in
   the harness's own clock, not at the gesture logic.**

   > 在轮盘消失之后啊 要重新追踪手部啊

   `gesture-state-machine.test.ts` already proved the per-hand reducer
   correct, so the obvious suspect was that reducer. It wasn't: hand-loss was
   judged by a fixed count of consecutive bad frames, which is a wildly
   different wall-clock delay depending on how fast `detectForVideo` happens
   to be running on a given machine, and a closed fist genuinely reads as
   lower-confidence to MediaPipe than an open palm --- so ordinary tracking
   noise mid-play kept crossing that threshold and resetting the hand. I
   changed the rule itself, timing the grace period from elapsed
   milliseconds instead of a frame count, and wrote that down in `CLAUDE.md`
   so the next timing bug in this file doesn't get "fixed" by nudging the
   same wrong kind of number
   ([`8cc3ec8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-zdy-forever/commit/8cc3ec8)).
   I confirmed it by driving the real controller with a synthetic camera feed
   paced on actual `requestAnimationFrame` ticks (`camera-controller.test.ts`
   --- a file that didn't exist before this bug), not the fixed-tick samples
   a unit test would default to, and checked the wheel survived a 200ms
   dropout mid-lock without unlocking, then still hid correctly after a
   genuine one-second absence.

## Before you ship

`pnpm check:evidence` verifies your citations resolve to real commits, that the
current reflection entry is in `reflections/`, and that your `CLAUDE.md` is
there --- before a marker ever opens the file. It checks that your map is
traceable, not that it is good: the marker judges whether your small,
deliberately chosen set of moments shows real judgement and reflection. A green
check is not a substitute for that curation.

Images are deliberately not checked, because whether one renders is visible the
moment you look. Open this file on GitHub and look at it before you ship.
