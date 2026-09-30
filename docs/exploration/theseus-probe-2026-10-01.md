# Theseus probe, 1 October 2026

**Evidence type: real user evidence.** This is one small, informal design probe:
five people on one laptop running a throwaway local prototype of the Theseus
mechanic. One of the five was also the facilitator and the project's maker, so
it isn't independent, and it doesn't support claims about users in general.

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

P1 has three `turn_start` events. The commit came 10 seconds after the second
one. The log alone doesn't say why the turn was restarted, and no reason is
assumed here.

## Direct facts

- Five participant slots were used, and four participants committed a change.
- P5 had not committed when the exported log ends.
- All four changes replaced an original word. No participant replaced another
  participant's word, so reactions to being overwritten were not tested.
- No questionnaire answers or observation notes were recorded with this run.

The whole sentence at each step, replayed from the log's positions. At every
commit, the `old` word matched the word at that position at the time:

0. `Make a website that people would miss if it disappeared.` (start)
1. `Make a website that strangers would miss if it disappeared.` (P1)
2. `Keep a website that strangers would miss if it disappeared.` (P2)
3. `Keep a website that strangers would miss when it disappeared.` (P3)
4. `Keep a sentence that strangers would miss when it disappeared.` (P4)

## Against the criteria set before the probe

The probe plan defined "deliberation" in advance: at least one of selecting
more than one word, entering more than one replacement, pressing "Not yet",
leaving a word unchanged, saying alternatives aloud, or taking 20 seconds or
more between the first selection and committing. It set "lock the concept" as
requiring, among other things, that a clear majority deliberated.

Under that fixed definition only P1 deliberated, by selecting four different
words. P2, P3 and P4 each selected one word and committed within about 10
seconds of selecting it. **So this run did not meet the pre-set lock
criterion.** It is recorded as inconclusive.

**A weakness in the criterion.** It counted long hesitation after selecting a
word, but not before. P2 and P3 each spent about 50 seconds before selecting
anything. That can't honestly be counted as deliberation under the rule this
run used, and the result above stands. It is a note on the method for the next
probe, not a reason to change this one.

## Interpretation

These are readings of the record above, not further observations.

- The one-change rule can produce visible deliberation in at least some cases
  (P1).
- Grammar constrained every change into a like-for-like swap: noun for noun,
  verb for verb, conjunction for conjunction. In this run that kept the sentence
  coherent.
- The sentence drifted towards describing itself ("a sentence", "strangers").
- Each change altered what the other words meant. After P4, P1's "strangers"
  would miss a sentence, not a website. Looking at one position at a time shows
  which words a slot has held, but not what the whole sentence said at each
  step.

## Not established

- Why P5 did not commit.
- How anyone reacts when overwritten.
- That people generally care about their word, or that most people deliberate.
- What happens after much deeper history.
- Whether coherence would survive more participants.
