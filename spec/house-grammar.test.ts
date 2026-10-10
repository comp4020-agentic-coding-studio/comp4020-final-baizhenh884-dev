import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeTerritory, reach, TERRITORIES } from "../src/lib/house/territories";

// The House's language → architecture grammar (CLAUDE.md "Scope (Final Project:
// House integration)"). Pure: no app state is read or changed, so it runs the
// same against any APP_URL.
//
// The fixture was generated once from Prototype 6's Model B `describe6`, the
// approved body-territory grammar (continuous length included), over the 325
// words of the prototype pool and a few extremes, at every position. Production
// must give exactly the same territory family, reach and feature levels.

type Row = [number, string, string, number, number, number, number, number, number, number, number];
const fixture = JSON.parse(readFileSync(new URL("./fixtures/house-descriptors.json", import.meta.url), "utf8")) as {
  rows: Row[];
};

describe("House grammar", () => {
  it("gives the ten positions their ten fixed territories, in order", () => {
    expect(TERRITORIES.map((t) => t.id)).toEqual([
      "ground",
      "frontLeft",
      "hall",
      "frontRight",
      "entry",
      "upperLeft",
      "roof",
      "upperRight",
      "side",
      "threshold",
    ]);
  });

  it("matches the approved Prototype 6 descriptors for every pool word at every position", () => {
    const wrong: string[] = [];
    for (const [position, word, family, R, len, open, mass, rep, tall, round, hang] of fixture.rows) {
      const d = describeTerritory(position, word);
      const got = [d.family, +d.reach.toFixed(4), d.levels.len, d.levels.open, d.levels.mass, d.levels.rep, d.levels.tall, d.levels.round, d.levels.hang];
      const want = [family, R, len, open, mass, rep, tall, round, hang];
      if (JSON.stringify(got) !== JSON.stringify(want)) wrong.push(`${position} ${word}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
    }
    expect(wrong.slice(0, 10), `${wrong.length} of ${fixture.rows.length} differ`).toEqual([]);
  });

  it("is deterministic: the same word at the same position always describes the same territory", () => {
    for (const word of ["Keep", "website", "incomprehensibilities", "a"]) {
      for (let position = 0; position < 10; position++) {
        expect(describeTerritory(position, word)).toEqual(describeTerritory(position, word));
      }
    }
  });

  it("reads only the written form: letter case and surrounding space change nothing", () => {
    expect(describeTerritory(2, "  Website ")).toEqual(describeTerritory(2, "website"));
  });

  it("lets longer words reach further, continuously, up to about 14 letters", () => {
    const at = (n: number) => reach("x".repeat(n));
    for (let n = 3; n < 14; n++) expect(at(n + 1), `${n + 1} letters reach no further than ${n}`).toBeGreaterThan(at(n));
    expect(at(7)).toBeLessThan(at(11));
    expect(at(14)).toBe(1);
    expect(at(21)).toBe(1);
  });
});
