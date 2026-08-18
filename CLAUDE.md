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

## The checks

`typecheck`, `build`, `deploy`, `spec`, `lint`, `tests`, `evidence`, `links`,
`secrets`. Run `pnpm check`. Read the failure.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook. As you learn what your prototype needs --- a
convention the work has to hold to, a sensor that keeps catching you out, a fact
about the stack that is easy to get wrong --- write it down here. Growing this
file is the work.
