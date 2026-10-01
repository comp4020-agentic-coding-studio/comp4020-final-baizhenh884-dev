# Process overview

This file is rewritten at each crit. At Crit 8 it covers what I chose to build,
the evidence behind it, the stack, and how the first slice was built, deployed
and corrected.

## How the agent was used

I set the product and its decision boundaries. Claude Code inspected, proposed,
implemented and verified within them. Any change to the contract or evidence
(`CLAUDE.md`, `README.md`, `PROCESS.md`, `spec/`) stopped for my approval and
went in its own commit. A failing check or a weak piece of evidence was
reported, not hidden: the agent stopped when a test was wrong rather than
bending the app to pass it. And production visitor activity is never
fabricated: no automated check writes to the live sentence. When one of my
instructions conflicted with the harness, the agent named the rule and waited.
For example, I'd asked for one commit, but `CLAUDE.md` requires harness
changes to be committed alone, so the contract landed separately from the
README.

## The harness came first

Before choosing a concept I set up `CLAUDE.md` with process rules only
([`bdeaef5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/bdeaef5)).
The product contract was derived from the README's argument
([`deb738a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/deb738a)),
then split into enforced rules and revisable design
([`59845b9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/59845b9)).
The evidence below is of three kinds, labelled where it lives: real user
evidence, agent simulation, and generated visual or test artefacts, which say
nothing about people.

## Choosing Theseus

Concept rounds with Claude Code ran against the live brief, rubric and Crit
8–10 specs. I set each round's constraints, and the agent generated and killed
candidates. The serious alternatives:

- _Pass the Pen_, a line-by-line story, was reliable but is the exquisite
  corpse.
- _Loom_ was a cloth whose rows constrain the next. A reproducible
  _simulation_ (`docs/exploration/loom/`, in
  [`0672722`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/0672722))
  showed the rule mostly made noise. Typically only 2 of a row's 16 squares
  were inherited, and pattern appeared only by deliberate design.
- _Question Toll_ (answer a stranger's question to ask one) was private, with
  nothing publicly browsable.

Theseus won on one rule a stranger gets in seconds, on a public object whose
history comes free. Before testing, I corrected my own framing: the product
shouldn't depend on people caring about their word. The position became one
small, irreversible act of influence, then loss of control. The starting
sentence is mine; the brief's own line was rejected because its hyphens make
"one word" ambiguous.

## The probe

_Real user evidence_, small and not independent: five people, one of them me,
on a throwaway prototype (the prototype, raw log and record are in
`docs/exploration/`). Four changed an original word, so overwriting was never
tested. The planned return round, reveal and questions were not run. Under the
lock criterion I fixed beforehand it was **inconclusive**. Only one participant
qualified, after a restarted turn, so it doesn't establish that the rule causes
deliberation, and I haven't redefined the criterion. Replaying its state showed
that the words beneath each position couldn't recover the whole sentence a
contribution sat in. Stepping back through earlier whole sentences
([`2961c2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/2961c2c))
is design reasoning prompted by that, not a research finding. A review
narrowed my first write-up
([`0672722`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/0672722)).
I briefly reconsidered a storytelling alternative (_Story Bottles_), and kept
Theseus.

## Stack and architecture

The course-taught Week 7 stack: Astro server rendering on `@astrojs/node`,
SQLite through `better-sqlite3` on the Fly volume, Drizzle migrations, plain
forms with Post/Redirect/Get, and no client framework. Its Fly shape is
proven, Astro escapes text by default (every word is a stranger's), `/readme/`
renders natively, and its server-sent-events pattern gives Crit 9 a path. A
plain Node server had fewer dependencies but would leave escaping, cookies and
rendering to me, so I chose known over small.

## Building it, spec first

The HTTP checks came before any framework code
([`199ff8c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/199ff8c)).
I had the checks themselves tested first. A review found that the draft would
pass an app with one version for the whole sentence, so per-position staleness
got its own check. A throwaway stub passes them, and each deliberately broken
rule fails its check (`docs/exploration/spec-validation/`).

When Astro's compressed HTML made two checks fail although the page was right,
the test was at fault, so the test was fixed, not production output
([`ff6e710`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/ff6e710)).

The persistence foundation
([`0a3b7ec`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/0a3b7ec))
stores the database at `/data/theseus.db`, refusing to start without the
volume. It holds per-position versions and an append-only change log, unique
per visitor. On a throwaway named volume, the seed ran once and a changed word
survived two restarts. The replacement itself is one atomic transaction
([`4a8bc97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/4a8bc97)).
Refusals write nothing, in a fixed order (already spent, then stale, then
invalid), so a visitor who has used their change is never invited to retry.
The returning visitor's trace was specified
([`8da19f6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/8da19f6))
before it was built
([`57a9bd8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/57a9bd8)).
The spec tells "still stands" from "replaced" by semantic markup (`<del>`),
not by matching wording. Building it also exposed that my earlier forms sat
inside a `<p>`, which the HTML parser splits apart.

Verification has four layers, named in `CLAUDE.md`:

1. typecheck;
2. the real image on a disposable database, where all 15 checks run;
3. production, read-only, where 4 pass and the checks that change the
   sentence skip themselves;
4. a person using the live site.

## First real use

After deploying, I made the first real production contribution, Make → Keep;
the agent didn't make it. It exposed a defect: focusing a word opened a wide
field beside it and broke the sentence apart. The fix edits each word in its
own place
([`0d61ca7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/0d61ca7)).
After redeploying to the same machine and volume, and then one machine
restart, read-only checks showed the same single change intact in
`/data/theseus.db`, with its history still reconstructing. The record, which
separates my use from the agent's read-only checks, is
`docs/exploration/production-2026-10-01.md`.

Drafting this file exposed a gap: the README promised stepping back through
earlier forms, but an earlier form only linked back to now. Stepping one form
at a time was specified
([`b3d7f6a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/b3d7f6a))
and then built
([`962759b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/962759b)).
It passed on the local image, was deployed to the same machine and volume,
and was verified on the live site with reads only, with the single change
intact.

## The trade-off

I accept a minimal interaction, a grammar that limits what each person can
say, and a small individual act. In return: one mechanic, a public object that
visibly changes, low implementation risk, and one rule running from the README
through `CLAUDE.md` and `spec/` to the app.
