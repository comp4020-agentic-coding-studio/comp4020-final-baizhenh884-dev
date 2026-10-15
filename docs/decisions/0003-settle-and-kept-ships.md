# 0003 — Settling replaces one-change-ever; kept ships as the second Theseus

**Status:** Proposed
**Decision for:** Final Project redesign (branch `final/theseus-redesign`)
**Supersedes:** [0002](0002-pseudonymous-visitor-and-logging.md)'s "What each
person may change" section

## Context

The redesign proposal (`docs/redesign/proposal.md`) diagnoses the brief's
flatness complaint — "change one word, then spectate" — as possibly a rule
problem, possibly an event problem, or both. Deliberately, per the project's
decision, there is **no formal playtest gate** for this round: the schedule is
too short, so the new rule and the kept-ships object are built directly, with
only informal tries by 2–3 classmates whenever something is playable, correcting
as the project goes. This ADR records the decision anyway, the same way
[0002](0002-pseudonymous-visitor-and-logging.md) recorded an existing
mechanism: because it changes a rule 0002 depended on, and because the schema
change behind it is one-way.

ADR 0002's "What each person may change" section said: "One successful
replacement, ever," enforced by `changes.visitor` being `unique()`
(`src/lib/schema.ts`) and checked first, atomically, inside `attempt`
(`src/lib/db.ts`). This decision replaces that specific guarantee — and only
that one; everything else 0002 recorded (what counts as a person, what's
visible, what's logged, the per-browser identity argument) is untouched and
still in force.

## Decision: the settle rule

> You may replace any word. Your word then **holds your place**: until
> someone replaces it, or it has stood about five minutes, you can't make
> another. Your next word goes somewhere else.

Formally, inside the existing `BEGIN IMMEDIATE` transaction
(`src/lib/db.ts`'s `attempt`), a visitor may act when:

- they have no prior change at all, **or**
- their latest change has since been replaced by someone else, **or**
- their latest change has stood for at least `SETTLE_SECONDS` (configured,
  production default 300) —

**and**, in every case, the target position is not the position of their own
latest change (the **move-on** clause). Move-on blocks only that one,
specific position — the exact spot of the visitor's own most recent change —
and lifts the instant they successfully change somewhere else: the new
position becomes "latest," and the old one stops being special to them. It is
not a ban on every position they have ever touched, and it was exactly the
clause the simulation measured as cutting direct revenge (A replaces B,
B immediately retaliates on A) to about 1%, versus 27% without it.

A refused attempt is `holding` (something of theirs still holds them) or
`not-here` (eligible, but not at this specific position); neither spends
eligibility, exactly as a stale or invalid attempt never spends it today.

### Why this, over the brief's own candidate ("at most one standing word")

Simulated in `docs/redesign/simulation/` (`sim.py`, `results.md`), summarised
in the proposal's table: the bare candidate **deadlocks small groups** — a
four-person pod (the crit's own group size) is frozen 85% of the time, because
once everyone holds a word, nobody can free anybody. It also **rewards
retaliation** (27% of replacements revenge, under a retaliatory mix). Adding
"move on" alone cuts revenge to ~1% without fixing the small-group deadlock.
Adding "settle" on top fixes both: the same pod is frozen 36% of the time
instead of 85%, stuck visitors drop to 0% across every tested mix, and return
visits able to act rise from ~40% (candidate) to 88-94%.

**What this gives up**: README's "One act should carry consequence" — "one you
can't take back is a decision" — no longer describes the redesigned rule.
Settling is an honest cooldown, not permanence, and it can be shortened by
someone else's act. This is a real, named cost, not something this decision
hides: see "What becomes false" below, left for the README's own author to
reconcile with its argument for "good."

### Alternatives considered

**The bare candidate (at most one standing word, no settle, no move-on).**
Rejected: deadlocks exactly the group size this crit and the showcase both
use (see simulation table above).

**Settle without move-on.** Rejected: fixes the deadlock but not revenge —
under a retaliatory mix, settle-without-moveon still shows meaningfully higher
revenge/repeated-pair rates than settle-with-moveon in the simulation. Move-on
is cheap (one extra predicate clause) and the gain is large.

**Free, unlimited withdrawal (let go whenever you want, no wait).** Rejected:
the simulation shows 12-17 acts per visitor in 20 minutes and a 40% top-quintile
action share — this is unlimited editing by another name, which is exactly
what "one act should carry consequence" was protecting against. Automatic
settling after a fixed time gives nearly the same freedom from permanent lock-
in without inviting that.

**A cooldown with no standing condition** (replace again after 5 minutes,
whether or not your word still stands). Rejected by the simulation on its own
terms: it never returns eligibility *through someone else's act* (0% "regained
via others," versus 67-74% for settle), which is precisely the mechanic that
turns being replaced into "someone pulled you back in" rather than only "wait
it out alone."

## Decision: kept ships (the second Theseus)

Every kept ship is derived from `changes` alone — no new stored state. Ship
*k* is the word that stood at version *k* of each position (`from_word` where
`from_version = k`). The ship currently shown is always ship *m* =
`min(version)` across all ten positions: the oldest ship not yet complete. Its
gaps are exactly the positions still sitting at version *m* — each gap is
waiting for a word still visible in the present sentence. The maker's original
sentence, reassembled plank by plank as each word is first replaced, is ship 1
exactly, literally staging Hobbes's puzzle: the kept ship is the "same"
original, the standing sentence is the "same" present thing, and asking which
is Theseus is the point, not a bug to resolve.

**The empty state is shown from the start, not hidden.** Before any
replacement, ship 1 exists with all ten gaps, rendered as faint outlines (the
direction-A dashed-outline treatment, borrowed specifically for this state) —
an empty frame visibly waiting to be filled, not an absence. This is a
deliberate answer to the proposal's own named risk: if 4-5 people can't
describe the second object unprompted, it fails: a visible, ten-gap frame from
the first load is what gives a first-time visitor something to read before any
explanation, rather than asking them to notice a second object has quietly
appeared.

**When a ship completes, it holds — visibly whole — until the next accepted
replacement anywhere**, not for a fixed duration. This is derived, not timed:
the ship that just completed (ship *m* − 1) is shown held complete exactly
when the single most recent row in `changes` is the one whose `from_version`
equalled *m* − 1 (the change that closed its last gap); the instant any
further replacement lands — on that ship's own positions or anywhere else —
that condition becomes false and the next ship (now the natural *m*) is what
every subsequent read shows. A fresh page load or reconnect during the hold
computes the identical state from the same query a live viewer's page already
holds, so there is nothing to replay and nothing a late arrival misses: it
sees the same completed ship, live or fresh, until someone, somewhere, acts
again. Only ship 1's completion gets the loud line ("None of the first
sentence stands. All of it has been kept.") and the hold; a later ship's
completion gets a quiet beat (the same crossing animation already used for an
ordinary replacement) and no hold, so the first ship's significance is never
diluted by repeating the same announcement for every ship after it.

### Why this model (M4 "kept ships"), over the three alternatives considered

Full comparison in `docs/redesign/proposal.md` section E. In short: a single
reassembled first ship that goes static forever (M1) answers the identity
question sharply but goes inert the moment it completes — it doesn't say what
happens next, which this redesign needs an answer for. A one-step "shadow" of
only the latest removed word per position (M2) never stands as a real
sentence and forgets immediately, which the existing fading-trail-beneath-each-
word treatment already does better. Every removed word kept in time order
(M3) is explicitly a feed — unbounded, ordered by recency — which directly
conflicts with README's "without becoming a feed." Kept ships (M4) are the
only option that is a valid sentence at every stage, never stops (ship 2, 3,
… assemble the same way, forever), and needs no new stored state: it is
already fully present in `changes`.

## Configuration: the rule is a setting, not a schema fork

Both rules live in the same schema, selected by one value (`rules.mode` —
`once` or `settle`, plus `rules.settle_seconds`), so flipping back to `once`
never requires a migration rollback. Production's mode is a Fly secret
(`fly secrets set RULE_MODE=...`), not a deploy-time flag, since CI redeploys
automatically on every push to `main` and would silently drop a one-off flag.
Default when unset is `once` — today's behaviour, byte-for-byte, until the
project owner explicitly switches it.

## Migration: one-way, disclosed

Migration `0001` drops `changes_visitor_unique`, adds non-unique
`(visitor, id)` and `(position, id)` indexes, creates the `rules` config
table, and adds a `BEFORE INSERT` trigger on `changes` that enforces whichever
rule `rules.mode` currently names — under `once` it reproduces exactly what
the dropped unique index did; under `settle` it implements the holding/move-on
predicate above. **No existing row is touched** by this migration; history,
`?at=N`, and every trace are unchanged by the schema change itself.

**This is one-way.** The old unique index could be recreated, but only by
deleting whichever visitor now has more than one row — i.e. by deleting
history, which the project will never do. Once `0001` is applied to the
production database, rolling the *application* back to a pre-redesign image
is safe at the app layer (that old image's own `spentBy` check still refuses
any second row for a visitor, unconditionally, independent of the dropped
index), but it does **not** touch the database-level enforcement: a
pre-redesign image has never heard of the `rules` table and never writes to
it, so **the trigger keeps enforcing whichever mode was last written** —
almost certainly `settle`, if the redesign was live in production. The old
app's own check still blocks a second row before any insert is attempted, so
no visitor can actually get a second write past it, but the database's own
last line of defence (CLAUDE.md "enforce in the database") would then be out
of step with what the rolled-back app assumes, relying entirely on the old
app's in-process check rather than two independent layers agreeing.

**To actually restore `once` at the database level** (not just at the app
layer), set the mode *before or instead of* rolling the app back:
`fly secrets set RULE_MODE=once -a <app>` and redeploy the **redesigned**
app (whichever image already knows how to write `rules` at boot) — it will
write `rules.mode = 'once'` the next time it starts, and only then does the
trigger itself go back to reproducing the old unique-index behaviour. A
pre-redesign image can never perform this write itself, so it must come
from a redesigned build, even if the end state is "roll back to the old
rule." The *schema* itself (the trigger, the `rules` table, the dropped
index) never rolls back — only its configured mode does. Treat `0001` as the
point of no return for this database's schema.

**Disclosed consequence**: every visitor who has ever successfully contributed
has a change older than `SETTLE_SECONDS`, so the moment `0001` reaches
production under `settle` mode, every past contributor becomes eligible again.
This is a direct, accepted consequence of the rule itself, not a migration
side effect to work around.

**Backup first, always.** Before `0001` ever reaches the production volume,
the project owner receives the exact `flyctl` steps to pull `/data/theseus.db`
to their own machine and must confirm the backup exists before the migration
is deployed. This is a hard gate, not a suggestion, recorded here because it
governs an action this ADR authorizes in principle but never in practice
without that explicit, separate confirmation.

## Known limit, stated honestly

Per-browser identity (ADR 0002) is unchanged by this decision, and settling
actually *protects* that decision's own argument rather than straining it:
under the bare candidate rule (the one actually rejected above), a new
incognito window was the *only* way out of being permanently stuck — settling
removes that incentive, since everyone becomes eligible again within
`SETTLE_SECONDS` regardless. A disciplined clique can still coordinate to free
each other faster than settle alone would (simulated repeated-pair share up to
roughly 17-45% at high discipline) — settle doesn't stop this, it only makes
coordinating unnecessary, since a stuck friend is freed in five minutes
anyway. This is accepted as the same kind of limit ADR 0002 already accepted
for identity: cheap to work around, small in what it buys, and not worth
closing by adding the surface (stricter identity, rate limits beyond the rule
itself) that would cost the project more than the gap is worth.

## What becomes false (for the README's own author, not edited here)

- "The rule" section's "no undo, no second change" describes `once`
  specifically; under `settle` mode it no longer holds.
- "What good means" → "One act should carry consequence" (`ENFORCED`: the
  server refuses a second successful replacement) needs its own argument
  reconciled with settling being a cooldown, not permanence — the honest cost
  this decision names above, not hidden from it.
- Any claim that the house's second reading doesn't exist yet needs updating
  once kept ships ship (Slices 3-5 of the implementation plan).

## Consequences

- No accounts, no visible identity change, no presence — this decision
  touches only the eligibility rule and adds the kept-ship reading of the
  same sentence; it doesn't reopen anything ADR 0002 settled about who a
  visitor is.
- `spec/theseus.test.ts`'s existing 403 "already spent" test
  (`spec/theseus.test.ts:192`) continues to pass unmodified under the default
  `once` mode; new behaviour is checked by new, mode-aware specs, never by
  weakening the old ones.
- Logging grows two new events (`freed`, `settled`) and renames two refusal
  outcomes (`holding`, `not-here` replace `spent`'s role under `settle`
  mode); `spec/logging.test.ts` was checked and asserts no outcome text
  literally, so it survives unmodified.
- If a future decision changes the rule again, a later ADR supersedes this
  one's rule section the same way this one supersedes part of 0002 — never
  edited in place.
