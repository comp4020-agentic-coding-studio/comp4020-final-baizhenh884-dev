# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The main breakthrough was deciding what “live” should actually mean in Theseus. I did not want every part of the site to update just because realtime was possible. I decided that only the current sentence should be live, while earlier versions should stay frozen (`9090740`).

That also helped with the harder case where someone is typing a word and another visitor changes the same position. I did not want the remote update to overwrite their draft or quietly change the version underneath them. Their draft stays, they are told that the shared word has changed, and if they still submit it, the server can reject it as stale.

Another important moment came from the House. I noticed that changing “people” to “garden” technically rebuilt the entry, but the finished result still looked almost the same. I asked for the settled versions to be compared instead of judging the rebuild animation. One experiment looked better at first, but most of the apparent improvement came from a neighbouring part moving. The entry itself was still too subtle, so I rejected the experiment rather than keeping a change that did not really solve the problem.

That investigation also exposed a more serious bug: after some live changes, the House could differ from a fresh reload. For `e2413ad`, the new regression checks were first run against the old behaviour and showed the mismatch, then the fix made them pass.

## What did this work change about who I want to be as a software developer?

I learned that a passing test or a visible change is not always enough. I want to ask what the evidence is actually proving and whether the result matches what a person would experience.

I also became more comfortable leaving a known weakness alone when the proposed fix does not really solve it. Not every problem needs another feature or another round of polishing.