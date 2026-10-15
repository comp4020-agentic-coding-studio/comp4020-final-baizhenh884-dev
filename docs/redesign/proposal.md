# Theseus redesign proposal (Final Project)

**Status:** proposal for discussion, on branch `final/theseus-redesign`. Nothing
here changes the app, `main`, the production database or deployment. Every
number below comes from an **agent-generated simulation**
([`simulation/`](simulation/README.md)), not from people; simulation cannot
show that anything is fun. The three sketches in
[`prototypes/`](prototypes/README.md) are isolated static pages.

---

## The three most uncertain decisions

### 1. Is the rule the cause of the flatness, or the event?

The brief diagnoses the flatness ("change one word, then spectate") as a rule
problem. Our evidence for that is thin. The probe (1 Oct) had four commits and
**nobody was overwritten**, so no one has yet experienced being replaced. The
first production record holds one contribution. The house's settled change is
small at page scale (the brief says so too). So the flatness could come from
the rule (nothing left to do), from the event (a change doesn't land), or from
both. Changing the rule is the expensive, partly one-way part (see C). Changing
the event is cheap and reversible.

**Proposal:** the playtest runs the *same* new event and second Theseus under
both the current rule and the new rule. If the event alone fixes it, keep
one-change-ever.

### 2. Should time return eligibility, and after how long?

The candidate rule ("at most one standing word") fails structurally (see B).
The fix I recommend is that a standing word **settles** after about 5 minutes:
it stays in the sentence but stops holding you. That is honest about one
thing: it is a cooldown that other people can shorten by replacing you. It
gives up the README's strongest claim, "one you can't take back is a
decision." Five minutes comes from the simulation: at 10 minutes a 4-person
room is frozen 64% of the time, and at 5 minutes 36%. How it *feels* is
unknown.

### 3. What is the second Theseus, and does it read without explanation?

I recommend **kept ships**, built from the existing `from_version` column with
no new state (see E). It is the only model of the four that literally stages
Hobbes. It is also the riskiest to explain. If 4–5 people can't say what it is
unprompted, cut it. The piece works without it.

---

## Defining "more interesting"

Nine behavioural proxies (table in A0), chiefly: **stuck** (locked for more
than half the session and still locked at the end), **room frozen** (nobody
present can act), **regained through another's act**, revenge / A→B→A /
repeated-pair, top-20% share, position spread, and, in the playtest only,
re-acting within 2 minutes of being freed.

## Simulation summary (12 visitors, 20 min unless named)

Means over 200 seeds. Full tables, the sensitivity analysis and every
assumption are in [`simulation/`](simulation/README.md) and the Appendix.

| rule | acts/visitor (median) | stuck | room frozen | revenge | repeated-pair | top-20% | regained via others |
|---|---|---|---|---|---|---|---|
| **once** (current) | 1 | 100% | 76% | 0% | 0% | 20% | — |
| **standing** (candidate) | 2 | 49% | 21% | 5% | 4% | 31% | 100% |
| standing, *retaliatory mix* | 2 | 48% | 16% | **27%** | **23%** | 35% | 100% |
| standing, *4-person pod* | 1 | **100%** | **85%** | 1% | 0% | 24% | 100% |
| **settle** (recommended) | 4 | 0% | 3% | 1% | 4% | 30% | 67% |
| settle, *retaliatory* | 4 | 0% | 3% | 3% | 5% | 30% | 69% |
| settle, *friend clique* | 4 | 0% | 2% | 3% | **17%** | 32% | 74% |
| settle, *4-person pod* | 4 | 0% | 36% | 1% | 1% | 24% | 21% |
| settle, *zero-wait voluntary release* | 12–17 | 0% | 0% | 4–7% | 16–22% | 40% | — |
| cooldown 5 min (r/Place reference) | 3 | 0% | 14% | 5% | 3% | 28% | 0% |

What the simulation shows:

- **The candidate deadlocks small groups.** With ten positions and ten or
  fewer people, everyone can hold a word at once, and then nobody can free
  anybody. A crit pod of four is frozen 85% of the time, waiting for
  something that won't happen.
- **The candidate rewards retaliation.** When half the room retaliates, 27% of
  replacements are revenge, and they cluster on one spot (A→B→A 27%).
- **"Move on" kills direct revenge almost for free.** If your next word must
  go somewhere other than your last, revenge falls to about 1%: the person
  who displaced you holds only your old spot, which you may no longer touch.
- **Free withdrawal is unlimited editing** (12–17 acts in 20 minutes).
- **Nothing stops a disciplined clique** (repeated-pair 17%, up to about 45%
  at very high discipline). It only stops being *necessary*: a stuck friend
  is freed in 5 minutes anyway.
- **Sensitivity:** the magnitudes move by up to 2× across the tested ranges of
  deliberation time and habit strength. The *ordering* of the rules on stuck,
  revenge and frozen time never changed.

---

## Recommended loop: one word that holds your place

> You may replace any word. Your word then **holds your place**: until
> someone replaces it, or it has stood about five minutes, you can't make
> another. Your next word goes somewhere else.

Influence, not ownership, survives. Permanence of the act does not.

## A. Interaction loop

- **Before contributing:** the same as now. Any word, any position.
- **While it holds:** the page says so privately ("'strangers' is holding
  your place"). You watch the shared object, and every incoming change might
  be the one that frees you. That is the change from spectating to waiting
  with a stake.
- **When replaced:** your word visibly breaks away and goes into the kept
  ship (E). Your trace says it was replaced and kept, and that you can act
  again anywhere but that part.
- **When it settles:** nothing changes on the shared page. Your trace now
  reads "'strangers' still stands, settled. You can act again."
- **Returning later:** you are almost always eligible again (simulated: 88–94%
  of return visits, against about 40% under the candidate).
- **Rapid action:** the per-position version check is unchanged. Two people
  drafting the same word means the first wins and the second gets a 409; their
  draft stays and their eligibility isn't spent.

**Example** (staged names, not people). Ana changes *people*→*strangers* (the
entry). *people* is an original, so it flies into the first kept ship. Ben
changes *website*→*sentence*. Cy replaces Ana's *strangers* with
*neighbours*: on Ana's page the entry is rebuilt, *strangers* is set aside
for ship 2, and she's free, anywhere but the entry. Ana changes *if*→*when*. Dee and Eli both draft *disappeared*; Dee
lands first and Eli's submit returns 409 with the draft intact, so Eli picks
*it*. Five minutes after Ben's change, *sentence* settles and Ben is free
without anyone touching his word. Later, when the last version-1 word goes,
the first kept ship completes on every open page at once. The next day, Cy's
*neighbours* has long since settled and Cy can act.

## B. Eligibility and concurrency

- **Authority:** one `BEGIN IMMEDIATE` transaction, as now (`src/lib/db.ts`
  `attempt`). It reads the visitor's latest change *L*. The visitor is
  eligible if there is no *L*, if *L* has a later change at its position
  (replaced), or if *L* is ≥ 5 minutes old (settled). The target must not be
  *L*'s position. Otherwise the outcome is `holding` or `not-here` (403, with
  distinct page text).
- **Which word holds you:** at most one, always your *latest* change. Older
  settled words may still stand; they are yours in your trace but hold nothing.
- **Time:** measured inside SQLite against `created_at`, which SQLite already
  writes in UTC. A duration needs no timezone.
- **Database-level guard:** `UNIQUE(visitor)` can't express time, so it
  becomes a `BEFORE INSERT` trigger that aborts a second holding insert
  (draft in the Appendix). SQLite's single writer already makes the in-
  transaction check atomic; the trigger keeps CLAUDE.md's "enforce in the
  database" principle as a last line.
- **Stale drafts:** unchanged. A draft is never rebased.
- **Multiple tabs:** eligibility follows the cookie. The existing per-
  connection resnapshot (`src/pages/events.ts`, `sameTrace`) widens to "this
  visitor's eligibility or trace changed".
- **Settling has no event.** The snapshot carries `heldMs` (time remaining,
  not a clock time, which avoids clock skew), and the page flips its own UI
  when it runs out. That is presentation only: if a submit is early, the
  server says "still holding".
- **Disconnect/reconnect:** a fresh snapshot, as now. Nothing is replayed.

## C. Production migration (not applied)

The current schema (`drizzle/0000_workable_molecule_man.sql`) has
`changes(visitor, position, from_word, to_word, from_version, created_at)`
and `CREATE UNIQUE INDEX changes_visitor_unique ON changes(visitor)`.

1. Back up the volume first: `VACUUM INTO '/data/pre-0001.db'`. This is a
   production action and needs your approval at the time.
2. Migration `0001`: drop `changes_visitor_unique`, add non-unique
   `(visitor, id)` and `(position, id)` indexes, and add the trigger. **No row
   is touched.** History, `?at=N` and the trace data are identical.
3. Consequence to disclose: every earlier participant's single change is
   older than five minutes, so **everyone who has ever contributed becomes
   eligible again** on deploy.
4. Rehearse first. A spec boots the current image on a named volume, makes
   staged local changes, then boots the new image on the same volume and
   checks that every `?at=N` is byte-identical.

**Rollback risk:** the app can be rolled back, the schema can't. The old image
still works without the unique index, because its `spentBy` check runs inside
the IMMEDIATE transaction. A visitor with two rows would see their first word
as their trace. Recreating `UNIQUE(visitor)` would mean deleting history, so
it must never be done. Treat the migration as one-way.

## D. Your trace (private)

The trace has three parts, in order:

1. **Eligibility** (`role="status"`): "You can replace a word" / "'X' is
   holding your place" / "You can act again, anywhere but the entry".
2. **Standing words**: marked in the sentence (as `<mark>` now), with
   "settled" where it applies.
3. **Replaced words**, newest first, each with what replaced it and "kept":
   your word has a permanent place in a kept ship.

No numbers and no times. The most recent contribution keeps the existing
contract markup (`<del>` plus the word now in its place), so the trace stays
backward compatible. Trace and eligibility never leave the visitor's own
request or stream.

## E. Hobbes: four models, one recommended

Every model is derived from `changes`. Note that the word that stood at
version *k* of a position is that position's `from_word` where
`from_version = k`.

| model | the object | after more than 10 removals | is it a sentence? | identity question |
|---|---|---|---|---|
| **M1 first ship reassembled** | each original word, placed when first displaced | complete after every position changes once, then static forever | yes: the maker's sentence | **sharp**: which is Theseus? But it is inert afterwards, and production may already be complete (I didn't read it) |
| **M2 shadow** | the latest removed word per position | every replacement rewrites it | yes, but one that never stood | weak: a one-step echo, it forgets (the receding past already shows this) |
| **M3 heap** | every removed word, in order | grows without bound | no | none. Ordered by time it **is a feed** without names, which conflicts with the README's "without becoming a feed" |
| **M4 kept ships** (recommended) | ship *k* = the word that stood at version *k* of each position | ship 1 is M1; when it completes, ship 2 (the first replacements) is assembling; and so on, forever | yes, each ship; a later ship's words may never have stood together | ship 1 is Hobbes exactly; later ships say every removed plank waits for the other nine places to give theirs up |

