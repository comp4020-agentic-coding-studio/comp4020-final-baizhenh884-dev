# Crit 8 reflection

## What was the breakthrough that moved the work forward?

The biggest turning point was defining the rules clearly before building the app.

For Theseus, I wanted one simple idea: there is one shared sentence, and each visitor can replace one word once. In `199ff8c`, I turned the main product rules into HTTP tests before implementing the app. Reviewing those tests showed that version checking needed to belong to each word position, rather than the whole sentence.

Another useful lesson came from `ff6e710`. The tests failed because Astro rendered the HTML differently from what the test expected, even though the page was correct. I had the agent correct the test instead of changing the production code to fit it. That reminded me that tests also need to be questioned when the failure does not match the intended behaviour.

The first real production use led to another correction. I changed “Make” to “Keep”, and the input box pushed the rest of the sentence around. In `0d61ca7`, I had the editor changed so it stayed in the word’s original position. After redeploying, my change was still there and survived a machine restart.

## What did this work change about who I want to be as a software developer?

This project made me care more about how I know something works, not just whether I can get a working result.

The small user probe did not prove what I originally hoped it would, so I kept it as inconclusive instead of making the result sound stronger. I also learned that AI is useful for implementing, checking and finding problems quickly, but I still need to decide what counts as evidence, which trade-offs make sense, and when I should question what the agent suggests.