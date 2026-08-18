# COMP4020 Crit 04 — Build a Playable Browser Instrument

Build my COMP4020 Crit 04 instrument completely.

Do not stop after producing a plan. First inspect the existing repository, including `README`, `CLAUDE.md`, package scripts, starter structure, existing invariant checks, and deployment setup. Then give a short implementation plan and immediately execute it.

Work autonomously through implementation, testing, debugging, documentation, and final build verification. Do not wait for approval between phases. If something fails, diagnose it, fix it, and rerun the relevant checks.

Do not unnecessarily replace the starter architecture or introduce a backend. This must remain a client-side browser instrument suitable for GitHub Pages.

## 1. Assignment constraints

The finished project must satisfy COMP4020 Crit 04:

- The browser itself is the musical instrument.
- Audio is generated live from player input in the page using the Web Audio API.
- Do not simply play back complete prerecorded musical phrases.
- The instrument must be expressive: different player choices should create noticeably different performances.
- A stranger should be able to open the page and make the first sound without reading instructions.
- Keyboard, mouse, and touch must provide a complete playable fallback.
- Camera hand tracking is an enhanced interaction mode, not a requirement for basic play.
- There must be no score, fail state, game-over state, wrong-note warning, or concept of playing incorrectly.
- It must work as a static GitHub Pages deployment.
- Existing starter invariant checks must continue to pass.
- The git history should show meaningful development stages.
- Maintain a factual `PROCESS.md`.
- Maintain `reflections/crit-4.md` based only on work actually performed. Do not fabricate development events.

The most important quality criterion is playability, not feature count.

---

# 2. Core concept

The instrument has two independent musical registers corresponding conceptually to the player's two hands.

LEFT HAND / LOW REGISTER:

C3 → D3 → E3 → F3 → G3 → A3 → B3 → C4

RIGHT HAND / HIGH REGISTER:

C4 → D4 → E4 → F4 → G4 → A4 → B4 → C5

Each register can independently operate in either:

**NOTE mode**
or
**CHORD mode**

For camera interaction:

- the physical left hand controls the low register;
- the physical right hand controls the high register.

Both hands should be able to operate simultaneously when using the Piano instrument.

---

# 3. Development order

Implement this in the following order.

### Phase 1 — Audio engine

Build the Web Audio engine first.

Use the native Web Audio API unless the existing starter architecture provides a compelling reason otherwise.

Do not depend on a server.

Implement:

- note frequency calculation using equal temperament with A4 = 440 Hz;
- note attack;
- note release;
- voice cleanup so AudioNodes are not leaked;
- polyphony for Piano;
- monophonic voice stealing for Violin;
- audio-context resume/unlock after the first valid user gesture;
- protection against stuck notes.

Keep audio-engine state separated from UI state.

---

# 4. Piano synthesis

The default instrument is:

**Piano**

It does not need to reproduce a concert piano perfectly, but it should sound recognisably piano-like rather than like a raw sine oscillator.

Use Web Audio synthesis such as:

- multiple harmonics/oscillators;
- fast attack;
- natural exponential decay;
- gentle filtering;
- short release;
- velocity-dependent gain.

Avoid large audio assets if synthesis can achieve an acceptable result.

Piano supports:

- multiple simultaneous notes;
- simultaneous left/right hand input;
- NOTE mode;
- CHORD mode.

---

# 5. Notes

The eight low-register notes are:

C3  
D3  
E3  
F3  
G3  
A3  
B3  
C4

The eight high-register notes are:

C4  
D4  
E4  
F4  
G4  
A4  
B4  
C5

Do not use a chromatic 12-note octave for this concept. These are intentionally eight diatonic positions.

---

# 6. Chords

Each register also has eight corresponding diatonic triads in C major.

LOW REGISTER:

C3 → C3 E3 G3  
D3 → D3 F3 A3  
E3 → E3 G3 B3  
F3 → F3 A3 C4  
G3 → G3 B3 D4  
A3 → A3 C4 E4  
B3 → B3 D4 F4  
C4 → C4 E4 G4

HIGH REGISTER:

C4 → C4 E4 G4  
D4 → D4 F4 A4  
E4 → E4 G4 B4  
F4 → F4 A4 C5  
G4 → G4 B4 D5  
A4 → A4 C5 E5  
B4 → B4 D5 F5  
C5 → C5 E5 G5

Therefore the musical progression is:

C major  
D minor  
E minor  
F major  
G major  
A minor  
B diminished  
C major

