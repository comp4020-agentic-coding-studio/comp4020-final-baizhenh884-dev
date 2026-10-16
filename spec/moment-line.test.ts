import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, inject, it } from "vitest";
import { measureIn, servedPage } from "./chrome";

// Ship 1's one loud line (docs/decisions/0003, Slice 5) and the phone
// pointer's acknowledgement, measured in headless Chrome on GET /'s served
// markup and stylesheet, with the page's own moment code
// (src/lib/moment-line.ts, standalone) run in it:
//   - while the line is up, its box overlaps no live sentence word, at both
//     marking viewports, as served and with every word long; the halves are
//     veiled behind it (not red), and it wraps balanced
//   - the veil goes when the line goes
//   - on a phone, a crossing or ship 1's completion makes the pointer to the
//     kept half acknowledge it for a moment, quietly (not red), then return
// The words are changed only in the measured copy, never on the server.

const baseUrl = inject("baseUrl");
const momentCode = ts.transpileModule(readFileSync(new URL("../src/lib/moment-line.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/^export /gm, "");

async function page(longWords: boolean): Promise<Document> {
  const doc = await servedPage(baseUrl);
  if (longWords) for (const l of doc.querySelectorAll('.sentence form[action="/replace"] label')) l.textContent = "wordmvadgycfe"; // ten 13-letter words
  const script = doc.createElement("script");
  script.textContent = momentCode;
  doc.head.append(script);
  return doc;
}

type Box = { left: number; top: number; right: number; bottom: number };
type Line = { line: Box; words: (Box & { text: string })[]; viewport: [number, number]; wrap: string; veil: number[]; veilAfter: number[]; red: boolean; gone: boolean };

const lineIn = async (size: [number, number], longWords: boolean) =>
  (await measureIn(await page(longWords), `(async () => {
    await document.fonts.ready;
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    const line = showMomentLine(document, false, 1500);
    await new Promise((r) => setTimeout(r, 900)); // the line and its veil have faded in
    const words = [...document.querySelectorAll('.sentence form[action="/replace"] label')].map((l) => ({ ...box(l), text: l.textContent }));
    const veilOf = () => [...document.querySelectorAll('.half')].map((h) => Number(getComputedStyle(h, '::after').opacity));
    const veil = veilOf(), rgb = getComputedStyle(line).color.match(/[\\d.]+/g).map(Number);
    const out = { line: box(line), words, viewport: [innerWidth, innerHeight], wrap: getComputedStyle(line).textWrap ?? getComputedStyle(line).textWrapStyle,
      veil, red: rgb[0] > 150 && rgb[1] < 90 && rgb[2] < 90 };
    await new Promise((r) => setTimeout(r, 2500)); // past its time, and its fade out
    return { ...out, veilAfter: veilOf(), gone: !document.querySelector('.moment') };
  })()`, size)) as Line;

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe("ship 1's loud line", () => {
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["phone 390×844", [390, 844]]] as const) {
    for (const longWords of [false, true]) {
      it(`overlaps no live sentence word while it's up (${name}${longWords ? ", every word long" : ""})`, async () => {
        const l = await lineIn([size[0], size[1]], longWords);
        expect(l.words).toHaveLength(10);
        for (const w of l.words) if (w.bottom > 0 && w.top < size[1]) expect(overlaps(l.line, w), `the line sits over "${w.text}"`).toBe(false);
        expect(l.line.top, "the line starts above the screen").toBeGreaterThanOrEqual(0);
        expect(l.line.bottom, "the line runs below the screen").toBeLessThanOrEqual(size[1]);
        expect(l.wrap, "the line doesn't wrap balanced").toMatch(/balance/);
        expect(l.red, "the line is red").toBe(false);
        // both halves recede behind it, and come back when it goes
        for (const v of l.veil) expect(v, "a half isn't veiled behind the line").toBeGreaterThan(0.5);
        for (const v of l.veilAfter) expect(v, "the veil outlived the line").toBe(0);
        expect(l.gone, "the line outlived its time").toBe(true);
      }, 90_000);
    }
  }
});

describe("the phone pointer to the kept half", () => {
  it("acknowledges a crossing or ship 1's completion for a moment, quietly, then returns (390×844)", async () => {
    const r = (await measureIn(await page(false), `(async () => {
      await document.fonts.ready;
      const p = document.querySelector('.stands-half .kept-pointer');
      const before = p.textContent, soft = getComputedStyle(p).color;
      const out = [];
      for (const kind of ["cross", "first"]) {
        acknowledgeBelow(document, kind, false, 600);
        await new Promise((r) => setTimeout(r, 200));
        const rgb = getComputedStyle(p).color.match(/[\\d.]+/g).map(Number);
        out.push({ kind, during: p.textContent, shown: getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0,
          changedColour: getComputedStyle(p).color !== soft, red: rgb[0] > 150 && rgb[1] < 90 && rgb[2] < 90 });
        await new Promise((r) => setTimeout(r, 1400));
        out[out.length - 1].after = p.textContent;
      }
      return { before, out };
    })()`, [390, 844])) as { before: string; out: { kind: string; during: string; after: string; shown: boolean; changedColour: boolean; red: boolean }[] };
    for (const o of r.out) {
      expect(o.shown, `${o.kind}: the pointer isn't shown`).toBe(true);
      expect(o.during, `${o.kind}: the pointer didn't acknowledge it`).not.toBe(r.before);
      expect(o.red, `${o.kind}: the acknowledgement is red`).toBe(false);
      expect(o.after, `${o.kind}: the pointer didn't return`).toBe(r.before);
    }
    expect(r.out[0].during, "a crossing and ship 1's completion read the same").not.toBe(r.out[1].during);
  }, 90_000);
});
