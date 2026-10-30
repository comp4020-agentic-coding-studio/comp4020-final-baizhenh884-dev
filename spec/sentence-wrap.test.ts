import { describe, expect, inject, it } from "vitest";
import { measureIn, servedPage } from "./chrome";

// The sentence's final full stop belongs to the sentence (CLAUDE.md): it is
// read as the end of the last word's line, never a dot alone on a line below
// it. Whether it wraps depends on the last word's width, so this measures
// GET /'s own markup and stylesheet in headless Chrome with the last word set
// to every valid length, 1 to 24 letters, wide and narrow, at desktop and phone widths. The
// word is changed only in the measured copy of the page, never on the server.

const baseUrl = inject("baseUrl");

type Row = { length: number; ch: string; sameLine: boolean; after: boolean };

async function fullStops(size: [number, number]): Promise<Row[]> {
  const doc = await servedPage(baseUrl);
  return (await measureIn(doc, `(async () => {
    await document.fonts.ready;
    const sentence = document.querySelector('.sentence');
    const labels = [...sentence.querySelectorAll('form[action="/replace"] label')];
    const last = labels[labels.length - 1];
    // the full stop: the last text in the sentence holding one, outside every word's form
    // (and outside anything else in a word's slot, such as a held draft's notice)
    const walker = document.createTreeWalker(sentence, NodeFilter.SHOW_TEXT);
    let stop = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.includes('.') && !n.parentElement.closest('form, .pos > :not(form)')) stop = n;
    if (!stop) throw new Error('no full stop in the sentence');
    const out = [];
    // every length, in a wide letter and a narrow one: a narrow short word is where the slot outgrows the word
    for (let length = 1; length <= 24; length++) for (const ch of ['w', 'i']) {
      last.textContent = ch.repeat(length);
      const range = document.createRange();
      const at = stop.data.indexOf('.');
      range.setStart(stop, at); range.setEnd(stop, at + 1);
      // the word's letters, not its label's box: a label fills its slot, which can be wider than the word (a
      // short word under its "10 · Pennant"), and the full stop was seen far from "peel" on the live page
      // while this check, measuring the box, passed
      const letters = document.createRange();
      letters.selectNodeContents(last);
      const dot = range.getBoundingClientRect(), word = letters.getBoundingClientRect();
      const mid = dot.top + dot.height / 2;
      out.push({ length, ch, sameLine: mid > word.top && mid < word.bottom, after: dot.left >= word.right - 1 && dot.left - word.right < 12 });
    }
    return out;
  })()`, size)) as Row[];
}

describe("the sentence's full stop", () => {
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1280×800", [1280, 800]], ["phone 390×844", [390, 844]]] as const) {
    it(`never wraps away from the last word (${name})`, async () => {
      const rows = await fullStops([size[0], size[1]]);
      expect(rows).toHaveLength(48);
      for (const r of rows) {
        expect(r.sameLine, `a last word of ${r.length} "${r.ch}": the full stop sits on its line`).toBe(true);
        expect(r.after, `a last word of ${r.length} "${r.ch}": the full stop follows it directly`).toBe(true);
      }
    }, 90_000);
  }
});
