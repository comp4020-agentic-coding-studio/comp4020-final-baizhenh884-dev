# Crit 8 reflection

## What was the breakthrough that moved the work forward?

Putting the rules somewhere they could fail before any app existed. I chose
Theseus: one shared sentence where each visitor can replace one word, once.
The README's four claims became a `CLAUDE.md` contract, then HTTP checks that
were red against the placeholder (`199ff8c`). Testing those checks against a
throwaway stub, and having them reviewed, showed the first draft would pass
an app with one version for the whole sentence; hence the per-position check.
From then on every step went spec first, then code, and when a failure was the
test's fault I fixed the test rather than bending the app (`ff6e710`).

The second turn came from real use. I made the first production change
myself, Make → Keep, and the editor opened a wide field beside the word that
broke the sentence apart. The fix put the editor in the word's own place
(`0d61ca7`). My change survived the redeploy and a machine restart.

## What did this work change about who I want to be as a software developer?

Before this project, I mostly cared about whether the final program worked.
This project made me care more about how I know it works, and whether the
evidence behind my decisions is honest.

The five-person probe did not prove what I originally hoped it would, so I
kept the result as inconclusive instead of changing the interpretation
afterwards. I also learned that AI is useful for exploring, implementing and
checking ideas quickly, but it should not decide everything for me. I still
need to decide what counts as real evidence, which trade-offs are acceptable,
and when the agent should stop and ask for approval.
