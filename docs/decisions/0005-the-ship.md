# 0005 — The house becomes a ship, in one harbour

**Status:** Accepted (2026-10-29)
**Decision for:** Final Project, after PR #15
**Supersedes:** the "Scope (Final Project: House integration)" section of
`CLAUDE.md`, including its frozen-grammar rule, and the house's place in the
product contract. **Partially supersedes**
[0001](0001-live-present-frozen-past.md): its rejection of option B (visible
co-presence) gives way to anonymous shipwrights, for the reasons under
"Co-presence" below. The rest of 0001 stands: the frozen past, no feed, and
SQLite as the only truth. Decisions 0002–0004 are unchanged: the pseudonymous
visitor and logging, the settle rule and kept ships, and the maker's
blocklist.

## Context

The object was always the Ship of Theseus: Plutarch's ship, whose planks are
replaced one by one, and Hobbes's ship, rebuilt from the old planks. The page
told that story with a ten-word sentence and a house of ten territories,
standing on the left and kept on the right.

The evidence that this didn't land:

- **28 October playtest** ([notes](../exploration/playtest-2026-10-28.md),
  written up from memory; three classmates on laptops). None of them knew
  where or how to change anything, or which half to act on, and they asked
  "how do I play?". Those who found out wanted to know which word was which
  part, and wanted a preview. They made a quick change or two and left.
  Nobody said they were bored: "boring" is the maker's reading of how short
  their visits were. Two fixes already in the contract came out of this
  playtest: the underlines on words at rest, and the faint "still standing"
  words in the kept sentence; their reasons are recorded in `CLAUDE.md`.
- **29 October.** Most replaced words vanished instead of reaching the kept
  half. Near the end of each ship they belonged to the next ship, which the page
  never showed. PR #15 fixed this with the waiting row, the next ship derived
  from `changes`, and a word that lands when its part does.
- **The house needed explaining.** A house has no story of replaced parts, so
  the page needed a question band, three steps, a kept note and a `/house/` page
  to say what the halves were. A ship carries the story itself: one ship sails
  on, and the old planks go to a slipway and become another ship.

The fixed parts are unchanged:

- the brief's multi-user, persistence and robustness requirements;
- the HTTP contract;
- the forms working without JavaScript;
- the server deciding every replacement.

## Options considered

1. **Now/Then single stage** (mockups made on 29 October outside the repo,
   not kept here). One stage with a Now/Then toggle, so the house and the kept
   house share one place.
   - For: it removes the shared head row that causes the known 1920 issue, and
     it is the smallest structural change.
   - Against: it keeps the house, so the story still needs explaining. It also
     hides the kept ship behind a toggle, which makes the playtest's confusion
     about the two halves harder to resolve, not easier. Nothing in it addresses
     the short visits.
2. **A visual reskin only.** Keep the house grammar and the two halves, and
   change the palette, type and framing.
   - For: the cheapest option, and no spec churn.
   - Against: it touches neither finding. The confusion was about what the
     halves mean, not how they look.
3. **The ship (chosen).**
   - Ten ship parts instead of ten territories.
   - Each part reads one countable thing in the spelling.
   - One harbour scene: the live ship on the water, the kept ship on a slipway,
     and waiting planks on a pallet beside it.
   - The old plank flies from one to the other, for this visitor's own change
     and for every other visitor's change arriving live.
   - A short, skippable opening story.

   A playable prototype was built by Claude in a separate session and approved
   by the maker for the look, the scene and the rules. It is kept, with its
   screenshots, in [`docs/exploration/ship-prototype/`](../exploration/ship-prototype/).
   It is a single file using three 0.160 from a CDN, with no server and its own
   example words. It is reference, not code to copy.

## Decision

**The body.** One part per position, in this order:

| Position | Part |
|---|---|
| 01 | ram |
| 02 | hull |
| 03 | prow |
| 04 | stern |
| 05 | shields |
| 06 | mast |
| 07 | sail |
| 08 | oars |
| 09 | rudder |
| 10 | pennant |

**The rules.** Each part reads one thing you can count in how the word is
spelled, never what it means:

| Part | Reads | Makes |
|---|---|---|
| ram | repeated letters | blunt, beak or trident |
| hull | the first letter | the hull's paint |
| prow | round letters | how far the prow curls |
| stern | consonants | the stern's plumes |
| shields | vowels | one shield per vowel, in the vowel's colour |
| mast | tall letters | the mast's height |
| sail | every letter | one stripe per letter, vowels coloured |
| oars | letters | one oar per letter, each side |
| rudder | hanging letters | how deep the rudder reaches |
| pennant | the word itself | the word, written on the pennant |

- Every count is capped where the prototype caps it.
- One table of rules is the single source for the ship, the notation, the
  typing prediction and the shipwright's notes.
- The rules get one round of tuning after an informal try by 2–3 classmates,
  once the harbour is live (slice 3). Each change records its reason. The
  rules are frozen after that round.

**One harbour.**
- One canvas holds both ships. It is decorative to assistive technology, as
  before.
