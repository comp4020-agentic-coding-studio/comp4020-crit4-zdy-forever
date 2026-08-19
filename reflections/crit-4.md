# Crit 4 reflection

**What was the breakthrough that moved the work forward?**

The breakthrough was switching models instead of re-prompting the same one
again. I wanted the agent to synthesise a genuine bowed-violin sound, and on
Sonnet 5 it kept confidently producing something else --- a trumpet-like
blare, then a synthesiser pad, then an electric guitar --- no matter how I
re-described "violin" in the prompt, because the actual problem was never the
wording: it was reaching for the same node-graph technique every time and
tuning its knobs, which structurally cannot make that sound. Re-explaining
the target harder wasn't going to fix a technique problem. So I switched to
Opus at its highest reasoning effort, and instead of taking one more single
guess at a patch, it built a small offline lab and rendered eight genuinely
different synthesis techniques to audio files I could actually listen to and
pick between, instead of us going back and forth trying to describe a sound
in words. That was the real shift: the model that got it right wasn't the one
that tried harder to describe a violin back to me, it was the one that
stopped trying to nail the description on the first attempt and built a way
for me to just listen and choose.

**What did this work change about who I want to be as a software developer?**

I got more comfortable saying "still not right" instead of settling for
"basically working." The camera wheel took three rounds of testing before it
actually behaved: first two hands would fight over one wheel object, then a
hand that reappeared as a fist stayed invisible even though it was locked and
playing, then the lock's grow animation turned out to be finishing before its
own fade-in even completed. Each fix looked complete on its own, and it would
have been easy to call the feature done after the first or second round. What
changed was noticing that "still wrong, in a different way" is still useful
information --- it meant I hadn't yet found the actual seam the bug lived in,
so I kept testing the real thing instead of trusting that the latest patch
was the last one needed.

The other shift was about where truth lives. A green `pnpm check` and code
that reads correctly both told me nothing about whether two hands would
fight over the same wheel on real, noisy camera input, or whether a chord
actually clipped through real speakers. Every bug worth finding this round
only showed up by actually using the thing — on hardware, by ear, frame by
frame. I want to carry that forward: build fast ways to check the real
thing (the offline audition lab, a controller driven by a fake camera feed)
rather than trusting that a clean abstraction and a passing test suite mean
the system behaves correctly end to end.
