import { describe, expect, inject, it } from "vitest";
import { tagged } from "../src/lib/house/thread";
import { measureIn, QUERY_JS, servedPage, stageWords } from "./chrome";

// The drawing sheet's numbering. Every word of the live sentence and every
// word or gap of the kept sentence carries its position, 01 to 10, small
// above it, always, on a phone too. Like the part notation ("05 — entry"),
// an index names a position: it's navigation, never a count. It's drawn, not
// read: assistive technology reads the sentences as their words (and a gap as
// "blank"), never the numbers. On the live house, a numbered tag stands on
// the territory of the pointed or chosen word only, never at rest and never
// on a phone (src/lib/house/thread.ts).

const baseUrl = inject("baseUrl");
const LONG = ["potato", "every", "ceremony", "that", "students", "will", "tythbvgbv", "whether", "it", "peel"];

type Index = { content: string; font: string; contrast: number; top: number; bottom: number; left: number; ownTop: number; overlaps: string[] };

describe("the numbering", () => {
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1280×800", [1280, 800]], ["phone 390×844", [390, 844]]] as const) {
    for (const [which, words] of [["the page's sentence", null], ["a long sentence", LONG]] as const) {
      it(`sets 01 to 10 above every live word and every kept word or gap, decorative, legible on its grid (${name}, ${which})`, async () => {
        const doc = await servedPage(baseUrl);
        if (words) stageWords(doc, [...words]);
        // the kept sentence with gaps and words both, as GET / serves them: alternate positions as gaps
        const kept = doc.querySelector(".kept-sentence")!;
        kept.querySelectorAll(".w").forEach((w, i) => {
          if (i % 2) { w.className = "w gap"; w.textContent = ""; } else if (!w.textContent) { w.className = "w"; w.textContent = "kept"; }
        });
        const m = (await measureIn(doc, `(async () => {
          await document.fonts.ready;
          const q = ${QUERY_JS};
          const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
          const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
          const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, s) => s - p); return (x + 0.05) / (y + 0.05); };
          const over = ([r, g, b, a = 1], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
          const ground = (half) => { const s = getComputedStyle(q(half)), flat = rgb(s.backgroundColor), line = (s.backgroundImage.match(/rgba?\\([^)]*\\)/) || [null])[0]; return [flat, line ? over(rgb(line), flat) : flat]; };
          // a word's ink: its letters' own top and bottom (ascenders and descenders included), from the font's
          // metrics on its own line box, not the line box itself, whose leading would hide a clash
          const ctx = document.createElement('canvas').getContext('2d');
          const ink = (w) => {
            const b = w.getBoundingClientRect(), text = w.textContent.trim();
            if (!text) return { left: b.left, right: b.right, top: b.bottom - 2, bottom: b.bottom }; // a gap: its drawn line
            const s = getComputedStyle(w);
            ctx.font = s.fontStyle + ' ' + s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
            const m = ctx.measureText(text), lh = parseFloat(s.lineHeight) || b.height;
            // from the content box: a word may keep room above its letters (padding) for its index
            const baseline = b.top + parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth) + (lh - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
            return { left: b.left, right: b.right, top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent };
          };
          // an index is its element's ::before, laid out against the element's own box
          const index = (el, half, words) => {
            const s = getComputedStyle(el, '::before'), r = el.getBoundingClientRect();
            const top = r.top + parseFloat(s.top), left = r.left + parseFloat(s.left), height = parseFloat(s.height);
            const [flat, line] = ground(half), fg = over(rgb(s.color), flat);
            const box = { top, bottom: top + height, left, right: left + parseFloat(s.width) };
            // the words this index would sit on, its own included: any word's letters it crosses, with 1px clear
            const overlaps = words.map((w) => [w, ink(w)])
              .filter(([, b]) => b.right > b.left && box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top - 1)
              .map(([w]) => w.textContent.trim() || 'gap');
            // its own word's letters (a gap: its drawn line)
            const own = ink(el.querySelector('label') || el);
            return { content: s.content, font: s.fontFamily, contrast: Math.min(ratio(fg, flat), ratio(fg, line)), top, bottom: box.bottom, left, ownTop: own.top, overlaps };
          };
          const live = [...document.querySelectorAll('.stands-half .sentence .pos')];
          const liveLabels = live.map((p) => p.querySelector('label'));
          const keptWords = [...document.querySelectorAll('.kept-half .kept-sentence .w')];
          return { live: live.map((p) => index(p, '.stands-half', liveLabels)), kept: keptWords.map((w) => index(w, '.kept-half', keptWords)) };
        })()`, [size[0], size[1]])) as { live: Index[]; kept: Index[] };
        for (const [what, list] of [["live word", m.live], ["kept word or gap", m.kept]] as const) {
          expect(list, `not ten ${what}s`).toHaveLength(10);
          for (const [i, x] of list.entries()) {
            const at = `${what} ${i + 1}`;
            // the number, 01 to 10 in order, from the sentence's own counter; its alternative text empty, so it's never read
            expect(x.content, `${at} has no index`).toMatch(/^counter\(\w+, decimal-leading-zero\) \/ ""$/);
            expect(x.font, `${at}'s index isn't in Plex Mono`).toMatch(/IBM Plex Mono/);
            expect(x.contrast, `${at}'s index is too faint on its grid`).toBeGreaterThanOrEqual(4.5);
            // over its own word: wholly above its letters (or a gap's line)
            expect(x.bottom, `${at}'s index isn't above its word`).toBeLessThanOrEqual(x.ownTop);
            expect(x.top, `${at}'s index runs off the top of the page`).toBeGreaterThanOrEqual(0);
            expect(x.overlaps, `${at}'s index sits on another word`).toEqual([]);
          }
        }
      }, 90_000);
    }
  }

  it("counts the indices from the sentence's own start, so they read 01 to 10 on both halves", async () => {
    const doc = await servedPage(baseUrl);
    const m = (await measureIn(doc, `(() => {
      const q = ${QUERY_JS};
      const s = (sel, pseudo) => getComputedStyle(q(sel), pseudo);
      return { liveReset: s('.stands-half .sentence').counterReset, liveStep: s('.stands-half .sentence .pos').counterIncrement,
        keptReset: s('.kept-half .kept-sentence').counterReset, keptStep: s('.kept-half .kept-sentence .w').counterIncrement };
    })()`, [1440, 900])) as Record<string, string>;
    const name = (v: string) => v.split(" ")[0];
    for (const [k, v] of Object.entries(m)) expect(v, `no counter: ${k}`).not.toBe("none");
    expect(name(m.liveStep), "the live words don't count themselves").toBe(name(m.liveReset));
    expect(name(m.keptStep), "the kept words don't count themselves").toBe(name(m.keptReset));
    expect(m.liveReset.split(" ")[1] ?? "0", "the live count doesn't start at 01").toBe("0");
    expect(m.keptReset.split(" ")[1] ?? "0", "the kept count doesn't start at 01").toBe("0");
  }, 60_000);

  // Which territory carries the numbered tag: the one a word is at work on (chosen, or being rebuilt),
  // else the one pointed at; none at rest. Where the line is drawn, the tag is its end.
  it("tags the pointed or chosen territory only, never at rest", () => {
    const rest = { selected: null, held: false, hovered: null, rebuilding: null };
    expect(tagged(rest)).toBeNull();
    expect(tagged({ ...rest, hovered: 3 })).toBe(3);
    expect(tagged({ ...rest, selected: 5 })).toBe(5);
    expect(tagged({ ...rest, selected: 5, hovered: 2 }), "pointing elsewhere took the tag from the chosen word").toBe(5);
    expect(tagged({ ...rest, selected: 5, held: true, rebuilding: 5 })).toBe(5);
    expect(tagged({ ...rest, rebuilding: 7, hovered: 1 }), "the part being rebuilt isn't the one tagged").toBe(7);
  });

  it("draws no tag on a phone", async () => {
    const doc = await servedPage(baseUrl);
    const shown = (await measureIn(doc, `(() => { const t = document.querySelector('#thread .tag'); return !!t && getComputedStyle(document.querySelector('#thread')).display !== 'none'; })()`, [390, 844])) as boolean;
    expect(shown, "a phone draws the house's numbered tag").toBe(false);
    const desk = (await measureIn(doc, `(() => !!document.querySelector('#thread .tag text'))()`, [1440, 900])) as boolean;
    expect(desk, "the desktop thread has no numbered tag").toBe(true);
  }, 60_000);
});