**Why M4:**

- Every removed word gets a permanent place *at its own position*, so the
  kept ship is a valid ten-part body that uses the same frozen grammar.
- The ship being assembled is ship *m* = `min(version)`. **Its gaps are
  exactly the present words still at version *m***: each gap in the kept
  ship is waiting for a word you can see.
- "None of the first sentence remains" and "the first kept ship is complete"
  are **the same instant** (no position left at version 1).
- No new state is needed. The server derives it per request, and the
  snapshot carries the assembling ship. A live `change` doesn't name the
  displaced word, but the open page already holds it: it is the word it was
  showing at version − 1.

**Is a second house just a duplicate renderer?** It must use the same grammar,
because Hobbes's point is that the kept planks are the same kind of thing. A
different form would answer the question for you. What makes it the opposite
of the present house is that it is the only **permanent** thing in Theseus
(a placed plank never changes) and it is **incomplete** (it shows gaps). The
present house is complete and replaceable.

**Cost:** the gaps are a visible progress indicator. That needs a recorded
relaxation of "no counts". It is not a score, a round or a reset.

## Replacement as an event; preview; the last original

- **Event** (sketched in B and C): the old part flares red and breaks loose
  (≈0.6 s), crosses to its place in the kept ship or is set aside for a later
  one (≈1.4 s), the new part is built up from its base (≈1.2 s), and the
  object settles. Red still means only "being rebuilt now". With reduced
  motion, the parts swap and the cue holds briefly.