- Wherever the old plank goes (the kept ship's gap or the pallet), it flies
  there after the server accepts the change. That holds for this visitor's own
  change (Post/Redirect/Get) and for every other visitor's change from the
  stream.
- It never flies on a load, a snapshot or a reconnect.
- On a phone the camera follows the plank and comes back.

**Which word is which part.**
- Part names sit beside the 01–10 indices.
- Pointing at a word or a part lights both ships and shows a tag.

**Notation and prediction.** These are rewritten for the new rules (for
example, "Oars · 7 letters → 7 oars a side"). They stay text only; the ship
never previews a draft.

**The shipwright's notes** at `/ship/` are server-rendered and readable
without JavaScript, generated from the same rule table. `/house/` answers 301
to `/ship/`, so old links and the README keep working.

**The question band** stays until the opening story is built. At that point
the evidence decides whether the story replaces the three steps.

**The opening story.**
- Five short beats, on the first visit only.
- Skippable in one click or with Escape, and it never traps focus.
- Absent without JavaScript; the forms are complete and usable without it.

## Co-presence

Decision 0001 rejected visible co-presence for three reasons:
- it would have to define who is present;
- it touches identity and privacy;
- it moves attention from the sentence to the size of its audience.

There is new evidence against each:
- at the 28 October playtest, visits were short: a quick change or two, then
  gone (the maker's reading; nobody said they were bored);
- the final brief asks for co-presence, and the showcase puts a room full of
  people in front of the page at once;
- in the harbour, presence can stay on the ship instead of turning into an
  audience display.

So, **anonymous shipwrights**:
- **One figure per open view.** Each open `GET /` view (one live stream) is
  one figure on the quay or slipway. A figure appears when its stream opens
  and leaves when it closes.
  - "Present" is defined as an open stream: no cookie, account or device
    needed.
  - No name, no per-person colour, no list, and no number shown anywhere.
  - Held in server memory only: never stored, and never logged per stream.
    The stream carries an anonymous total only, which draws the figures and
    is never shown as a number.
- **Figures carry planks.** When a change happens, a figure carries the old
  plank from the ship to the slipway: any figure for others' changes, and
  your own figure, marked only on your page, for yours.
- **Your plank.** When someone replaces a word that is yours, you see that
  plank highlighted as it flies, with one line: "Your plank was carried to the
  slipway. It's kept." It shows on your page only, from a live event, never on
  a load or a reconnect.
- **The last plank.** When the shown ship has one original plank left, the
  page names it: "One original plank still stands: it" (the word standing
  there).

**Amended 31 October (the maker), when the shipwrights slice was planned:**
- **The plank is carried, not flown the whole way.** It is tossed in a short
  arc to the quay's edge, a shipwright catches it and carries it to the
  slipway or the rack, about 3 s in all. Every plank is carried the same way:
  when no other figure is on the quay, a passing one walks in to catch it.
- **A new change finishes any carry still under way at once.** The plank is
  set down, its kept part and its waiting word appear, and the new toss
  begins. This keeps the live ships equal to a fresh build. With reduced
  motion nothing is tossed or carried, as before.
- **At most 8 figures are drawn,** so a full room doesn't bury the slipway.
  Past 8 the scene looks the same.
- **Logging.** Nothing about the total is logged. Decision 0002's
  `stream-open` / `stream-close` lines stay: they record who did what, not
  who is present, and they predate this decision.
- The stream's total travels as its own event, `crew` (`{ total }`), and the
  snapshot and change events are unchanged.

Still no numeric counts, names, identity, feed, scores or chat. Co-presence
comes through the shared ship, not an audience display. "Your plank" and "the
last plank" come with the harbour; the shipwrights are a slice of their own
right after it.

## Participation

- `SETTLE_SECONDS` drops from 300 to 20, set as a Fly secret on 29 October.
  No code changes.
- Move-on stays.

The reasoning is co-presence at the showcase. At 300 s, someone at a laptop
makes one change and then watches for five minutes. At 20 s they can answer the
person next to them within a breath, and see their plank fly. Move-on is what
stops a quick loop from turning into one person re-rolling one part. It sends
them to another part, which is also the next plank flying.

**What stays exactly as it is:**
- the backend, the HTTP contract and the forms working without JavaScript (the
  shipwrights add an anonymous total to the stream, held in memory only);
- the rule modes and the database trigger, and the version and stale checks;
- the kept-ship and next-ship derivation;
- realtime over SSE, and logging;
- the blocklist;
- no counts and no identity;
- the sentences read as text;
- spelling, never meaning.

## What it costs

- **The house grammar is retired, not edited.** About 2,000 lines of
  `src/lib/house/` go, with the house specs, `house-grammar.test.ts` and its
  fixture. "Frozen grammar" becomes "frozen rules" for the ship, after one
  round of tuning. The geometry checks (live equals fresh, clearances, first
  screen) have to be rebuilt for the harbour.
- **The two-halves layout and its checks go.** That is
  `two-ships-layout.test.ts` (1,177 lines), whose pinned states, the 1920
  known issue included, no longer apply. The harbour needs its own layout
  checks.
- **WebGL carries more.** One larger scene with shadows, water and ten parts
  on two ships is heavier on a phone than two small houses. The bundle and
  first paint need a budget. Without WebGL, the sentence, the kept sentence,
  the waiting row and the forms are the whole page.
- **Time.** The slices run back to back and finish before the deadline (noon,
  9 November), with room left for the README and PROCESS. The scene is the
  least certain part.
- **Copy and README.** Most of the README's house language becomes untrue. The
  maker rewrites it.

## Order of work

1. This ADR and `CLAUDE.md`.
2. The ship body, rules, notation and `/ship/`.
3. The harbour: the flights, the part tags, the phone camera, "your plank"
   and "the last plank".
4. The shipwrights.
5. An informal try by 2–3 classmates, run and recorded by the maker
   (observations only), then one round of rule tuning, then the rules freeze.
6. The opening story, deciding then whether it replaces the three steps.
7. Polish.

## Status of evidence

The prototype is the maker's approved reference, kept in
`docs/exploration/ship-prototype/`. It is not a measurement. Any claim about
whether strangers read the ship better than the house needs the next informal
try, recorded when it happens.
