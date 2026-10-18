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

Slice 5 — the moment of replacement:
- Each spec commit below landed red before its feat commit.
- `608850e` `7d50249` — only ship 1 holds (spec, then `deriveKeptShip` fix);
  a later ship's closing change shows the next ship at once.
- `252f7f2` `54b5020` — `src/lib/kept-moment.ts`:
  `classifyMoment(prev, next, position)` → cross / first / later / null,
  from the kept ship a page last showed and the one a change event brings.
  No new server field. live-client's `onKept(kept, moment)` classifies
  only change events newer than what's shown, and tells the moment before
  `onLatest`; snapshots never bring one.
- `b32cf95` `4b7c07b` — spec: `cross` motion + `arrivalAt`; new
  `spec/house-kept-stage.test.ts` (bursts 0/150/10000 ms apart over a
  `deriveKeptShip` history through ship 1's hold and ship 2's completion:
  at most one motion in flight, target always the newest, settles on a
  fresh load's body and gaps); a burst of crossings in the standing house
  settles on the fresh body.
- `b355f7e` — `motion.ts` cross + `arrivalAt`, `LiveBody.arrive`,
  `src/lib/house/kept-stage.ts` (`KeptStage`, `BEAT_MS`).
- `920f7ce` — on the page: the part crosses out of the standing canvas
  toward the kept house and comes in from the facing edge; ship 1's line
  ("None of the first sentence stands. All of it has been kept."),
  centred across both halves, `mix-blend-mode: difference`, not red,
  ~6.5 s, live only; a later ship's beat in words and house; the actor's
  own change classified once after Post/Redirect/Get from sessionStorage.
- `bd2fcb7` — `docs/redesign/screenshots/replacement-crossing.webm`,
  `ship-1-complete.webm` (Playwright, two windows; staged test words).

Slice 5b — the maker's frame-by-frame review of the videos:
- `ab08dfd` — spec: `spec/moment-line.test.ts` (headless Chrome, the
  page's own `src/lib/moment-line.ts` transpiled and injected): at
  1920x1080 and 390x844, as served and with every word 13 letters, the
  line's box overlaps no live sentence word and stays on screen, wraps
  balanced, isn't red, the halves are veiled behind it and the veil goes
  with it; the phone pointer acknowledges a crossing and ship 1
  differently, quietly, then returns.
- `603e7eb` — `src/lib/moment-line.ts`: the veil (each half's `::after`
  in its own ground), the line placed in the tallest band no live word,
  earlier word or part notation occupies (re-placed on scroll/resize,
  smaller if the band is short), `acknowledgeBelow()` for the phone
  pointer. No auto-scroll; nothing about either house changes.
- `474710e` — the line sits in the upper part of that band (over the
  houses, clear of the notes); ship 1's phone acknowledgement stands above
  the veil and lasts until the line has gone.
- `fdf2275` — four videos at 1920x1080 and 390x844 replace the two
  1280x800 ones: `replacement-crossing-<viewport>.webm`,
  `ship-1-complete-<viewport>.webm`. Chrome's own screencast, started once
  the page had laid out, at the viewport's size, encoded on real
  timestamps. Staged test words.

Slice 5c — only what stands now (the maker's decision):
- `78bf450` — spec: new `spec/present-only.test.ts` (a replaced word
  appears nowhere in the live sentence; `?at=N` still shows it);
  `spec/two-ships-layout.test.ts` at 1920x1080 and 390x844 on a staged
  sentence of ten 13-letter words: no text under any live word, the live
  house starts within 2/3 (1920) / 85% (390) of the screen, the kept house
  too when side by side. Measured first: houses at 630 / 686 without
  earlier words, 990 / 1407 with four under each word. `sentence-wrap`
  and `live-client` specs adapted (see the commit).
- `cca10fe` — `.past` span, `past` prop, `recentPast()`, the
  `.sentence .past` CSS and its AVOID entry are gone. The own exchange
  after Post/Redirect/Get now reads the replaced word from what the tab
  noted at submit (it used to read `.past > span`), so the own crossing
  and the actor's ship-1 line are unchanged (checked in a browser).
  `.sentence.past` and `?at=N` untouched.
- screenshots retaken (fresh/replaced, 1920x1080 and 390 wide).

Slice 5d — the air between the live sentence and its house:
- Measured first (screenshot pixels against the field, fresh sentence):
  sentence to drawn house was 154.5px at 390x844 and 164.9px at 1920x1080.
  Of that, 61.5 / 51.9px was page layout (the sentence's 1.2rem margin, the
  part notation's reserved line, its 1rem margin, the phone house's 0.6rem
  top margin) and 93 / 113px was the canvas's own top margin. Most of the
  canvas margin is headroom: through the fixed camera the tallest body (ten
  13-letter words) starts 34px (phone) / 28px (desktop) below the canvas
  edge, so it stays.
- `0ce4c1f` — spec: `spec/two-ships-layout.test.ts`, at 1920x1080 and
  390x844, as served and with ten long words: showing any of the ten
  parts' notations moves neither the sentence nor either house; the house
  starts within 20px of the sentence; it never gets smaller; the houses
  stay level side by side; every body at rest (the 500 sentences, the
  extremes, ten 13-letter words, through `place()` at the measured canvas
  size) starts at least 8px below the notation. The sentence sets moved to
  `spec/house-sentences.ts`, shared with `house-constraints`. Red: 51.9 /
  61.5px.
- `5d4382d` — `#part` is set absolutely under the sentence (0.5rem into
  the sentence's margin), over the canvas's empty top band; the phone house
  loses its 0.6rem top margin. Now 111.2px (390, house unchanged 205x153)
  and 141.2px (1920, the row's freed height goes to the house: 295x220 ->
  319x238). A first try at `top: 100%` failed the 8px clearance at 1920 with
  ten long words (22.3 vs 24.7px).
- **Accepted exception (the maker's decision):** the clearance is for the
  house at rest. During an exchange (under a second) the old part lifts
  ~21px (phone) / ~33px (desktop), and for the tallest bodies it may pass
  briefly under the notation; before this the same lift was cut off by the
  canvas edge. Not checked, by decision.
- `5c1811b` — screenshots retaken, same scenario as `4889fe4` (fresh, then
  ten staged replacements by three fresh visitors, settle mode). No videos.

Audit against the Final Project brief (2026-10-17, no code): the gaps
are the maker's writing (`reflections/crit-10.md`, `PROCESS.md` rewrite on
`main`; README rewrite on this branch before the merge) and deployment.
Decided: merge and deploy only after the Crit 10 cutoff (2026-10-21 08:30);
no `crit-9` tag (none was made; the maker notes it in `PROCESS.md`); the
refused-replacement URL stays `/replace` (refusals are full pages at their
real status). Deploy checklist: see "Merge and deploy" below.

Slice 6a — accessibility (plan 2, approved):
- `928fd0e` — spec: the kept sentence is readable (each gap "blank", its
  drawn span still empty; the kept house stays aria-hidden), replacing
  Slice 4's "kept sentence aria-hidden"; new `spec/kept-sentence.test.ts`;
  `spec/live-client.test.ts`: one polite live region, silent on load,
  snapshot, reconnect or a stale event; a burst coalesced into one
  announcement 2.5 s after its last change, naming positions and words as
  text, no time.
- `b2f4504` — feat: `src/lib/kept-sentence.ts` (the live redraw, moved out
  of index.astro), `#news` live region, `ANNOUNCE_MS = 2500` in
  live-client. Known limit: a second tab of the same browser hears its own
  change announced (the client can't tell whose change it is).
- `b2e9956` — CLAUDE.md: both sentences are the accessible state; the
  enforced announcement line (approved diff).

Slice 6b — the one-off layout failure, found and fixed:
- After `b2f4504`, one once pass failed "two halves side by side and equal
  (1920x1080)" without a message worth keeping. Made to explain itself, it
  recurred as different Chrome specs timing out (1 in 3 full passes, 1 in
  6 loops of the Chrome specs). Traced: `/json/version` answered in 5 ms,
  then the page never loaded. Cause: headless Chromes from earlier
  measurements outlived the 5 s SIGTERM grace and kept their debugging
  port; `spec/chrome.ts` guessed ports from a fixed range of 200, so a
  later launch could reach an orphan (ps showed two on port 9745, up to 75
  minutes old). Not the layout, not the app.
- `33b10db` — spec: new `spec/chrome-harness.test.ts` (every old-range
  port held by a never-answering decoy; a measurement must still finish in
  its own Chrome; red: hung). `two-ships-layout`'s side-by-side test and
  `bothHalves()` now print viewport, font status and every measured box in
  each assertion message.
- `68749d5` — fix: `--remote-debugging-port=0`, the port read from the
  profile's `DevToolsActivePort`; SIGKILL if Chrome is still running 5 s
  after SIGTERM. Chrome specs looped six times: all pass, no orphan left.
  Full once pass three times in a row: all green. No retries added and no
  check loosened.

Slice 6c — the maker's blocklist (plan 3, approved):
- `d4b35f4` — ADR 0004: exact-match list from the Fly secret
  `BLOCKED_WORDS` (NFKC, case-folded), refused as invalid (422, change not
  used up), "That word can't be used here.", logged as `reason=blocked`
  only; refusal order unchanged; an empty list logged once, never fatal.
  Alternatives (none, substring, list in repo, maker removal route, client
  filter) and limits recorded. Maker removal route deliberately not built.
- `47d12d3` — spec: new `spec/blocklist.test.ts` (case and fullwidth
  variants refused; a word containing a listed word allowed; log; the
  empty-list line in a second container). Test word `blockedtestword`;
  unset in CI fails, never skips.
- `d4c3b69` — spec/ADR correction found against the feat: accepted words
  are logged by contract, so only `invalid` lines must lack the word; and
  Astro's built server loads the app's modules on the first request, not
  at process start, so the empty-list line comes with the first request
  (before its response), not at boot. The existing rule-mode line has
  always behaved the same.
- `009b1b4` — feat: `src/lib/blocklist.ts`, `word.ts` reason `blocked`,
  the refusal sentence, `checks.yml` declares the test word on both
  containers and both runs.
- Not committed: a CLAUDE.md diff (local verification commands set
  `BLOCKED_WORDS=blockedtestword`; the moderation line names ADR 0004),
  waiting for the maker's approval.
- Not done, by decision: a wrapper entry in the Dockerfile so the line
  prints at process start. It would change a fixed template file.

Slice 6d — the first ten seconds for a stranger (plan D, option B):
- `640de45` — CLAUDE.md: local checks set the test blocklist; the
  moderation line names ADR 0004 (approved diff).
- `ab69d5e` — spec: at rest the notation's slot shows an invitation (one
  line, inside its half, aria-hidden, house still within 20px); choosing a
  word puts the notation in the same slot and moves nothing; `?at=N` has
  none; ship 1's line avoids it.
- `722f893` — feat: `.invite` "Choose any word and type your own" in the
  notation's slot, hidden by CSS while `#part` shows. First instruction
  was at y=787 (1920) / 592 (390); now y=322 / 219, house unmoved.
- Screenshots retaken at `722f893` (fresh/replaced, 1920x1080, 390 wide).
- Pass counts at `722f893`: once 158 / 21 named skips; settle 173 / 6.

Slice 6e — settling, made visible (plan C), and a settle-trace bug:
- `4cbdc84` — spec: a holding word's one aria-hidden `.settling` line,
  from the elapsed share (`--from`) for `settlesInMs` (`--ms`); gone when
  the hold ends or the word is replaced; none for a settled word, once
  mode or reduced motion; `data-settle-ms` on GET / under settle only;
  layout: inside the word, at most 3px, not red, moves nothing.
- `b52f2ab` — spec fix: the layout check's colour regex was `\d` inside a
  template literal (reached the page as `d`); now red for the right reason.
- `287e276` — spec, a pre-existing bug found in a real browser: the server
  sent `settlesInMs` as fractional milliseconds (julianday arithmetic),
  and live-client's reader takes only whole ones, so an open settle-mode
  page dropped its own trace and the local settle timer (`31b4d05`) never
  ran: the trace said "holding" until a reload. `realtime.test.ts` now
  asserts whole milliseconds and that `parseSnapshot` keeps the trace.
- `b8b4af2` — fix: `Math.ceil` in `db.ts`. Seen in headless Chrome: the
  trace flips to "You can act again" by itself after the hold.
- `bb0f1fd` — feat: `renderSettling()` in live-client, `.settling` CSS,
  `data-settle-ms`. Seen in headless Chrome, 3 s hold: 16 of 163 px at
  once, 95 px at 1.5 s, gone at 3.5 s; another visitor's page has none.
- Not committed: CLAUDE.md "Current design" names this private exception
  to "showing how long a word stood"; waiting for the maker's approval.
- Screenshots: unchanged by C (the line has settled by the time the
  replaced shot is taken; a retake was byte-identical), so `c586a6b`
  stands for `bb0f1fd` too.
- Pass counts at `bb0f1fd`: once 164 / 22 named skips; settle 179 / 7.

Slice 6f — your word, kept (plan B, settle mode only):
- Estimated first (agent-generated simulation, not user evidence; a scratch
  driver over `sim.py`'s unchanged settle rule and random habits, 30
  visitors over an hour, 50 seeds, not kept in the repo): at any moment
  about 15% (12-19%) of a visitor's replaced words are in the kept ship
  shown, about 45% wait in a later one (usually two ahead), about 40% are
  in a ship already built; visitor words first appear on screen (ship 2)
  after about 23 minutes.
- `2c879e6` — spec: `keptWhere` and a real `deriveKeptShip` history (later
  through ship 1's hold, shown in ship 2, earlier at ship 3); wire: a
  settle replaced item is exactly `{ position, word, now, kept }`, a
  replaced latest carries `kept`; HTTP: the author's trace names where the
  word is kept, and once fresh visitors bring the shown ship round, says
  "kept in the house opposite" and marks it in the kept sentence on the
  author's page only.
- `95446b9` — spec: two hand-built live-client settle fixtures carry
  `kept` (one had been cast past the type checker).
- `19a94ad` — feat: `keptWhere` (word's ship = its row's from_version + 1),
  `kept` on the settle trace (once-mode trace and reader unchanged), the
  three phrases in `trace-text`, `onMine` in live-client, `<mark>` in the
  kept sentence (server and live) in the kept half's soft ink, and
  `KeptHouse.mine` drawing the newest shown part a little firmer. Limit:
  one position in the house, all of them in the sentence. Seen in headless
  Chrome: the author's open page switches from "kept for a later house"
  to "kept in the house opposite", marked, without a reload; a stranger's
  page marks nothing.
- Screenshots: unchanged by B (the standard scenario's replaced shot is a
  visitor whose words all stand, and ship 1 shows; a retake was
  byte-identical), so `c586a6b` stands for `19a94ad`. B's visible state was
  seen only in a scratch screenshot, not kept.
- Pass counts at `19a94ad`: once 166 / 23 named skips; settle 182 / 7.

Staged stills for C and B (the standard stills can't show either):
- `9b8d17e` — CLAUDE.md: the settling line is the one private exception
  to "showing how long a word stood" (approved diff).
- `6e3e6f6` — `settling-<viewport>.png` (SETTLE_SECONDS=60,
  so the hold could be caught midway; shot 20 s in, line 33% filled) and
  `kept-mine-author-<viewport>.png` / `kept-mine-stranger-<viewport>.png`
  (SETTLE_SECONDS=3; author's "lantern" marked and "kept in the house
  opposite", a stranger's window at the same moment unmarked). **Staged,
  test words only, not participant evidence.** App tree at `19a94ad`.
- Judged, not checked: the kept house's firmer part on the author's still
  differs from the stranger's only in edge strength; it's subtle at page
  scale.

Slice 6g — the phone link to the kept half (plan 3), paused; the kept cue:
- Measured at 390x844: the kept house starts 974px down (1.2 screens)
  fresh, 1232px with a three-word settle trace, 1390px with ten long
  words. The line saying so is at 555px (fresh) but 992px with ten long
  words: below the first screen.
- `a611236` (superseded by `71096f7`) — spec: on a phone `.kept-pointer` is a link to the kept half
  on the first screen, following it shows the kept house, a
  `.back-pointer` links back; neither shows side by side; no scroll on
  load. **Red, and its feat is not committed**: built, it fails the
  long-sentence case (the line sits at y=992 with ten long words). Moving
  the link up would change the first screen D settled, so it waits for the
  maker's decision. The built feat is in `git stash` ("plan 3 feat: phone
  link to the kept half"). Resolved in Slice 6i.
- `23d90e0` — spec: new `spec/house-cue.test.ts`, pure `partTone`: in the
  kept house the author's own part's edges are at least 0.4 stronger, in
  the kept ink, never red, timber lightened 0 < lift <= 0.2; every other
  tone unchanged.
- `5a44c2f` — feat: `partTone` extracted from `HouseView.paint` (all old
  tones identical); kept cue edges 0.95 (was 0.54), solid timber lightened
  20%, openings untouched. Measured (author vs stranger, same moment):
  before, 0 px differed visibly; after, 2404 px (1920) / 1759 px (390) of
  the entry part, ~18 levels lighter for the author.
- `3d42f13` — `kept-mine-author-*` retaken; the stranger stills were
  byte-identical.
- Pass counts at `5a44c2f`: once 172 / 23 named skips, settle 188 / 7, plus
  the two red plan-3 tests above.

Slice 6h — earlier houses, `/?kept=k` (plan 1 of the second set):
- `1f71310` — spec: `completedShip` (pure: null until every position is
  past version k; ship 1 is the maker's words; ships 1-3 match
  `deriveKeptShip` one change before completing plus the completing
  word); new `spec/kept-houses.test.ts` (404 for non-whole numbers, the
  ship being built and later; a completed ship: its words, no gap, no
  forms, no live half, aria-hidden house, no `/events` in the HTML, no
  digit in the page text; Earlier/Later house between completed ships
  only, one kept sentence; the last completed ship doesn't lead on).
- `4d2343d`, corrected by `20ed8ab` — spec: GET /'s kept half has one
  "Earlier house" link to the most recent completed ship. The first draft
  used `rel="prev"`; GET / already has exactly one, the Earlier form's
  (HTTP contract; live-client rewrites the first `a[rel~="prev"]`), so it
  is a plain `a.earlier-house` and GET / keeps one rel=prev.
- `954a9ab` — feat: `shipWords` shared by `deriveKeptShip` and
  `completedShip`; `completedShipAt`; `EarlierHouse.astro`,
  `mountLoneHouse`; the kept half's Earlier house link.
- Gap noticed: the "never live" check reads the HTML only; the page's own
  script could still subscribe. Seen in headless Chrome: a fresh tab
  loading only `/?kept=1` makes no `/events` request (an earlier "true"
  was the same tab's earlier GET /). Not yet a check.
- CLAUDE.md "Enforced" line for `/?kept=k`: committed `b61b9dc`.
- `5d5648d` — `replaced-*` retaken (the kept half ends with "Earlier
  house"; fresh stills byte-identical); `kept-house-*` new: staged, test
  words only, two full rounds then one change, `/?kept=2`.
- Pass counts at `954a9ab`: once 180 / 23 named skips, settle 196 / 7,
  plus plan 3's two paused tests.

Slice 6i — the phone header links (plan 3, the maker's placement):
- `b61b9dc` — CLAUDE.md: earlier houses at `/?kept=k` in the enforced
  contract (approved diff).
- `71096f7` — spec, replacing `a611236`'s footer-link placement (which
  failed with ten long words: the footer line sat at y=992 of 844): on a
  phone the live half's header row reads "What stands" left and a link
  "What was kept ↓" right in the same caps; the kept half's row links
  "Back to what stands ↑"; the footer line stays unlinked; the sentence,
  invitation and house exactly where they are without the links; no
  scroll on load; neither link side by side. The stash holding the
  footer-link feat was dropped.
- `53067e2` — feat: `.head-row` (label + link, the label's own margin, so
  nothing grows); `#stands` / `#kept`; smooth scroll on a tap, instant with
  reduced motion; plain anchors, no JavaScript needed. Seen in headless
  Chrome at 390x844: the kept house comes to y≈441, back returns to the
  top; the footer line still acknowledges a crossing, with and without
  reduced motion.
- `d239ef9` — phone stills retaken with the header links; the two
  1920 kept-mine stills also updated, for `954a9ab`'s Earlier house link
  (they predated it); the other 1920 stills unchanged.
- **All green, no named failures:** at `53067e2`, once 182 passed / 23
  named skips; settle 198 passed / 7 named skips.

Plan 1 (phone performance) waits for the maker's real-phone test on home
Wi-Fi; no rendering change until then. Over plain-http LAN the `Secure`
visitor cookie is dropped, so the phone can watch but not submit; submit
from the Mac.

## Verified (fresh Docker build of the exact committed tree, both passes)

```sh
docker rm -f app; docker build -t app .
docker run -d --rm --init --name app -p 8099:8080 -e PORT=8080 -e BLOCKED_WORDS=blockedtestword --tmpfs /data app
RULE_MODE=once BLOCKED_WORDS=blockedtestword APP_URL=http://localhost:8099 pnpm check
docker stop app

docker run -d --rm --init --name app -p 8099:8080 -e PORT=8080 -e RULE_MODE=settle -e SETTLE_SECONDS=3 -e BLOCKED_WORDS=blockedtestword --tmpfs /data app
RULE_MODE=settle SETTLE_SECONDS=3 BLOCKED_WORDS=blockedtestword APP_URL=http://localhost:8099 pnpm check
docker stop app
```

At `009b1b4`:

- `once` mode: **153 passed, 21 named skips, 0 failed**
- `settle` mode: **168 passed, 6 named skips, 0 failed**

Seen in headless Chrome at `009b1b4` (not checks): three changes from
other windows 400 ms apart gave one announcement; the kept sentence read
"blank a blank …"; "BlockedTestWord" refused with the neutral sentence and
the same visitor's next ordinary word accepted. Staged test words.

Seen in a real browser at `5d4382d` (headless Chrome, not a check): a
chosen word at 1920x1080 and 390x844 shows its notation clear above the
house, and the desktop line runs from the word to its part without
crossing the notation.

Seen in a real browser (headless Chrome via Playwright, two windows, not
a check): a crossing from a second window, ship 1's completion with the
line and the held ship, and the actor's own crossing after the redirect
(the first change after the hold, into ship 2); no page errors.

The layout specs (`sentence-wrap`, `two-ships-layout`, `word-field`,
`moment-line`, `chrome-harness`) need Chrome: `CHROME=...` or the usual
paths; they fail, never skip, without it.

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

- **Moments come from the client, not a server field**: the ship number
  stays internal; `classifyMoment` reads the kept ship before and after.
- **The loud line is never replayed**: it needs a change event (or, for
  the actor, the one sessionStorage read after their own submit). The held
  completed ship itself is derived, so a fresh load during the hold shows
  it whole, without the line. `?at=N` has no kept ship at all.
- **The line isn't red** (CLAUDE.md: red is only a part being rebuilt):
  Instrument Serif italic, pale in `difference`, rather than C's red sans.
- **Kept half** (Slice 4b, chosen by the maker): dark umber ground with
  the timber model, not a lighter kraft paper. The live half stays primary
  (larger sentence, the only interactive one).

## Open, not yet done

- A long shared sentence (many long words) still pushes both houses down,
  since the houses stay directly under their sentences; the page scrolls.
- When a word is chosen, the other words recede but the full stop stays
  full ink (it isn't a label). Pre-existing; visible in the focus state.

## Merge and deploy (the maker runs it, after 2026-10-21 08:30)

1. After the cutoff, tag Crit 10's state on `main` (`/comp4020:ship`).
2. Backup, hard stop (production SQLite is WAL, so use the backup API):
   `mise exec -- flyctl ssh console -a comp4020-final-baizhenh884-dev -C "sh -c 'cd /app && node -e \"require(\\\"better-sqlite3\\\")(\\\"/data/theseus.db\\\").backup(\\\"/data/pre-0001.db\\\").then(()=>console.log(\\\"ok\\\"))\"'"`,
   then `mise exec -- flyctl ssh sftp get /data/pre-0001.db ~/theseus-backups/pre-0001.db -a comp4020-final-baizhenh884-dev`,
   check it (`sqlite3 … "pragma integrity_check; select count(*) from changes;"`),
   and a volume snapshot (`flyctl volumes snapshots create <vol-id>`).
3. Secrets, staged: `RULE_MODE=settle`, `SETTLE_SECONDS=<chosen>`, and
   `BLOCKED_WORDS=<the maker's list>` (`flyctl secrets set … --stage`).
4. Merge by PR; CI runs both passes, then deploys.
5. Verify: `flyctl logs` shows the rule mode and the blocklist line after
   the first request; read-only `pnpm check` against the fly.dev URL; any
   production verification change only with approval, disclosed.
6. Rollback: `RULE_MODE=once` and redeploy the redesigned image; the
   schema never goes back.

## What's next

Slices 1-6 are built (6: accessibility, the Chrome harness, the
blocklist, the invitation, the settling line and the settle-trace fix,
your word kept). Not done: informal tries by 2-3 classmates; the
one-way migration 0001 has still never touched production (the backup
hard stop above stands); nothing merges to `main` before the Crit 10
cutoff.

Open:
- README.md still describes the earlier words under each word (line 52,
  "Replaced words fade beneath their position"), and CLAUDE.md's "Current
  design" (lines 400-401) too. The README is the maker's to change; the
  CLAUDE.md diff is proposed, not applied.
- On a phone the kept house starts far below the fold (~1430 px with ten
  long words) by design; the pointer line covers it.

Open, seen while building Slice 5:
- On a phone a crossing still arrives out of view (by decision: no
  auto-scroll); the pointer now says that a part went below.
- The line's placement inside its free band (30% down) and its timing (it appears ~2.4 s after the change, as the last part
  sets down) is judged, not specified.