- **No preview, kept.** A preview turns the act into styling a building and
  spends the surprise before the commit. Instead, show the **stakes**: while
  you draft, mark the part that will leave and the gap it will fill.
- **The last original:** don't add a separate notification. The structure
  does it, because the first kept ship completes on every open page at once.
  One line appears once, live: *"None of the first sentence stands. All of it
  has been kept."* Late arrivals see the completed ship, not the moment.
  Rejected: a progress bar, a reset, a new round, or only a passive line.

## F. Visual directions (open the sketches)

| | **A Monograph, sharpened** (evolutionary) | **B Two ships** (departure) | **C Breaker's yard** (bold) |
|---|---|---|---|
| hierarchy | sentence, then house, then a small kept plate | two equal halves: what stands / what was kept | a huge sentence over a saturated house over a heap |
| sentence(s) | serif, as now; "cut away so far" in caps | bold sans (present) against italic serif (kept, with blanks) | full-width uppercase, a difference blend |
| body | plaster house; kept plate in unfired white with dashed gaps | night-blue house; timber-coloured kept ship | one hue per territory; the heap is labelled blocks |
| event | slow lift in red, then to the kept plate | part breaks, crosses the gutter, locks into its gap | part shudders, drops and smashes into the heap |
| phone | stacked; kept plate below the fold | stacked halves; crossing becomes vertical | full screen; heap above the controls |
| simultaneous use | still quiet: changes are easy to miss | arrivals are visible from across the room | very visible, and becomes noise at high rate |
| gains | continuity; cheapest | **the composition is the Hobbes question**; the exchange is legible at a glance | memorable; physical |
| loses | doesn't fix flatness (the settled change is still subtle) | the restraint and "the sentence alone is the protagonist" | heap = feed (M3); toy palette; contrast and a11y risks from the blend |
| cost | low | medium: dark theme, one renderer with two viewports | medium–high, plus a heap layout that grows forever |

