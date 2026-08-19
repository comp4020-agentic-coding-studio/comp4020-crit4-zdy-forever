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

I got more comfortable saying "still wrong" instead of settling. The Violin's
timbre got rejected by ear four times in a row, and each time it would have
been easy to accept a slightly-better-than-before result rather than push for
a fundamentally different approach. The turning point was realising that
repeated failure of the *same kind* is information: it meant the whole
technique, not the parameters, was wrong, and no amount of further tuning
was going to fix it. That's a habit I want to keep — treating a pattern of
similar failures as a signal to change direction, not as a reason to try
harder at the same thing.

The other shift was about where truth lives. A green `pnpm check` and code
that reads correctly both told me nothing about whether two hands would
fight over the same wheel on real, noisy camera input, or whether a chord
actually clipped through real speakers. Every bug worth finding this round
only showed up by actually using the thing — on hardware, by ear, frame by
frame. I want to carry that forward: build fast ways to check the real
thing (the offline audition lab, a controller driven by a fake camera feed)
rather than trusting that a clean abstraction and a passing test suite mean
the system behaves correctly end to end.
