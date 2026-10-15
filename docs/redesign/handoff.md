# Final Project redesign — handoff

Branch `final/theseus-redesign`, forked from `main`'s Crit 10 tip (`30aa71a`).
**Nothing on this branch merges to `main` before the Crit 10 cutoff,
2026-10-21T08:30 Australia/Canberra.** Check today's date against that
before assuming it has or hasn't passed.

Read `docs/decisions/0003-settle-and-kept-ships.md` first — it's the spec
for everything below. This file is only the execution tracker.

## What's committed, oldest first

Exploration (docs only, no app code):
- `5c7216e` `c741e66` `fb02d04` `16ada3b` — simulation + visual sketches
  (`docs/redesign/simulation/`, `docs/redesign/prototypes/`)
- `88e7b79` — the written proposal, `docs/redesign/proposal.md`

Slice 1 — ADR + CLAUDE.md (docs only):
- `69435a4` — ADR 0003, Status: Accepted
- `feb9c49` — ADR 0002 forward-link to 0003
- `2335aca` — CLAUDE.md: settle-rule scope section

Slice 2a — migration + eligibility + logging:
- `0118706` — migration 0001: drops the unique index, adds `rules` +
  the mode-aware `BEFORE INSERT` triggers
- `2a82bcd` — eligibility pre-check, `traceFor` ordering fix,
  `holderOf`/`settledPosition`
- `5feee78` — `replace.astro` handles holding/not-here, logs freed/settled
- `53b8a5d` — `spec/eligibility.test.ts`, settle-gated

Slice 2b — CI coverage correction:
- `3933e0a` — CLAUDE.md: spec-before-feat commit ordering + CI-skip rule
- `5fa620e` — CI runs the full spec twice (once, settle)
- `176e6e2` — fails instead of skips when CI leaves RULE_MODE unset;
  settle-by-age test
- `397de7b` — `spec/logging.test.ts` asserts freed/settled lines

Slice 2c — **Your Trace** (this session, done):
- `47b27c8` — `spec/trace.test.ts` (new) + mode-aware
  `spec/realtime.test.ts`/`spec/live-client.test.ts`, written and committed
  red before any implementation
- `11494c8` — spec wording fix (wrong territory label)
- `28c5a95` — `src/lib/db.ts`: `SettleTrace`, `settleTraceFor`,
  `currentTrace` — additive, `traceFor` untouched
- `fe65c66` — `src/pages/index.astro` + new `src/lib/trace-text.ts`:
  settle-mode trace rendering, mode-aware `#how`
- `584645c` — `src/pages/events.ts`: mode-aware snapshot trace shape
- `d1407da` — spec setup bugs found by actually running against a live
  container (reused-visitor-without-freeing, key-order mistakes,
  fake-timers-before-network-call)
- `31b4d05` — `src/lib/live-client.ts`: multi-position marking, richer
  trace rendering, local settle-timer (settling by age has no server
  event, so a holding trace flips to free on the page via a client
  `setTimeout`, never a server push)
- `ba8e569` — real bug found in verification: `events.ts` was resending a
  snapshot on every broadcast anywhere, because `settlesInMs` never
  compares equal to a prior read of itself; excluded from the comparison

Working tree is clean. Nothing staged or uncommitted.

## Verified (fresh Docker build of the exact committed tree, both passes)

```sh
docker rm -f app; docker build -t app .
docker run -d --rm --init --name app -p 8099:8080 -e PORT=8080 --tmpfs /data app
RULE_MODE=once APP_URL=http://localhost:8099 pnpm check
docker stop app

docker run -d --rm --init --name app -p 8099:8080 -e PORT=8080 -e RULE_MODE=settle -e SETTLE_SECONDS=3 --tmpfs /data app
RULE_MODE=settle SETTLE_SECONDS=3 APP_URL=http://localhost:8099 pnpm check
docker stop app
```

- `once` mode: **82 passed, 21 named skips, 0 failed**
- `settle` mode: **97 passed, 6 named skips, 0 failed**

Every skip in both runs is named and settle/once-exclusive (confirmed by
listing them with `--reporter=verbose`) — none is an accidental gap.

## Decisions already made — don't re-ask or re-derive

- **No formal playtest gate this round** (schedule-driven, explicit project
  decision) — build directly, correct from informal tries by 2-3 classmates.
- **Rule is configuration** (`rules.mode`, Fly secret `RULE_MODE`, never a
  deploy-time flag): default `once`, unchanged until explicitly flipped.
- **Migration 0001 is one-way** — not yet deployed to production. Before it
  ever reaches the production volume, give the exact `flyctl` backup steps
  and wait for explicit confirmation the backup exists. Hard stop.
- **Trace type shape**: a discriminated union by mode (`currentTrace`),
  never a unified always-rich shape — rejected because it would change the
  `once`-mode contract for no reason.
- **The eligibility sentence is appended to the same paragraph** as the
  backward-compatible word/`<del>` markup, not a separate `role="status"`
  element — `spec/theseus.test.ts`'s existing trace tests grab the first
  `role="status"` and run ungated in both CI passes.
- **Kept-ship empty state** (Slice 3): shown from the start (ship 1, all
  ten gaps, faint outlines), never progressively revealed.
- **Ship-1 hold mechanism** (Slice 5): derived from `changes`
  (`from_version` of the most recent row), never a timer. Only ship 1 gets
  the loud line and the hold; later ships get a quiet beat only.
- **Settle-timer mechanism** (new this session): the client schedules its
  own local timer from `settlesInMs`, flips the trace's *display* only —
  presentation only, server remains sole authority on any submit.

## What's next — Slices 3-5, not started

**Slice 3 — kept-ship data, derived, no new stored state.** A
`keptShipAt(n)`-style function in `src/lib/db.ts`: ship *m* =
`min(version)` across positions; gaps are positions still at version *m*.
Empty sentence → ship 1, all ten gaps, rendered as faint outlines from the
first load.

**Slice 4 — visual direction B on the real page, mobile + reduced motion.**
Wire `docs/redesign/prototypes/b-two-ships.html` into the real frozen
grammar in `src/lib/house` (same territory/grammar module, never a second
renderer). Two ships at rest, stacked on mobile (390×844). Check
`src/lib/house/motion.ts`'s existing reduced-motion mechanism before
building anything new.

**Slice 5 — the replacement event and the last-original moment.** Ship 1's
"just completed" hold is the derived state above, not a timer; false the
instant any further replacement lands anywhere. A fresh page load during
the hold computes the identical state a live viewer already sees.
Historical `?at=N` shows the same derivation truncated at N.

Each slice follows the same discipline as Slice 2: spec committed and red
before any feat commit, both `RULE_MODE` passes green before moving on,
nothing merges to `main` before the cutoff above.
