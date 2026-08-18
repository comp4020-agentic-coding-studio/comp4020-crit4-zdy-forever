# Crit 4 reflection

**What was the breakthrough that moved the work forward?**

The breakthrough was realising the camera feature needed the same discipline
as the audio engine: a pure, camera-free core wrapped by a thin, untestable
shell. Early on it was tempting to write gesture recognition straight inside
the MediaPipe callback --- classify the hand, decide what it means, act on it,
all in one place, the way it's easy to reach for in a live demo. That shape
can't be unit-tested without a real camera, so I split it: `gesture-classifier.ts`
turns 21 hand landmarks into `"open" | "fist" | "unknown"`, and
`gesture-state-machine.ts` is a plain reducer, `stepHandGesture(state, sample)`,
that turns a stream of those shapes into wheel/play/toggle events with no
DOM or MediaPipe dependency at all. That's what let me actually test the
hardest rule in the whole spec --- a quick, stationary OPEN-FIST-OPEN is a mode
toggle, but the same gesture with either more time or more movement is a
played note --- with plain synthetic data, and catch a wrong assumption in my
own test fixture before it ever reached real code.

**What did this work change about who I want to be as a software developer?**

<!-- TEMPLATE: this half is yours. It asks what the work changed about you,
     and that's not something anyone else can answer on your behalf --- fill
     it in with what actually shifted for you working through Crit 4, then
     delete this comment. -->
