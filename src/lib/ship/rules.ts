// The ship's rules (docs/decisions/0005-the-ship.md): ten parts, one per
// position, each reading one thing you can count in how a word is spelled,
// never what it means. One table: the ship (build.ts), the notation and the
// shipwright's notes all read it, never a second copy (spec/ship-rules.test.ts).
//
// The letters counted are Latin, with accents stripped (é counts as e).
// Letters of other scripts count as letters and consonants; digits and
// punctuation count as nothing (decided 30 October). A word with no letter
// still gives every part its minimum; the pennant shows the word as written.

export const PARTS = ["ram", "hull", "prow", "stern", "shields", "mast", "sail", "oars", "steering oar", "pennant"];

const VOWELS = "aeiou";
const TALL = "bdfhklt";
const ROUND = "bcdegopqs";
const HANGING = "gjpqy";

// each vowel's colour, on a shield and on its sail stripe
export const VOWEL_COLOUR: Record<string, number> = { a: 0xb23a26, e: 0xd49a2a, i: 0xefe6d0, o: 0x2f5f8c, u: 0x23201d };
// the hull's thirteen paints, by first letter: a and n share the first, b and o the second, and so on
export const PAINT = [0x23201d, 0x8e2f22, 0x2f5f8c, 0x3f5a3a, 0x6b3f2a, 0x1f4b56, 0x7a5a1e, 0x4d2c3d, 0x2b3a5c, 0x5c6b3a, 0x8a4b2a, 0x34404a, 0x6e2a2a];

export type Counts = {
  letters: number;
  vowels: string[]; // in spelling order
  consonants: number;
  tall: number;
  round: number;
  hanging: number;
  repeated: number; // letters used again after their first use
  first: string | null; // the first Latin letter
};

// every letter of any script, in order, lower case, accents stripped from Latin ones
const lettersOf = (word: string) => [...word.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()].filter((ch) => /\p{L}/u.test(ch));

export function counts(word: string): Counts {
  const ls = lettersOf(word);
  const latin = ls.filter((ch) => ch >= "a" && ch <= "z");
  const of = (set: string) => latin.filter((ch) => set.includes(ch));
  const vowels = of(VOWELS);
  return {
    letters: ls.length,
    vowels,
    consonants: ls.length - vowels.length,
    tall: of(TALL).length,
    round: of(ROUND).length,
    hanging: of(HANGING).length,
    repeated: ls.length - new Set(ls).size,
    first: latin[0] ?? null,
  };
}

export const paintOf = (c: Counts): number => (c.first === null ? PAINT[0] : PAINT[(c.first.charCodeAt(0) - 97) % 13]);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// A part made of a word: its value (what the builder draws), what it is in words (`says`) and the count that
// decided it (`because`).
export type Part = { position: number; value: unknown; says: string; because: string };
export type Rule = {
  reads: string; // what the part counts
  makes: string; // what it makes of that count
  part(c: Counts, word: string): { value: unknown; says: string; because: string };
};

export const RULES: Rule[] = [
  {
    reads: "repeated letters",
    makes: "a blunt ram with none, a beak with one, a three-pronged trident with two or more",
    part: (c) => {
      const value = c.repeated === 0 ? "blunt" : c.repeated === 1 ? "beak" : "trident";
      return { value, says: value, because: plural(c.repeated, "repeated letter") };
    },
  },
  {
    reads: "the first letter",
    makes: "the hull's paint, one of thirteen",
    part: (c) => ({
      value: paintOf(c),
      says: c.first === null ? "plain paint" : `paint “${c.first.toUpperCase()}”`,
      because: c.first === null ? "no Latin letter" : `starts with “${c.first}”`,
    }),
  },
  {
    reads: "round letters (b c d e g o p q s)",
    makes: "how far the prow curls: once per round letter, up to six",
    part: (c) => {
      const value = Math.min(c.round, 6);
      return { value, says: value === 0 ? "straight prow" : `curl ×${value}`, because: plural(c.round, "round letter") };
    },
  },
  {
    reads: "consonants",
    makes: "one plume on the stern per consonant, from one to nine",
    part: (c) => {
      const value = clamp(c.consonants, 1, 9);
      return { value, says: plural(value, "plume"), because: plural(c.consonants, "consonant") };
    },
  },
  {
    reads: "vowels",
    makes: "one shield a side per vowel, in the vowel's colour, up to eight",
    part: (c) => {
      const value = c.vowels.slice(0, 8);
      return { value, says: value.length === 0 ? "no shields" : `${plural(value.length, "shield")} a side`, because: plural(c.vowels.length, "vowel") };
    },
  },
  {
    reads: "tall letters (b d f h k l t)",
    makes: "how tall the mast stands: a step per tall letter, up to five",
    part: (c) => {
      const value = Math.min(c.tall, 5);
      return { value, says: `mast height ${value}`, because: plural(c.tall, "tall letter") };
    },
  },
  {
    reads: "every letter",
    makes: "one stripe on the sail per letter: vowels in their colour, the rest linen",
    part: (c, word) => {
      // the letters in order: a Latin letter as itself (a vowel is drawn in its colour, the rest linen), a letter
      // of another script as null (linen); at least one stripe
      const ls = lettersOf(word);
      const value = ls.length ? ls.map((ch) => (ch >= "a" && ch <= "z" ? ch : null)) : [null];
      return {
        value,
        says: plural(value.length, "stripe"),
        because: ls.length ? `spelled ${ls.join("·").toUpperCase()}` : "no letters",
      };
    },
  },
  {
    reads: "letters",
    makes: "one oar a side per letter, from one to twelve",
    part: (c) => {
      const value = clamp(c.letters, 1, 12);
      return { value, says: `${plural(value, "oar")} a side`, because: plural(c.letters, "letter") };
    },
  },
  {
    reads: "hanging letters (g j p q y)",
    makes: "how deep the steering oar reaches: a step per hanging letter, up to four",
    part: (c) => {
      const value = Math.min(c.hanging, 4);
      return { value, says: `depth ${value}`, because: plural(c.hanging, "hanging letter") };
    },
  },
  {
    reads: "the word itself",
    makes: "the pennant, with the word written on it",
    part: (_c, word) => {
      const value = word.trim();
      return { value, says: `“${value}” on the pennant`, because: "the word, as written" };
    },
  },
];

export function partOf(position: number, word: string): Part {
  const rule = RULES[position];
  if (!rule) throw new RangeError(`no part at position ${position}`);
  return { position, ...rule.part(counts(word), word) };
}