Do not label these as good/bad/correct/incorrect. They are simply musical choices.

---

# 7. Physical keyboard controls

Implement keyboard interaction before camera interaction.

Use this mapping.

## Low register — left side of keyboard

A = C3  
S = D3  
D = E3  
F = F3  

Z = G3  
X = A3  
C = B3  
V = C4

## High register — right side of keyboard

J = C4  
K = D4  
L = E4  
; = F4  

M = G4  
, = A4  
. = B4  
/ = C5

These keys should be clearly visible in the UI.

Use:

**1** = toggle LOW register between Note / Chord

**0** = toggle HIGH register between Note / Chord

Prevent browser key repeat from spawning uncontrolled duplicate voices.

For Piano:

- keydown starts the note/chord;
- keyup releases it;
- multiple keyboard inputs may overlap.

Visual feedback must happen immediately when a key is pressed.

---

# 8. Mouse and touch

The Crit must not depend only on a hardware keyboard or camera.

Create visible controls that can be played directly with:

- mouse;
- touchscreen;
- keyboard.

The on-screen controls should expose the same two groups of eight musical positions.

Mouse/touch input must use the exact same audio engine and mapping as keyboard/camera input.

Support pointer events rather than maintaining completely separate mouse and touch implementations where possible.

If feasible without destabilising the implementation, allow multi-touch so two musical positions can be played together on Piano.

---

# 9. Main visual direction

The visual identity should be minimal, dark, elegant, and highly interactive.

Do not make this look like a normal DAW or a traditional piano application.

The important visual object is a pair of circular **liquid-glass musical wheels**.

Use a modern liquid-glass aesthetic:

- translucent surfaces;
- backdrop blur;
- subtle refraction-like gradients;
- soft highlights;
- fluid movement;
- restrained glow;
- smooth spring-like transitions;
- clear active-sector feedback.

Do not sacrifice usability for visual effects.

The player should understand where interaction is possible within a few seconds.

Avoid large paragraphs of tutorial text.

Prefer visual affordances and tiny labels such as:

`LOW · C3–C4`

`HIGH · C4–C5`

`NOTE`

`CHORD`

`PIANO`

`VIOLIN`

---

# 10. Eight-direction wheel

Each hand has a circular wheel divided into eight directional sectors.

Map sectors clockwise beginning at the top:

N → C  
NE → D  
E → E  
SE → F  
S → G  
SW → A  
W → B  
NW → high C

For the left hand those are C3–C4.

For the right hand those are C4–C5.

In Chord mode the exact same sectors trigger the corresponding chords.

The currently active direction should visibly illuminate/deform/highlight.

The wheel must clearly display all eight possible destinations without requiring text instructions.

---

# 11. Camera mode

After keyboard + pointer interaction is fully working, implement camera control.

Add a clearly visible but non-blocking action such as:

**Enable Camera**

The user must explicitly enable camera permission.

If camera access is unavailable or denied, nothing should break. Keyboard/mouse/touch interaction must remain fully functional.

Camera processing must happen locally in the browser.

Do not upload frames anywhere.

Use an appropriate browser hand-tracking solution such as MediaPipe Tasks Vision Hand Landmarker if compatible with the existing stack and GitHub Pages.

Avoid adding a larger ML framework if MediaPipe can handle the requirement.

Support two hands simultaneously.

Correctly account for the mirrored selfie camera so that the player's actual left hand controls LOW and actual right hand controls HIGH.

---

# 12. Hand tracking state

For each detected hand maintain independent state:

- handedness;
- confidence;
- smoothed palm position;
- gesture: OPEN / FIST / UNKNOWN;
- wheel anchor point;
- active sector;
- mode: NOTE / CHORD;
- whether the hand is currently playing;
- gesture timing;
- movement since fist began.

Use a palm centre derived from stable hand landmarks rather than a single fingertip.

Smooth the hand position enough to remove camera jitter, but do not create noticeable latency.

Do not trigger musical events from low-confidence or unstable hand detections.

---

# 13. OPEN PALM behaviour

When the player shows an open palm:

A liquid-glass wheel appears centred around that hand's palm.

The wheel should visually follow the hand while the hand remains open.

For example:

- left open palm → LOW C3–C4 wheel;
- right open palm → HIGH C4–C5 wheel.

At this stage the wheel is not locked.

It acts as the player's movable instrument interface.

---

# 14. FIST behaviour

