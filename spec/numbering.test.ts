import { describe, expect, inject, it } from "vitest";
import { tagged } from "../src/lib/ship/tag";
import { PARTS } from "../src/lib/ship/rules";
import { measureIn, QUERY_JS, servedPage, stageWords } from "./chrome";

// The numbering. Every word of the live sentence carries its position and
// part, "01 · Ram", small above it, and every word or gap of the kept
// sentence its position, always, on a phone too. Like the part notation
// ("08 · Oars"), an index names a position: it's navigation, never a count.
// It's drawn, not read: assistive technology reads the sentences as their
// words, never the numbers or the part names. In the harbour, a tag with the
// part's number and name stands on the part of the pointed or chosen word
// only, never at rest and never on a phone (src/lib/ship/tag.ts).

const baseUrl = inject("baseUrl");
const LONG = ["potato", "every", "ceremony", "that", "students", "will", "tythbvgbv", "whether", "it", "peel"];
// descenders over every index below them: words that wrap line after line, each with a g, p or y low in it
// (one such word left in the shared sentence by another spec once found the clash at 1280)
const LOW = ["eligmvnuioene", "gypsy", "jumpy", "agapggypqyjgp", "pygmy", "yoga", "gappy", "puppy", "gyppy", "spy"];

type Index = { content: string; font: string; contrast: number; top: number; bottom: number; left: number; ownTop: number; overlaps: string[] };

