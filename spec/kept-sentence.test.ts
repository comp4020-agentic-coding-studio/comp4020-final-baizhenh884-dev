import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderKeptSentence } from "../src/lib/kept-sentence";

// The kept sentence as a live page redraws it (index.astro's renderKept), in
// the same shape GET / serves (spec/kept-ship.test.ts): a word or an empty,
// drawn gap per position, each gap read to a screen reader as "blank", the
// full stop on the last word's line, and visitor words always as text.

const readable = (el: Element): string => {
  const walk = (n: Node): string =>
    n.nodeType === 3 ? n.textContent ?? "" : n.nodeType === 1 && (n as Element).getAttribute("aria-hidden") === "true" ? "" : [...n.childNodes].map(walk).join("");
  return walk(el).replace(/\s+/g, " ").trim();
};

describe("the kept sentence, redrawn live", () => {
  const doc = new JSDOM('<p class="kept-sentence"></p>').window.document;
  const el = doc.querySelector(".kept-sentence")!;

  it("reads as its words, a gap as 'blank', and draws a gap empty", () => {
    const words = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    const gaps = words.map((_, i) => i % 3 === 0);
    renderKeptSentence(el, { words, gaps });
    expect(readable(el)).toBe("blank two three blank five six blank eight nine blank.");
    const spans = [...el.querySelectorAll(".w")];
    expect(spans).toHaveLength(10);
    for (const [i, s] of spans.entries()) {
      expect(s.classList.contains("gap"), `position ${i} gap class`).toBe(gaps[i]);
      if (gaps[i]) expect(s.textContent, `gap ${i} holds visible text`).toBe("");
    }
    expect(el.querySelector(".end")?.textContent, "the full stop isn't on the last word's line").toMatch(/\.$/);
  });

  it("keeps a visitor's word as text", () => {
    const words = Array(10).fill("<b>x</b>");
    renderKeptSentence(el, { words, gaps: Array(10).fill(false) });
    expect(el.querySelector("b"), "a kept word became markup").toBeNull();
    expect(readable(el)).toContain("<b>x</b>");
  });
});
