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

## Scope (Final Project: House integration)

The Final Project deliberately pivots to the House of Theseus. This section
supersedes the "smallest slice" rule above for the house itself; the realtime
limits above (since Crit 9) still hold. The prototypes behind the house live
outside this repo: it holds their result and its specs, not the search.

- The public object is one shared ten-word sentence and one corresponding
  house, two forms of the same thing. The house is a deterministic
  representation of the sentence: the forms, `/replace`, the HTTP contract and
  every existing test are unchanged, and the sentence stays usable without the
  house or without JS.
- Ten fixed territories, one per position; each word's written form (the
  frozen features, with length graded continuously and saturating near 14
  letters) gives its territory's character. Never by meaning.
- The grammar and the geometry are frozen. Change them only for a correctness
  blocker found by a check or by hand, with the evidence; not for taste. Do not
  reopen a deliberately rejected design or grammar direction without new
  evidence that changes the reason it was rejected.
- One word primarily changes its own territory. A neighbour may move only
  through a structural rule that already exists (the threshold clearing the
  entry), never because a word was given reach into it.
- `three` is the one client rendering library, bundled by Vite. Client
  JavaScript may render, select and animate the house; it never decides a
  replacement.
- The house is never stored: SQLite keeps only the sentence and its history,
  and an earlier form's body is built from that earlier sentence alone.
- No preview: typing a replacement never changes the house; the new body
  appears only after the server accepts the change.
- Red means only "this body is being rebuilt now"; nothing stays red.
- Both canvases are decorative to assistive technology; the live sentence
  and the kept sentence are the accessible state, and other visitors'
  changes are announced politely, coalesced.

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
   RULE_MODE=settle BLOCKED_WORDS=blockedtestword pnpm check    # APP_URL defaults to http://localhost:8080
   docker stop app
   ```
3. **Deployed:** `flyctl deploy --remote-only --ha=false -a
   comp4020-final-baizhenh884-dev`, then
   `APP_URL=https://comp4020-final-baizhenh884-dev.fly.dev pnpm check`. Against
   a non-local URL only the read-only checks run: the ones that change the
   sentence skip themselves, because on production they'd fabricate visitor
   contributions. Verify those behaviours on the live URL by hand, as a
   visitor, and record what you saw as an observation.
4. **Human judgement:** whether a stranger can do the core thing, whether the
   app lives up to the README, how the page looks. Open it in a browser; the
   rendered page is the truth. Report these as observations, not passes.

- Never report a requirement as verified by a check that doesn't test it. Say
  it's unverified and what would verify it.
- A difference between two houses counts only if it shows in the settled house
  at page scale. The exchange animation proves nothing about it, and neither
  does a count that includes a neighbour moving: measure the settled territory
  itself.
- Bounding boxes and counts can't judge architecture or equality. Compare real
  geometry, and judge how the house reads in a rendered browser.
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
  part of the house it stands for.
- History keeps every successful replacement, in order, so every earlier whole
  sentence can be rebuilt. `GET /?at=N` is the sentence after N replacements
  (0 is the start). Earlier forms are read-only; only the current sentence can
  be replaced.
- Public views never show who made a change or when anyone else acted, and no
  counts appear on the page: no totals, no "3 of 12", no popularity or scores.
  The ordinal in a `?at=N` URL is navigation, not a count shown on the page,
  and so is the part notation ("05 — entry"): it names a position. (Enforced
  in code and checked by review; no automated check yet.)
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
  behaviour. Their house is built from that earlier sentence alone and is
  read-only.
- An earlier house, `GET /?kept=k`, is completed kept ship k alone: its ten
  words and its house, read-only, never live, reached one at a time
  (Earlier house / Later house / Back to now), never listed together. Ship
  k is derived from `changes` by the same rule as the kept ship being built
  (`completedShip` in `src/lib/kept-ship.ts`), nothing stored. Anything that
  isn't a completed ship (not a whole number from 1, the ship still being
  built, or later) is 404. Its number is navigation in the URL only, never
  shown on the page (`spec/kept-houses.test.ts`, `spec/kept-ship.test.ts`).
- The house follows authoritative shared state, not a held draft: a newer
  shared word reaches it once, including at a position where a draft keeps the
  word on screen back, and the draft, its expected version and the label stay
  as they were (`spec/live-client.test.ts`).
- Live equals fresh: after any sequence of live changes, every territory's
  geometry equals that of a fresh build of the same final sentence
  (`spec/house-live-body.test.ts`). Whether a standing neighbour is kept is
  decided on its geometry, never on its outline or a count.
- A screen reader reaches what the page shows: the kept sentence is read as
  its words, each gap as "blank" (`spec/kept-ship.test.ts`,
  `spec/kept-sentence.test.ts`); others' changes are announced in one polite
  live region, only from change events newer than what's shown (never a
  load, snapshot or reconnect), a burst coalesced into one announcement, as
  plain text naming positions and words, never who or when
  (`spec/live-client.test.ts`).
- Realtime delivery is presentation only: SQLite remains the sole source of
  truth, server memory holds no authoritative sentence state, and the
  existing per-position version/stale-check and whichever eligibility rule
  is currently active (`once` or `settle` — see "Enforced" above) are never
  bypassed, weakened, or duplicated by the realtime channel. No automatic
  event rebases a draft onto a newer version; if it's submitted, the
  existing stale rule applies exactly as before.
- No presence, online/visitor counts, visitor identity, or activity/change
  feed is added for realtime; the existing no-who/when/counts rule extends to
  whatever the realtime channel carries.
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
  motion (`spec/live-client.test.ts`, `spec/two-ships-layout.test.ts`).
- The visual treatment (fading, layout) is judged, not specified. Its
  direction is Monograph, an architectural-study field: the sentence is the
  protagonist and the house its body; a standing house stays restrained; red
  is only a part being rebuilt now.
- Word and house as one selection (settled; change only with a recorded
  reason). Pointing at a word, or at a territory on a fine pointer, marks both
  by paired emphasis, with no line. A focused or selected word gets a thin
  line to its territory and the part notation ("05 — entry"). An accepted
  change draws that line red while exactly that part is exchanged, then
  everything returns to neutral. A phone has no line. Under the standing
  house: "Ten words. Ten parts. Change a word, and its part is rebuilt."
  Under the kept house: "Replaced words are kept here, and built back into
  a house." At
  the foot beside About: "If every word and every part is replaced, is it
  still the same thing?" With reduced motion nothing moves and the cue stands
  still for a moment, then clears.
- A position that changed elsewhere while a visitor has an unsubmitted draft
  there shows an inert notice of the new word, without touching the draft or
  its expected version; the draft is only reconciled once the visitor clears
  it themselves or reloads.

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
