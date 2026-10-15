# 0002 — A visitor is a browser; the server logs it pseudonymously

**Status:** Accepted
**Decision for:** Crit 10 "Fly by instruments"

## Context

Crit 10 asks for two things the project has so far left implicit:

1. What counts as a person, and what each person may see and change — "checked
   on the server... written down in the repo with why."
2. Server-side logging of who did what, that outlives the crit, so I can watch
   two classmates use the deployed app from its URL alone and narrate, from
   `flyctl logs`, what each of them did — without touching the app myself.

Theseus already has both mechanisms (a visitor cookie, a per-position version
check, a private per-visitor trace); what's missing is a single record naming
the decision and its reasoning, and the logging itself.

## What counts as a person

A visitor is a browser holding the `theseus_visitor` cookie
(`src/lib/visitor.ts`, the `COOKIE` constant): a random id minted on first
`GET /` (`ensureVisitor`), not an account, not a chosen name, not a device.

### Alternatives considered

**An account (signup, login).** Rejected: README's "What I'm deliberately not
building" already rules out accounts and profiles, and its "What I looked at"
section cites situated software (Shirky, 2004) for the opposite reason: for
software built for one group, a cookie is enough. An account adds friction the
crit's own test (a stranger, from the URL alone, no setup) works against.

**A chosen pseudonym.** Rejected: README's "The sentence keeps its past
without becoming a feed" already rules out names, times, counts and an
activity stream. A pseudonym a visitor picks is still an identity they could
recognise themselves by across sessions and show to others — more surface
than the project wants, for no requirement that needs it.

**A device fingerprint (IP, user-agent, canvas/font fingerprinting, etc.).**
Rejected: more identifying than a cookie, not less, since it can survive a
cookie clear and cross browser profiles — the opposite of the limit this
decision accepts below. It would also mean collecting data (IP, headers) the
app has no other reason to touch.

**Chosen: the existing cookie.** It already satisfies the brief's own
multi-user test — two browsers in separate Chrome profiles share no cookies,
so the server already tells them apart — and needs no new mechanism.

## What each person may change, and where it's enforced

- **One successful replacement, ever.** `changes.visitor` is declared
  `unique()` in `src/lib/schema.ts`; the `attempt` transaction in
  `src/lib/db.ts` checks `spentBy` first, before anything else, and
  `replaceWord` maps a unique-constraint race to the same `"spent"` outcome.
  This is atomic in the database, never check-then-write.
- **Only a word they actually saw.** `attempt` compares the position's
  current `version` to the one the form submitted; a mismatch is refused
  (`"stale"`) and never spends the visitor's one change.
- **Any word, including their own.** No row is ever marked as belonging to a
  visitor in a way that blocks a later change — `positions`
  (`src/lib/schema.ts`) has no owner column at all.

## What each person may see, and where it's enforced

- **Everyone sees the same shared sentence and house.** `currentPositions()`
  in `src/lib/db.ts` is the one read every visitor gets.
- **Only their own trace, privately.** `traceFor(visitor)` (`src/lib/db.ts`)
  is computed per request from that request's own cookie; `GET /`
  (`src/pages/index.astro`) passes only its own visitor's id; `GET /events`
  (`src/pages/events.ts`) does the same per connection, and a realtime
  `snapshot` carries only that connection's own trace, never another
  visitor's (see `docs/decisions/0001-live-present-frozen-past.md`). There is
  no query or route that returns another visitor's trace, identity, or change
  history.

## What's logged, why, and what's deliberately not

Implemented in `src/lib/log.ts`, `src/middleware.ts`, `src/lib/visitor.ts`,
`src/pages/replace.astro`, `src/pages/events.ts` (see commits "log every
request's...", "log visitor-new and visitor-return...", "log a replacement's
outcome...", "log a realtime stream's..."). Summary:

- **A per-request id** (`requestId()` in `src/lib/log.ts`), not a visitor
  identity: ties every log line from one request (and, for `/events`, the
  connection it opens) together, so I can follow one action start to finish
  while narrating from `flyctl logs`.
- **A one-way visitor tag** (`visitorTag()` in `src/lib/log.ts`):
  `sha256(cookie).hex().slice(0, 8)`. The raw cookie never appears in a log
  line — it's effectively the visitor's credential, and logging it would let
  anyone who reads the logs impersonate them. The hash is deterministic (same
  browser, same tag, across requests and tabs), differs across browsers, and
  can't be reversed to the cookie without already knowing it (the cookie's
  own 122 bits of entropy make a server-side secret or salt unnecessary for
  this purpose).
