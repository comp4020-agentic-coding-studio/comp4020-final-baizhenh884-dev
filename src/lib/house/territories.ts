// Position → territory, and word → that territory's character. Each of the ten
// positions always owns the same share of the one body; the word written there
// decides only its form, through the frozen features (features.ts).

import { adjectives, features, LEVEL_KEYS, level, reachOf, type Adjectives, type Level, type LevelKey } from "./features";

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

const front = (a: Adjectives) => (a.repeats ? "split" : a.round ? "curved" : a.open ? "hollow" : "solid");
const upper = (a: Adjectives) => (a.repeats ? "cells" : a.open ? "frame" : a.round ? "vault" : "box");
// the first adjective that applies gives the territory's family
const FAMILY: Record<TerritoryId, (a: Adjectives) => string> = {
  ground: (a) => (a.hangs ? "stilts" : a.short ? "plinth" : "podium"),
  frontLeft: front,
  hall: (a) => (a.repeats ? "stepped" : a.open ? "clerestory" : "block"),
  frontRight: front,
  entry: (a) => (a.round ? "arch" : a.short ? "cut" : "nested"),
  upperLeft: upper,
  roof: (a) => (a.repeats ? "sawtooth" : a.flat ? "flat" : a.round ? "barrel" : "gable"),
  upperRight: upper,
  side: (a) => (a.veryTall ? "tower" : a.repeats ? "stepped" : a.round ? "drum" : a.open ? "arcade" : "wing"),
  threshold: (a) => (a.repeats ? "colonnade" : a.open ? "canopy" : a.round ? "apron" : "court"),
};

export type Territory = {
  position: number;
  id: TerritoryId;
  family: string;
  reach: number; // 0..1, from length
  levels: Record<LevelKey, Level>;
};

export function describeTerritory(position: number, word: string): Territory {
  const t = TERRITORIES[position];
  if (!t) throw new RangeError(`no territory at position ${position}`);
  const f = features(word);
  const levels = Object.fromEntries(LEVEL_KEYS.map((k) => [k, level(k, f)])) as Record<LevelKey, Level>;
  return { position, id: t.id, family: FAMILY[t.id](adjectives(f)), reach: reachOf(f), levels };
}

export const reach = (word: string): number => reachOf(features(word));
