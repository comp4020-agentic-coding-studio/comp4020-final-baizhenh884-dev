# Theseus probe, 1 October 2026

**Evidence type: real user evidence.** This is one small, informal design probe:
five people on one laptop running a throwaway local prototype of the Theseus
mechanic. One of the five was also the facilitator and the project's maker, so
it isn't independent, and it doesn't support claims about users in general.
Which of P1–P5 was the maker wasn't recorded.

The prototype was a single local HTML file, outside the app, with the rule
"replace one word, once". It started with no history. The starting sentence,
which I wrote, was:

`Make a website that people would miss if it disappeared.`

## Raw evidence

The prototype's event export, verbatim. The clock times are UTC, which is how
the prototype prints them, and the export carries no date. `i` is the word
position, counting from 0.

```text
14:18:18 P1 turn_start {}
14:18:32 P1 select {"i":2,"word":"website"}
14:18:38 P1 select {"i":9,"word":"disappeared"}
14:18:38 P1 select {"i":3,"word":"that"}
14:20:12 P1 select {"i":4,"word":"people"}
14:20:12 P1 open_input {"i":4,"word":"people"}
14:21:01 P1 turn_start {}
14:21:03 P1 select {"i":4,"word":"people"}
14:21:04 P1 open_input {"i":4,"word":"people"}
14:21:08 P1 draft {"value":"strangers"}
14:21:11 P1 commit {"i":4,"old":"people","new":"strangers","overwrote":"original"}
14:21:28 P1 turn_start {}
14:23:35 P2 turn_start {}
14:24:28 P2 select {"i":0,"word":"Make"}
14:24:30 P2 open_input {"i":0,"word":"Make"}
14:24:34 P2 draft {"value":"Keep"}
14:24:37 P2 commit {"i":0,"old":"Make","new":"Keep","overwrote":"original"}
14:24:47 P3 turn_start {}
14:25:38 P3 select {"i":7,"word":"if"}
14:25:38 P3 open_input {"i":7,"word":"if"}
14:25:42 P3 draft {"value":"when"}
14:25:43 P3 commit {"i":7,"old":"if","new":"when","overwrote":"original"}
14:25:54 P4 turn_start {}
14:26:01 P4 select {"i":2,"word":"website"}
14:26:01 P4 open_input {"i":2,"word":"website"}
14:26:05 P4 draft {"value":"sentence"}
14:26:06 P4 commit {"i":2,"old":"website","new":"sentence","overwrote":"original"}
14:26:14 P5 turn_start {}
```

The prototype's own summary, derived from that log. It measures each time from
the participant's first `turn_start`.

| Participant | First word selected | Committed | Words selected | Change |
| ----------- | ------------------- | --------- | -------------- | ------ |
| P1 | 13.9s | 172.5s | website → disappeared → that → people → people | people → strangers |
| P2 | 53.0s | 62.2s | Make | Make → Keep |
| P3 | 50.5s | 56.0s | if | if → when |
| P4 | 6.7s | 12.3s | website | website → sentence |
| P5 | — | — | — | none |

P1 has three `turn_start` events. The 172.5s in the summary is measured from
the first. In that first stretch P1 selected four different words (two in the
same second), and opened the input for "people". No replacement was submitted
there: the prototype logs a draft only when Enter is pressed, and there's
none.
After the second `turn_start`, P1 selected "people", typed "strangers" and
committed within 10 seconds. The third `turn_start` came after P1's commit.
The log alone doesn't say why the turn was restarted, and no reason is assumed
here.

## Direct facts

- Five participant slots were used, and four participants committed a change.
- P5 had not committed when the exported log ends.
- All four changes replaced an original word. No participant replaced another
  participant's word, so reactions to being overwritten were not tested.

The whole sentence at each step, replayed from the log's positions. At every
commit, the `old` word matched the word at that position at the time:

0. `Make a website that people would miss if it disappeared.` (start)
1. `Make a website that strangers would miss if it disappeared.` (P1)
2. `Keep a website that strangers would miss if it disappeared.` (P2)
3. `Keep a website that strangers would miss when it disappeared.` (P3)
4. `Keep a sentence that strangers would miss when it disappeared.` (P4)

## What did not happen

The probe plan had three more steps after the turns, and none of them was run:

- **a return round,** in which each participant would see what had become of
  their word;
- **a group reveal** of the final sentence and its history;
- **six written questions.**

The log contains no `return_view` or `reveal` events, and there are no answers
or observation notes. So nothing here tests how people respond to seeing what
became of their word, or to any form of history.

## Against the criteria set before the probe

The probe plan defined "deliberation" in advance: at least one of selecting
more than one word, entering more than one replacement, pressing "Not yet",
leaving a word unchanged, saying alternatives aloud, or taking 20 seconds or
more between the first selection and committing. It set "lock the concept" as
requiring, among other things, that a clear majority deliberated.

Under that fixed definition only P1 counts, by selecting four different words.
But those selections came in a turn that was later restarted, so the log can't
say whether they were deliberation, exploring the interface, an interruption,
or something else. P2, P3 and P4 each selected one word and committed within
about 10 seconds of selecting it. **So this run did not meet the pre-set lock
criterion.** It is recorded as inconclusive.

**A weakness in the criterion.** It counted long hesitation after selecting a
word, but not before. P2 and P3 each spent about 50 seconds before selecting
anything. That can't honestly be counted as deliberation under the rule this
run used, and the result above stands. It is a note on the method for the next
probe, not a reason to change this one.

## Interpretation

These are readings of the record above, not further observations.

- **This probe doesn't establish that the one-change rule causes
  deliberation.** P1 is the only participant who meets the pre-set definition,
  and P1's selections can't be told apart from exploring the interface.
- **All four successful replacements were like-for-like.** In this small run,
  each was a grammatical substitution (noun for noun, verb for verb,
  conjunction for conjunction), and the sentence stayed grammatical. This run
  can't say whether that generalises: the participants weren't strangers, and
  the prototype accepted only a single word of letters, apostrophes and
  hyphens.
- **One change made the sentence refer to itself** (website → sentence). One
  word isn't a trend.
- **A design limitation, found by inspecting the real sequence.** The
  per-position history could show which words had occupied a slot, but not
  rebuild the complete sentence a contribution appeared in. After P4, P1's
  "strangers" would miss a sentence, not a website. The hybrid history that
  followed, adding earlier whole sentences, is design reasoning prompted by
  inspecting the probe's state. It is not a user-research finding: no
  participant was shown any history or asked about it.

## Not established

- Why P5 did not commit.
- That the one-change rule causes deliberation.
- How anyone reacts when overwritten, or when they see what became of their
  word.
- Whether visitors need, or use, whole-sentence history.
- That people generally care about their word, or that most people deliberate.
- What happens after much deeper history.
- Whether coherence would survive more participants.