**Recommendation: B**, borrowing C's physical break and crossing for the event.

## G. Architecture: what changes and what survives

| area | change |
|---|---|
| schema/migrations | `0001`: drop the unique index, add indexes and the trigger; no data change |
| transaction | `spent` becomes `holding` / `not-here`, read from the latest change and its age |
| trace | `traceFor` becomes `traceFor` + `eligibility`; a list, not a single word |
| realtime | `change` payload **unchanged**; snapshot adds `eligibility` (`state`, `heldMs`, `notAt`) and the assembling kept ship, and the trace becomes a list. A missed change during a reconnect is covered by the fresh snapshot, as now |
| history | `?at=N` unchanged; kept ships as of N are derivable the same way |
| House | grammar frozen; add the kept-ship body (gaps, other material) and the longer exchange; one WebGL context with scissor viewports |
| logging | `spent` becomes `holding`/`not-here` (with reason); new `freed v=<displaced tag>` in the replacing request; `kept-complete ship=k` |
| tests | `theseus.test.ts` 403 "second change" check replaced by holding / not-here / freed / settled checks; `realtime.test.ts` `SNAPSHOT_KEYS` and trace shape change; `logging.test.ts` doesn't assert `spent` (grep) and survives, plus new lines; `house-*` survive |
| a11y | kept sentence as text in the summary; canvas stays decorative; eligibility in `role="status"`; contrast checked for the dark half |
| docs | README "The rule" and "One act should carry consequence" rewritten; **ADR 0003 supersedes 0002's "What each person may change"**; CLAUDE.md contract lines on one change ever, uniqueness, Monograph direction and counts all need your approval |

Settling makes tests need a short T. I propose `SETTLE_SECONDS` as real
configuration (production default 300). Whether that breaches "no fields
added only so something can be tested" is your call.

## H. Risks

Full table in A5. The ones that decide things: **schedule** (25 days, and
the rule change is gated on a playtest that hasn't run); **migration** (a
one-way schema change); **cliques** (no rule stops them; settle only makes
them unnecessary); **harmful words** (more acts means more exposure, so the
maker-only fix the README defers becomes urgent); **visual overload and
mobile** (direction B at high rates; a kept ship off-screen on phones).

## I. Prototype plan and delivery

1. **Done:** rule simulation and three sketches.
2. **You pick a direction** (target 17 Oct).
3. **Interactive prototype** (16–22 Oct), isolated under
   `docs/redesign/prototypes/interactive/`. A small local node server; phones
   on the LAN; toggles for rule (once / settle) and kept ships (on/off); 2D
   canvas in direction B; JSON event log. The rule is the riskiest part, so it
   gets tested before the visuals are polished.
