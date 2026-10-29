// stub: slice 2's spec lands first (spec/ship-rules.test.ts)
export const PARTS: string[] = [];
export type Rule = { reads: string; makes: string };
export const RULES: Rule[] = [];
export const VOWEL_COLOUR: Record<string, number> = {};
export const PAINT: number[] = [];
export type Counts = { letters: number; vowels: string[]; consonants: number; tall: number; round: number; hanging: number; repeated: number; first: string | null };
export const counts = (_word: string): Counts => ({ letters: 0, vowels: [], consonants: 0, tall: 0, round: 0, hanging: 0, repeated: 0, first: null });
export const paintOf = (_c: Counts): number => -1;
export type Part = { position: number; value: unknown; says: string; because: string };
export const partOf = (position: number, _word: string): Part => ({ position, value: null, says: "", because: "" });
