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
- Current deliverable: Crit 8, "It's alive!". Crits 9 and 10 and the final
  submission run in this same repo.

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

## Scope (Crit 8)

- Build the smallest slice that satisfies the current crit's spec — no more.
  Don't add a feature because it's easy to build, and don't add speculative
  ones.
- Keep a path open to multi-user and real-time (crit 9): don't pick a design,
  such as state held only in the browser or only in server memory, that would
  have to be thrown away to add them.

## Stack

- Astro server-rendered pages on `@astrojs/node`, SQLite through
  `better-sqlite3`, Drizzle for the schema and migrations, and the replacement
  itself as one raw-SQL transaction. This is the course's Week 7 stack (tag
  `frozen-07-anu-system` of the course's `template-dynamic` repo).
- Plain HTML forms and Post/Redirect/Get. No React or other SPA, no Hono, no
  WebSockets, no external APIs, and client JavaScript only where a rule needs
  it.
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
   docker build -t app . && docker run -d --rm --init --name app -p 8080:8080 -e PORT=8080 --tmpfs /data app
   pnpm check    # APP_URL defaults to http://localhost:8080
   docker stop app
   ```

   This is how to show the current code passes. Local and CI state is
   disposable and is never user evidence, so the whole spec runs here,
   including the checks that change the sentence. `pnpm check` against the
   fly.dev URL tests the last deploy, not the working tree (`/readme/` compares
   the local `README.md` with what's served). `--tmpfs /data` wipes data, so a
   persistence claim needs a named volume (`-v data:/data`) and a restart.
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
- Never weaken or skip a local/CI check because production can't run it.
- New checks go in `spec/*.test.ts` (`spec/README.md` covers the shipped
  ones), assert the contract rather than the implementation, and are written
  before the code, failing for the right reason.
- Don't replace judgement with a proxy: no keyword checks, and no fields added
  only so something can be tested.

## Evidence integrity

- `pnpm check:evidence` starts red (no reflection, template `PROCESS.md`), and
  CI gates the deploy on it once the repo is public. It goes green only when
  `reflections/crit-8.md` and `PROCESS.md` hold real accounts of real work.
  Never create a placeholder or stub to make it, CI or any rubric check pass.
- Never fabricate user testing, research, sources, observations, command
  output, failures, deployment results or design rationale. If something
  wasn't done, say so.

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
- One successful replacement per visitor, ever: no undo and no second change.
  A visitor is a browser holding the site's visitor cookie. Enforce it
  atomically in the database (a uniqueness constraint), never by
  check-then-write and never only in the page.
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
  be replaced by any later valid replacement.
- History keeps every successful replacement, in order, so every earlier whole
  sentence can be rebuilt. `GET /?at=N` is the sentence after N replacements
  (0 is the start). Earlier forms are read-only; only the current sentence can
  be replaced.
- Public views never show who made a change or when anyone else acted, and no
  counts appear on the page: no totals, no "3 of 12", no popularity or scores.
  The ordinal in a `?at=N` URL is navigation, not a count shown on the page.
  (Enforced in code and checked by review; no automated check yet.)
- A visitor who has contributed and comes back can recognise their
  contribution in context: their word if it still stands, or that it has been
  replaced. (Required for Crit 8; its markup will be fixed by a later spec.)
- The starting sentence is maker-authored and is the only non-visitor content.
  Never seed, import or fabricate visitor changes: not in the app, the database,
  the logs or the evidence.
- There is no user-facing moderation. Any recovery path for harmful public
  content is an exceptional maker action outside the ordinary interaction: it
  never protects, assigns or adds words, and it needs a recorded decision
  before it's built.
- No editing, undo, reactions, profiles, nicknames, feeds, scores or second
  sentence without an explicit product decision recorded first.
- Every rule above is enforced on the server. The page may mirror a rule but is
  never its only enforcement.

### Current design (revisable)

These can change without a contract change, as long as the enforced rules
hold.

- Beneath each word, a few of the most recent words it replaced (currently
  four), receding, hidden from screen readers.
- Earlier whole sentences, reached one step at a time (Earlier / Later / Now),
  one on screen at once and never listed together.
- Not in Crit 8: an "as you left it" jump, a client-side confirmation step, and
  showing how long a word stood. Each change still records when it happened,
  for logging; that time is never shown to other visitors.
- The visual treatment (fading, layout) is judged, not specified.

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
