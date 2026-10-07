# Theseus

One sentence, shared by everyone who visits:

> Make a website that people would miss if it disappeared.

I wrote that; it's the starting condition, not a visitor's change. From then
on, strangers rewrite it one word at a time, one change each, and can keep
coming back to watch what it becomes, or leave it open and watch it change.

## The rule

- You may replace one word with one word of your own. Once it goes through,
  you can't undo it and you don't get another.
- Anyone after you may replace any word, including yours.
- You can only replace a word you actually saw. If someone changes it while
  you're deciding, yours doesn't go through, and your change is still unspent.
  If it changes while you're typing, what you typed stays and the page tells
  you the new word; clear your draft and the word catches up.
- Afterwards you can still watch, and step back through what the sentence used
  to say.
- While the sentence is open, other people's changes appear in it as they
  happen, without reloading.

A visitor is a browser, remembered by a cookie rather than an account; clearing
it makes you a new visitor.

## What good means

### One act should carry consequence

Unlimited edits make every change cheap; one you can't take back is a
decision. `ENFORCED`: the server refuses a second successful replacement.

### You can only alter what you actually encountered

If the word moved on before you acted, your change fails rather than landing on
a sentence you never saw, and it isn't used up. `ENFORCED`.

### Contribution is influence, not ownership

Nothing is protected: not your word, not anyone's, not my starting sentence.
And because a word's meaning depends on its neighbours, later changes alter
what yours says even while it stands. `ENFORCED`: no word can be locked or
claimed.

### The sentence keeps its past without becoming a feed

Replaced words stay beneath their position, a few at a time and fading, so the
sentence deepens as it's used. You can also step back through its earlier
whole forms, one at a time. No names, no times for others' changes, no counts
or scores on the page, no activity stream; only you see which word was yours.
`ENFORCED` by the server for what's never shown; `JUDGED` for whether the
layers read as depth rather than clutter.

### Only the present is live; the past stays frozen

When several people have the sentence open, the sentence itself is the sign
that others are there: it changes as they act. Everything the open page says
about the sentence now stays true as it changes, including your trace, the
link to the sentence just before now, and the summary a screen reader hears.
Earlier forms never move: what the sentence said after a given change is fixed
for good. There's no presence, no online count, no chat, no activity feed, and
nothing about who else is here. `ENFORCED`: earlier forms never connect to the
live stream, and the stream carries words and versions, never people, times or
counts. `JUDGED`: whether a word changing under you reads as company rather
than noise. The reasoning and the options I turned down are in
[decision 0001](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/decisions/0001-live-present-frozen-past.md).

## How it works

- One server-rendered page per view, with SQLite as the only record of the
  sentence. A replacement is an ordinary form POST, checked and applied in one
  database transaction: one change per visitor, and only against the version
  of the word you saw.
- `/?at=0` is my starting sentence; `/?at=N` is the whole sentence after N
  changes. These pages are read-only, and Earlier and Later step through them
  one at a time; they aren't a list of changes.
- The current page also holds open a server-sent events stream. It starts with
  a snapshot of the sentence (and your own trace, if you have one) read from
  SQLite. After that, each successful replacement arrives as just a position,
  its new word and its version. If your own trace changes, say because you made
  your change in another tab or your word was replaced, your stream alone gets
  a fresh snapshot.
- The page applies an update only if its version is newer than the one it
  shows, so a repeated or late message can't move it backwards. The server's
  checks still decide whether any replacement succeeds.
- A dropped connection reconnects on its own and starts again from a fresh
  snapshot, so it catches up from SQLite rather than replaying missed messages.
  The server keeps only the list of open streams in memory. There's no event
  log, queue or second store, and it runs as one process on one Fly.io machine
  with one volume. How Fly's proxy treats these long-lived connections hasn't
  been checked on the deployed site yet.
- Each word is an ordinary form field, so the page works with a keyboard and
  shows focus. A screen-reader summary reads the whole current sentence and
  stays current. Every visitor's word is shown as text, never as markup.

## What I looked at

- **The Ship of Theseus**, repaired plank by plank in Plutarch, with Hobbes's
  twist of keeping the old planks
  ([summary](https://en.wikipedia.org/wiki/Ship_of_Theseus)). It gave the
  name and the question. The kept planks are the words beneath each position;
  the ship's earlier shapes are the earlier forms.
- **Reddit, ["How We Built r/Place"](https://www.redditinc.com/blog/how-we-built-rplace)**
  (2017): anyone could draw over anyone, one tile every five minutes, a limit
  that "de-emphasized the importance of the individual". Theseus inverts the
  limit, one change ever, and like Place enforces it on the server.
- **Clay Shirky, ["Situated Software"](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html)**
  (2004): software for one group can lean on that group, which is why a cookie
  is enough.
- **A five-person probe**
  ([record](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/exploration/theseus-probe-2026-10-01.md)),
  small, and I was one of the five. Inspecting its state showed the words
  beneath each position can't recover what the whole sentence said, so earlier
  forms exist.

These shaped the decisions; they don't prove them.

## What I'm deliberately not building

No accounts, profiles or nicknames; no chat, comments, likes or reactions; no
second sentence or rooms; no presence or online counts; no scores, feed,
editing or undo; no fake visitors. There's no user-facing moderation; before the
public showcase, harmful content will need a minimal, maker-only recovery path
that gives nobody ownership of words. Leaving all this out keeps the one rule
the whole experience.
