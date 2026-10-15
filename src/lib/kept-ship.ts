// Kept ships (docs/decisions/0003-settle-and-kept-ships.md): the second
// reading of the sentence, derived entirely from `changes` — no new stored
// state. Ship k is the word that stood at version k of each position. The
// ship normally shown is m0 = min(version) across the ten positions, the
// oldest ship not yet complete; its gaps are exactly the positions still at
// version m0. But once a ship completes it holds, visibly whole, until the
// next accepted replacement anywhere: re-derived on every read from whether
// the single most recent change in `changes` is the one that closed that
// ship's last gap, never from a timer or a stored flag.
//
// Pure, so it's tested directly (spec/kept-ship.test.ts) without a database,
// the same way deriveTotal (live-client.ts) is.

export type KeptChange = { position: number; fromVersion: number; fromWord: string };
export type CurrentWord = { word: string; version: number };
export type KeptShip = { ship: number; words: string[]; gaps: boolean[] };

export function deriveKeptShip(changes: readonly KeptChange[], current: readonly CurrentWord[]): KeptShip {
  const m0 = Math.min(...current.map((c) => c.version));
  const last = changes[changes.length - 1]; // `changes` is append-only in order (ORDER BY id)
  const ship = last && last.fromVersion === m0 - 1 ? m0 - 1 : m0;

  const words = current.map((c) => c.word);
  const gaps = current.map((c) => c.version <= ship);
  for (const c of changes) {
    if (c.fromVersion === ship) {
      words[c.position] = c.fromWord;
      gaps[c.position] = false;
    }
  }
  return { ship, words, gaps };
}
