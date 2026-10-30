# Harness

Process rules for this repo, plus the product contract for Theseus, derived
from what `README.md` argues "good" means (see "Product contract").

## Sources of truth

- The **brief** poses the problem; the **spec** is the fixed contract. Both
  live on the course site, not in this repo: the final project
  (`/assessments/final-project/`) and the current crit (`/crits/<slug>/`,
  JSON at `/api/crits/<slug>.json`). Read the live one, not a memory of it.
- The template's fixed parts are stated where they live: `fly.toml`,
  `Dockerfile`, `.github/workflows/checks.yml`, `spec/README.md`. In short: one
  shared-cpu-1x machine with 256 MB, one volume at `/data` (the only storage
  that survives a restart or redeploy), HTTP on `0.0.0.0:$PORT`, and `/readme/`
  publishing all of `README.md` in the HTML the server sends.
- Current deliverable: Crit 10, "Fly by instruments". The final submission
  runs in this same repo.
- `README.md` is the public definition and record of the work; `PROCESS.md` is
  the process evidence (900–1100 words, rewritten at each crit). Neither stands
  in for the other.

## Start of every task

- Before substantial work, read the relevant spec lines, `git status`, and the
  existing code for the area you're touching.
- Before building on something earlier work supposedly created, confirm it
  exists by citing the file and line. A plan saying it exists is not evidence.
- Don't carry requirements over from earlier crits or other repos unless the
  current spec restates them.
- At a new crit or handoff, re-read that crit's spec and review every rule in
  this file: update, generalise or remove what no longer applies (through
  "Maintaining this file").

## Scope (current crit; realtime limits since Crit 9)

- Build the smallest slice that satisfies the current crit's spec — no more.
  Don't add a feature because it's easy to build, and don't add speculative
  ones.
- Realtime covers only what the current page (`GET /`) shows about the
  current sentence: the words, the visitor's own trace, and the link to the
  immediately previous whole sentence. Nothing else goes live: no presence,
  no online/visitor counts, no activity or change feed, no chat, no rooms.
  The one exception is the shipwrights (decision 0005, "Scope (Final
  Project: the ship, in one harbour)"): an anonymous total of open streams,
  drawn as figures, never shown as a number.
  Catch-up after a disconnect is a fresh read from SQLite, never a replay
  log, a queue, or any durable pub/sub.

## Scope (Crit 10)

- Multi-user is already satisfied: the visitor cookie (`src/lib/visitor.ts`)
  already tells browsers apart, and the one-change and stale-version rules
  already enforce it server-side. This crit's work is not a new mechanism;
  it's naming the existing one and adding the logging the crit's own
  verification needs:
  - `docs/decisions/0002-pseudonymous-visitor-and-logging.md` records what
    counts as a person, what each may see and change, where it's enforced,
    and why per-browser is the right strength, not an accepted gap.
  - Server-side logging of who did what (`src/lib/log.ts`,
    `src/middleware.ts`), so the app can be narrated from `flyctl logs`
    alone, without clicking through the UI.
- No new product surface: no accounts, no visible identity, no presence,
  no change to the one-change-per-visitor rule.

## Scope (Final Project redesign: settle rule + kept ships)

Branch `final/theseus-redesign` only; `main` stays exactly as deployed for
Crit 10 until the redesign is ready to merge, and nothing merges before the
Crit 10 cutoff. Decided in
`docs/decisions/0003-settle-and-kept-ships.md`, which supersedes
[0002](docs/decisions/0002-pseudonymous-visitor-and-logging.md)'s "What each
person may change" section only.

- **The rule is configuration, not a schema fork.** One setting
  (`rules.mode`, `once` or `settle`) selects the enforced behaviour; flipping
  it back to `once` needs no migration rollback. Production's mode is a Fly
  secret, set explicitly, never a deploy-time flag (CI redeploys on every
  push to `main` and would silently drop a flag). Default when unset is
  `once` — today's behaviour, unchanged.
- **No formal playtest gate for this round** (explicit project decision,
  schedule-driven): build directly, correct as you go from informal tries by
  2-3 classmates whenever something is playable, rather than gating behind a
  structured test.
- **The migration is one-way and needs a confirmed backup first.** Before
  migration `0001` (drops the visitor uniqueness constraint, adds the
  `rules` table and a mode-aware trigger) ever reaches the production
  volume, give the exact `flyctl` backup steps and wait for explicit
  confirmation the backup exists. This is a hard stop, not a formality, and
  stated here because it is easy to skip under deadline pressure.