4. **Playtest** with 4–5 people (23–25 Oct; protocol in the Appendix).
5. **Gate** (26 Oct): rule change yes or no, kept ships yes or no. Then
   ADR 0003 and the CLAUDE.md diff for your approval.
6. **Build in production code** (27 Oct–5 Nov), specs red first: migration
   and upgrade rehearsal, then eligibility, trace and snapshot, logging, kept
   ships, then visual direction and event.
7. **Deploy and record** (5–8 Nov), with your approval, backup first; then
   README, PROCESS and reflection. One day of buffer before noon on 9 Nov.

**Crit 10: ship the current version.** The cutoff is 21 Oct 08:30
(Australia/Canberra), six days away. The crit's requirements are met. The new
rule is unplayed, the migration is one-way, and the bare candidate rule
simulates *worse* than the current one at exactly the crit's group size.

---

## Appendix

### A0. Behavioural proxies

Behavioural proxies, all measurable in the simulation and the playtest logs:

| proxy | what it captures | target direction |
|---|---|---|
| successful acts per visitor (median, distribution) | there is still something to do | up, with no long tail |
| **stuck**: locked > half the session, still locked at the end | spectator lock-in | ≈ 0 |
| **room frozen**: share of time nobody present can act | collective dead time | low |
| return visits able to act | a reason to come back | high |
| **regained through another's act** | other people change what *you* can do | high when the room is busy |
| re-act within 2 min of being freed (playtest only) | being replaced pulls you back | high |
| revenge, A→B→A, repeated-pair | adversarial loops | low |
| top-20% share of actions | domination | near 20–30% |
| position spread, same position as the previous change | change circulates instead of churning one spot | spread high |

### A1. Full simulation table (200 seeds; 50 for trickle-24h)

Columns: acts/visitor, median, distribution 0/1/2/3/4+ (%), stuck, room
frozen, wait to regain (min), regained via another's act, revenge,
repeated-pair, A→B→A, top-20%, same position as previous, position spread,
runs where all ten originals go, return visits able.