- **Every access** (method, path, status, duration), every replacement
  outcome (`replaced`/`spent`/`stale`/`invalid`), every realtime connection
  open/close and forced resnapshot — enough to narrate who arrived, what they
  did, and whether it succeeded, entirely from stdout.
- **A successful replacement's word text** (`from`/`to`), because that text
  is already permanent public state the moment it's accepted (the `changes`
  table's `fromWord`/`toWord`, shown on the page). **A refused word's text is
  never logged** — only a reason category (`empty`, `too-long`, `whitespace`,
  `same-word`, `no-such-position`, from the new `invalidReason()` in
  `src/lib/word.ts`). A refused word never became public state, and there's
  no product reason to keep an informal record of arbitrary rejected strings
  a visitor typed.
- **A broadcast's reach as a count, not a list.** `broadcast()`
  (`src/lib/live.ts`) now returns how many open `/events` connections it
  successfully notified, logged as `streams=N` in the same request. This
  answers the product contract's actual question — did the change reach
  every connected open view — without inventing a per-connection identity
  that doesn't exist today and that nothing else needs.
- **Never logged**: the raw cookie, IP address, user agent, or anything from
  request headers. Nothing reads those today, and there's no stated need to
  start; logging them would add identifying surface for no requirement this
  crit names.
- **Logging never reaches any public response.** It's stdout only, read via
  `flyctl logs`/`docker logs`, never rendered into a page, a stream frame, or
  an API response — README's "no who, no when, no counts on the page" rule is
  untouched (`spec/logging.test.ts` checks this directly).
- **Logging is observation only.** It never changes a response, the
  replacement transaction, or realtime delivery, and a logging failure can't
  fail a request (`logLine` never throws).

## Why per-browser is the right strength here, not just an accepted gap

Clearing cookies, or opening a fresh incognito window, mints a new visitor and
therefore a new eligible change. This isn't a loophole to tolerate; it's the
right strength of enforcement for situated software built for a room of
people, the frame README's own "What I looked at" section already argues
from (Shirky, 2004). A second window buys exactly one more word — and
anyone who still has their change left can replace it next. Both the cost of
the workaround (open a new window) and its gain (one word, immediately
contestable) are small, and "contribution is influence, not ownership" was
already the project's answer to a stranger changing what you left behind.
Enforcing identity any harder — an account, a device fingerprint — would cost
the project real things (friction for a stranger with just a URL, an identity
surface README already rejects above) to close a gap that costs almost
nothing to leave open. Per-browser is therefore the deliberate strength of
this rule, not a limit the project is settling for.

## Consequences

- No new product surface: no accounts, no visible identity, no presence.
- The decision that was previously implicit (scattered across `README.md`'s
  "What good means" and `CLAUDE.md`'s product contract) now has one place
  that explains what counts as a person, what's enforced where, and why — for
  this crit's own requirement, and for later crits or the final submission to
  build on without re-deriving it.
- Narrating the crit from `flyctl logs` shows pseudonymous tags, never names,
  consistent with the per-browser identity this decision names.
- `README.md` doesn't currently say the server keeps any logs at all. Whether
  to add a line about pseudonymous operational logging, and how to word it so
  it doesn't read as contradicting the realtime section's "No event log,
  replay or presence registry" (which is about architecture — no durable,
  replayable event store standing in for SQLite — not about an ops log that's
  never replayed to a client and never a product feature), is left to the
  README's own author.
- If a later redesign changes the one-change-per-visitor rule, a later ADR
  supersedes this one's "What each person may change" section rather than
  editing it in place.
