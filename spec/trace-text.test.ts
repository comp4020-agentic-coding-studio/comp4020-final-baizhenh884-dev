import { describe, expect, it } from "vitest";
import { latestParts, standingLine } from "../src/lib/trace-text";

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

  // The hold, said only when it applies (the maker, 31 October): the rule paragraph no longer explains holding to
  // everyone, so a holding word's own line says what the hold is: how long, and where the next word may go.
  // naming the word once (the maker, 31 October), in the one line GET / and the live page both show
  it("says, while the word holds the place, how long the hold is and that the next word goes elsewhere, naming the word once", () => {
    const parts = latestParts({ position: 2, word: "rudderless", standing: true, settled: false, settlesInMs: 9000 }, "20 seconds");
    expect(standingLine(parts)).toBe("Your word “rudderless” still stands, marked above. Until it's replaced or has stood 20 seconds, you can't make another; then your next word goes somewhere else.");
  });

  it("keeps a settled word's line as it was", () => {
    const parts = latestParts({ position: 0, word: "ship", standing: true, settled: true });
    expect(standingLine(parts)).toBe("Your word “ship” still stands, marked in the sentence above. You can act again, anywhere but place 01, where it stands.");
  });

  it("never names a part of the house", () => {
    for (let position = 0; position < 10; position++) {
      const { eligibility } = latestParts({ position, word: "ship", standing: true, settled: true });
      expect(eligibility).not.toMatch(/ground|mass|hall|entry|volume|roof|threshold/);
    }
  });
});
