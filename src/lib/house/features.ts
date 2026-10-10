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

// The same features read as plain adjectives; a territory's character is the
// first one that applies to it.
export type Adjectives = Record<"short" | "long" | "tall" | "flat" | "round" | "hangs" | "repeats" | "open" | "veryTall", boolean>;
export function adjectives(f: Features): Adjectives {
  return {
    short: f.length <= 4,
    long: f.length >= 7,
    tall: f.tall >= 2,
    flat: f.tall === 0,
    round: f.roundShare >= 0.5,
    hangs: f.hanging > 0,
    repeats: f.repeats >= 2,
    open: f.vowelShare >= 0.4,
    veryTall: f.tall >= 3,
  };
}

// Longer words reach further, graded continuously so long words keep reaching:
// 3 letters 0.11, 5 0.40, 7 0.60, 9 0.74, 11 0.86, and the whole reach from 14
// letters on, where the body's safe limits are. (The four-step length level,
// which saturated at 7 letters, made long words indistinguishable; Prototype 6
// replaced it here, and only here.)
export function reachOf(f: Features): number {
  return Math.min(1, Math.max(0, Math.log(f.length / 2.5) / Math.log(14 / 2.5)));
}
