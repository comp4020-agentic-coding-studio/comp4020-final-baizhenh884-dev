# Loom simulation

**Evidence type: agent-generated simulation, not user evidence.** It tests a
rule, not people. Simulated weavers choosing rows are not a prediction of what
real visitors would do.

## What Loom was

A rejected concept: one shared cloth, one row per visitor. Each row is 16
over/under squares. The rule was a float limit borrowed from weaving: no run of
more than `k` matching squares across a row or down a column. So the rows above
force some squares in the next row. The hope was that this inherited
constraint would make visible pattern on its own.

## What was simulated

- **Rule variants:** maximum run `k` = 2, 3 and 4, on a 16-square row, for 100
  rows, over 40 seeded runs each.
- **Simulated behaviours:**
  - `random`: any legal row.
  - `continue`: extend the previous row's diagonal.
  - `disrupt`: differ from the previous row as much as possible.
  - `default`: change as few squares as possible from all-under.
  - A mixed population of the four, in `render_all.py`.
- **Measures:** how many squares were forced, how many were genuinely free,
  dead ends, near-paralysis, and pattern statistics. The pattern statistics
  are agreement with neighbouring squares and compressibility, compared with a
  cloth of pure random noise.

## Files

- `sim.py`: the model.
- `experiments.py`: prints the table in `results.txt`.
- `render_all.py`: draws `structure.png` (black and white, every rule and
  behaviour) and `colour.png` (coloured rows, as the page would show them).
- `results.txt`: the output of re-running both scripts. It matches the
  original run exactly, and the re-drawn images are byte-identical to the
  originals.

The only change from the original throwaway copies, which lived in `/tmp`: the
file paths now point at this directory.

## What it showed, and why Loom was dropped

- **Little inheritance at the proposed rule.** With `k = 3` and random
  weavers, a typical row had 2 of 16 squares forced; the range was 0–11.
- **Noise, not pattern.** That cloth compressed like noise: 1.05, against 1.055
  for pure random squares.
- **Pattern needed design.** Clear diagonals appeared only when simulated
  weavers deliberately continued a pattern (`continue`), or did the minimum
  (`default`).
- **Colour drowned the weave.** In the coloured rendering, each row's colour
  dominated, so the cloth read as one stripe per person.
- **No dead ends.** No run ever reached a state with no legal next row, for any
  `k`.

Loom's defining mechanism, inherited constraint making the pattern, didn't
produce the effect the concept depended on, so it was dropped.
