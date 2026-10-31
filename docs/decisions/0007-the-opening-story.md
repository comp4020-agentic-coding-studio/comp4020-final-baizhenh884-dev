# 0007 — The opening story, for a first visit

**Status:** Proposed (2026-10-31)
**Decision for:** Final Project, after the log
**Builds on:** [0005](0005-the-ship.md), its "The opening story" lines (five
short beats, first visit only, skippable with Escape, never traps focus,
absent without JavaScript), which this decision makes concrete. It also
settles 0005's open question, whether the story replaces the three steps: it
doesn't. Decisions 0001–0006 are otherwise unchanged.

## Context

The 28 October playtest ([notes](../exploration/playtest-2026-10-28.md),
written up from memory; three classmates on laptops) found that on arriving
nobody understood what the page was or what they were meant to do, and
nobody could tell the two halves apart. The two halves were then a house
standing and a house kept: the second Theseus. Decision 0005 replaced the house
with a ship partly because a ship carries this story itself. But the page
still never tells the story: Plutarch's ship, its planks replaced one by one,
and Hobbes's second ship built from the old planks. The band asks the question
and gives three steps on how to play; it doesn't say why there are two ships.

Nobody has seen the ship version yet, so whether a stranger reads the two
ships as the question is unknown. The story is the maker's answer to the
playtest's "what is this?", built ahead of the informal try that would test it.

## Options considered

1. **No story; the band alone.** The question, one sentence and three steps.
   - For: nothing new to build or maintain; nothing stands between a visitor
     and the sentence.
   - Against: the second ship stays unexplained, and the band's one sentence
     names Theseus without Hobbes.
2. **A longer band** with the story in text.
   - For: no new state, no overlay, readable without a script.
   - Against: it pushes the sentence further down a phone's first screen,
     which the contract keeps there; and it tells the story in words instead
     of with the harbour that already shows it.
3. **A short story over the existing harbour, on a first visit (chosen).**

## Decision

**Five beats, once, over the harbour as it is; then out of the way.**

- **The beats.** Camera moves over the existing scene, and one or two lines
  of text each. No new art, no new model, no new sound.
  1. Wide on the harbour: "Athens kept the ship of Theseus in its harbour for
     centuries."
  2. In on the live ship; three small parts (shields, then oars, then stern)
     are rebuilt in turn, each red only while it's rebuilt and exactly as it
     was: "As its planks rotted, they were replaced, one by one." (Amended
     31 October after the maker saw the frames: the whole hull turning red
     read as the whole ship replaced, not one by one.)
  3. Hold on it: "Until none of the first planks were left. Philosophers
     argued over it: was it still the same ship?", with a small source line,
     "Plutarch, Life of Theseus 23": a citation of what he reports, not a
     quotation.
  4. Across to the ship of old planks on the slipway: "Centuries later,
     Hobbes asked: what if someone kept every old plank, and built them into
     a ship? Which one is Theseus's?" (Plutarch wrote c. 100 CE; Hobbes in
     1655.)
  5. Back to wide, the sentence strip lit: "Here, the ship is a sentence.
     Each word is a plank. Change one." and a Begin button.
- **Nothing in it is live data.** The lines are fixed text: no counts, names,
  words from the sentence or anything from the stream. The scene behind them
  is the harbour as it stands (the ships and shipwrights the page already
  draws). Beat 2 rebuilds each part *as it was*: the ship still
  represents the sentence, nothing is previewed, and live equals fresh.
- **First visit only, remembered in the browser.** A flag in `localStorage`
  is set when the story opens. If storage fails (private window, blocked
  site data), the story shows once per page load and the page still works.
  The server never knows: no cookie, no field, no log line.
- **Always skippable, never in the way.** A visible Skip on every beat;
  Escape skips. Click or tap anywhere on the story, Enter, Space or the right
  arrow advance; the left arrow goes back a beat. It never traps focus:
  moving focus out of the story ends it, as Skip does. Begin or Skip puts
  focus on the sentence (the strip, not a word field, so no word is taken in
  hand).
- **Replayable.** "The story" in the masthead on `GET /` (a button: it plays
  the story again; it goes nowhere). Not on `?at=N`, `?kept=k` or `/ship/`.
- **Reduced motion:** no camera moves and no flash; the text beats over the
  fixed view.
- **No WebGL (or before it loads):** the same five lines as text, in the same
  overlay, advanced and skipped the same way.
- **No JavaScript:** no story and no "The story" button (0005); the page is
  complete without them.
- **Accessible.** The story is a labelled, non-modal dialog; each beat's text
  is real text, read as it appears; the canvas stays decorative.
- **Live changes go on underneath.** The sentence, the ships and the log keep
  following the stream while the story plays; a phone's camera doesn't follow
  a flying plank until the story ends.
- **The band stays as it is**, three steps included (maker, 31 October).
- On a phone the harbour starts one scroll below the band, so the story
  scrolls it into view and scrolls back to the sentence at the end.

## What it costs

- One more thing between a first visitor and the sentence, for five clicks
  or one Skip. A visitor who skips loses nothing: the band still says how to
  play.
- The checks' browser is always a first visit, so every existing check that
  loads `/` would meet the story. The harness marks it as seen (the same
  `localStorage` flag a returning visitor holds) for every check except the
  story's own.
- The lines quote no source verbatim. Beat 3 says what Plutarch reports and
  cites it (the source line names where, it doesn't put words in his mouth);
  beat 4 paraphrases Hobbes (*De Corpore* II.11). Neither is presented as a
  quotation.

## Status of evidence

The playtest notes above, which predate the ship. Whether the story helps a
stranger read the two ships needs the informal try, recorded when it happens.
