import { describe, expect, inject, it } from "vitest";
import { measureIn, servedPage } from "./chrome";

// Choosing a word must give a field you can see and type into, in the word's
// own place, in every browser. jsdom has no layout, so this builds a page from
// the app's own markup and stylesheet and measures it in headless Chrome. The
// second run deletes the field-sizing rule, which is what a browser without
// that property (Safari, Firefox) is left with: a focused field that is
// focused and takes keystrokes, but is 0px wide, so the word just vanishes.
//
// Needs Chrome: set CHROME to its binary, or have google-chrome / chromium at
// the usual path. It fails, never skips, when there is none (spec/chrome.ts).

const baseUrl = inject("baseUrl");

type Measure = { i: number; label: number; field: number; formBefore: number[]; formAfter: number[]; clipped: boolean; focused: boolean; value: string; hit: number };

const DESKTOP: [number, number] = [1440, 900];
const PHONE: [number, number] = [390, 844];

async function measure(withoutFieldSizing: boolean, size: [number, number] = DESKTOP): Promise<Measure[]> {
  // the app's markup as served, with its own scripts left out so only the CSS is under test
  const doc = await servedPage(baseUrl);
  return (await measureIn(doc, `(async () => {
      await document.fonts.ready;
      // a browser without the property: its @supports blocks are false (dropped) and their "not" blocks true (applied)
      if (${withoutFieldSizing}) for (const s of document.styleSheets) for (let i = s.cssRules.length - 1; i >= 0; i--) {
        const r = s.cssRules[i];
        if (!(r instanceof CSSSupportsRule) || !/field-sizing/.test(r.conditionText)) continue;
        if (/^not/.test(r.conditionText)) [...r.cssRules].forEach((inner, k) => s.insertRule(inner.cssText, i + 1 + k));
        s.deleteRule(i);
      }
      const box = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10) / 10); };
      const out = [];
      for (const [i, input] of [...document.querySelectorAll('.sentence input[name="word"]')].entries()) {
        const form = input.closest("form"), label = form.querySelector("label");
        // the sentence may sit below the fold once other visitors have changed it: look at the word, then measure it in place
        label.scrollIntoView({ block: "center" });
        // what a tap on the middle of the word reaches: that word's own form, or whichever neighbour overlaps it
        const lr = label.getBoundingClientRect(), under = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2)?.closest("form");
        const hit = under ? [...document.querySelectorAll('.sentence form')].indexOf(under) : -1;
        input.value = ""; input.blur();
        const formBefore = box(form);
        input.focus({ preventScroll: true }); // layout is under test, not the page scrolling to a field
        const formAfter = box(form); // choosing moves nothing; what is then typed may grow the word
        input.value = "hello";
        out.push({ i, label: label.getBoundingClientRect().width, field: input.getBoundingClientRect().width, formBefore, formAfter,
          clipped: input.scrollWidth > input.clientWidth + 1, focused: document.activeElement === input, value: input.value, hit });
        input.value = ""; input.blur();
      }
      return out;
    })()`, size)) as Measure[];
}

describe("choosing a word", () => {
  for (const [name, without] of [["with field-sizing", false], ["without field-sizing (Safari, Firefox)", true]] as const) {
    it(`gives a visible field in the word's place ${name}`, async () => {
      const rows = await measure(without);
      expect(rows.length).toBe(10);
      for (const r of rows) {
        expect(r.focused, `word ${r.i} takes focus`).toBe(true);
        expect(r.value, `word ${r.i} takes typing`).toBe("hello");
        // visible: at least as wide as the word it replaces, never a zero-width field
        expect(r.field, `word ${r.i}: the field is as wide as its word`).toBeGreaterThanOrEqual(r.label - 0.5);
        expect(r.field, `word ${r.i}: the field has width`).toBeGreaterThan(8);
        // what is typed is not cut off
        expect(r.clipped, `word ${r.i}: typing "hello" is not clipped`).toBe(false);
        // choosing a word does not move it, or change its line's height
        expect(r.formAfter, `word ${r.i}: choosing it moves nothing`).toEqual(r.formBefore);
      }
    }, 90_000);
  }

  for (const [name, size] of [["desktop 1440×900", DESKTOP], ["phone 390×844", PHONE]] as const) {
    it(`reaches the word that was touched, not a neighbour (${name})`, async () => {
      const rows = await measure(false, size);
      expect(rows.length).toBe(10);
      // the middle of every word belongs to that word: neighbouring short words must not cover each other
      expect(rows.map((r) => r.hit)).toEqual(rows.map((r) => r.i));
    }, 90_000);
  }
});
