import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { features } from "../src/lib/house/features";
import { describeTerritory, FAMILY_ORDER, TERRITORIES, TESTS } from "../src/lib/house/territories";

// Why a territory has its family, read from the rule itself
// (docs/decisions: CLAUDE.md "Scope (Final Project: House integration)",
// the no-output-change restructure). Each family is the first test in its
// territory's order that holds; the reason is every test tried, in order:
// the ones that failed, then the one that held (none, for the last family).
// The families themselves are pinned by spec/house-grammar.test.ts; this
// checks that what the reason says is true of the word.

const rows = JSON.parse(readFileSync(new URL("./fixtures/house-descriptors.json", import.meta.url), "utf8")).rows as [number, string][];
const POOL = [...new Set(rows.map((r) => r[1]))];
const EXTREMES = ["a", "y", "rhythm", "bookkeeper", "lollipop", "queue", "aaaaaaaaaaaaaaaaaaaaaaaa", "Bt", "qq", "incomprehensibilities"];
const WORDS = [...POOL, ...EXTREMES];

describe("why a territory has its family", () => {
  it("states each test it names truly of the word, in the territory's own order, ending at the family", () => {
    const wrong: string[] = [];
    for (let position = 0; position < 10; position++) {
      const order = FAMILY_ORDER[TERRITORIES[position].id];
      for (const word of WORDS) {
        const t = describeTerritory(position, word);
        const f = features(word);
        // the reason walks the order: every step before the family failed, the family's own test (if any) held
        const at = order.findIndex((s) => s.family === t.family);
        const expected = order.slice(0, at + 1).map((s, i) => ({ test: s.test, holds: i === at && s.test !== null })).filter((s) => s.test !== null);
        const said = t.reason.map((r) => ({ test: r.test, holds: r.holds }));
        if (JSON.stringify(said) !== JSON.stringify(expected)) wrong.push(`${position} ${word}: ${JSON.stringify(said)} ≠ ${JSON.stringify(expected)}`);
        // and every claim is true of the word's letters, by the test's own definition
        for (const r of t.reason) if (TESTS[r.test].holds(f) !== r.holds) wrong.push(`${position} ${word}: says ${r.test} ${r.holds ? "holds" : "fails"}`);
      }
    }
    expect(wrong.slice(0, 10), `${wrong.length} wrong`).toEqual([]);
  });

  it("reaches every family each territory can have, and nothing else", () => {
    for (let position = 0; position < 10; position++) {
      const id = TERRITORIES[position].id;
      const seen = new Set(WORDS.map((w) => describeTerritory(position, w).family));
      expect([...seen].sort(), id).toEqual(FAMILY_ORDER[id].map((s) => s.family).sort());
    }
  });

  // hand-checked against features.ts and the family order, so the wording itself is pinned
  it("reads, in words, the way a person would check it", () => {
    const say = (position: number, word: string) => describeTerritory(position, word).reason.map((r) => (r.holds ? TESTS[r.test].yes : TESTS[r.test].no)).join(", ");
    expect(say(4, "cut")).toBe("not mostly round, short"); // entry: arch? no; cut? yes
    expect(say(4, "people")).toBe("mostly round"); // entry: arch, at once
    expect(say(4, "entrance")).toBe("not mostly round, not short"); // nested, the last: no test of its own
    expect(say(0, "jump")).toBe("a hanging letter"); // ground: stilts first
    expect(say(8, "letterbox")).toBe("very tall"); // side: tower first (l t t b = 4 tall)
    expect(say(2, "hammock")).toBe("fewer than 2 repeats, not open"); // hall: block, the last (one extra m: 1 repeat)
    expect(say(6, "miss")).toBe("fewer than 2 repeats, no tall letters"); // roof: flat (one extra s)
    expect(say(6, "bottle")).toBe("fewer than 2 repeats, has a tall letter, mostly round"); // roof: barrel (one extra t)
  });

  // "repeats" counts every use of a letter after its first, across the whole word, and the test holds
  // at 2 or more. Its wording must not let a doubled letter read as passing: "hammock" (one extra m)
  // fails it, "letter" (an extra t and an extra e) passes it, at the same position.
  it("words the repeats test so a single doubled letter can't be misread as passing", () => {
    const at = (word: string) => describeTerritory(2, word);
    expect(features("hammock").repeats, "hammock's repeats").toBe(1);
    expect(features("letter").repeats, "letter's repeats").toBe(2);
    expect(at("hammock").family).toBe("block");
    expect(at("letter").family).toBe("stepped");
    expect(at("hammock").reason[0]).toEqual({ test: "repeats", holds: false });
    expect(at("letter").reason[0]).toEqual({ test: "repeats", holds: true });
    expect(TESTS.repeats.yes).toBe("2 or more repeats");
    expect(TESTS.repeats.no).toBe("fewer than 2 repeats");
    expect(TESTS.repeats.means, "the definition gives the threshold").toMatch(/2 or more/);
    expect(TESTS.repeats.means, "the definition shows a passing example").toMatch(/letter/);
    expect(TESTS.repeats.means, "the definition shows a failing example").toMatch(/hammock/);
  });
});