- **Kept ships need no new stored state.** The second Theseus (ship *k* = the
  word that stood at version *k* of each position) is derived entirely from
  the existing `changes` log; don't add a table, a counter, or any field only
  to make this easier to build or test.
- Scope stays narrow even inside this redesign: no accounts, no visible
  identity change, no presence — the redesign touches the eligibility rule
  and adds one new reading of the same sentence, nothing else from the
  existing product contract.

## Scope (Final Project: the ship, in one harbour)

Decided in `docs/decisions/0005-the-ship.md`, which retires the house: its
grammar, its frozen-grammar rule and its specs are replaced, not edited. The
realtime limits above (since Crit 9) still hold. The prototype behind the
ship (`docs/exploration/ship-prototype/`) is the reference for the look,
the scene and the rules, never code to copy.

- The public object is one shared ten-word sentence and one ship, two forms
  of the same thing, and the kept sentence and its ship of old planks. The
  ship is a deterministic representation of the sentence: the forms,
  `/replace`, the HTTP contract and the backend are unchanged, and the
  sentence stays usable without the ship or without JS.
- Ten fixed parts, one per position: 01 ram, 02 hull, 03 prow, 04 stern,
  05 shields, 06 mast, 07 sail, 08 oars, 09 rudder, 10 pennant. Each
  part reads one thing you can count in the word's spelling, from one table
  (`src/lib/ship/rules.ts`) that the ship, the notation, the prediction and
  `/ship/` all read, never a second copy. Never by meaning.
- One word changes only its own part; no part reads another position's word.
- The rules get one round of tuning, after the informal try by 2–3
  classmates once the harbour (slice 3) is live; every change in that round
  records its reason (in its commit and in decision 0005). After it the rules
  are frozen: change them only for a correctness blocker found by a check or
  by hand, with the evidence, not for taste. A restructure that leaves every
  part's output unchanged keeps `spec/ship-rules.test.ts` and its fixture
  unmodified in the same change; one that needs either edited is a rule
  change.
- One harbour, one canvas: the live ship on the water, the kept ship on a
  slipway, the next ship's waiting planks on a pallet beside it. Once the
  server has accepted a change, the old plank is carried from the live ship
  to its place (the kept ship's gap, or the pallet): for this visitor's own
  change and for every other visitor's change arriving live; never on a load,
  a snapshot or a reconnect. It is tossed in a short arc to the quay's edge,
  caught by a shipwright and carried to the slipway or the rack, about 3 s in
  all. Every plank is carried the same way: when no other shipwright is on
  the quay, a passing one walks in to catch it. A new change finishes any
  carry still under way at once (the plank set down, its kept part and
  waiting word in place), so live always equals fresh. The camera's fixed
  view is the default; on a desktop a drag orbits it within the prototype's
  limits (no pan, distance and angle clamped), with a way back; a phone has
  no orbit, so the canvas never takes the page's scroll, and instead its
  camera follows the plank to where it's set down and comes back (never with
  reduced motion). With reduced motion nothing is tossed or carried: the
  parts swap, and the shipwrights stand still.
- The plank that flies is the old part as it stood, in its own colours, and
  bleaches to the kept ship's driftwood as it lands; it is never red. Red is
  only the live ship's new part, for about a second; the kept part it
  becomes arrives without red (`spec/ship-motion.test.ts`,
  `spec/harbour-flight.test.ts`).
- `three` is the one client rendering library, bundled by Vite and loaded as
  a deferred module: the sentence is painted before any script runs, and
  `GET /`'s scripts stay within 200 KB gzipped
  (`spec/harbour-budget.test.ts`). Client JavaScript may render, select and
  animate the ships; it never decides a replacement.
- The ships are never stored: SQLite keeps only the sentence and its history,
  and an earlier form's ship is built from that earlier sentence alone.
