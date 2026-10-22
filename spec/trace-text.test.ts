import { describe, expect, it } from "vitest";
import { latestParts } from "../src/lib/trace-text";

// The trace's eligibility sentence under rule mode `settle` names the place
// the visitor can't act at by its number, as the sentence's own notation does
// ("01"), never by the part of the house it builds; and its tense follows the
// word: "stands" while it stands, "stood" once it's been replaced. Pure:
// changes nothing.

describe("the trace's eligibility sentence", () => {
  it("names the place by number, in the present while the word stands", () => {
    const parts = latestParts({ position: 0, word: "ship", standing: true, settled: true });
    expect(parts.eligibility).toBe("You can act again, anywhere but place 01, where it stands.");
  });

  it("says where it stood once the word has been replaced", () => {
    const parts = latestParts({ position: 0, word: "ship", standing: false, now: "boat", kept: "shown" });
    expect(parts.eligibility).toBe("You can act again, anywhere but place 01, where it stood.");
  });

  it("pads every place to two digits, up to 10", () => {
    expect(latestParts({ position: 4, word: "ship", standing: true, settled: true }).eligibility).toContain("place 05,");
    expect(latestParts({ position: 9, word: "ship", standing: false, now: "boat", kept: "later" }).eligibility).toContain("place 10,");
  });

  it("never names a part of the house", () => {
    for (let position = 0; position < 10; position++) {
      const { eligibility } = latestParts({ position, word: "ship", standing: true, settled: true });
      expect(eligibility).not.toMatch(/ground|mass|hall|entry|volume|roof|threshold/);
    }
  });
});
