# 0006 — The log: a record of planks, not a feed of people

**Status:** Proposed (2026-10-31)
**Decision for:** Final Project, after the harbour and the shipwrights
**Partially supersedes:** [0001](0001-live-present-frozen-past.md), its
rejection of option C (a live change feed), for the reasons below. The rest of
0001 stands: the frozen past, SQLite as the only truth, and no presence beyond
the anonymous shipwrights of [0005](0005-the-ship.md). Decisions 0002–0005 are
otherwise unchanged.

## Context

The page keeps every earlier whole sentence one step away (`?at=N`) and every
finished ship of old planks one at a time (`?kept=k`). What it never shows is
the record of the planks themselves: which word replaced which, in order. The
kept ship shows where replaced words went; it doesn't show what each one was
replaced *by*, or the run of replacements that made the sentence what it is.

On 31 October the maker looked at the live site as a visitor and asked for a
third section below the harbour: the log, every replacement, newest first, one
line each.

Decision 0001 rejected option C, "show incoming changes as they happen, as a
stream or log beside the sentence", because a recency-ordered stream "would
also make what happened recently, and implicitly who and when, more prominent
than the shared sentence". That reason is about people and time. A record of
planks with neither isn't what 0001 turned down.

## Options considered

1. **No log (keep 0001 as it is).** History stays one step at a time under
   Earlier form and Earlier ship.
   - For: no change to the contract; the sentence stays the only thing on the
     page about what happened.
   - Against: the replacements themselves (old word → new word) are never seen
     together, so the ship's story, every plank swapped for another, has to be
     pieced together one form at a time.
2. **A log with times** ("07 · Sail  whether → wonder  2 min ago"), as first
   asked.
   - For: it reads as alive; recent activity is visible.
   - Against: it shows when others acted, which the contract forbids for public
     views, and it is the recency stream 0001 rejected. Rejected by the maker,
     31 October.
3. **A record of planks, no times, no names (chosen).**

## Decision

**The log is the ship's record, not a feed of people.**

- Below "Your plank" on `GET /`: every successful replacement, newest first,
  one line each: the place and its part, the old word and the new one
  ("07 · Sail  whether → wonder").
- **Nothing that says when or who.** No times, no relative ages, no names, no
  visitor marks (not even the visitor's own), no counts or totals, no
  numbering of the lines beyond the 01–10 place, which names a position.
- **Finished ships stay one at a time** under Earlier ship, as the contract
  says; the log never lists ships.
- **Live** over the existing stream: each change event adds its line at the
  top, for every open `GET /`; a load, a snapshot or a reconnect shows the
  record as it stands, from SQLite. The change event is unchanged: it already
  carries the position and the new word, and the old word is the one the page
  showed there. The snapshot carries the record (`log`: the latest lines, as
  place, old word and new, the blocklist applied on the server), so a page
  that reconnects after missing changes catches up without a reload, as the
  sentence does (amended 31 October, before it was built: the decision first
  said nothing new on the wire, which left a reconnect unable to catch up).
- **The latest 50 lines.** The whole history stays in SQLite and stays
  reachable one form at a time under Earlier form.
- **The maker's blocklist applies to the log.** A line whose old or new word is
  on `BLOCKED_WORDS` (the same NFKC, case-folded, whole-word match as decision
  0004) isn't shown. Nothing is added to the list, and a visitor's rules don't
  change: the blocklist still only refuses a replacement as invalid. A word
  that was allowed when it was made, and blocked later, leaves the log then.
- Derived from `changes`, nothing stored: no new table or field.
- Historical views (`?at=N`, `?kept=k`) have no log, as they have no realtime.
- Accessible as text: a list read in order, each line as its place, part, old
  word and new word. New lines arriving live are not announced separately: the
  existing polite announcement of others' changes already says what changed.

## Why this isn't the feed 0001 rejected

0001's objection was that a stream makes "what happened recently, and
implicitly who and when, more prominent than the shared sentence". The log
shows order, but not time: a line from a minute ago and one from a week ago
look the same. It shows no one: not who made a change, not even that the same
person made two. It is the planks' record, the history the kept ship already
derives, read as a list. The sentence stays the protagonist: the log sits
below the harbour and the kept ship, third of three sections.

## What it costs

- The README's "keeps its past without becoming a feed" and "no feed" claims
  have to be rewritten by the maker to say what the log is and isn't.
- The contract lines on realtime scope and on "no activity or change feed"
  change to name the log as the one exception (CLAUDE.md, shown with this).
- A word the blocklist misses now shows in one more place, and stays visible
  in the log (until it's among the oldest 50 replaced) after it has left the
  sentence. The maker's recovery path is the same: add it to `BLOCKED_WORDS`.

## Status of evidence

The maker's own look at the live site, 31 October. No visitor has used the log
yet; whether it helps people read the ship's story needs the informal try.
