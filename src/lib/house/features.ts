// The written form of a word, read as seven features (never its meaning).
// Frozen: a port of Prototype 4.5's feature-vector grammar, which Prototypes
// 5–6 kept unchanged. Each feature has one architectural meaning:
//   length            how far a territory reaches
//   vowel share       openness, void
//   consonant cluster mass, thickness
//   repeated letters  rhythm, repetition
//   tall letters      verticality            b d f h k l t
//   round letters     curvature              b c d e g o p q s
//   hanging letters   lift                   g j p q y

const VOWELS = new Set("aeiou");
const TALL = new Set("bdfhklt");
const ROUND = new Set("bcdegopqs");
const HANGING = new Set("gjpqy");

export type Features = {
  length: number;
  vowelShare: number;
  cluster: number; // the longest run of consonants
  repeats: number; // letters used more than once, counted past their first use
  tall: number;
  roundShare: number;
  hanging: number;
};

export function features(word: string): Features {
  const c = [...word.trim().toLowerCase()];
  const L = c.length;
  // a word with no vowel reads its y as one
  const hasVowel = c.some((x) => VOWELS.has(x));
  const isVowel = (x: string) => VOWELS.has(x) || (!hasVowel && x === "y");
  let run = 0;
  let cluster = 0;
  for (const x of c) {
    run = isVowel(x) ? 0 : run + 1;
    cluster = Math.max(cluster, run);
  }
  return {
    length: L,
    vowelShare: c.filter(isVowel).length / L,
    cluster,
    repeats: L - new Set(c).size,
    tall: c.filter((x) => TALL.has(x)).length,
    roundShare: c.filter((x) => ROUND.has(x)).length / L,
    hanging: c.filter((x) => HANGING.has(x)).length,
  };
}

// Each feature in four visible steps (0–3), cut where ordinary words spread.
export type Level = 0 | 1 | 2 | 3;
export type LevelKey = "len" | "open" | "mass" | "rep" | "tall" | "round" | "hang";
const CUTS: Record<LevelKey, [(f: Features) => number, number[]]> = {
  len: [(f) => f.length, [4, 5, 7]],
  open: [(f) => f.vowelShare, [0.3, 0.4, 0.5]],
  mass: [(f) => f.cluster, [2, 3, 4]],
  rep: [(f) => f.repeats, [1, 2, 3]],
  tall: [(f) => f.tall, [1, 2, 3]],
  round: [(f) => f.roundShare, [0.2, 0.4, 0.6]],
  hang: [(f) => f.hanging, [1, 2, 3]],
};
export function level(key: LevelKey, f: Features): Level {
  const [at, cuts] = CUTS[key];
  const x = at(f);
  return cuts.filter((c) => x >= c).length as Level;
}
export const LEVEL_KEYS = Object.keys(CUTS) as LevelKey[];

// The same features read as plain adjectives, each a test with its own words
// for when it holds and when it doesn't; a territory's character is the first
// one that applies to it (territories.ts). One table, so the rule and the
// explanation of it (the part notation, /house/) are the same data.
export type AdjectiveKey = "short" | "long" | "tall" | "flat" | "round" | "hangs" | "repeats" | "open" | "veryTall";
export type Test = { holds: (f: Features) => boolean; yes: string; no: string; means: string };
export const TESTS: Record<AdjectiveKey, Test> = {
  short: { holds: (f) => f.length <= 4, yes: "short", no: "not short", means: "4 letters or fewer" },
  long: { holds: (f) => f.length >= 7, yes: "long", no: "not long", means: "7 letters or more" },
  tall: { holds: (f) => f.tall >= 2, yes: "tall", no: "not tall", means: "2 or more tall letters" },
  flat: { holds: (f) => f.tall === 0, yes: "no tall letters", no: "has a tall letter", means: "no tall letter" },
  round: { holds: (f) => f.roundShare >= 0.5, yes: "mostly round", no: "not mostly round", means: "half the letters or more are round" },
  hangs: { holds: (f) => f.hanging > 0, yes: "a hanging letter", no: "no hanging letter", means: "at least one hanging letter" },
  repeats: { holds: (f) => f.repeats >= 2, yes: "repeated letters", no: "no repeats", means: "letters used again, 2 or more times in all" },
  open: { holds: (f) => f.vowelShare >= 0.4, yes: "open", no: "not open", means: "40% or more of the letters are vowels" },
  veryTall: { holds: (f) => f.tall >= 3, yes: "very tall", no: "not very tall", means: "3 or more tall letters" },
};
export type Adjectives = Record<AdjectiveKey, boolean>;
export function adjectives(f: Features): Adjectives {
  return Object.fromEntries(Object.entries(TESTS).map(([k, t]) => [k, t.holds(f)])) as Adjectives;
}
export const LETTERS = { vowels: VOWELS, tall: TALL, round: ROUND, hanging: HANGING };

// Longer words reach further, graded continuously so long words keep reaching:
// 3 letters 0.11, 5 0.40, 7 0.60, 9 0.74, 11 0.86, and the whole reach from 14
// letters on, where the body's safe limits are. (The four-step length level,
// which saturated at 7 letters, made long words indistinguishable; Prototype 6
// replaced it here, and only here.)
export function reachOf(f: Features): number {
  return Math.min(1, Math.max(0, Math.log(f.length / 2.5) / Math.log(14 / 2.5)));
}
