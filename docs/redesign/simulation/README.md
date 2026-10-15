# Eligibility-rule simulation

**Evidence type: agent-generated simulation, not user evidence.** Simulated
visitors follow simple, stated habits. The output shows what a rule *permits
and encourages* under those habits; it cannot show that any rule is fun,
legible, or fair-feeling to people. No real visitor data was used.

Run (standard library only, deterministic, ~15 s):

```sh
python3 -I docs/redesign/simulation/sim.py 200 > docs/redesign/simulation/results.md
```

## Rules compared

| rule | may act when | notes |
|---|---|---|
| `once` | you have never succeeded | current production rule |
| `standing` | none of your words stands | the brief's candidate |
| `moveon` | `standing`, and your next word goes to a position other than your last | blocks immediate re-taking of the spot you just lost |
| `settle` | `moveon`, or your standing word has stood ≥ T (default 5 min) | a word that has stood T *settles*: it stays in the sentence but stops holding you; derived from the change's timestamp, no button |
| `cooldown` | ≥ 5 min since your last success | r/Place-style reference, no standing condition |

## Behavioural assumptions (all are guesses)

- **Deliberation:** an able visitor acts after an exponential wait with a
  per-visitor mean drawn log-normally around 40 s (probe: 6–170 s to first
  commit). After their first act, each visitor's urge to act again is scaled
  by an "appetite" drawn uniformly from 0.3–1.0.
- **Submission latency:** 5–20 s between choosing a position and submitting;
  the version seen is the one at choice time, so stale refusals occur.
  60 % of stale refusals retry promptly.
- **Habits:**
  - `random`: picks any allowed position uniformly.
  - `retaliate`: after being displaced, with probability `p_ret` (0.8) next
    targets a word the displacer still holds; otherwise random.
  - `friend`: a clique of four. With probability `p_unl` (0.8) a friend
    targets the clique member's word that has been locked longest; never
    targets a friend's word otherwise.
- **Presence:**
  - `random`/`retaliatory`/`friends`: 12 visitors, 20 minutes; all arrive in
    the first 3 min; 40 % leave after 4–12 min, and 40 % of those return
    2–6 min later for 2–5 min.
  - `sparse`: 12 visitors dropping in for 2–6 min at random across 20 min.
  - `trickle-24h`: 12 visitors, each with 1–3 short visits across a day.
  - `pod-4`: four people present the whole 20 minutes (a crit pod, or the
    proposed playtest).
- Words have no content; nothing models whether a replacement is good.

## Metric definitions

- **acts/visitor**: successful replacements per visitor (p10–p90 across seeds).
- **blocked >½ time**: share of visitors who, while present, were unable to act
  more than half the time. *Note:* every rule scores high here because a
  visitor who has just acted is "unable" by design; read it with "stuck".
- **stuck at end**: share of visitors locked for more than half the window
  and still locked at the end.
- **room frozen**: share of occupied time in which *nobody present* can act.
- **wait to regain**: mean length of a completed lock (wall clock).
- **locks that end**: share of lock episodes that end before the window does.
- **repeated-pair**: share of replacements between a pair of visitors who
  displace each other ≥ 3 times in total.
- **revenge**: share of replacements where the actor displaces the last person
  who displaced them.
- **A→B→A same pos**: share of replacements that retake a position from the
  visitor who had just taken it from the actor.
- **top-20 % share**: share of all replacements made by the most active 20 %.
- **same pos as prev / pos spread**: whether change circulates (spread 1.0 =
  perfectly even across the ten positions).
- **runs where all 10 originals go**: share of runs in which no maker word
  remains at some point.

## What it shows (summary; numbers in results.md)

1. **`standing` deadlocks small groups.** With 4 people (`pod-4`) the room is
   frozen ~84 % of the time and 99 % of visitors end stuck: once everyone's
   word stands, nobody can unlock anybody. With 12 it still leaves ~45 %
   stuck at the end. This is a structural property (N ≤ 10 visitors can all
   hold a word at once), not a parameter artefact.
2. **`standing` invites retaliation.** With half the room retaliating,
   ~28 % of replacements are revenge and ~29 % retake the same position
   from the person who just took it (A→B→A). `moveon` cuts both to ~1–2 %.
3. **Friend unlocking is real but bounded.** With an active clique,
   repeated-pair rises to 23 % (`standing`) and 14 % (`moveon`), up to
   ~45 % when the clique is very disciplined (p = 0.95), with the top 20 %
   making ~45 % of actions. No rule here stops a determined clique; `moveon`
   only slows it.
4. **Free withdrawal is unlimited editing.** `settle` with T = 0 (release on
   demand) gives 12–17 acts per visitor in 20 minutes; the scarcity vanishes.
5. **`settle` (T = 5 min) removes stuck visitors entirely** in every mix,
   keeps revenge ≤ 3 %, cuts room-frozen time in `pod-4` from ~85 % to ~36 %
   and in the 12-person mixes from ~16–21 % to 2–3 %, and lets ~90 % of
   return visits arrive able to act (vs ~40 % for `standing`). It also
   produces the most actions (median 4 per visitor in 20 min). At T = 10 min
   `pod-4` is frozen ~64 % of the time; at T ≥ 20 min it behaves like
   `standing` inside a 20-minute session.
6. **`cooldown` is the most active and the least Theseus**: no relationship
   between your eligibility and other people at all.

## Sensitivity

Faster deliberation (20 s) raises acts and retaliation under `standing`
(revenge 22–38 %); slower (80 s) lowers both. The *ordering* of the rules on
stuck, revenge and frozen did not change across the tested ranges of
deliberation (20–80 s), habit strength (0.5–0.95) or settle age; the
magnitudes did, by up to a factor of two.
