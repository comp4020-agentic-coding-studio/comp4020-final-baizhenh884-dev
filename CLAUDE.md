# Harness

Process rules for this repo. The app concept isn't chosen yet, so nothing here
is a design rule; those are added deliberately once `README.md` argues what
"good" means for this app (see "Definition of good").

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

   This is how to show the current code passes. `pnpm check` against the
   fly.dev URL tests the last deploy, not the working tree (`/readme/` compares
   the local `README.md` with what's served). `--tmpfs /data` wipes data, so a
   persistence claim needs a named volume (`-v data:/data`) and a restart.
3. **Deployed:** `flyctl deploy --remote-only --ha=false -a
   comp4020-final-baizhenh884-dev`, then
   `APP_URL=https://comp4020-final-baizhenh884-dev.fly.dev pnpm check`, then use
   the change on the live URL by hand.
4. **Human judgement:** whether a stranger can do the core thing, whether the
   app lives up to the README, how the page looks. Open it in a browser; the
   rendered page is the truth. Report these as observations, not passes.

- Never report a requirement as verified by a check that doesn't test it. Say
  it's unverified and what would verify it.
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

`README.md` will argue what "good" means for this app, from sources. Until the
concept and those sources are chosen, add no design rules here, and never
generic ones ("intuitive", "beautiful", "user-friendly", "responsive"). Rules
derived from the README's argument come in a later, deliberate update.

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