| mix | rule | acts | med | dist | stuck | frozen | wait | via others | revenge | rep-pair | ABA | top20 | samepos | spread | all go | return able |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| random | once | 1.00 | 1 | 0/100/0/0/0 | 100% | 76% | — | — | 0% | 0% | 0% | 20% | 7% | 0.81 | 0% | 0% |
| random | standing | 2.55 | 2 | 0/18/36/27/19 | 49% | 21% | 2.9 | 100% | 5% | 4% | 7% | 31% | 7% | 0.94 | 76% | 37% |
| random | moveon | 2.59 | 2 | 0/15/36/31/18 | 46% | 20% | 3.1 | 100% | 0% | 1% | 2% | 31% | 5% | 0.95 | 76% | 43% |
| random | settle | 3.77 | 4 | 0/6/15/22/56 | 0% | 3% | 2.9 | 67% | 1% | 4% | 2% | 30% | 6% | 0.97 | 96% | 89% |
| random | cooldown | 2.74 | 3 | 0/12/24/42/22 | 0% | 14% | 5.0 | 0% | 5% | 3% | 3% | 28% | 8% | 0.94 | 79% | 85% |
| retaliatory | once | 1.00 | 1 | 0/100/0/0/0 | 100% | 76% | — | — | 0% | 0% | 0% | 20% | 7% | 0.82 | 0% | 0% |
| retaliatory | standing | 2.81 | 2 | 0/21/30/22/27 | 48% | 16% | 2.3 | 100% | 27% | 23% | 27% | 35% | 15% | 0.88 | 50% | 43% |
| retaliatory | moveon | 2.55 | 2 | 0/16/38/27/18 | 45% | 19% | 3.1 | 100% | 1% | 2% | 2% | 31% | 5% | 0.95 | 80% | 41% |
| retaliatory | settle | 3.83 | 4 | 0/5/15/22/58 | 0% | 3% | 2.9 | 69% | 3% | 5% | 2% | 30% | 7% | 0.96 | 92% | 88% |
| retaliatory | cooldown | 2.71 | 3 | 0/12/26/39/22 | 0% | 15% | 5.0 | 0% | 16% | 10% | 12% | 28% | 8% | 0.92 | 60% | 83% |
| friends | once | 1.00 | 1 | 0/100/0/0/0 | 100% | 75% | — | — | 0% | 0% | 0% | 20% | 5% | 0.82 | 0% | 0% |
| friends | standing | 2.87 | 2 | 0/20/31/21/27 | 45% | 16% | 2.3 | 100% | 11% | 22% | 11% | 36% | 11% | 0.87 | 47% | 46% |
| friends | moveon | 2.87 | 2 | 0/18/32/22/28 | 42% | 17% | 2.5 | 100% | 2% | 16% | 2% | 35% | 7% | 0.90 | 49% | 51% |
| friends | settle | 4.08 | 4 | 0/5/14/20/60 | 0% | 2% | 2.6 | 74% | 3% | 17% | 2% | 32% | 7% | 0.94 | 85% | 94% |
| friends | cooldown | 2.74 | 3 | 0/11/25/42/22 | 0% | 14% | 5.0 | 0% | 5% | 2% | 4% | 28% | 8% | 0.94 | 80% | 84% |
| sparse | once | 0.97 | 1 | 3/97/0/0/0 | 55% | 54% | — | — | 0% | 0% | 0% | 21% | 9% | 0.80 | 2% | 13% |
| sparse | standing | 1.19 | 1 | 3/77/18/2/0 | 23% | 42% | 5.1 | 100% | 1% | 0% | 1% | 31% | 9% | 0.84 | 4% | 34% |
| sparse | settle | 1.30 | 1 | 3/68/25/4/0 | 0% | 38% | 4.1 | 33% | 0% | 0% | 0% | 32% | 7% | 0.86 | 7% | 60% |
| trickle-24h | once | 0.98 | 1 | 2/98/0/0/0 | 69% | 85% | — | — | 0% | 0% | 0% | 20% | 7% | 0.80 | 0% | 5% |
| trickle-24h | standing | 1.27 | 1 | 2/71/27/1/0 | 26% | 81% | 380 | 100% | 1% | 0% | 1% | 30% | 10% | 0.85 | 0% | 35% |
| trickle-24h | settle | 1.88 | 2 | 2/30/47/21/0 | 0% | 68% | 5.0 | 1% | 0% | 0% | 0% | 30% | 10% | 0.91 | 36% | 100% |
| pod-4 | once | 1.00 | 1 | 0/100/0/0/0 | 100% | 89% | — | — | 0% | 0% | 0% | 20% | 7% | 0.53 | 0% | — |
| pod-4 | standing | 1.17 | 1 | 0/84/15/1/0 | 100% | 85% | 1.2 | 100% | 1% | 0% | 1% | 24% | 6% | 0.59 | 0% | — |
| pod-4 | settle | 3.73 | 4 | 0/1/5/32/63 | 0% | 36% | 4.4 | 21% | 1% | 1% | 0% | 24% | 8% | 0.87 | 7% | — |
| pod-4 | cooldown | 3.49 | 4 | 0/0/6/38/56 | 0% | 43% | 5.0 | 0% | 8% | 6% | 4% | 23% | 9% | 0.85 | 4% | — |

"Blocked more than half the time" is 78–100% under every rule, because a
visitor who has just acted is unable to act by design. "Stuck" is the metric
that separates the rules. Settle-age and assumption sensitivity tables are in
`simulation/results.md`.

### A2. Voluntary withdrawal, assessed

- **Withdraw = remove my word** (the position reverts): this rewrites the
  present without a change row, or adds a "reversion" row that breaks
  "every change is a replacement by a visitor". Rejected.