When OPEN changes to FIST:

lock the wheel at the palm position where the fist began.

The wheel must stay fixed in screen space even when the fist moves.

The fist then becomes the controller moving relative to the locked wheel centre.

Calculate:

`dx = fistX - wheelCenterX`

`dy = fistY - wheelCenterY`

Use `atan2` to determine one of the eight sectors.

Use radial distance from the centre to determine whether the fist has moved far enough to intentionally select a direction.

Implement:

- centre dead zone;
- activation radius;
- hysteresis around sector boundaries;
- smoothing/debouncing.

The purpose is to avoid jitter rapidly retriggering neighbouring notes.

---

# 15. Camera musical interaction

Once the wheel is locked:

moving the fist into one of its eight directions triggers the corresponding sound.

Example for RIGHT hand in NOTE mode:

top → C4  
top-right → D4  
right → E4  
bottom-right → F4  
bottom → G4  
bottom-left → A4  
left → B4  
top-left → C5

LEFT hand behaves identically but uses C3–C4.

Changing sector should smoothly change/retrigger the selected sound.

Do not continuously spawn thousands of oscillator nodes every camera frame.

Trigger audio events only when the meaningful musical state changes.

---

# 16. Expressive movement

Camera input should affect more than just pitch.

Use radial distance from the locked wheel centre as a lightweight expressive parameter.

For example:

closer to activation boundary = softer

farther toward the outside = stronger

Map this to gain/velocity and, if musically useful, subtle timbral brightness.

Clamp the result to a comfortable range.

Do not make the user move huge distances.

This should make two people playing the same notes still sound slightly different depending on how they move.

---

# 17. Note / Chord camera gesture

I specifically want:

**OPEN → FIST → OPEN**

to switch that hand between NOTE and CHORD mode.

However this must not conflict with the ordinary play interaction.

Resolve it using the following rule.

If the player:

1. begins OPEN;
2. closes to FIST;
3. barely moves the fist;
4. opens the hand again quickly;

interpret this as a **mode toggle**.

Use sensible calibrated values roughly in the region of:

- total duration < 600–800 ms;
- displacement below a hand-size-normalised threshold.

Do not depend entirely on raw screen pixels if hand scale information is available.

When detected:

NOTE → CHORD

or

CHORD → NOTE

Show immediate visual feedback in that hand's wheel.

For example the centre label morphs from:

NOTE

to:

CHORD

Do not produce an error message.

---

# 18. Normal fist movement must NOT toggle modes

If OPEN → FIST is followed by meaningful directional movement, interpret it as playing.

When the player finally opens their hand:

release/unlock the wheel and return it to following the open palm.

Do NOT toggle NOTE/CHORD in this case.

This distinction is important.

A stationary quick fist gesture is a mode command.

A moving fist is musical input.

---

# 19. Instrument selector

Add a simple instrument/timbre selector.

Initially provide:

**Piano** — default  
**Violin**

Design the architecture so another timbre could be added later without rewriting every input system.

All input systems should feed a central musical-intent layer:

keyboard  
pointer/touch  
camera

↓

musical event

↓

instrument/audio engine

Do not duplicate synthesis logic inside each controller.

---

# 20. Violin mode

Violin has an important constraint:

**Violin is monophonic.**

It may play only ONE note globally at any given moment.

Violin must NOT support chords.

When the player switches from Piano to Violin:

1. release any currently active piano/chord voices safely;
2. force LOW mode to NOTE;
3. force HIGH mode to NOTE;
4. disable chord toggles visually;
5. ignore chord-toggle keyboard/gesture commands while Violin is active.

Do not show this as an error.

Simply communicate through disabled controls and subtle UI state.

---

# 21. Violin input overwrite / voice stealing

Implement **last-note priority** for Violin.

Whenever a new valid note arrives from ANY input source:

- keyboard;
- mouse;
- touch;
- left hand;
- right hand;

the new note immediately replaces the previous violin note.

The previous violin voice should fade/release very quickly to avoid clicking.

There must never be two simultaneous violin notes.

Example:

LEFT currently plays E3.

RIGHT then selects G4.

E3 stops and G4 becomes the only violin note.

This is the required input-overwrite behaviour.

---

# 22. Violin synthesis

Create a recognisably bowed-string-like synthesised timbre using Web Audio.

Possible characteristics:

- sawtooth-like harmonic source;
- low-pass filtering;
- slower attack than Piano;
- sustained envelope;
- smooth release;
- subtle vibrato after attack;
- slight timbral movement.

