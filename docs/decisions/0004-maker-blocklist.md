# 0004 — A maker's blocklist, refused like any invalid word

**Status:** Accepted
**Decision for:** the Final Project showcase (2026-11-11), where visitor words
stand on a large screen in a room of strangers.

## Context

Theseus has no user-facing moderation, by design: visitors don't report,
vote on or remove each other's words, and no word is protected or owned
(`README.md` L106–109 on `main`, `CLAUDE.md` "Product contract"). The README
also promises that "before the public showcase, harmful content will need a
maker-only fix that gives nobody ownership of words", and `CLAUDE.md` requires
any such recovery path to be "an exceptional maker action outside the
ordinary interaction" that "never protects, assigns or adds words", with a
recorded decision before it's built. This is that decision.

## Decision

A short list of words the server refuses, chosen by the maker and held
outside the repository:

- **Where it lives:** the Fly secret `BLOCKED_WORDS`, comma-separated, read
  once at boot. Never in the repository, the logs or any public response, so
  the list's words are never published by the project itself. The maker
  sets and changes it with `flyctl secrets set`; no code change or migration.
- **How a word is matched:** after the ordinary trim, the word and every
  list entry are Unicode-normalised (NFKC) and case-folded, then compared
  whole. Exact match only: a word that merely contains a listed word is
  allowed, so names and places that happen to contain one aren't refused.
- **What happens:** a listed word is an invalid replacement. It takes the
  existing refusal path: 422, nothing changes, and the visitor's change is not
  used up. The refusal page says only "That word can't be used here.", never
  the word. The log says `invalid reason=blocked`, never the word (refused
  words are never logged, ADR 0002).
- **Order of refusals is unchanged:** ineligible (403) before stale (409)
  before invalid (422). A visitor who is holding a place and types a listed
  word is told they're holding a place, which reveals nothing about the list.
- **Unset is loud, not fatal:** if `BLOCKED_WORDS` is unset or empty, the app
  starts normally and logs one line at boot saying the blocklist is empty.
  It never refuses to start (that would make a forgotten secret an outage)
  and never stays silent (that would make a forgotten secret look like a
  working list).

## Alternatives considered

- **Nothing (today).** Keeps the purest form of "no moderation", but a single
  slur would stand on the showcase screen until a stranger happened to
  replace it. Rejected for the showcase only on that consequence.
- **Substring matching.** Catches more, but refuses innocent words that
  contain a listed one (the Scunthorpe problem), and a refusal that looks
  arbitrary undermines a rule the page asks visitors to trust. Rejected.
- **A list in the repository.** Simplest to test, but publishes the words in
  a public repo and its history. Rejected; CI uses a meaningless test word.
- **A maker removal route** (the maker replaces or blanks a standing word).
  Deals with what the list misses, but adds an admin surface, an
  authentication problem, and an action that writes the sentence outside the
  ordinary rule. Not built; it would need its own decision.
- **Client-side filtering.** Not enforcement: the server decides every
  replacement. Rejected.

## Limits, stated honestly

- It refuses only exact listed words. Deliberate misspellings, spaced
  letters across positions, or a harmful sentence made of individually
  innocent words all pass. The list reduces the obvious case; it is not
  moderation.
- It does nothing about a word already standing when the list changes. That
  word stays until an ordinary replacement, which anyone, including the
  maker, can make under the ordinary rule.
- It gives nobody ownership: no word is protected, assigned or added, and the
  list is the same for every visitor.

## Consequences

- `src/lib/word.ts` gains the check; `invalidReason` gains `"blocked"`.
- CI declares `BLOCKED_WORDS` on both passes with a test word, and the spec
  fails, rather than skips, if CI leaves it unset.
- The maker sets the real list in production with `flyctl secrets set
  BLOCKED_WORDS=...` before the showcase. Before that, production logs that
  the list is empty on every boot.
