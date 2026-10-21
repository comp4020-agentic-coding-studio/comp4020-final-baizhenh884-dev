// Kept ships (docs/decisions/0003-settle-and-kept-ships.md): the second
// reading of the sentence, derived entirely from `changes` — no new stored
// state. Ship k is the word that stood at version k of each position. The
// ship normally shown is m0 = min(version) across the ten positions, the
// oldest ship not yet complete; its gaps are exactly the positions still at
// version m0. But once ship 1 completes it holds, visibly whole, until the
// next accepted replacement anywhere: re-derived on every read from whether
// the single most recent change in `changes` is the one that closed its last
// gap, never from a timer or a stored flag. Later ships never hold.
//
// Pure, so it's tested directly (spec/kept-ship.test.ts) without a database,
// the same way deriveTotal (live-client.ts) is.

export type KeptChange = { position: number; fromVersion: number; fromWord: string };
export type CurrentWord = { word: string; version: number };
export type KeptShip = { ship: number; words: string[]; gaps: boolean[] };

export function deriveKeptShip(changes: readonly KeptChange[], current: readonly CurrentWord[]): KeptShip {
  const m0 = Math.min(...current.map((c) => c.version));
  const last = changes[changes.length - 1]; // `changes` is append-only in order (ORDER BY id)
  // only ship 1 holds: a later ship's completion is a quiet beat on the page, never a hold
  const ship = last && last.fromVersion === m0 - 1 && m0 - 1 === 1 ? 1 : m0;

  const kept = shipWords(changes, ship);
  const words = current.map((c, i) => kept[i] ?? c.word);
  const gaps = kept.map((w) => w === null);
  return { ship, words, gaps };
}

// Ship k: at each position the word that stood at version k, kept once it
// was replaced (null while it still stands). The one rule both the kept
// ship being built and an earlier, completed one are read by.
function shipWords(changes: readonly KeptChange[], k: number): (string | null)[] {
  const words: (string | null)[] = Array(10).fill(null);
  for (const c of changes) if (c.fromVersion === k) words[c.position] = c.fromWord;
  return words;
}

// An earlier house (/?kept=k): ship k's ten words, only once every position
// has been replaced past version k; null for any other k.
export function completedShip(changes: readonly KeptChange[], current: readonly CurrentWord[], k: number): string[] | null {
  if (!Number.isInteger(k) || k < 1 || k >= Math.min(...current.map((c) => c.version))) return null;
  const words = shipWords(changes, k);
  return words.every((w): w is string => w !== null) ? words : null;
}

// Where a replaced word is kept, against the ship shown: a word that stood at
// version g of its position belongs to ship g. Never a number on the page.
export type KeptWhere = "shown" | "later" | "earlier";
export const keptWhere = (wordShip: number, shownShip: number): KeptWhere => (wordShip === shownShip ? "shown" : wordShip > shownShip ? "later" : "earlier");