Keep it pleasant and restrained.

Do not create harsh, painfully loud oscillator output.

---

# 23. Interaction state architecture

Avoid one huge component containing everything.

Separate concerns into sensible modules such as:

- audio engine;
- instruments;
- music mapping;
- keyboard controller;
- pointer controller;
- hand tracker;
- gesture classifier;
- wheel state;
- UI components.

Do not overengineer with unnecessary abstractions.

Important mapping functions and gesture logic should be pure/testable where practical.

There should be one authoritative musical state model.

Avoid separate conflicting state machines for each input source.

---

# 24. Opening experience

The Crit presentation opens cold: people should be able to try it before I explain anything.

Design the initial screen accordingly.

Do NOT begin with a large tutorial modal.

The first screen should immediately show playable controls.

A stranger should see something like:

**MOVE. PRESS. PLAY.**

or another very short invitation.

Show the playable keyboard keys directly on the controls.

Mouse users should see obvious clickable/touchable sectors.

Camera should appear as an optional enhancement:

`Enable Camera`

If browser autoplay rules require an explicit user gesture before audio can start, unlock/resume the AudioContext from the player's first meaningful pointer/key interaction whenever possible.

Do not make the opening experience a configuration wizard.

---

# 25. Camera UI

When camera mode is active:

- show the mirrored video feed;
- keep it visually secondary to the musical interaction;
- overlay the liquid-glass wheels in the same coordinate space as the hands;
- do not display excessive landmark-debugging graphics in the final UI;
- optionally provide a small debug mode in development only.

If no hand is visible, the UI should remain calm.

Do not show a red error.

Do not frame losing hand tracking as failure.

Wheels may smoothly fade out after a short period of lost tracking.

---

# 26. Responsive design

Make the instrument work at reasonable desktop and mobile/tablet viewport sizes.

Camera mode will primarily be demonstrated on desktop/laptop, but pointer/touch interaction must remain usable on touch devices.

Do not allow controls to overflow badly at small widths.

Keep touch targets sufficiently large.

Respect safe areas where appropriate.

---

# 27. Accessibility and reduced motion

Implement appropriate:

- button labels;
- keyboard focus;
- visible focus states;
- semantic controls;
- reduced-motion handling.

The experience is sound-oriented, but visual feedback should make state changes understandable.

Do not remove keyboard accessibility while implementing global musical keyboard shortcuts.

Avoid hijacking shortcuts while the user is focused on an interactive element that requires typing.

---

# 28. Performance

Camera recognition and Web Audio must feel responsive.

Do not run unnecessary React/state rerenders on every video frame.

Use refs or another suitable mechanism for high-frequency positional state where appropriate.

Only promote state to UI rendering when needed.

Avoid:

- rebuilding the AudioContext;
- creating unbounded oscillators;
- reinitialising the hand detector every frame;
- excessive DOM elements;
- layout thrashing.

The feeling of low latency is more important than elaborate visual effects.

---

# 29. Testing

Add useful automated tests where the repository setup permits them.

At minimum, test logic such as:

- note mappings;
- keyboard mappings;
- eight-sector angle mapping;
- chord mappings;
- LOW/HIGH register mapping;
- Note/Chord mode toggle state;
- Violin forcing NOTE mode;
- Violin rejecting chord mode;
- Violin last-note priority;
- gesture sequence classification;
- stationary quick fist = toggle;
- moving fist = play rather than toggle.

Do not try to fake camera hardware in an unnecessarily complicated test suite.

Use pure gesture-classification functions so the important logic can be tested without a real webcam.

Run all existing starter invariant checks.

Run:

- tests;
- lint;
- type checking;
- production build;

using the scripts actually defined by this repository.

Fix failures rather than merely documenting them.

---

# 30. Manual acceptance tests

Before declaring the work complete, manually reason through and, where tooling permits, verify these cases.

### Keyboard

Press low-register key → correct C3–C4 sound.

Press high-register key → correct C4–C5 sound.

Both sides can play simultaneously on Piano.

Toggle LOW to CHORD → only LOW keys produce chords.

HIGH can remain NOTE.

Toggle HIGH separately.

### Pointer/touch

Every visible sector produces the correct sound.

### Camera

Open left hand → low wheel appears.

Open right hand → high wheel appears.

Both open → two wheels.

Close left fist → left wheel locks.

