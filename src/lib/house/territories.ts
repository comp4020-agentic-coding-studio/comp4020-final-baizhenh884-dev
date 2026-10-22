// Position → territory, and word → that territory's character. Each of the ten
// positions always owns the same share of the one body; the word written there
// decides only its form, through the frozen features (features.ts).

import { features, LEVEL_KEYS, level, reachOf, TESTS, type AdjectiveKey, type Level, type LevelKey } from "./features";

export { TESTS };

export const TERRITORIES = [
  { id: "ground", label: "ground" },
  { id: "frontLeft", label: "front-left mass" },
  { id: "hall", label: "central hall" },
  { id: "frontRight", label: "front-right mass" },
  { id: "entry", label: "entry" },
  { id: "upperLeft", label: "upper-left volume" },
  { id: "roof", label: "roof" },
  { id: "upperRight", label: "upper-right volume" },
  { id: "side", label: "side mass" },
  { id: "threshold", label: "threshold" },
] as const;
export type TerritoryId = (typeof TERRITORIES)[number]["id"];

// Each territory's families, in the order they're tried: the first whose test
// holds is the family; the last has no test of its own (it's what's left).
export type Step = { test: AdjectiveKey | null; family: string };
const step = (test: AdjectiveKey | null, family: string): Step => ({ test, family });
const front = [step("repeats", "split"), step("round", "curved"), step("open", "hollow"), step(null, "solid")];
const upper = [step("repeats", "cells"), step("open", "frame"), step("round", "vault"), step(null, "box")];
export const FAMILY_ORDER: Record<TerritoryId, Step[]> = {
  ground: [step("hangs", "stilts"), step("short", "plinth"), step(null, "podium")],
  frontLeft: front,
  hall: [step("repeats", "stepped"), step("open", "clerestory"), step(null, "block")],
  frontRight: front,
  entry: [step("round", "arch"), step("short", "cut"), step(null, "nested")],
  upperLeft: upper,
  roof: [step("repeats", "sawtooth"), step("flat", "flat"), step("round", "barrel"), step(null, "gable")],
  upperRight: upper,
  side: [step("veryTall", "tower"), step("repeats", "stepped"), step("round", "drum"), step("open", "arcade"), step(null, "wing")],
  threshold: [step("repeats", "colonnade"), step("open", "canopy"), step("round", "apron"), step(null, "court")],
};

// one test tried on the way to the family: whether it held
export type Reason = { test: AdjectiveKey; holds: boolean };

export type Territory = {
  position: number;
  id: TerritoryId;
  family: string;
  // every test tried, in order: the ones that failed, then the one that held (none, for the last family)
  reason: Reason[];
  reach: number; // 0..1, from length
  levels: Record<LevelKey, Level>;
};

export function describeTerritory(position: number, word: string): Territory {
  const t = TERRITORIES[position];
  if (!t) throw new RangeError(`no territory at position ${position}`);
  const f = features(word);
  const levels = Object.fromEntries(LEVEL_KEYS.map((k) => [k, level(k, f)])) as Record<LevelKey, Level>;
  const reason: Reason[] = [];
  let family = "";
  for (const s of FAMILY_ORDER[t.id]) {
    const holds = s.test === null || TESTS[s.test].holds(f);
    if (s.test !== null) reason.push({ test: s.test, holds });
    if (holds) { family = s.family; break; }
  }
  return { position, id: t.id, family, reason, reach: reachOf(f), levels };
}

export const reach = (word: string): number => reachOf(features(word));