- No preview: typing a replacement never changes either ship; the new part
  appears only after the server accepts the change. The notation may name, in
  text, what a draft would give its part ("Oars · 7 letters → 7 oars a
  side"); the ship never shows it. Decided after the 28 October playtest:
  people expected meaning to change the house. A text prediction teaches that
  spelling decides the form, while the ship keeps its surprise until the
  server accepts.
- Red means only "this part is being rebuilt now"; nothing stays red.
- The canvas is decorative to assistive technology; the live sentence, the
  kept sentence and the waiting row are the accessible state, and other
  visitors' changes are announced politely, coalesced.
- Without WebGL (or before it loads) the page is the sentence, its forms, the
  kept sentence and the waiting row, complete and usable; nothing waits on the
  canvas (`spec/harbour-fallback.test.ts`).
- Co-presence, partly superseding decision 0001's option B: each open
  `GET /` stream is one anonymous shipwright on the quay or slipway, at most
  8 drawn (past 8 the scene looks the same); every figure alike, with no
  name, per-person colour, list or number shown anywhere. The total is held
  in server memory only, never stored, and the stream carries it alone
  (`crew`: `{ total }`), never who is present. Nothing about the total is
  logged; the Crit 10 `stream-open` / `stream-close` lines (decision 0002's
  logging of who did what) stay as they are. Your own change is carried by
  your figure, marked only on your page; the server never says which figure
  is yours. Without WebGL there are no figures and no text about them
  (`spec/realtime.test.ts`, `spec/present-only.test.ts`,
  `spec/harbour-flight.test.ts`).

## Stack

- Astro server-rendered pages on `@astrojs/node`, SQLite through
  `better-sqlite3`, Drizzle for the schema and migrations, and the replacement
  itself as one raw-SQL transaction. This is the course's Week 7 stack (tag
  `frozen-07-anu-system` of the course's `template-dynamic` repo).
- Plain HTML forms and Post/Redirect/Get. No React or other SPA, no Hono, no
  WebSockets, no external APIs, and client JavaScript only where a rule needs
  it.
- Server-Sent Events is the realtime transport from Crit 9 on — still no
  WebSockets, still no client framework.
- The database file lives on the volume, at `/data/theseus.db` in production,
  set explicitly rather than by a default. In production the app refuses to
  start if `/data` is missing. Local databases stay in a gitignored directory
  and are never copied to production.

## Working and committing

- Plan first: no implementation until I approve the plan. Each change states
  the requirement it serves, what it changes, and how it will be checked. The
  plan says what happens to every existing test (kept, replaced or removed, and
  why).
- After a change, run the check it named, read the result, and fix problems
  before moving on. When a check fails, read its output before changing
  anything; if a test looks wrong, prove it against the running app first.
- One logical change per commit, nothing unrelated bundled in. The history
  grows with the work; no bulk commit at the end.
- Never use `--no-verify`. If a hook blocks a commit, stop and tell me.
- Don't commit changes to `README.md`, `PROCESS.md`, `reflections/` or this
  file without showing me first and getting my OK.
- Don't flip the repo public without my go-ahead. Once public, every push to
  `main` runs CI and deploys.

## Verification: name the layer

A check at one layer doesn't verify another. Say which layer a claim rests on.

1. **Code/build:** `pnpm typecheck`; the image builds.
2. **Local image:** the spec against *this* repository state, as CI runs it:

   ```sh
   docker build -t app . && docker run -d --rm --init --name app -p 8080:8080 -e PORT=8080 -e BLOCKED_WORDS=blockedtestword --tmpfs /data app
   RULE_MODE=once BLOCKED_WORDS=blockedtestword pnpm check    # APP_URL defaults to http://localhost:8080
   docker stop app
   ```

   This is how to show the current code passes. Local and CI state is
   disposable and is never user evidence, so the whole spec runs here,
   including the checks that change the sentence. `pnpm check` against the
   fly.dev URL tests the last deploy, not the working tree (`/readme/` compares
   the local `README.md` with what's served). `--tmpfs /data` wipes data, so a
   persistence claim needs a named volume (`-v data:/data`) and a restart.

   **On `final/theseus-redesign` (`RULE_MODE=settle` in production), run it
   a second time against a settle-mode container**, exactly as `checks.yml`
   does, since production's actual mode is never exercised by the default
   run above:

   ```sh
   docker run -d --rm --init --name app -p 8080:8080 -e PORT=8080 -e RULE_MODE=settle -e SETTLE_SECONDS=3 -e BLOCKED_WORDS=blockedtestword --tmpfs /data app
   RULE_MODE=settle SETTLE_SECONDS=3 BLOCKED_WORDS=blockedtestword pnpm check    # APP_URL defaults to http://localhost:8080
   docker stop app
   ```
3. **Deployed:** `flyctl deploy --remote-only --ha=false -a
   comp4020-final-baizhenh884-dev`, then
   `APP_URL=https://comp4020-final-baizhenh884-dev.fly.dev pnpm check`. Against
   a non-local URL only the read-only checks run (under `caffeinate -i`, so
   the Mac doesn't sleep mid-run): the ones that change the
   sentence skip themselves, because on production they'd fabricate visitor
   contributions. Verify those behaviours on the live URL by hand, as a
   visitor, and record what you saw as an observation.
4. **Human judgement:** whether a stranger can do the core thing, whether the
   app lives up to the README, how the page looks. Open it in a browser; the
   rendered page is the truth. Report these as observations, not passes.

- Never report a requirement as verified by a check that doesn't test it. Say
  it's unverified and what would verify it.
- A difference between two ships counts only if it shows in the settled part
  at page scale. The flight proves nothing about it: measure the settled part
  itself.
- Bounding boxes and counts can't judge a ship or equality. Compare real
  geometry, and judge how the ship reads in a rendered browser.
- A layout check stages its whole state (`stageHarbour` in `spec/chrome.ts`):
  every server-derived element it measures is set by the check, never left
  to whatever an earlier spec file left in the shared container.
- Never weaken or skip a local/CI check because production can't run it.
- New checks go in `spec/*.test.ts` (`spec/README.md` covers the shipped
  ones), assert the contract rather than the implementation, and are written
  before the code, failing for the right reason. **The spec commit itself
  must land before the feat commit it covers**, not just be written first and
  committed alongside or after (the settle-rule migration, commits
  `0118706..5feee78`, landed before `spec/eligibility.test.ts`, commit
  `53b8a5d` — the spec existed and was green locally before each feat commit,
  but the commit *order* didn't show that, so the history can't prove it on
  its own). History is never rewritten to fix this after the fact; it's a
  rule for commits from here on.
- **A check gated on configuration the test runner doesn't control on its own
  (a rule mode, a feature flag) must never be silently skippable in CI.**
  Follow `spec/logging.test.ts`'s `dockerOnly` pattern: skip, named, when the
  gating condition is genuinely absent from a local or non-CI run, but fail
  loudly when CI's own environment should have declared it and didn't. CI
  must declare every such variable explicitly on every run it does — never
  leave it unset and rely on a check's default to paper over the gap.
- Don't replace judgement with a proxy: no keyword checks, and no fields added
  only so something can be tested.

## Evidence integrity

- CI gates the deploy on `pnpm check:evidence`. It passes once `PROCESS.md`
  and any one crit reflection exist, so it can't tell which crit's file is
  there: before each cutoff, confirm that crit's own reflection
  (`reflections/crit-10.md` now) exists and holds a real account. Never create
  a placeholder or stub to make it, CI or any rubric check pass.
- Never fabricate user testing, research, sources, observations, command
  output, failures, deployment results or design rationale. If something
  wasn't done, say so.
- Words staged to exercise a local browser or a spec are test data, never
  "visitors' changes" in any account. Scratch measurements, prototypes and
  screenshots kept outside the repo aren't repo evidence: say they weren't
  kept, and don't cite them as if they were.
- Deliberate production verification changes require explicit user approval and
  must be disclosed as verification activity, never participant evidence.

## Keeping decisions explainable

For a non-obvious decision (stack, what counts as a person, schema, what
persists or expires, what's deliberately not built), keep enough on record to
explain it later in `PROCESS.md`: the decision, the alternatives considered,
the evidence behind it, and what happened once it was built. A commit message
is usually enough at the time. Don't rewrite `PROCESS.md` after every small
step.

## Secrets and local config

- `FLY_API_TOKEN` lives in `mise.local.toml`, the course API key in
  `.claude/settings.local.json`; both are gitignored and stay that way. Never
  print their values or copy them into a tracked file, the `Dockerfile`,
  `fly.toml` or CI config.
- Never copy secrets in from another repository.
- If a secret is committed or pushed, stop and tell me: it needs rotating, not
  just deleting.

## Dates and times

When behaviour depends on dates or times, compute them in the timezone the
spec or project rules name, never the machine's timezone (Fly and CI run in
UTC). No app timezone is chosen yet; add one here only when the app needs it.

## Definition of good

`README.md` argues what "good" means for Theseus; the product contract below is
derived from it. When a README claim changes, change the contract in the same
deliberate update. Never add generic rules ("intuitive", "beautiful",
"user-friendly", "responsive").

## Product contract: Theseus

What the code must hold to. The README says why; don't restate it here.

### Enforced

- The HTTP contract at the top of `spec/theseus.test.ts` (routes, fields,
  status codes, the word `<label>` and the `rel="prev"` link) is binding.
  Change it only together with the spec.
- **Under rule mode `once`** (production default, and the only mode before
  the redesign's migration `0001` lands): one successful replacement per
  visitor, ever: no undo and no second change. A visitor is a browser
  holding the site's visitor cookie. Enforce it atomically in the database
  (a uniqueness constraint on `changes.visitor`, before `0001`), never by
  check-then-write and never only in the page.
- **Under rule mode `settle`** (the redesign on `final/theseus-redesign`,
  `docs/decisions/0003-settle-and-kept-ships.md`, after migration `0001`): a
  visitor may act when they have no prior change, their latest change has
  been replaced, or it has stood at least `SETTLE_SECONDS` — and never at
  the exact position of their own latest change (move-on) until they've
  changed elsewhere. **Once `0001` is applied, the uniqueness constraint no
  longer exists in either mode** — it is dropped, not conditionally
  bypassed. From that point on, both `once` and `settle` are enforced by the
  same single database-level guard, a `BEFORE INSERT` trigger on `changes`
  that reads the current `rules.mode` and applies whichever predicate is
  active (reproducing the old unique-index behaviour exactly when
  `mode = 'once'`). Never assume the unique index still exists once `0001`
  has run, in either mode. Which mode is active is itself configuration (see
  "Scope" above), never hardcoded behaviour that needs a schema change to
  switch. In both cases: atomic in the database, never check-then-write and
  never only in the page.
- A replacement names the word position and the version of it the visitor saw.
  Versions belong to one position: a change elsewhere never makes a word stale.
  If that position has changed since, refuse it. Compare versions, not word
  text: a position can return to an earlier word.
- A refused replacement (stale, invalid, or the same as the current word) never
  uses up the visitor's change.
- A replacement is one token: trimmed, 1–24 characters, no whitespace or
  control characters. Store it as plain text and escape it on every output. The
  sentence's final full stop belongs to the sentence, not to a word.
- No word is protected: the maker's starting words and every visitor's word can
  be replaced by any later valid replacement. No visitor owns a word, or the
  part of the ship it stands for.
- History keeps every successful replacement, in order, so every earlier whole
  sentence can be rebuilt. `GET /?at=N` is the sentence after N replacements
  (0 is the start). Earlier forms are read-only; only the current sentence can
  be replaced.
- Public views never show who made a change or when anyone else acted, and no
  counts appear on the page: no totals, no "3 of 12", no popularity or scores.
  The ordinal in a `?at=N` URL is navigation, not a count shown on the page,
  and so are the part notation ("08 · Oars"), the 01–10 index and part name
  above each word and kept gap, and the part tag on the ships: each names a
  position. The shipwrights' total is drawn as figures, never written as a
  number, in the page's text, its attributes or anywhere a visitor can read
  it (`spec/present-only.test.ts`).
  (Otherwise enforced in code and checked by review; no automated check yet.)
- A visitor who has contributed and comes back can recognise their
  contribution in context: their word if it still stands, or that it has been
  replaced. Its markup is fixed in the HTTP contract at the top of
  `spec/theseus.test.ts`.
- The starting sentence is maker-authored and is the only non-visitor content.
  Never seed, import or fabricate visitor changes: not in the app, the database,
  the logs or the evidence.
- There is no user-facing moderation. Any recovery path for harmful public
  content is an exceptional maker action outside the ordinary interaction: it
  never protects, assigns or adds words, and it needs a recorded decision
  before it's built. The one built is the maker's blocklist
  (`docs/decisions/0004-maker-blocklist.md`, `spec/blocklist.test.ts`): words
  from the `BLOCKED_WORDS` Fly secret, exact after NFKC and case folding,
  refused as invalid (422, change not used up), logged only as
  `reason=blocked`; an empty list is logged once, never fatal. Real blocked
  words never appear in the repo, logs, chat or responses; checks use the
  meaningless `blockedtestword`.
- No editing, undo, accounts, profiles, nicknames, comments, likes or other
  reactions, rooms, feeds, scores or second sentence without an explicit
  product decision recorded first.
- A successful replacement reaches every other connected open view of the
  current sentence (`GET /`) within about a second, without a reload. After a
  dropped connection reconnects, that view catches up automatically to
  current truth without a manual reload. What that view shows about the
  current sentence stays true: the words, the visitor's own trace, and the
  link to the immediately previous whole sentence. The one exception is a
  position holding the visitor's unsubmitted draft: it shows that the word
  changed, while the draft and the version it was based on stay as they
  were.
- Historical `?at=N` views never update live and never subscribe to realtime
  behaviour. Their ship is built from that earlier sentence alone, on its
  own, and is read-only.
- An earlier ship, `GET /?kept=k`, is completed kept ship k alone: its ten
  words and its ship on the slipway, read-only, never live, reached one at a
  time (Earlier ship / Later ship / Back to now), never listed together. Ship
  k is derived from `changes` by the same rule as the kept ship being built
  (`completedShip` in `src/lib/kept-ship.ts`), nothing stored. Anything that
  isn't a completed ship (not a whole number from 1, the ship still being
  built, or later) is 404. Its number is navigation in the URL only, never
  shown on the page (`spec/kept-houses.test.ts`, `spec/kept-ship.test.ts`).
- Every replaced word visibly goes to the slipway. One that belongs to the
  next ship (ship + 1, by the same rule) waits: as a plank on the pallet,
  and as text in a row after the kept sentence, "Waiting for the next
  ship:", in place order with its 01–10 index, hidden when none waits; plank
  and word land when the flight does (at once with reduced motion or no
  canvas); when the ship completes, they move up into the kept ship.
  Derived from `changes` (`next` in `src/lib/kept-ship.ts`, carried by the
  stream as a derived value), nothing stored. Live for every open `GET /`;
  it flies only from a change event, never a load, snapshot or reconnect,
  and a phone's "kept below" acknowledgement fires for it too. Real text
  after the kept sentence, announced in the polite live region, coalesced.
  No counts (`spec/kept-ship.test.ts`, `spec/kept-moment.test.ts`,
  `spec/live-client.test.ts`, `spec/harbour-flight.test.ts`,
  `spec/harbour-layout.test.ts`).
- The ship follows authoritative shared state, not a held draft: a newer
  shared word reaches it once, including at a position where a draft keeps the
  word on screen back, and the draft, its expected version and the label stay
  as they were (`spec/live-client.test.ts`).
- Live equals fresh: after any sequence of live changes, every part's
  geometry, on both ships, equals that of a fresh build of the same final
  sentence and kept ship (`spec/ship-body.test.ts`, `spec/ship-kept.test.ts`).
- A screen reader reaches what the page shows: the kept sentence is read as
  its words, each gap as "still standing: <word>" (`spec/kept-ship.test.ts`,
  `spec/kept-sentence.test.ts`); others' changes are announced in one polite
  live region, only from change events newer than what's shown (never a
  load, snapshot or reconnect), a burst coalesced into one announcement, as
  plain text naming positions and words, never who or when; and a draft's
  prediction in a second polite live region, once typing pauses (never per
  key), or once that the word was replaced by someone else and to choose it
  again (`spec/live-client.test.ts`, `spec/ship-notation.test.ts`).
- The part notation names its part and what the word makes of it and, after
  an accepted change (own or another visitor's), before and after ("2 oars a
  side → 7 oars a side", or "…, unchanged") and, on a desktop, the count that
  decided it ("7 letters"), all from the rule table (`partOf` in
  `src/lib/ship/rules.ts`), never a second copy. A phone shows the change
  only. Same slot, moves nothing, one line. Decorative to assistive
  technology, which hears the same change in the polite live region
  (`spec/ship-notation.test.ts`, `spec/harbour-layout.test.ts`).
- `GET /ship/` (the shipwright's notes) explains how each part reads a word:
  the ten parts, what each counts and makes, the vowel colours, the paints
  and worked examples, server-rendered from the rule table so it can't drift
  and readable without a script. Read-only, never live, never a place to try
  a word; reached from `/readme/` and from `/` (the band's masthead row, in
  full and folded, and the foot). `GET /house/` answers 301 to `/ship/`
  (`spec/ship-page.test.ts`, `spec/question-band.test.ts`).
- A kept gap shows the word still standing at its position, faint, over a
  dashed line (a second cue besides lightness: a kept word has no line,
  your own kept word a dotted one). It keeps the 4.5:1 floor on its grid
  like any text and a ceiling of 60% of the faintest kept word's contrast.
  Under the kept sentence: "Replaced words, back in their places. Faint
  words still stand." (`spec/harbour-layout.test.ts`). (Reason: at the 28
  October playtest an empty gap was read as a fill-in-the-blank quiz, and the
  kept sentence as the original.)
- Escape on a word in hand cancels it: it empties the draft as the visitor
  would (so a change it held back applies then), lets go of the field, and
  never submits. While a replacement is typed, the notation's slot names the
  part (its number alone on a phone), the word being replaced, struck, and
  what the draft would make of it, from the rule table, with the deciding
  count on a desktop; never the keys, which stay in the rule paragraph. A
  draft that can't be a word predicts nothing, from its spelling alone
  (never the blocklist). If another visitor replaced the word: its number,
  the struck word, "now “X”" and "choose again". One line; only a word is
  shortened, never the prediction; the struck word never shortened on a
  desktop (`spec/live-client.test.ts`,
  `spec/ship-notation.test.ts`, `spec/harbour-layout.test.ts`).
- The focused word field shows a visible keyboard focus (2px, ink) that
  never touches a neighbouring word, on a phone included
  (`spec/harbour-layout.test.ts`).
- Every page has one visible h1 (the masthead's "Theseus"), a header, one
  main, a meta description, Open Graph tags with an image that loads, and a
  favicon (`spec/page-shell.test.ts`).
- On a desktop the live sentence steps down through a few fixed sizes to
  stay on two lines, never below a floor at which it still outranks the
  kept sentence; the step is one function of the words
  (`src/lib/sentence-step.ts`), shared by the server and the live client.
  A step never changes under someone: another visitor's change that needs a
  new step waits while this visitor has a word in hand (a field focused or
  holding a draft, including moving between words) and applies once they
  let go. Ten 24-letter words may wrap past two lines at the floor
  (`spec/sentence-step.test.ts`, `spec/live-client.test.ts`,
  `spec/harbour-layout.test.ts`). The step is a prediction from glyph
  widths, not a measurement in the visitor's browser: two lines is checked
  only in Chrome on macOS and Linux (the 500-sentence set). Elsewhere
  (Windows, Safari, Firefox) a rare third line is possible.
- Realtime delivery is presentation only: SQLite remains the sole source of
  truth, server memory holds no authoritative sentence state, and the
  existing per-position version/stale-check and whichever eligibility rule
  is currently active (`once` or `settle` — see "Enforced" above) are never
  bypassed, weakened, or duplicated by the realtime channel. No automatic
  event rebases a draft onto a newer version; if it's submitted, the
  existing stale rule applies exactly as before.
- No presence, online/visitor counts, visitor identity, or activity/change
  feed is added for realtime, except the shipwrights' anonymous total
  (above); the existing no-who/when/counts rule extends to whatever the
  realtime channel carries.
- The realtime layer never weakens an existing server-enforced product rule.
  Existing server-side validation, persistence and output-safety guarantees
  remain authoritative; stale, invalid, or ineligible replacements (whatever
  the active rule mode currently refuses — a second change under `once`, a
  holding or not-here attempt under `settle`) continue to be refused by the
  server. Realtime presentation and navigation behaviour are page-side only
  and never override those server guarantees.
- The server logs who did what, server-side, to stdout, so it outlives the
  crit (`docs/decisions/0002-pseudonymous-visitor-and-logging.md`). Logging
  is observation only: it never changes a response, the replacement
  transaction, or realtime delivery, and a logging failure never fails a
  request. The visitor tag is a one-way hash of the cookie; the raw cookie,
  IP address and user agent are never logged. A refused replacement's word
  text is never logged, only a reason category. A broadcast's reach is
  logged as a count of streams notified, never a per-stream identity.
  Nothing from the logs reaches any public response, stream, or API.

### Current design (revisable)

These can change without a contract change, as long as the enforced rules
hold.

- Only what stands now under the live sentence (`GET /`): no earlier words
  beneath its words. Replaced words are shown kept in the kept half; the
  whole history is one step away under "Earlier form" (`?at=N`).
- Earlier whole sentences, reached one step at a time (Earlier / Later / Now),
  one on screen at once and never listed together.
- Not built (as of Crit 9): an "as you left it" jump, a client-side
  confirmation step, and showing how long a word stood. Each change still
  records when it happened, for logging; that time is never shown to other
  visitors. The one exception is private: under settle mode, a visitor's
  own holding word fills a thin line until it settles (how much of their
  hold is left), on their own page only, never red, and not with reduced
  motion (`spec/live-client.test.ts`, `spec/harbour-layout.test.ts`).
- The sentence shares the first screen with the harbour (maker, 30 October):
  on a desktop at 1920, 1440 and 1280 the whole sentence strip sits over or
  under the scene within the first screen, as the prototype's panel does;
  the kept strip and the notes may fall below it, reachable by scrolling.
  At rest the sentence strip never covers the live ship's hull, at 1920,
  1440, 1280 and 390 (the harbour's counterpart of the house's "clear of
  every house at rest") (`spec/harbour-layout.test.ts`).
- On a phone, a new visitor's first screen (the question band in full) holds
  the question, the three steps and the whole live sentence; the harbour may
  start one scroll below. Ten 13-letter words run the sentence itself past
  that screen. Once the band is folded (this visitor has made a change), the
  harbour and the whole sentence fit the first screen together, ten
  13-letter words included (`spec/harbour-layout.test.ts`).
- The visual treatment is judged, not specified. Its direction is the
  prototype's sunlit harbour: Athens on the shore, the live ship painted on
  teal water, the kept ship bleached like driftwood on its slipway, a part
  still standing drawn as an outline, the next ship's planks on a pallet;
  parchment strips for the sentence and the kept sentence. The sentence is
  the protagonist and the ship its body; red is only a part being rebuilt
  now.
- The question first: above the harbour on `GET /`, a band with the
  question, one sentence on Theseus's ship and three numbered steps on how
  to play, in full until this visitor has made a change (from their trace,
  on the server, never live), then the question alone. Step 1 names the
  device's gesture (Click on a desktop, Tap on a touch screen); step 2 says
  its plank is rebuilt from how the word is spelled, not what it means; step
  3 says replaced words are kept on the slipway: in the ship of old planks,
  or waiting for the next. Its copy claims nothing the rules don't do
  (`spec/question-band.test.ts`). Kept until slice 4, which decides with
  evidence whether the opening story replaces the three steps.
- Every word at rest carries a faint solid underline on every device, so a
  word reads as clickable before it's pointed at; pointing darkens it
  (`spec/harbour-layout.test.ts`). (Reason: at the 28 October playtest,
  people on a desktop didn't see the words could be clicked.)
- Every live word carries its position and part, "01·Ram", small above
  it, and every kept word or gap its position, always, a phone included;
  drawn, never read (`spec/numbering.test.ts`).
- Word and part as one selection. Pointing at a word, or at a part on a fine
  pointer, lights that part on both ships and shows a tag on each with its
  number and name; a focused or selected word keeps its parts lit and shows
  the notation. No tag at rest. An accepted change draws the rebuilt part
  red while it is exchanged, then everything returns to neutral. A phone has
  no tag on the canvas; the notation and the strip say the part. Under the
  sentence: "Ten words. Ten planks. Change a word, and its plank is rebuilt."
  Under the kept sentence: "Replaced words are kept here: in this ship, or
  waiting for the next." The question, as the band's headline and at the
  foot beside About: "If every plank is replaced, is it still the same
  ship?" With reduced motion
  nothing flies: the parts swap, the new one outlined in red for a moment,
  then not.
- Your plank (decision 0005): when another visitor replaces a word that is
  yours, its plank glows as it flies, on your page only, and one line says
  "Your plank was carried to the slipway. It's kept." in the notation's
  slot, also in the polite live region; only from a live change, never a
  load, snapshot or reconnect (`spec/live-client.test.ts`).
- The last plank (maker, 30 October): when the ship shown has one gap left,
  the kept strip names it: while ship 1 is being built, "One original plank
  still stands: X"; for a later ship, "One plank still stands before the
  ship of old planks is whole: X". Only ship 1's planks are originals. On
  the server and live: the stream's kept ship carries `original` (whether
  it's ship 1), a flag, never the ship's number (`spec/kept-ship.test.ts`).
- A position that changed elsewhere while a visitor has an unsubmitted draft
  there shows an inert notice of the new word, without touching the draft or
  its expected version; the draft is only reconciled once the visitor clears
  it themselves or reloads.

### Known issues

- Only the next ship waits. A word replaced at a position that already
  has a word waiting (the third time it changes while the current ship is
  being built) belongs to a ship further ahead and isn't shown until that
  ship is next (decided 29 October: one waiting row, not a queue of
  ships). It's kept in `changes` and appears in its ship in time.

## Stop and ask

Stop and tell me, rather than working around it, when:

- the spec conflicts with an assumption, an instruction or the code
- a check seems to be testing an old deployment rather than the current code
- a change would substantially expand scope
- passing a check would need fake evidence or a weakened check

When an instruction of mine conflicts with the repo, the spec or verified
behaviour, name the conflict, cite the evidence (file and line where
possible), say what following it would produce, propose the smallest safer
alternative, and wait. A design preference of your own is not a conflict.

## Maintaining this file

- Never edit this file without my approval: show the diff and wait. Commit an
  approved change on its own.
- After a repeated correction, a failed test, a wrong assumption, a problem
  found by hand or a thrown-away implementation, ask whether it reveals a
  reusable rule. If it does, propose a rule change or an automated check,
  stating what happened and where, the rule, and how we'll know it works.
- This file holds durable rules and testable project contracts, not task lists
  or plans.