Move left fist → LOW notes change by direction.

Close right fist → right wheel locks.

Move right fist → HIGH notes change by direction.

Moving one fist does not affect the other hand's wheel.

Quick stationary OPEN→FIST→OPEN → toggles only that hand's Note/Chord mode.

OPEN→FIST→MOVE→OPEN → plays and does not toggle.

### Violin

Switch Piano → Violin.

Chord functionality immediately disables.

Both hands become NOTE mode.

New input replaces old input.

Only one violin note ever sounds.

Switching back to Piano restores chord controls, but keep the state predictable. Do not silently restore a stale chord that the player cannot see; defaulting both hands to NOTE after the switch is acceptable.

### Failure/fallback

Camera denied → keyboard/mouse instrument still works.

Camera hand lost → no crash and no stuck audio.

Rapid key presses → no stuck notes.

Changing instruments while sound is active → no stuck notes.

---

# 31. Visual polish

Once everything works, polish the experience.

Focus on:

- response to input;
- sector deformation;
- wheel movement;
- note attack feedback;
- smooth mode changes;
- strong visual hierarchy;
- subtle depth.

Avoid:

- decorative landing pages;
- excessive explanatory copy;
- fake analytics;
- score counters;
- game mechanics;
- achievement systems;
- unnecessary settings pages.

The instrument itself should dominate the page.

---

# 32. Process documentation

Update `PROCESS.md` while doing the work rather than fabricating process history afterward.

Record important real decisions such as:

- keyboard-first implementation;
- why camera is progressive enhancement;
- how OPEN/FIST gesture ambiguity was resolved;
- why stationary OPEN→FIST→OPEN toggles mode;
- why moving fist means play;
- how jitter was corrected;
- audio decisions;
- any incorrect first implementation and how it was corrected;
- performance corrections;
- tests used to ground decisions.

Keep this factual.

For `reflections/crit-4.md`, create/update the reflection using only events that genuinely occurred during this implementation.

If some part requires my subjective judgement after the live Crit, leave an explicit placeholder rather than inventing a reaction.

---

# 33. Git history

Make meaningful commits as the project grows.

Do not make one giant final commit.

A sensible sequence would roughly correspond to:

1. keyboard + Web Audio core;
2. note/chord mapping + pointer/touch;
3. instrument switching + violin;
4. camera hand tracking;
5. gesture/wheel interaction;
6. polish/accessibility/performance;
7. tests/docs/final fixes.

Do not manufacture fake historical commits for work that did not happen.

Commit messages should describe actual changes.

---

# 34. GitHub Pages

Preserve/configure deployment according to the starter repository.

The application must work from the repository's GitHub Pages base path rather than assuming `/`.

Do not use absolute asset paths that break on GitHub Pages.

Verify the production build.

If the repository includes a GitHub Actions deployment workflow, preserve or correctly update it.

---

# 35. Definition of done

Do not stop merely because the UI renders.

The task is complete only when:

- keyboard instrument works;
- mouse/touch instrument works;
- C3–C4 LOW register works;
- C4–C5 HIGH register works;
- all 16 note positions map correctly;
- Piano chords work;
- LOW/HIGH Note/Chord modes are independent;
- Piano is polyphonic;
- Violin exists;
- Violin is monophonic;
- Violin disables chords;
- latest violin input overrides previous input;
- camera can detect left/right hands;
- open palms create/follow two liquid-glass wheels;
- fists lock those wheels;
- fist movement selects eight directions;
- camera movement generates the corresponding notes/chords;
- stationary OPEN→FIST→OPEN toggles Note/Chord;
- moving OPEN→FIST→MOVE→OPEN does not accidentally toggle;
- camera denial has a graceful fallback;
- audio does not get stuck;
- existing invariant checks pass;
- tests pass;
- typecheck passes;
- lint passes;
- production build passes;
- `PROCESS.md` is updated factually;
- `reflections/crit-4.md` is updated factually;
- GitHub Pages compatibility is preserved.

After completing everything, give me a concise final report containing:

1. what was implemented;
2. important architecture decisions;
3. controls;
4. camera gesture rules;
5. files changed;
6. tests/build/invariant results;
7. any remaining limitations;
8. the exact local command I should run to test it;
9. anything I should specifically demonstrate during the Crit.

Do not stop at a plan. Continue implementing and correcting the project until the above acceptance criteria are satisfied, unless you hit a genuine external blocker that cannot be resolved from the repository or local environment.