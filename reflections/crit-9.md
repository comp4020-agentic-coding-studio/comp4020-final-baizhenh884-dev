# Crit 9 reflection

## What was the breakthrough that moved the work forward?

Deciding what "live" means before building it. Only the present goes live and
earlier forms stay frozen, and a remote change never overwrites a draft you are
typing: the page names the new word, and your submit can still fail as stale.
Once that rule was written down, realtime became something I could check.

The second breakthrough came from noticing something faint. When I replaced
"people" with "garden" at the entry of the house, a part was rebuilt and the
finished house looked almost the same. So I stopped asking the agent whether it
looked different. I had it render the real house and measure the settled
before and after, not the animation. One fix, a taller opening for vowel-rich
words, looked like a win until I held the threshold still and saw that much of
the gain was the threshold canopy rising with it. Without that, the entry was
still too subtle, so I threw the experiment away.

That work also showed a worse bug, which had been there since the live body's first
commit: a live change could leave a neighbour stale, so the house differed from a
reload. I had the regression tests written first and checked they failed.

## What did this work change about who I want to be as a software developer?

I want to keep asking what a number or a screenshot doesn't show. "It works" and
"it looks good" are not evidence, and an animation can hide a weak result.

I learned to stop, too. The grammar is frozen, and the entry's weakness is
written down as unsolved. I would rather ship one coherent piece with a known
flaw than keep polishing it.
