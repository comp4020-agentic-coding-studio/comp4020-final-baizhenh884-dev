import { describe, expect, it } from "vitest";
import { SIZE_STEPS, sizeStep } from "../src/lib/sentence-step";
import { SENTENCES } from "./ship-sentences";

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

// Which word's "01·Ram" rises to a second row (the maker, 30 October): a label wider than its word and the space
// after it would push the next word away, so it rises to the upper row; a label that fits stays down. Raised
// labels side by side may only rise together if the first ends before the second begins; where a label fits on
// neither row (two very short words in a row), its word is given just the room its label needs ("room"), so no
// two labels ever meet. One pure function of the words, the server's and the live client's alike. Whether the
// result reads cleanly, with normal spacing and no label touching another, is measured in Chrome
// (spec/harbour-layout.test.ts, spec/numbering.test.ts).
import { labelRows } from "../src/lib/sentence-step";

describe("which labels rise to a second row", () => {
  const maker = "Make a website that people would miss if it disappeared".split(" ");
  it("gives each word a row (1, 2, or 1 with room for its label), the same every time for the same words", () => {
    for (const layout of ["desktop", "phone"] as const) for (const words of [maker, ...SENTENCES.slice(0, 100)]) {
      const r = labelRows(words, layout);
      expect(r).toHaveLength(10);
      expect(r.every((x) => x === 1 || x === 2 || x === "room")).toBe(true);
      expect(labelRows([...words], layout)).toEqual(r);
    }
  });

  it("keeps every label down over long words", () => {
    expect(labelRows(Array(10).fill("wordmvadgycfe"), "desktop")).toEqual(Array(10).fill(1));
  });

  it("raises a label over a word too short for it", () => {
    const words = ["harbour", "a", "ceremony", "this", "students", "will", "wonder", "whether", "it", "sail"];
    for (const layout of ["desktop", "phone"] as const) {
      const r = labelRows(words, layout);
      expect(r[1], `"a" under 02·Hull doesn't rise (${layout})`).toBe(2);
      expect(r[8], `"it" under 09·Rudder doesn't rise (${layout})`).toBe(2);
    }
  });

  // two short words in a row ("if it" under 08·Oars and 09·Rudder, as on the page; "a it"): a label too wide for
  // its word is never left down over it (seen in Chrome: "09·Rudder" over "it" ran into "10·Pennant"), and two
  // raised labels side by side never both rise; the second gets room instead
  it("never leaves a label down over a word too short for it, nor two raised side by side", () => {
    for (const layout of ["desktop", "phone"] as const) {
      const r = labelRows(maker, layout);
      expect(r[8], `"it" under 09·Rudder is left down (${layout})`).not.toBe(1);
      expect([r[7], r[8]], `"if it" both rise (${layout})`).not.toEqual([2, 2]);
      const t = labelRows(["harbour", "a", "it", "ceremony", "students", "will", "wonder", "whether", "shore", "sail"], layout);
      expect(t[2], `"it" after "a" is left down (${layout})`).not.toBe(1);
      expect([t[1], t[2]], `"a it" both rise (${layout})`).not.toEqual([2, 2]);
    }
  });
});
