# Process overview

This file is rewritten at each crit. At Crit 8 so far it records what to build
and why. The stack and the agent workflow get their own sections when those
decisions are made; neither has been made yet.

## The harness came first

Before choosing a concept I set up `CLAUDE.md` with process rules only
([`bdeaef5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/bdeaef5)):
plan before building, name which layer a check verifies, never fake evidence,
and add no design rules until the README had argued for some. The product
contract now in `CLAUDE.md` comes from the README.

## Three kinds of evidence

This account uses three kinds of evidence, and keeps them apart:

- **Real user evidence:** one five-person probe, with its raw event log, in
  [`docs/exploration/theseus-probe-2026-10-01.md`](docs/exploration/theseus-probe-2026-10-01.md).
- **Agent-generated simulation:** the Loom simulation (throwaway, outside the
  repo), which tested a rule, not people.
- **Generated visual exploration:** static layout mocks rendered in a browser.
  The two history comparison sheets in `docs/exploration/` are exactly that,
  not user evidence. Each panel is labelled as real probe history or synthetic
  stress-test content.

## Decision: build Theseus

**The question.** What could be multi-user, persistent and, by Crit 9,
real-time, while being a pointed answer to the brief rather than the median
one, and small enough to ship reliably?

**How I worked on it.** Concept rounds with Claude Code against the live
brief, rubric and Crit 8–10 specs. I set each round's constraints (later ones
banned shared-artwork answers), and the agent generated, critiqued and killed
candidates against them. Cheap tests replaced argument where they could.

**Alternatives seriously considered.**

- _Pass the Pen_: a story written a line at a time, each writer seeing only the
  line before. Reliable, but it's the exquisite corpse. The idea wasn't mine,
  which capped how surprising the response could be.
- _Loom_: one cloth, a row per visitor, with the rows above constraining the
  next through a float limit borrowed from weaving, in the hope that richness
  would come from the rule. _Simulation_ (16 threads, 100 rows, three rule
  variants, four simulated behaviours) said otherwise. Random weavers made a
  cloth that compressed like noise, typically only 2 of 16 squares were
  inherited, and patterns needed deliberate design. Each row's colour
  dominated, so it read as "everyone adds a stripe". Its defining mechanism
  didn't support its claim, so I dropped it.
- _Question Toll_: ask a stranger one question after answering one. Strong
  personal pull, but every exchange is private and one-to-one, with nothing
  publicly browsable for a crit or a showcase room.

**Why Theseus.** One rule a stranger gets in seconds. The whole object is
public. Its history comes free with the mechanic, because replacing a word
leaves the old one behind. Crit 8 is tiny. And Crit 9 turns each replacement
into something other people watch happen.

**What the first mocks showed.** _Visual exploration_ with labelled fake
history: the "palimpsest", with a few replaced words beneath each position,
held up at desktop and phone widths after one revision. That shows a layout can
look intentional, not that anyone will care.

**A correction before testing.** I'd been treating "people will care about
their word" as the thing to prove, but the product shouldn't depend on it. The
position is one small, irreversible act of influence over a public object, then
loss of control. Attachment is something to watch, not a success condition.

## The probe, and what it changed

_Real user evidence_, small: five people, one of them me, taking turns on a
throwaway local prototype. Four changed a word; the fifth hadn't committed when
the log ends, for reasons not recorded. Every change replaced an original word,
so overwriting remains untested. "Make a website that people would miss if it
disappeared." became "Keep a sentence that strangers would miss when it
disappeared."

**Inconclusive under its own rules.** I fixed a "lock" criterion before the
test: a clear majority had to deliberate, by a stated definition. Only one of
five did. Two others waited about 50 seconds before selecting anything, but the
definition only counted time after selecting, so they don't count, and I
haven't redefined it after the fact. That's a flaw in the method to fix next
time, not a reason to change this result.

**What it exposed.** Two things I hadn't focused on:

- Grammar channels every change: all four were like-for-like swaps. That kept
  the sentence coherent, and it also caps what anyone can say. I'm keeping it
  as the concept's deliberate cost.
- Each change altered what the other words meant. After the fourth change, the
  first person's "strangers" would miss a sentence, not a website. The
  per-position history showed what each slot had held, but not what the whole
  sentence said at each step. For "influence, not ownership", that matters:
  you can only see what your word did if you can read the sentence it was in.

**What changed: the history model.** I mocked three options on the probe's real
history, plus a labelled synthetic stress test. Time-aligned columns couldn't
wrap and overflowed at every width. Stacked earlier sentences read clearly with
four changes but became a changelog of near-identical lines with many. The
hybrid is now the design: the palimpsest by default, plus stepping back through
earlier whole sentences, one at a time and read-only (README claim 4, and the
`CLAUDE.md` contract).

**Reconsidered after the probe.** _Story Bottles_, stories drifting between
strangers a sentence at a time, would loosen the grammar limit. But it's
collaborative storytelling again, with private hand-offs, free-text moderation
and a larger Crit 8. I kept Theseus.

## The starting sentence

"Make a website that people would miss if it disappeared." Ten replaceable
words, readable without knowing the course, and nearly every position flips
the meaning. It asks the brief's question, what makes a website worth having,
without the jargon. The brief's own line ("Make a multi-user, real-time
website that's good") was considered, but its hyphens and contraction make
"one word" ambiguous.

## The trade-off

I accept a minimal interaction, a page that leans on typography and its own
history, a grammar that limits what each person can say, and a small individual
act. In return: one mechanic, a public object that visibly changes, low
implementation risk, and one rule running from README through `CLAUDE.md` and
`spec/` to the app.
