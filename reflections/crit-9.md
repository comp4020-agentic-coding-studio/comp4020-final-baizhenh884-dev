# Crit 9 reflection

## What was the breakthrough that moved the work forward?

Refusing to treat green tests as proof. I decided that only the present goes
live and the past stays frozen, and I directed the agent through plans I
corrected before any code existed. Applying a held-back change on blur would
have let a stale draft slip past the 409, because a submit click blurs first.
Every behaviour was then specified red before it was built.

After everything passed, the agent flagged a case nobody had checked: one
visitor with two tabs. A real browser confirmed their trace never appeared in
the other tab. The page fix alone didn't solve it; the real gap was one layer
down, because the
transport never told an open tab that its own trace had changed. We went back
to the contract twice, client then transport, red each time, until the
two-tab case passed.

## What did this work change about who I want to be as a software developer?

I wrote little of this code myself. My work was setting the rules, reading
plans and diffs, pointing out contradictions, insisting on red before green,
and deciding whether what a person sees matches what I meant. That turned out
to be most of the engineering.

I want to keep asking what a passing test doesn't prove. Because I required
every result to be checked before it counted, the agent found some that looked
like evidence and weren't: a check passing by accident on old data, and a test
that failed for its own reasons rather than the app's. Making that checking a
rule, not a hope, is the habit I want to keep.
