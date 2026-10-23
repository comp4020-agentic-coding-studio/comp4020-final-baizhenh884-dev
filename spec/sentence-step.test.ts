import { describe, expect, it } from "vitest";
import { SIZE_STEPS, sizeStep } from "../src/lib/sentence-step";
import { SENTENCES } from "./house-sentences";

// The live sentence's size step (docs: CLAUDE.md "Current design"): on a
// desktop it steps down through a few fixed sizes, never a continuous one, so
// a long sentence stays on two lines, and the server and the live client pick
// the step from this one function of the words alone. Pure.
//
// The browser side (two lines at 1280, 1440 and 1920; the floor still larger
// than the kept sentence) is in spec/two-ships-layout.test.ts, and the rule
// that a step never changes under someone with a word in hand is in
// spec/live-client.test.ts.

describe("the live sentence's size step", () => {
  it("is a few fixed steps, largest first, the smallest no less than 0.8", () => {
    expect(SIZE_STEPS.length).toBeGreaterThanOrEqual(2);
    expect(SIZE_STEPS.length).toBeLessThanOrEqual(5);
    expect(SIZE_STEPS[0]).toBe(1);
    for (let i = 1; i < SIZE_STEPS.length; i++) expect(SIZE_STEPS[i]).toBeLessThan(SIZE_STEPS[i - 1]);
    expect(SIZE_STEPS.at(-1)).toBeGreaterThanOrEqual(0.8);
  });

  it("is a whole step index, the same every time for the same words", () => {
    for (const words of SENTENCES.slice(0, 100)) {
      const s = sizeStep(words);
      expect(Number.isInteger(s) && s >= 0 && s < SIZE_STEPS.length).toBe(true);
      expect(sizeStep([...words])).toBe(s);
    }
  });

  it("keeps a short sentence at full size", () => {
    expect(sizeStep("Make a website that people would miss if it disappeared".split(" "))).toBe(0);
  });

  it("steps down for a longer sentence, and never steps up for a longer one", () => {
    expect(sizeStep("potato every ceremony that students will tythbvgbv whether it peel".split(" "))).toBeGreaterThan(0);
    const base = "potato every ceremony that students will tythbvgbv whether it peel".split(" ");
    for (let i = 0; i < 10; i++) {
      const longer = base.map((w, j) => (j === i ? w + "ing" : w));
      expect(sizeStep(longer), `adding letters to word ${i + 1} made it larger`).toBeGreaterThanOrEqual(sizeStep(base));
    }
  });

  // at the smallest step some sentences can't fit two lines: ten 24-letter words
  // wrap past two lines at the floor, and the step stays at the floor (never smaller)
  it("stops at the floor for a sentence that can't fit two lines at any step", () => {
    expect(sizeStep(Array(10).fill("w".repeat(24)))).toBe(SIZE_STEPS.length - 1);
    expect(sizeStep(Array(10).fill("incomprehensibilities"))).toBe(SIZE_STEPS.length - 1);
  });
});
