# Process overview

This file is rewritten at each crit; the `crit-8` tag keeps the Crit 8
version. At Crit 9 it covers the project as it stands: what Theseus is, the
stack, how the realtime layer was decided, specified and corrected, and what is
still unverified.

## How I worked with the agent

I set the product and its rules; Claude Code planned, implemented and verified
within them. Every plan was read-only until I approved it, and I revised the
Crit 9 plan three times before any code existed. Each behaviour was specified
as a failing check before the code that passes it, and any change to
`CLAUDE.md`, `README.md` or `spec/` was shown to me first. No automated check
writes to the live sentence.

## What Theseus is

One shared sentence, rewritten one word at a time, one change per visitor,
ever. The harness came first
([`bdeaef5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/bdeaef5)).
Theseus beat _Pass the Pen_ (the exquisite corpse) and _Loom_, whose rule a
simulation showed mostly made noise. A five-person probe, with me as one of the
five, was inconclusive about deliberation. It did show that words kept beneath
each position can't rebuild the whole sentence, so earlier forms exist.

## Stack

This is the course's Week 7 stack: Astro server rendering on `@astrojs/node`,
SQLite through `better-sqlite3` on the Fly volume, plain forms and
Post/Redirect/Get. A replacement is one SQLite transaction, with per-position
versions and an append-only log that is unique per visitor
([`0a3b7ec`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/0a3b7ec),
[`4a8bc97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/4a8bc97)).
For realtime I chose server-sent events. Writes are already POSTs, so only the
server needs to talk back. `CLAUDE.md` rules out WebSockets, and polling would
cost reads without adding truth. The agent first confirmed in the adapter's
source that it streams responses.

## Deciding what goes live

**Only the present is live; the past stays frozen**
([decision 0001](docs/decisions/0001-live-present-frozen-past.md),
[`9090740`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/9090740)).
I wanted the sentence itself to carry the sense that others are acting.
Presence or online counts would add social metadata Theseus has avoided. A
feed would turn its kept history into a different product. Frozen earlier forms
keep each one's meaning stable. The harness and scope were updated first
([`a8a032b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/a8a032b)).

## Corrections before any code

Reviewing the plan, I caught four flaws that would have shipped:

- **Version rule.** A draft applied equal versions. The rule became: apply
  only if the incoming version is greater than the one shown. Equal is a
  duplicate, lower is stale, and neither moves the page or the Earlier link.
- **Blur.** The plan applied a held-back change when a draft's input lost
  focus. But clicking submit blurs first, which would quietly advance the
  expected version and let a stale draft past the 409. Now blur does nothing:
  the draft keeps its version, a notice names the new word, and the change
  applies only once the visitor clears the draft.
- **Connection race.** Reading the snapshot and then subscribing could miss a
  change in between. The stream now subscribes first, then reads SQLite and
  sends the snapshot with no yield, so a change shows up at least once. That
  argument holds for this single, synchronous process, not across machines.
- **The race test.** It first demanded exactly-once delivery, which the design
  doesn't promise. It now checks that a change is never missing from both the
  snapshot and the stream, and that replaying it never goes backwards and ends
  at SQLite's version.

I also had the Earlier link stay live: it means the sentence just before now.

## Spec first, in order

Transport: specified red
([`e4bc25d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/e4bc25d)),
then green
([`4ed247a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/4ed247a)).
Page reconciliation: specified red against a stub
([`03d2a31`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/03d2a31)),
then green
([`a0a58c8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/a0a58c8)).
Writing that spec surfaced two boundaries that weren't in my plan. The
screen-reader summary is part of the page's truth, so it stays live. And the
first change has to create the Earlier link, which points to `?at=0`.

Before trusting any result I checked it meant what it claimed. The test's own
stream reader first failed typechecking. One false pass came from a check
that matched a hidden past-words strip left behind by earlier runs. In one test
I read the opening frame before it had arrived. Each was fixed before the
evidence counted.

## The correction that mattered most

With every suite green, the agent flagged a case its browser checks hadn't
covered: one visitor with two tabs. Tab A loads before the visitor has a trace,
and they make their change in tab B. Would tab A ever gain "Your trace"?

The first diagnosis was the page: it could update a trace but not create one.
I had that specified red
([`62d8bba`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/62d8bba))
and the page fix written. A real headless-Chrome run of the two tabs still
failed: tab A's sentence updated, but its trace never appeared. The cause was
the transport: change events carry no trace by design, and a snapshot came
only on connect. The agent stopped rather than
weaken the contract. I chose a per-connection refresh, specified it red
([`6ac3ae8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/6ac3ae8)),
and it went green
([`6896612`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/6896612)).
Each connection now re-reads only its own visitor's trace after a change, and
sends a fresh `{ positions, trace }` snapshot only if that trace changed. There
is no visitor registry or replay. At that commit the page RED was still
waiting, deliberately, so the full suite stayed red until the page fix landed
([`ae6421c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/ae6421c)).
Then the two-tab run passed with no reload. Green tests had not proved what a
visitor would see.

## Evidence, and what isn't verified

Locally, on a disposable database: the page spec passes 16/16, the transport
8/8, Crit 8's 15/15, and the full check 39/39. In local headless Chrome, two
sessions showed:

- live replacements, and the visitor's trace turning replaced;
- a draft surviving a change, with a stale submit still getting 409, and
  clearing it applying the newest word;
- the Earlier link and the screen-reader summary staying true;
- reconnect catching up, and a history tab staying frozen;
- keyboard use, and no horizontal scroll at 390×844.

Screenshots showed the notice clipped by the focus outline, and a margin fixed
it. A slight focus-outline overlap left over from Crit 8 stays out of scope.
The README followed only after the behaviour was verified
([`2ac0dec`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/2ac0dec)).

None of Crit 9 is pushed or deployed. How Fly's proxy treats long-lived
connections, and propagation between real sessions in production, are
unverified.

## The trade-off

I accept a little client script, a machine kept awake while a tab is open, and
drafts that wait on their visitor. In return the sentence is live without
becoming a feed, and SQLite stays the only truth.
