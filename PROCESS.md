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
Violin is strictly monophonic with last-note-priority voice stealing. Keyboard,
mouse, and touch (via Pointer Events) all drive the same central
`MusicEngine`, and an optional camera mode layers two-hand tracking
(MediaPipe Tasks Vision) on top as progressive enhancement: an open palm
summons a floating echo of a register's wheel, a fist locks it and reaching
in a direction plays that sector with distance-driven expressive gain, and a
quick, stationary OPEN-FIST-OPEN toggles NOTE/CHORD instead.

## The moments that mattered

1. **The spec's own audio/video ban shaped the camera architecture, not just
   its DOM.** `spec/instrument.test.ts` fails the whole build if any built
   HTML contains an `<audio>`/`<video>` tag, since a real tag is how a static
   site would fake "live" sound with a recording. The camera feature needs a
   `<video>` element to feed MediaPipe, so I couldn't just drop one in
   `index.html`. Instead `hand-tracker.ts` creates the element at runtime, only
   once the player explicitly clicks "Enable Camera", and `camera-controller.ts`
   mounts it into `#camera-layer` itself
   ([`abd7d40`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-zdy-forever/commit/abd7d40)).
   I knew it held because I re-ran `pnpm build` and grepped `dist/**/*.html` for
   `<video`/`<audio>` by hand before trusting the automated check again --- the
   static markup genuinely never gains one, camera on or off.

2. **stylelint's kebab-case rule caught a BEM habit I didn't notice I still
   had.** I wrote the whole liquid-glass stylesheet using BEM's `block--modifier`
   convention (`wheel--chord`, `sector--active`, ...), which is idiomatic CSS
   but fails this repo's `stylelint-config-standard` `selector-class-pattern`
   rule --- it wants single-dash kebab-case only. `stylelint --fix` fixed 131 of
   143 errors on its own but left every BEM double-dash alone, since renaming a
   class isn't a safe autofix. Rather than loosen the rule, I renamed every
   modifier class to single-dash form across both `styles.css` and
   `wheel.ts`
   ([`272d0b2`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-zdy-forever/commit/272d0b2)).
   I checked it was really fixed, not just quieter, by re-running
   `stylelint styles.css` to zero errors and then grepping both files for the
   old `--` names to confirm nothing still referenced them.

3. **The camera's gesture logic is designed to need no camera to test.** The
   spec calls out that gesture-sequence classification should be pure and
   testable without fake hardware. `gesture-state-machine.ts` takes it
   literally: `stepHandGesture(state, sample)` is a plain reducer over
   `{shape, x, y, t}` samples with no DOM or MediaPipe dependency, so the
   trickiest behavioural rule --- a quick, stationary OPEN-FIST-OPEN is a mode
   toggle, but the same sequence with enough displacement or duration is a
   played note followed by a release --- is asserted directly in
   `gesture-state-machine.test.ts` with synthetic sample sequences, no camera or
   even a browser involved
   ([`ca87dc4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-zdy-forever/commit/ca87dc4)).
   Both the duration threshold and the displacement threshold are exercised as
   independent gating conditions, which is what told me the disambiguation
   logic was actually doing its job and not just passing the happy path.

4. **Actually opening the page in a real browser caught a bug that reading
   the code and a green `pnpm check` both missed.** CLAUDE.md says the
   rendered page is the truth, not my mental model of it, so once a real
   Chrome instance was available I drove the built site directly: switched to
   Violin, held two keys on the same register at once, and watched --- both
   sectors stayed lit, even though `violin.ts`'s voice-stealing correctly
   silences the older oscillator. The audio was right; the wheel was lying
   about which note was actually sounding. The cause was that
   `MusicEngine.attack()` tracked "active" per input source, not per instrument
   voice, so a source that was still physically held kept showing its sector
   as sounding after a monophonic instrument had silently stolen its note out
   from under it. I fixed it by having `attack()` release every other source
   once a monophonic instrument's note lands, added a unit test for it, then
   reopened the same two-keys-held sequence in the browser to confirm only
   the newer sector stayed lit
   ([`06da29f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-zdy-forever/commit/06da29f)).
   The lesson: a passing test suite proves the parts I thought to test are
   correct, not that the whole system is; only actually looking at the running
   page surfaced this one.

## Before you ship

`pnpm check:evidence` verifies your citations resolve to real commits, that the
current reflection entry is in `reflections/`, and that your `CLAUDE.md` is
there --- before a marker ever opens the file. It checks that your map is
traceable, not that it is good: the marker judges whether your small,
deliberately chosen set of moments shows real judgement and reflection. A green
check is not a substitute for that curation.

Images are deliberately not checked, because whether one renders is visible the
moment you look. Open this file on GitHub and look at it before you ship.
