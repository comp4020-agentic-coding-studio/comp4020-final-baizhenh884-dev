# Theseus

One sentence, shared by everyone who visits:

> Make a website that people would miss if it disappeared.

I wrote that; it's the starting condition, not a visitor's change. From then
on, strangers rewrite it one word at a time, one change each, and can keep
coming back to watch what it becomes.

## The rule

- You may replace one word with one word of your own. Once it goes through,
  you can't undo it and you don't get another.
- Anyone after you may replace any word, including yours.
- You can only replace a word you actually saw. If someone changes it while
  you're deciding, yours doesn't go through, and your change is still unspent.
- Afterwards you can still watch, and step back through what the sentence used
  to say.

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
whole forms, one at a time. No names, no times for others' changes, no counts,
no activity stream; only you see which word was yours. `ENFORCED` for what's
never shown; `JUDGED` for whether the layers read as depth rather than
clutter.

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
  small, and I was one of the five. Every change was a like-for-like swap, and
  the words beneath each position couldn't show what the whole sentence said at
  each step, which is why earlier forms exist.

These shaped the decisions; they don't prove them.

## What I'm deliberately not building

No accounts, profiles or nicknames; no chat, comments, likes or reactions; no
second sentence or rooms; no scores, feed, editing or undo; no fake visitors;
no live updates until Crit 9. There's no user-facing moderation in Crit 8.
Before the public showcase, the project needs a minimal, exceptional recovery
path for harmful public content, outside the ordinary interaction and giving
nobody ownership of words. Leaving all this out keeps the one rule the whole
experience.
