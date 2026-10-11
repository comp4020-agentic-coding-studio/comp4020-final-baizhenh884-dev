# Process overview

This file is rewritten at each crit; the `crit-8` tag keeps the Crit 8
version. At Crit 9 it covers the project as it stands, and what is still
unverified.

## How I worked with the agent

I set the product and its rules; Claude Code planned, implemented and checked
within them. Every plan was read-only until I approved it, each behaviour was
specified as a failing check before the code that passes it, and any change to
`CLAUDE.md`, `README.md` or `spec/` was shown to me first. I treated "it works"
and "it looks good" as claims to be shown; the corrections that mattered most
came from running the page, not green suites.

## What Theseus is

One shared sentence, rewritten one word at a time, one change per visitor,
ever. The harness came first
([`bdeaef5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/bdeaef5)).
Theseus beat _Pass the Pen_ and _Loom_, whose rule a simulation showed mostly
made noise. A five-person probe, me included, was inconclusive about
deliberation, but showed that words kept beneath a position can't rebuild the
whole sentence, so earlier forms exist. It later became one object in two
forms: the sentence, and a house of ten parts.

## Stack

The course's Week 7 stack: Astro on `@astrojs/node`, SQLite on the Fly volume,
plain forms and Post/Redirect/Get. A replacement is one transaction with
per-position versions and a log unique per visitor. For realtime I chose
server-sent events: writes are already POSTs, `CLAUDE.md` rules out WebSockets,
and polling would cost reads without adding truth. The house adds one client
library, `three`, which only draws.

## Only the present is live

**Only the present is live; the past stays frozen**
([decision 0001](docs/decisions/0001-live-present-frozen-past.md),
[`9090740`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/9090740)).
I wanted the sentence itself to show that others are acting. Presence counts
would add social metadata, and a feed would turn the history into another
product. A reconnecting page re-reads current SQLite; nothing is replayed.

The hard case is a remote change to the word you are editing. Overwriting your
draft loses your work; rebasing it lets you submit against a version you never
saw. So the draft and its expected version stay, the page names the new
word, and a submit then fails as stale. Reviewing the plan, I caught that
applying it on blur would defeat this, because clicking submit blurs
first and would let a stale draft past the 409.

Each layer was specified red, then built green
([`e4bc25d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/e4bc25d),
[`a0a58c8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/a0a58c8)).
With everything green, the agent raised a case its checks hadn't covered: one
visitor, two tabs. A real browser run showed the second tab never gained "Your
trace", because change events carry no trace by design. The agent stopped rather
than weaken that contract; I chose a per-connection refresh
([`6896612`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/6896612)).

## One sentence, one house

The prototypes lived outside this repo, so it holds their result, not the
search: ten fixed territories, one per position. A word's position decides where
it acts, and its written form (length, vowels, letter shapes) its character,
never its meaning. I froze that grammar as a fixture before any code
([`9fc4b69`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/9fc4b69)),
with a continuous length rule, because the four-step one saturated at seven
letters and made long words look alike. The house is never stored; an earlier
form's house is built from that sentence alone.

The geometry spec checks 500 seeded sentences and extremes
([`8d51ad9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/8d51ad9)),
but it can't judge architecture, so I judged renders. Masses read as fins,
pegs and fence panels, and six refinements changed geometry without touching
the grammar
([`4df7bea...6090b8b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/compare/4df7bea...6090b8b)).
A review caught a view keeping its own group list that could drift from the
body's; `LiveBody` now owns it
([`ae5c6f1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/ae5c6f1)).
Then I froze the grammar and geometry.

## Making word and house one thing

The question was how to make sentence and house feel causally linked without a
diagram or a game. I compared three treatments behind a query switch. The one
that explained fastest competed with the sentence, so the sentence stayed the
protagonist and the idea moved under the house. My decisive correction:
pointing alone must not draw the long line. Hover marks a word and its part by
paired emphasis; the thin line appears only for a word at work, and turns red
only while that part is rebuilt; a phone has none
([`198f337`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/198f337)).
The prototype screenshots weren't kept. The README now opens with the same idea
in prose
([`0228bb8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/0228bb8)).

## When a difference is too faint to see

Replacing _people_ with _garden_ at the entry rebuilt that part, but the settled
house looked almost the same. I asked for settled before and after evidence,
never the exchange animation: the real house rendered at page size, compared for
37 words at every territory. The entry was the one territory where faint results
were systematic, because openness only set a recess hidden behind the threshold.
Making openness raise the opening first looked like an improvement. A stricter
comparison, holding the threshold still, showed that much of the gain was the
neighbouring threshold moving, as it already does to clear the entry, not the
entry becoming more visible; without it the entry was still too subtle. I
rejected the experiment. The weakness is known and unsolved; the scratch
measurements aren't repository evidence and weren't kept.

That comparison exposed an older bug: a live change could settle on a different
house than a reload. `LiveBody` kept a neighbour when its bounding box and mesh
count matched, but a solid can move inside the same outline, so a change at the
entry could leave the hall stale. The regression specs ran the real show,
change and settle path first; they fail with the old signature and pass once it
covers every solid's vertices
([`e2413ad`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/e2413ad)).
Hand checks also found what green suites missed: a focused field was invisible
without `field-sizing`
([`5a71bf5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/5a71bf5)).

## Evidence, and what isn't verified

On the final tree, locally, with a throwaway database, `pnpm check` passes 71
of 71 and typecheck is clean. I also checked the page in local
headless Chrome with staged words: test data, not visitors' changes. The
motion spec was written after its code and pins it
([`72e865d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/72e865d)).
Nothing from Crit 9 or the house is pushed or deployed, so Fly's handling of
long-lived connections, propagation between real sessions and the house on real
devices are unverified, and I have no participant evidence.

## The trade-off

I accept a little client script, a machine kept awake while a tab is open, and
drafts that wait on their visitor. In return the sentence is live without
becoming a feed, and SQLite stays the only truth.
