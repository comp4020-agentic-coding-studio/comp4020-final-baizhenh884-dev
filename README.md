# Theseus

One sentence of ten words, shared by everyone who visits:

> Make a website that people would miss if it disappeared.

I wrote that; it's the starting condition, not a visitor's change. Strangers
rewrite it one word at a time, one change each, and can come back, or stay, to
watch.

## The rule

- You may replace one word with one of your own, once: no undo, no second
  change.
- Anyone after you may replace any word, including yours.
- You can only replace a word you saw: if it changes first, yours fails and
  isn't used up. If it changes while you type, your draft stays and the page
  names the new word; clear the draft to catch up.

A visitor is a browser, remembered by a cookie rather than an account.

## What good means

### One act should carry consequence

Unlimited edits make every change cheap; one you can't take back is a
decision. `ENFORCED`: the server refuses a second successful replacement.

### You can only alter what you actually encountered

A change never lands on a sentence you didn't see. `ENFORCED`, word by word.

### Contribution is influence, not ownership

Nothing is protected, not even my starting sentence. Later changes alter what
yours says even while it stands. `ENFORCED`: no word can be locked.

### The sentence keeps its past without becoming a feed

Replaced words fade beneath their position, and you can step back through
earlier whole forms one at a time: `?at=0` is my sentence, `?at=N` the sentence
after N changes. No names, times, counts or activity stream; only you see which
word was yours. `ENFORCED` for what's hidden; `JUDGED` for depth over
clutter.

### Only the present is live; the past stays frozen

With the sentence open, others' changes appear as they happen, and what the
page says stays true: the words, your trace (even from another tab) and the
Earlier link. No presence, online count or chat. `ENFORCED`: earlier forms
never join the live stream, which carries words and versions, not people,
times or counts. `JUDGED`: whether a changing sentence reads as company.
Reasoning:
[decision 0001](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/decisions/0001-live-present-frozen-past.md).

## How it works

SQLite is the only record; a replacement is a form POST in one transaction.
An open page listens on a server-sent events stream: a fresh SQLite snapshot on
every connect or reconnect, then each change as position, word and version. The
page applies only newer versions; the server decides every replacement. No
event log, replay or presence registry. Words are form fields, a screen-reader
summary stays current, and words are always text. Deployed behaviour on Fly.io
is unchecked so far.

## What I looked at

- **The Ship of Theseus**
  ([summary](https://en.wikipedia.org/wiki/Ship_of_Theseus)), with Hobbes's
  kept planks: the name and the question.
- **Reddit, ["How We Built r/Place"](https://www.redditinc.com/blog/how-we-built-rplace)**
  (2017): anyone drew over anyone, under a server-enforced limit. Theseus
  allows one change ever.
- **Clay Shirky, ["Situated Software"](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html)**
  (2004): software for one group can lean on it, so a cookie is enough.
- **A five-person probe**
  ([record](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/exploration/theseus-probe-2026-10-01.md)),
  me among them: words beneath each position couldn't recover the whole
  sentence, so earlier forms exist.

These shaped the decisions; they don't prove them.

## What I'm deliberately not building

No accounts or profiles; no chat, comments, likes or scores; no presence or
counts; no rooms; no feed, editing or undo; no fake visitors. No user-facing
moderation: before the public showcase, harmful content will need a maker-only
fix that gives nobody ownership of words.
