import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderKeptSentence, renderWaiting } from "../src/lib/kept-sentence";

// The kept sentence as a live page redraws it (index.astro's renderKept), in
// the same shape GET / serves (spec/kept-ship.test.ts): a kept word, or at a
// gap the word still standing there, drawn faint (spec/two-ships-layout.test.ts)
// and read to a screen reader as "still standing: <word>"; the full stop on
// the last word's line, and visitor words always as text. A gap used to be an
// empty underline read as "blank": at the 28 October playtest it was taken
// for a fill-in-the-blank quiz.

const readable = (el: Element): string => {
  const walk = (n: Node): string =>
    n.nodeType === 3 ? n.textContent ?? "" : n.nodeType === 1 && (n as Element).getAttribute("aria-hidden") === "true" ? "" : [...n.childNodes].map(walk).join("");
  return walk(el).replace(/\s+/g, " ").trim();
};

describe("the kept sentence, redrawn live", () => {
  const doc = new JSDOM('<p class="kept-sentence"></p>').window.document;
  const el = doc.querySelector(".kept-sentence")!;

  it("reads as its words, a gap as 'still standing: <word>', and draws a gap as the word still standing", () => {
    const words = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    const gaps = words.map((_, i) => i % 3 === 0);
    renderKeptSentence(el, { words, gaps, next: Array(10).fill(null) });
    expect(readable(el)).toBe("still standing: one two three still standing: four five six still standing: seven eight nine still standing: ten.");
    const spans = [...el.querySelectorAll(".w")];
    expect(spans).toHaveLength(10);
    for (const [i, s] of spans.entries()) {
      expect(s.classList.contains("gap"), `position ${i} gap class`).toBe(gaps[i]);
      // a gap shows the word still standing at its position, as text
      if (gaps[i]) expect(s.textContent, `gap ${i} doesn't show the word still standing`).toBe(words[i]);
    }
    expect(el.querySelector(".end")?.textContent, "the full stop isn't on the last word's line").toMatch(/\.$/);
  });

  it("keeps a visitor's word as text", () => {
    const words = Array(10).fill("<b>x</b>");
    renderKeptSentence(el, { words, gaps: Array(10).fill(false), next: Array(10).fill(null) });
    expect(el.querySelector("b"), "a kept word became markup").toBeNull();
    expect(readable(el)).toContain("<b>x</b>");
  });
});

// The waiting row under the kept house (decided 29 October): the next house's
// words, in place order, each with its 01–10 index (drawn, like the kept
// sentence's), as real text read after the kept sentence. No count anywhere.
// Empty, it's hidden: nothing waits.
describe("the waiting row, redrawn live", () => {
  const doc = new JSDOM('<p class="waiting" hidden><span class="label">Waiting for the next house:</span> <span class="ws"></span></p>').window.document;
  const row = doc.querySelector<HTMLElement>(".waiting")!;
  const next = (at: Record<number, string>) => Array.from({ length: 10 }, (_, i) => at[i] ?? null);

  it("lists the waiting words in place order, each named by its place, and reads as plain words", () => {
    renderWaiting(row, next({ 6: "wonder", 2: "ceremony", 4: "students" }));
    expect(row.hidden).toBe(false);
    const ws = [...row.querySelectorAll(".ws .w")];
    expect(ws.map((w) => w.textContent)).toEqual(["ceremony", "students", "wonder"]);
    expect(ws.map((w) => w.getAttribute("data-n"))).toEqual(["03", "05", "07"]);
    expect(readable(row)).toBe("Waiting for the next house: ceremony students wonder");
    expect(readable(row), "the row counts").not.toMatch(/\d/);
  });

  it("hides when nothing waits", () => {
    renderWaiting(row, next({}));
    expect(row.hidden).toBe(true);
    expect(row.querySelectorAll(".ws .w")).toHaveLength(0);
  });

  it("keeps a visitor's word as text", () => {
    renderWaiting(row, next({ 0: "<b>x</b>" }));
    expect(row.querySelector("b"), "a waiting word became markup").toBeNull();
    expect(readable(row)).toContain("<b>x</b>");
  });
});