describe("the numbering", () => {
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1280×800", [1280, 800]], ["phone 390×844", [390, 844]]] as const) {
    for (const [which, words] of [["the page's sentence", null], ["a long sentence", LONG], ["descenders over the indices", LOW]] as const) {
      it(`sets 01 to 10 above every live word and every kept word or gap, decorative, legible on its grid (${name}, ${which})`, async () => {
        const doc = await servedPage(baseUrl);
        if (words) stageWords(doc, [...words]);
        // the kept sentence with gaps and words both, as GET / serves them: alternate positions as gaps
        const kept = doc.querySelector(".kept-sentence")!;
        kept.querySelectorAll(".w").forEach((w, i) => {
          // a gap shows the word still standing there, as GET / serves it
          if (i % 2) { w.className = "w gap"; w.textContent = ["a", "that", "would", "if", "disappeared"][(i - 1) / 2]; } else if (!w.textContent) { w.className = "w"; w.textContent = "kept"; }
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
          const live = [...document.querySelectorAll('.sentence-strip .sentence .pos')];
          const liveLabels = live.map((p) => p.querySelector('label'));
          const keptWords = [...document.querySelectorAll('.kept-strip .kept-sentence .w')];
          return { live: live.map((p) => ({ ...index(p, '.sentence-strip', liveLabels), part: p.getAttribute('data-part') })), kept: keptWords.map((w) => index(w, '.kept-strip', keptWords)) };
        })()`, [size[0], size[1]])) as { live: (Index & { part: string | null })[]; kept: Index[] };
        // each live word's index names its part too, from the rule table's names
        m.live.forEach((x, i) => {
          expect(x.part, `live word ${i + 1} doesn't name its part`).toBe(PARTS[i][0].toUpperCase() + PARTS[i].slice(1));
          // Chrome reports attr() resolved: counter(word, decimal-leading-zero) " · Ram" / ""
          expect(x.content, `live word ${i + 1}'s index doesn't add its part`).toBe(`counter(word, decimal-leading-zero) " · ${x.part}" / ""`);
        });
        for (const [what, list] of [["live word", m.live], ["kept word or gap", m.kept]] as const) {
          expect(list, `not ten ${what}s`).toHaveLength(10);
          for (const [i, x] of list.entries()) {
            const at = `${what} ${i + 1}`;
            // the number, 01 to 10 in order, from the sentence's own counter; its alternative text empty, so it's never read
            expect(x.content, `${at} has no index`).toMatch(/^counter\(\w+, decimal-leading-zero\)( " · [^"]+")? \/ ""$/);
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

  // A gap's number and a word's number on the same line of the kept sentence stand level, one row of numbers
  // over the line (seen live: a gap's number sat down beside the next word's letters). The kept sentence has
  // gaps and words both, as GET / serves them: alternate positions as gaps, so every line mixes them.
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1440×900", [1440, 900]], ["1280×800", [1280, 800]], ["phone 390×844", [390, 844]]] as const) {
    it(`sets the kept sentence's numbers level along each line, gaps and words alike (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      const kept = doc.querySelector(".kept-sentence")!;
      kept.querySelectorAll(".w").forEach((w, i) => {
        if (i % 2) { w.className = "w gap"; w.textContent = ["a", "that", "would", "if", "disappeared"][(i - 1) / 2]; } else { w.className = "w"; w.textContent = ["Make", "website", "people", "miss", "it"][i / 2]; }
      });
      const rows = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        // each number's top, and its word's or gap's box (a gap's box is shorter than a word's on the same line)
        return [...document.querySelectorAll('.kept-strip .kept-sentence .w')].map((w) => {
          const r = w.getBoundingClientRect(), s = getComputedStyle(w, '::before');
          const top = s.top === 'auto' ? r.bottom - parseFloat(s.bottom) - parseFloat(s.height) : r.top + parseFloat(s.top);
          return { gap: w.classList.contains('gap'), top, boxTop: r.top, boxBottom: r.bottom };
        });
      })()`, [size[0], size[1]])) as { gap: boolean; top: number; boxTop: number; boxBottom: number }[];
      expect(rows, "not ten kept words or gaps").toHaveLength(10);
      // one line: boxes that overlap vertically (in reading order, a new line starts below the last one's box)
      const lines: (typeof rows)[] = [];
      for (const r of rows) {
        const last = lines.at(-1);
        if (last && r.boxTop < Math.max(...last.map((x) => x.boxBottom)) && r.boxBottom > Math.min(...last.map((x) => x.boxTop))) last.push(r);
        else lines.push([r]);
      }
      expect(lines.some((l) => l.some((x) => x.gap) && l.some((x) => !x.gap)), "no kept line holds both a gap and a word: nothing compared").toBe(true);
      for (const [n, items] of lines.entries()) {
        const tops = items.map((i) => i.top);
        expect(Math.max(...tops) - Math.min(...tops), `the numbers on kept line ${n + 1} aren't level: ${JSON.stringify(items.map((i) => [i.gap ? "gap" : "word", Math.round(i.top)]))}`).toBeLessThanOrEqual(1);
      }
    }, 90_000);
  }

  it("counts the indices from the sentence's own start, so they read 01 to 10 on both halves", async () => {
    const doc = await servedPage(baseUrl);
    const m = (await measureIn(doc, `(() => {
      const q = ${QUERY_JS};
      const s = (sel, pseudo) => getComputedStyle(q(sel), pseudo);
      return { liveReset: s('.sentence-strip .sentence').counterReset, liveStep: s('.sentence-strip .sentence .pos').counterIncrement,
        keptReset: s('.kept-strip .kept-sentence').counterReset, keptStep: s('.kept-strip .kept-sentence .w').counterIncrement };
    })()`, [1440, 900])) as Record<string, string>;
    const name = (v: string) => v.split(" ")[0];
    for (const [k, v] of Object.entries(m)) expect(v, `no counter: ${k}`).not.toBe("none");
    expect(name(m.liveStep), "the live words don't count themselves").toBe(name(m.liveReset));
    expect(name(m.keptStep), "the kept words don't count themselves").toBe(name(m.keptReset));
    expect(m.liveReset.split(" ")[1] ?? "0", "the live count doesn't start at 01").toBe("0");
    expect(m.keptReset.split(" ")[1] ?? "0", "the kept count doesn't start at 01").toBe("0");
  }, 60_000);

  // Which part carries the tag: the one a word is at work on (chosen, or being rebuilt), else the one pointed
  // at; none at rest.
  it("tags the pointed or chosen part only, never at rest", () => {
    const rest = { selected: null, held: false, hovered: null, rebuilding: null };
    expect(tagged(rest)).toBeNull();
    expect(tagged({ ...rest, hovered: 3 })).toBe(3);
    expect(tagged({ ...rest, selected: 5 })).toBe(5);
    expect(tagged({ ...rest, selected: 5, hovered: 2 }), "pointing elsewhere took the tag from the chosen word").toBe(5);
    expect(tagged({ ...rest, selected: 5, held: true, rebuilding: 5 })).toBe(5);
    expect(tagged({ ...rest, rebuilding: 7, hovered: 1 }), "the part being rebuilt isn't the one tagged").toBe(7);
  });

  // the tags are the harbour's own elements, one for each ship, decorative; a phone never shows them
  it("draws no tag on a phone, and a tag for each ship on a desktop", async () => {
    const doc = await servedPage(baseUrl);
    const tags = [...doc.querySelectorAll(".part-tag")];
    expect(tags.map((t) => t.getAttribute("data-ship")).sort(), "there isn't one tag for each ship").toEqual(["kept", "live"]);
    for (const t of tags) expect(t.getAttribute("aria-hidden"), "a tag is read").toBe("true");
    const show = `(() => { document.querySelectorAll('.part-tag').forEach((t) => { t.hidden = false; t.textContent = '08 · Oars'; }); return [...document.querySelectorAll('.part-tag')].some((t) => getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().width > 0); })()`;
    expect((await measureIn(doc, show, [390, 844])) as boolean, "a phone draws a part tag").toBe(false);
    expect((await measureIn(doc, show, [1440, 900])) as boolean, "a desktop draws no part tag").toBe(true);
  }, 60_000);
});
