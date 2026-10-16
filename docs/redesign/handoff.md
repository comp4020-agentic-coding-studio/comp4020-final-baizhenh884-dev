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

Slice 3 — kept-ship data, derived (`816ff18..`):
- `0644c97` — spec: `deriveKeptShip` (gaps, the ship-1 hold, ship 2's
  partial fill), pure logic in `spec/kept-ship.test.ts`
- `0c3a781` — `src/lib/kept-ship.ts`: derived from `changes` alone
- `fb8fb23` — `keptShipAt()` in `src/lib/db.ts`

Slice 3b — the kept ship live:
- `282c3ab` — spec: `keptShip` `{ words, gaps }` on every snapshot and
  change event; `onKept` in live-client
- `a858bb2` — `events.ts` + `live-client.ts` carry it

Slice 4 — the kept ship on the page:
- `3392b68` `b0764f8` — spec: kept-ship markup on GET / (read-only,
  aria-hidden, a gap closes with the word that stood there)
- `7763bbb` — second house panel (`#house-kept`), `HouseView.ghost()`
  for gaps, `mountKept()`
- `daff497` — fix: `define:vars` scripts aren't modules; `mountKept`
  reads its initial state from the rendered markup
- `01fda2f` — screenshots. Review of these found the page was visually
  direction A (a small kept caption in a corner, houses floating), not B,
  plus a stray dot: the two items below.

Slice 4b — direction B's composition, and the stray full stop:
- `e20ba5c` — spec: `spec/sentence-wrap.test.ts` (headless Chrome, last
  word 1-24 letters at 1920/1280/390: the full stop stays on its line,
  right after it). The Chrome helper moved to `spec/chrome.ts`. Red: the
  dot wrapped alone at 9/18/19 letters.
- `4bfc0b0` — fix: last `.pos` + full stop share a nowrap
  `<span class="end">`; one position's markup moved to
  `src/components/WordSlot.astro`
- `0de8ec6` — spec: `spec/two-ships-layout.test.ts` (headless Chrome:
  two equal halves side by side at 1920/1280, stacked at 390; grounds at
  least 3:1 apart; each sentence above its own house in its own half; kept
  sentence >= 0.6x and < the live size, >= 4.5:1 on its ground; ten gaps
  each >= 1.2em and drawn at >= 3:1). `kept-ship.test.ts`: a gap holds no
  text.
- `7cd0efc` — feat: `.stands-half` (study field, plaster, interactive
  sentence) and `.kept-half` (dark umber `#2b241d`, new `kept` look in
  `theme.ts`: timber tones, pale edges), rows shared through CSS subgrid
  so the houses stand level. `HouseView`/`LiveBody`/`dress()` take a
  `Look` (`present | past | kept`) instead of `past: boolean`. A house's
  canvas lies over its host (it used to inflate its row). `?at=N`'s single
  fixed house restored (Slice 4 had dropped it). Captions: stands "Ten
  words. Ten parts. Change a word, and its part is rebuilt."; kept
  "Replaced words are kept here, and built back into a house."
- `ce83792` — screenshots retaken under `RULE_MODE=settle`: fresh, then
  ten replacements by three fresh headless-Chrome visitors (click, type,
  Enter; staged test words, not participant evidence). Phone shots are
  full page height so the stacked kept half shows.

Slice 4c — the maker's review of 4b:
- `f6d6c0a` — CLAUDE.md quotes both houses' captions (approved diff)
- `c093c81` — spec: with the live half's notes lengthened, each house is
  within 15% of the viewport height of its own sentence (1920, 1280); a
  `.kept-pointer` line shows only when the halves stack. Red: 369px gap,
  no pointer.
- `5fca602` — spec fix: dropped `c093c81`'s "house starts in the first
  60% of the screen". It measured the shared sentence's length (after the
  once-mode files, ten 13-letter test words, about six lines), not the
  layout; checked against the running container.
- `d470a1d` — how-text, trace and Earlier link move into the live half's
  foot, under its house (live-client inserts them there too); mast "One
  sentence, two houses"; phone-only "What was replaced is kept below."
- `4b914f1` — screenshots retaken, same scenario as `ce83792`.

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

At `d470a1d` (the app tree since is unchanged):

- `once` mode: **102 passed, 21 named skips, 0 failed**
- `settle` mode: **117 passed, 6 named skips, 0 failed**

The layout specs (`sentence-wrap`, `two-ships-layout`, `word-field`) need
Chrome: `CHROME=...` or the usual paths; they fail, never skip, without it.

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

- **Kept half** (Slice 4b, chosen by the maker): dark umber ground with
  the timber model, not a lighter kraft paper. The live half stays primary
  (larger sentence, the only interactive one).

## Open, not yet done

- A long shared sentence (many long words) still pushes both houses down,
  since the houses stay directly under their sentences; the page scrolls.
- On a phone there's ~150px of air between the sentence and the live house
  (the part notation's reserved line plus the canvas's own margin).
- When a word is chosen, the other words recede but the full stop stays
  full ink (it isn't a label). Pre-existing; visible in the focus state.

## What's next — Slice 5, not started

**Slice 5 — the replacement event and the last-original moment.** Ship 1's
"just completed" hold is the derived state above, not a timer; false the
instant any further replacement lands anywhere. A fresh page load during
the hold computes the identical state a live viewer already sees.
Historical `?at=N` shows the same derivation truncated at N.

Slice 5's motion goes onto the two halves as they are now: pieces cross
from `.stands-half` into `.kept-half`. Reduced motion: check
`src/lib/house/motion.ts`'s existing mechanism before building anything new.

Each slice follows the same discipline as Slice 2: spec committed and red
before any feat commit, both `RULE_MODE` passes green before moving on,
nothing merges to `main` before the cutoff above.