- **Withdraw = let go** (the word stays, I'm freed): with no wait it is
  unlimited editing (12–17 acts in 20 minutes; top-20% share 40%). With a
  wait it is *settle plus a button*. The button adds a UI surface, a history
  question ("is letting go an event?") and a reason to loop let-go →
  replace. Automatic settling gives the same outcome with no new act and no
  new row. **Recommend automatic settle; no button.**
- Should settling be part of history? No. It is derivable (`created_at` + T),
  it is never shown to others, and `?at=N` doesn't change.

### A3. Migration draft (`0001`, not applied)

```sql
DROP INDEX `changes_visitor_unique`;
--> statement-breakpoint
CREATE INDEX `changes_visitor_idx` ON `changes` (`visitor`, `id`);
--> statement-breakpoint
CREATE INDEX `changes_position_idx` ON `changes` (`position`, `id`);
--> statement-breakpoint
-- last line, as UNIQUE(visitor) was: no insert while the visitor's latest
-- change still holds them (stands and is younger than the settle time), and
-- never onto the position of that latest change.
CREATE TRIGGER `changes_one_holding` BEFORE INSERT ON `changes`
WHEN EXISTS (
  SELECT 1 FROM `changes` AS last
  WHERE last.visitor = NEW.visitor
    AND last.id = (SELECT max(id) FROM `changes` WHERE visitor = NEW.visitor)
    AND (
      last.position = NEW.position
      OR (
        NOT EXISTS (SELECT 1 FROM `changes` AS later WHERE later.position = last.position AND later.id > last.id)
        AND (julianday('now') - julianday(last.created_at)) * 86400 < (SELECT settle_seconds FROM `rules`)
      )
    )
)
BEGIN SELECT RAISE(ABORT, 'holding'); END;
```

`rules` is a one-row table that the app writes from configuration at boot.
Checked once by the agent on a scratch SQLite file outside the repo (Python
`sqlite3`; the script wasn't kept): applied after `0000` to a database with
one old change, it left that row identical, and it allowed or refused nine
staged inserts as intended. That covers an old visitor freed by age, holding
straight after, freed by replacement, refused on the old spot, and settled at
T = 0. This is not a test of the app.
drizzle-kit doesn't generate triggers, so this part of the SQL is hand-written
into the generated migration and reviewed. The migrator applies it at boot,
inside its transaction.

### A4. Playtest protocol (design only; nothing has been run)

- **People:** 4–5, not including the maker. The maker facilitates and notes
  observations only (in the 1 Oct probe the maker was a participant).
- **Setup:** each person on their own phone or laptop, in one room, using the
  local interactive prototype. Words are theirs and kept in the prototype's
  log only. No explanation beyond the page's own text.
- **Rounds:** R1, 8 minutes, current rule plus the new event and kept ships.
  R2, 8 minutes, settle plus the same. With one group the order can't be
  counterbalanced; say so, or run two groups in opposite orders.
- **Logged:** acts, refusals (reason), eligibility changes with cause, time
  from being freed to the next act, positions.
- **Observed** (tally sheet): looking at others' screens, talking about the
  sentence, retaliation talk ("you got me"), coordination ("free me"),
  idle-but-present.
- **After each round, asked individually** (open answers, then a 1–5
  rating):
  1. Why could or couldn't you act just now?
  2. When your word was replaced, what did you want to do?
  3. What is the second object on the right? (Asked before any explanation.)
  4. Did you notice what changed in the house when someone else acted?
  5. Was it cooperative, adversarial, chaotic or boring?
  6. Is there a reason to keep going right now?
- **Decision thresholds** (set before the test): keep the rule change only if
  R2 beats R1 on "reason to keep going" for most people *and* at most one
  person can't explain why they were blocked. Keep kept ships only if at
  least 3 of 5 describe it as removed or kept parts without prompting.
- **Not claimed:** anything about strangers in general. Five people, one
  room, one session.

### A5. Risks

| risk | note |
|---|---|
| migration | one-way schema; rehearse on a named volume; back up first |
| concurrency | holding check plus trigger inside IMMEDIATE; two tabs serialise |
| abuse / ping-pong | "move on" cuts revenge to ~1%; cliques remain (17%); per-browser identity unchanged (ADR 0002). Settling *protects* ADR 0002's argument: under the bare candidate, a new window is the only way out of being stuck |
| solo return | solved by settle (≈90%+ of returns able) |
| historical semantics | `?at=N` untouched; settled-ness is never shown historically |
| harmful words | more acts means more exposure; the maker-only fix the README defers is now more urgent |
| visual overload | B at high rates: queue exchanges, collapse beyond 2 at once |
| mobile | the kept ship can be off-screen; needs an in-view cue |
| accessibility | motion, the dark contrast, and a second sentence in the summary |
| performance | two bodies, one context; SSE snapshot grows by at most a few words |
| **schedule** | 25 days to Final; the rule change is gated on a playtest that hasn't happened |

### A6. Assumptions not tested anywhere

Nobody has yet been overwritten in any session we have a record of. Whether
being replaced feels like an invitation or an insult is the central unknown,
and it is exactly what playtest question 2 asks.
