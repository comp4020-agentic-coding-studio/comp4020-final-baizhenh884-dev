// The exact wording of "Your trace" under rule mode `settle`
// (docs/decisions/0003-settle-and-kept-ships.md). Pure, structured parts —
// not HTML strings — so src/pages/index.astro (server JSX) and
// src/lib/live-client.ts (client DOM) build identical markup from one
// source, including after the client's local settle timer flips a trace's
// display (see live-client.ts). No counts or times ever appear here: the
// settle timer's own value (settlesInMs) only ever drives a local setTimeout,
// never rendered text. The one number is a place's, which names a position,
// as the part notation's "05" does.

import type { ReplacedItem, SettleTrace, StandingItem } from "./db";
import type { KeptWhere } from "./kept-ship";

export type LatestParts = {
  word: string;
  del?: string; // present when replaced: the word that's gone (the <del> text)
  now?: string; // present when replaced: what stands there now
  holding?: boolean; // present while the word holds the place (not yet settled)
  kept?: string; // present when replaced: where it's kept, a sentence
  eligibility: string; // appended sentence: what the visitor may do next
};

// Where a replaced word is kept, against the kept ship shown now. No ship
// numbers: "no counts on the page" (CLAUDE.md).
const KEPT: Record<KeptWhere, string> = {
  shown: "kept in the ship of old planks",
  later: "kept for a later ship",
  earlier: "kept in a ship already built",
};
export const keptPhrase = (where: KeptWhere): string => KEPT[where];

// a place by the sentence's own number ("place 01"), never the part of the ship it builds
const place = (position: number): string => `place ${String(position + 1).padStart(2, "0")}`;

// `hold`: how long a word holds the place (settleSecondsPhrase); the holding line is the one place the hold is
// explained (the maker, 31 October: the rule paragraph says only what always applies)
export function latestParts(latest: SettleTrace["latest"], hold = "a while"): LatestParts {
  if (!latest.standing) {
    return {
      word: latest.word,
      del: latest.word,
      now: latest.now,
      kept: `It's ${keptPhrase(latest.kept)}.`,
      eligibility: `You can act again, anywhere but ${place(latest.position)}, where it stood.`,
    };
  }
  if (!latest.settled) {
    return {
      word: latest.word,
      holding: true,
      eligibility: `Until it's replaced or has stood ${hold}, you can't make another; then your next word goes somewhere else.`,
    };
  }
  return {
    word: latest.word,
    eligibility: `You can act again, anywhere but ${place(latest.position)}, where it stands.`,
  };
}

export const standingText = (item: StandingItem): string => `“${item.word}” still stands, settled.`;

export const replacedText = (item: ReplacedItem): string => `“${item.word}” was replaced by “${item.now}”, ${keptPhrase(item.kept)}.`;

// Seconds under a minute spelled out, otherwise rounded minutes — used only
// by the holding line, which names the rule's hold in general terms, never
// the visitor's own remaining time.
export function settleSecondsPhrase(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// the line for a word of yours that still stands, shown by GET / and the live page alike; while it holds your place
// it names the word once and the hold follows on (the maker, 31 October)
export const standingLine = (parts: LatestParts): string =>
  `Your word “${parts.word}” still stands, marked ${parts.holding ? "above" : "in the sentence above"}. ${parts.eligibility}`;
