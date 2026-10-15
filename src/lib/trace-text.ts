// The exact wording of "Your trace" under rule mode `settle`
// (docs/decisions/0003-settle-and-kept-ships.md). Pure, structured parts —
// not HTML strings — so src/pages/index.astro (server JSX) and
// src/lib/live-client.ts (client DOM) build identical markup from one
// source, including after the client's local settle timer flips a trace's
// display (see live-client.ts). No numbers or times ever appear here: the
// settle timer's own value (settlesInMs) only ever drives a local setTimeout,
// never rendered text.

import { TERRITORIES } from "./house/territories";
import type { ReplacedItem, SettleTrace, StandingItem } from "./db";

export type LatestParts = {
  word: string;
  del?: string; // present when replaced: the word that's gone (the <del> text)
  now?: string; // present when replaced: what stands there now
  eligibility: string; // appended sentence: what the visitor may do next
};

const territoryLabel = (position: number): string => TERRITORIES[position]?.label ?? `position ${position + 1}`;

export function latestParts(latest: SettleTrace["latest"]): LatestParts {
  if (!latest.standing) {
    return {
      word: latest.word,
      del: latest.word,
      now: latest.now,
      eligibility: `You can act again, anywhere but the ${territoryLabel(latest.position)}.`,
    };
  }
  if (!latest.settled) {
    return {
      word: latest.word,
      eligibility: `“${latest.word}” is holding your place: until it's replaced or has stood a while, you can't make another.`,
    };
  }
  return {
    word: latest.word,
    eligibility: `You can act again, anywhere but the ${territoryLabel(latest.position)}.`,
  };
}

export const standingText = (item: StandingItem): string => `“${item.word}” still stands, settled.`;

export const replacedText = (item: ReplacedItem): string => `“${item.word}” was replaced by “${item.now}”, kept.`;

// Seconds under a minute spelled out, otherwise rounded minutes — used only
// by #how's settle-mode paragraph, which names the rule in general terms,
// never the visitor's own remaining time.
export function settleSecondsPhrase(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
