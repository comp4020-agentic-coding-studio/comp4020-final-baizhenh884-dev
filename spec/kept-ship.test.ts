import { describe, expect, it } from "vitest";
import { deriveKeptShip, type KeptChange, type CurrentWord } from "../src/lib/kept-ship";

// Kept ships (docs/decisions/0003-settle-and-kept-ships.md): ship m0 =
// min(version) across the ten positions is the ship being built; the ship
// before it (m0 - 1) is shown instead, held complete, exactly while the
// single most recent change is the one that closed its last gap — re-derived
// on every read, never timed, from `changes` alone. Pure logic (like
// deriveTotal in src/lib/live-client.ts), so it's tested directly here
// without a database or a running app.

const STARTING = ["Make", "a", "website", "that", "people", "would", "miss", "if", "it", "disappeared"];

// A little model of the real schema: replay a sequence of [position, word]
// replacements over the maker's sentence, producing exactly the (changes,
// current) shapes deriveKeptShip reads from SQLite.
function simulate(replacements: [position: number, word: string][]): { changes: KeptChange[]; current: CurrentWord[] } {
  const words = [...STARTING];
  const versions = Array(10).fill(1);
  const changes: KeptChange[] = [];
  for (const [position, word] of replacements) {
    changes.push({ position, fromVersion: versions[position], fromWord: words[position] });
    words[position] = word;
    versions[position]++;
  }
  return { changes, current: words.map((word, i) => ({ word, version: versions[i] })) };
}

describe("Kept ships", () => {
  it("shows ship 1, all ten gaps, before any replacement", () => {
    const { changes, current } = simulate([]);
    const kept = deriveKeptShip(changes, current);
    expect(kept.ship).toBe(1);
    expect(kept.gaps).toEqual(Array(10).fill(true));
  });

  it("fills a position in ship 1 with its original word once that word is replaced away", () => {
    const { changes, current } = simulate([[3, "ox"]]);
    const kept = deriveKeptShip(changes, current);
    expect(kept.ship).toBe(1);
    expect(kept.gaps[3]).toBe(false);
    expect(kept.words[3]).toBe(STARTING[3]);
    expect(kept.gaps.filter((g) => g).length, "only the replaced position should stop being a gap").toBe(9);
  });

  it("holds ship 1 complete, with every original word, once its last gap closes", () => {
    const replacements: [number, string][] = STARTING.map((_, i) => [i, `v2-${i}`]);
    const { changes, current } = simulate(replacements);
    const kept = deriveKeptShip(changes, current);
    expect(kept.ship).toBe(1);
    expect(kept.gaps).toEqual(Array(10).fill(false));
    expect(kept.words).toEqual(STARTING);
  });

  it("stays ship 1, held, on a fresh read with no further change", () => {
    const replacements: [number, string][] = STARTING.map((_, i) => [i, `v2-${i}`]);
    const { changes, current } = simulate(replacements);
    const first = deriveKeptShip(changes, current);
    const again = deriveKeptShip(changes, current);
    expect(again).toEqual(first);
    expect(again.ship).toBe(1);
    expect(again.gaps).toEqual(Array(10).fill(false));
  });

  it("flips to ship 2 the instant any further replacement lands, correctly pre-filled wherever a position is already a version ahead", () => {
    // round 1: every position replaced once, completing (and holding) ship 1
    const round1: [number, string][] = STARTING.map((_, i) => [i, `v2-${i}`]);
    // two positions already replaced a second time before this read — ship 2
    // must show both as kept (their version-2 word), not as gaps
    const round2: [number, string][] = [
      [2, "v3-2"],
      [7, "v3-7"],
    ];
    const { changes, current } = simulate([...round1, ...round2]);
    const kept = deriveKeptShip(changes, current);
    expect(kept.ship).toBe(2);
    expect(kept.gaps[2]).toBe(false);
    expect(kept.gaps[7]).toBe(false);
    expect(kept.words[2]).toBe("v2-2"); // the word that stood at version 2, now kept
    expect(kept.words[7]).toBe("v2-7");
    expect(kept.gaps.filter((g) => g).length, "only the two already-twice-replaced positions should be filled").toBe(8);
  });

  it("never reports a position as a gap and kept at once (gaps/words agree with one another)", () => {
    const { changes, current } = simulate([[0, "ox"], [0, "cat"], [4, "dog"]]);
    const kept = deriveKeptShip(changes, current);
    expect(kept.words).toHaveLength(10);
    expect(kept.gaps).toHaveLength(10);
  });
});
