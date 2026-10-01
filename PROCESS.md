# Process overview

This file is rewritten at each crit. At Crit 8 it records what I chose to build,
the evidence behind it, and the architecture, before any app code exists.

## The harness came first

Before choosing a concept I set up `CLAUDE.md` with process rules only
([`bdeaef5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/bdeaef5)):
plan before building, name which layer a check verifies, never fake evidence,
and add no design rules until the README had argued for some. The product
contract was derived from the README's argument and committed alongside it
([`deb738a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/deb738a)).
It was later split into enforced rules and revisable design
([`59845b9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/59845b9)).

The evidence below is of three kinds, labelled where it lives:

- one real five-person probe;
- one agent-generated simulation;
- generated visual and test artefacts, which say nothing about people.

## Choosing Theseus

**The question.** What could be multi-user, persistent and, by Crit 9,
real-time, while being a pointed answer to the brief rather than the median
one, and small enough to ship reliably?

**How I worked.** Concept rounds with Claude Code against the live brief, rubric
and Crit 8–10 specs. I set each round's constraints (later ones banned
shared-artwork answers), and the agent generated, critiqued and killed
candidates against them. Where a claim could be tested cheaply, we tested it.

**Alternatives seriously considered.**

- _Pass the Pen_: a story written a line at a time, each writer seeing only the
  line before. Reliable, but it's the exquisite corpse, which capped how
  surprising it could be.
- _Loom_: one cloth, a row per visitor, with the rows above constraining the
  next. A reproducible _simulation_ (`docs/exploration/loom/`,
  [`0672722`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/0672722))
  showed the proposed rule mostly made noise. Typically only 2 of 16 squares
  were inherited, and pattern appeared only when simulated weavers designed
  it. Its defining mechanism didn't support its claim.
- _Question Toll_: ask a stranger one question after answering one. Strong
  personal pull, but private and one-to-one, with nothing publicly browsable
  for a crit or a showcase room.

**Why Theseus.** One rule a stranger gets in seconds, on a public object whose
history comes free: replacing a word leaves the old one behind. Crit 8 stays
small, and Crit 9 turns each replacement into something others watch happen.

**A correction before testing.** I'd been treating "people will care about
their word" as the thing to prove. The product shouldn't depend on it. The
position became: one small, irreversible act of influence over a public object,
then loss of control.

## The probe

_Real user evidence_, small and not independent: five people, one of them me,
taking turns on a throwaway prototype (the prototype, raw log and record are
all in `docs/exploration/`). Four changed a word; the fifth hadn't committed
when the log ends. Every change replaced an original word, so overwriting was
never tested. The planned return round, reveal and written questions were not
run.

**Inconclusive under its own rules.** I fixed a "lock" criterion before the
test: a clear majority had to deliberate, by a stated definition. Only P1
qualified, and P1's turn was restarted mid-way, so the log can't separate
deliberation from exploring the interface. The probe doesn't establish that the
rule causes deliberation, and I haven't redefined the criterion after the fact.
A review of the evidence narrowed my first write-up of these claims
([`0672722`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/0672722)).

**What inspecting it prompted.** All four changes in this run were like-for-like
swaps, which kept the sentence grammatical. That says nothing beyond this run.
Replaying the sequence also showed a limit in my design: the words beneath each
position recorded what a slot had held, but not the whole sentence a
contribution sat in. After the fourth change, the first person's "strangers"
would miss a sentence, not a website. So I added stepping back through earlier
whole sentences, compared in mocks that use the probe's real history
([`2961c2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/2961c2c)).
That is design reasoning prompted by the probe's state, not a user-research
finding. I then reconsidered a looser alternative, _Story Bottles_, but it was
collaborative storytelling again, so I kept Theseus.

## The starting sentence

"Make a website that people would miss if it disappeared." Ten replaceable
words, readable without the course, and nearly every position flips the
meaning. The brief's own line was considered, but its hyphens and contraction
make "one word" ambiguous.

## Stack and architecture

**Decision.** The course-taught Week 7 stack: Astro server-rendered pages on
`@astrojs/node`, SQLite through `better-sqlite3` on the Fly volume, Drizzle for
the schema and migrations, and the replacement as one raw-SQL transaction.
Plain HTML forms with Post/Redirect/Get, and no client framework.

**Why.** Its Docker and Fly shape is already proven, so the risk sits in the
product, not the plumbing. Astro escapes text by default, which matters when
every word is a stranger's. `/readme/` renders natively. And the Week 7
server-sent-events pattern gives Crit 9 a path without replacing anything
built now.

**Alternatives.** A plain Node server had a smaller dependency surface, but
escaping, cookies and rendering would be mine to hand-write and get right.
Node's built-in SQLite needs no native build, but isn't yet stable. I chose
known over small.

**The contract before the stack.** I wrote the HTTP checks before any framework
code
([`199ff8c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/199ff8c)),
and they fail against the placeholder by design. Writing them forced the
contract into the open: routes, fields, status codes. Before committing, I had
the checks themselves tested. A review found that the first draft would pass
an app with one version for the whole sentence, where any change anywhere
makes every open form stale. That made per-position versions an explicit
requirement, with a check of its own. A throwaway stub of the contract passes
the final checks, and each deliberately broken rule fails the check written
for it (`docs/exploration/spec-validation/`, in
[`0672722`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/0672722)).

**Testing production differently.** The checks that change the sentence run
only against disposable local and CI databases, which are never user evidence.
Run against the live site, they'd write made-up visitor words into the real
public sentence. So there they skip themselves, and the same behaviour is
verified by hand, as a real visitor, and recorded as observation.

## The trade-off

I accept a minimal interaction, a page that leans on typography and its own
history, a grammar that limits what each person can say, and a small individual
act. In return: one mechanic, a public object that visibly changes, low
implementation risk, and one rule running from the README through `CLAUDE.md`
and `spec/` to the app.
