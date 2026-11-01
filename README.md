# Theseus

The Ship of Theseus asks whether something remains the same after every part is replaced. Here, the question is both a ten-word sentence and a ten-part ship. Each place in the sentence builds one ship part; spelling determines its form, never meaning.

I wrote the first sentence: *Make a website that people would miss if it disappeared.* Visitors may replace its words. Each accepted change rebuilds one part, while a shipwright carries the old plank across the quay to a second ship made from replaced words.

Nothing is permanent, and nobody owns what they leave behind.

## The rule

- Replace any word. Yours holds your place until someone replaces it or 20 seconds pass; then move somewhere else. No undo.
- Anyone may later replace your word.
- You can only replace a word you saw. If it changes first, the attempt fails, but your opportunity to replace a word is not spent.

A visitor is a browser, remembered by a cookie rather than an account.

## What good means

- **One act should carry consequence.** A change cannot be withdrawn; you wait until your word is replaced or settles after 20 seconds, then move elsewhere. `ENFORCED` by the server ([decision 0003](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/decisions/0003-settle-and-kept-ships.md)).
- **Alter only what you encountered.** A change never lands on a version you did not see. `ENFORCED` word by word.
- **Contribution is influence, not ownership.** No word, including mine, can be locked. `ENFORCED`.
- **Keep the past without making a feed of people.** Earlier whole sentences remain reachable, and the log records replaced planks without names or times. `ENFORCED` for what stays hidden; `JUDGED` in my 31 October live walkthrough, where the log made the replacement sequence readable together rather than one form at a time, without adding people or times.
- **Keep what was replaced as a second Theseus.** Old words assemble another ship from the record rather than stored copies. `ENFORCED` in derivation; `JUDGED` against the 28 October playtest, where the paired houses were not understood. The ships answer that failure but await the same visitor test.
- **Only the present is live.** Current words update and anonymous shipwrights show co-presence; earlier forms remain frozen. No names, counts or chat. `ENFORCED` in the stream; `JUDGED` in my browser review of the figures and carried planks. Whether a group reads them as co-presence remains unverified ([decision 0005](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/decisions/0005-the-ship.md)).

## How it works

SQLite is the only record and the server decides every replacement. Open pages receive updates through a live stream. The ships are drawn in the browser from the words, never stored; [How the planks are made](https://comp4020-final-baizhenh884-dev.fly.dev/ship/) explains their rules.

## What I looked at

- **The Ship of Theseus** ([summary](https://en.wikipedia.org/wiki/Ship_of_Theseus)): Plutarch's continuing ship and Hobbes's second one.
- **Reddit, [“How We Built r/Place”](https://www.redditinc.com/blog/how-we-built-rplace):** shared editing limited by time; Theseus also limits place.
- **Clay Shirky, [“Situated Software”](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html):** software for one group can rely on its context, so a cookie is enough.
- **A [five-person probe](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/exploration/theseus-probe-2026-10-01.md):** words alone could not recover the sentence, so earlier forms remain.
- **A [three-person playtest](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/exploration/playtest-2026-10-28.md):** the house was unclear, so it became a ship with a visible story.

These shaped the decisions; they do not prove them.

## What I am deliberately not building

No accounts, profiles, rooms, chat, comments, likes, scores, public identities, presence counts, feed of who acted or when, editing, undo, fake visitors or user-facing moderation. A maker-only exact-word blocklist is a recovery tool, not ownership or moderation ([decision 0004](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/decisions/0004-maker-blocklist.md)).
