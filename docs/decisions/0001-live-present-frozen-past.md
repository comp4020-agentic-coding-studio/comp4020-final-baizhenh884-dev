# 0001 — Live present, frozen past

**Status:** Accepted
**Decision for:** Crit 9 "All at once"

## Context

Crit 9 makes Theseus real-time: a successful change has to appear in every
other open session within about a second, without a reload. The crit also
asks for one explicit decision about how the app behaves when several people
use it at once.

Theseus already says what good means (`README.md`). There is one shared
sentence. Contribution is influence, not ownership: no word is protected. The
sentence "keeps its past without becoming a feed": replaced words stay
beneath their position and earlier whole forms can be stepped through, but
there are "no names, no times for others' changes, no counts or scores on the
page, no activity stream".

So real-time raises a product question, not only a transport one: once
several people have the sentence open, what should become live?

## Options considered

### A. Live current sentence, frozen history, no presence or feed (chosen)

Only the current shared state goes live. On the current page (`GET /`):

- the sentence updates when someone else's replacement succeeds;
- the visitor's own trace stays true (if their word is replaced while they
  watch, the trace says so);
- the Earlier link keeps meaning the immediately previous whole sentence;
- a draft the visitor hasn't submitted is not silently rebased if someone
  changes that position: they see that it changed, and their draft and the
  version it was based on stay as they were.

Historical `?at=N` views stay exactly as they are.

What it gives: the shared artefact itself becomes the sign that other people
are acting. Current truth stays current, each earlier form keeps a stable
meaning, and the existing idea is extended without a separate social layer.

### B. Visible co-presence

Show that other people are here, as a count, a list or ambient markers.

What it would give: simultaneity becomes legible, and the sentence feels
inhabited even when nobody is changing it, which suits a crit where a pod
opens the app at once.

Why not for Theseus: it needs new definitions the project has so far avoided:
who or what counts as present (a cookie, a tab, a device), when presence
expires, and what each viewer learns about the others, which touches identity
and privacy. It also moves attention from the sentence to the size of its
audience. Some presence designs could be built without breaking any single
README line, but none follow the existing definition of good closely enough to
justify the extra surface.

### C. Live activity or change feed

Show incoming changes as they happen, as a stream or log beside the sentence.

What it would give: activity and the order of changes become very visible, and
newcomers can see the sentence is in use.

Why not: it turns the sentence's history into a recency-ordered stream, which
directly conflicts with the README's choice to keep the past without becoming
a feed. It would also make what happened recently, and implicitly who and
when, more prominent than the shared sentence.

## Decision

Build A.

- Only the current shared state goes live; historical `?at=N` views remain
  immutable snapshots.
- Realtime adds no presence indicator, online count, identity surface,
  activity feed, chat, rooms or scores.
- SQLite remains the source of truth; server memory never holds authoritative
  sentence state.
- The existing stale and concurrency rules (per-position versions, one change
  per visitor) remain the only conflict resolution. Realtime does not add a
  second one.

The transport (Server-Sent Events, recorded in `CLAUDE.md` under Stack) is an
architecture choice for carrying out this decision, not part of it.

## Consequences

- Theseus gets its first deliberate client-side behaviour: until now the
  pages needed no script at all.
- An open current page has to reconcile remote changes while preserving any
  local draft, without ever making a stale draft look current.
- After a dropped connection, the page has to catch up to current SQLite
  truth on its own, without a manual reload.
- Realtime presentation must not weaken the stale-version, one-change or
  output-safety guarantees the server already enforces. A visitor's word
  arriving live is untrusted text exactly as it is in server-rendered HTML.
- An open realtime connection may keep the Fly machine running while any tab
  is open, instead of letting it stop between requests.
- Verification grows: two simultaneous sessions, reconnect, mobile, keyboard
  and slow-connection use all need checking, and some of that only a person
  in a browser can judge.
- Rejecting presence and a feed keeps the scope small and the sentence
  central, and deliberately gives up the extra awareness of other people
  those designs could provide.

This records the decision before implementation. Nothing here has been built
or verified yet.
