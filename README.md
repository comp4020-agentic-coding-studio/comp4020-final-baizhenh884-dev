# Theseus

The Ship of Theseus asks whether something remains the same thing when each of
its parts has been replaced, one by one.

Here, that question takes two forms at once: a sentence of ten words, and a
house of ten parts. Each place in the sentence corresponds to a part of the
house. The position of a word determines where it acts; the way the word is
written helps determine the architectural character of that part. Its meaning
does not.

I wrote the first sentence: *Make a website that people would miss if it
disappeared.* After that, any visitor may replace a word, and its part of the
house is rebuilt. Replaced words are kept, and built back into a second sentence
and a second house.

Nothing is permanent, and nobody owns what they leave behind.

*If every word and every part is replaced, is it still the same thing?*

The page opens on that question and three steps on how to play; once you have
made a change, only the question stays.

## The rule

- You may replace any word with one of your own. Your word then holds your
  place: until someone replaces it, or it has stood about five minutes, you
  can't make another, and your next word has to go somewhere else. No undo.
- Anyone after you may replace any word, including yours.
- You can only replace a word you saw: if it changes first, yours fails and
  isn't used up.

A visitor is a browser, remembered by a cookie rather than an account.

## What good means

### One act should carry consequence

Unlimited edits make every change cheap. Here a change can't be taken back, and
it holds you: while your word stands you wait, and you can't return to the same
place. `ENFORCED` by the server
([decision 0003](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/decisions/0003-settle-and-kept-ships.md)).

### You can only alter what you actually encountered

A change never lands on a sentence you didn't see. `ENFORCED`, word by word.

### Contribution is influence, not ownership

Nothing is protected, not even my starting sentence. Later changes alter what
yours says even while it stands. `ENFORCED`: no word can be locked.

### The sentence keeps its past without becoming a feed

The present shows only what stands now; earlier whole forms are reached one at
a time (`?at=0` is my sentence, `?at=N` the sentence after N changes). No
names, times, counts or activity stream; only you see which word was yours, and
the numbers 01–10 name positions, not counts. `ENFORCED` for what's hidden;
`JUDGED` for depth over clutter.

### What is replaced is kept, as a second Theseus

Hobbes asked what happens if the old planks are rebuilt into a second ship.
Here the first kept sentence is mine, gathered back as each word is replaced;
its gaps are words still standing. Finished houses are revisited one at a time,
never as a list. `ENFORCED`: derived from the record, never stored. `JUDGED`:
whether a stranger reads the two houses as the question.

### Only the present is live; the past stays frozen

Others' changes appear as they happen; no presence, online count or chat.
`ENFORCED`: earlier forms never go live, and the stream carries words, not
people, times or counts. `JUDGED`: whether a changing sentence reads as company
([decision 0001](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/decisions/0001-live-present-frozen-past.md)).

## How it works

SQLite is the only record, the server decides every replacement, and an open
page receives updates through a live stream. The house is built in the browser
from each word's written form, never stored, and rebuilt only after the server
accepts a change; [How the house reads a
word](https://comp4020-final-baizhenh884-dev.fly.dev/house/) sets out its rules.

## What I looked at

- **The Ship of Theseus** ([summary](https://en.wikipedia.org/wiki/Ship_of_Theseus)): the name, the question, and Hobbes's second ship.
- **Reddit, ["How We Built r/Place"](https://www.redditinc.com/blog/how-we-built-rplace)** (2017): anyone over anyone, under a server limit; Theseus limits by place as well as time.
- **Clay Shirky, ["Situated Software"](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html)** (2004): software for one group can lean on it, so a cookie is enough.
- **A five-person probe** ([record](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/exploration/theseus-probe-2026-10-01.md)), me among them: words beneath each position couldn't recover the sentence, so earlier forms exist.

These shaped the decisions; they don't prove them.

## What I'm deliberately not building

No accounts or profiles; no chat, comments, likes or scores; no presence or
counts; no rooms; no feed, editing or undo; no fake visitors; no user-facing
moderation. The one maker-only fix, a blocklist of exact words, gives nobody
ownership and is not moderation
([decision 0004](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/decisions/0004-maker-blocklist.md)).

At the 21 October crit, two or three classmates tried it informally, under the
old one-change rule, and wanted to try many words (no notes were kept). I didn't
add a private sandbox or shorten the wait; I made the rule legible instead: the
question band, the 01–10 numbers and /house/.
