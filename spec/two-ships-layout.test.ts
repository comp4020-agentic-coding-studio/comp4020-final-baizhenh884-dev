import { describe, expect, inject, it } from "vitest";
import { measureIn, servedPage } from "./chrome";

// The two ships on GET / (docs/decisions/0003-settle-and-kept-ships.md),
// measured in headless Chrome from the served markup and stylesheet. Two
// halves, "what stands" and "what was kept", each with its sentence above
// its own house: side by side and equal on a desktop, stacked on a phone,
// and always on two clearly different grounds. The kept sentence is set as a
// sentence (legible on its ground, at a size near the live one, but never
// larger than it: the live sentence stays primary), and a gap is drawn as a
// visible blank, so a fresh kept ship reads as an empty sentence of ten gaps.
//
// The shared sentence may hold any state, so the gap check turns every kept
// word into a gap in the measured copy only (a gap is a ".w.gap" span with
// no word in it, as GET / serves one), never on the server.
//
// However long the live half's notes run (how-to, a settle trace naming many
// standing words, the Earlier link), each house stays directly under its
// own sentence on a desktop: the notes are lengthened in the measured copy
// only, the way a long trace lengthens them for a visitor.

const baseUrl = inject("baseUrl");

type Box = { left: number; top: number; right: number; bottom: number; width: number };
type Layout = {
  viewport: number;
  stands: Box; kept: Box;
  standsBg: string; keptBg: string; groundContrast: number;
  standsSentence: Box; standsHouse: Box; keptSentence: Box; keptHouse: Box;
  liveSize: number; keptSize: number; keptTextContrast: number;
  gaps: { width: number; ink: number }[];
  pointer: Box | null; pointerShown: boolean;
};

async function layout(size: [number, number], longNotes = false): Promise<Layout> {
  const doc = await servedPage(baseUrl);
  if (longNotes) {
    const how = doc.querySelector("#how");
    if (!how) throw new Error("GET / has no #how");
    for (let i = 0; i < 12; i++) how.append(doc.createElement("br"), doc.createTextNode(`“standing${i}” still stands, settled.`));
  }
  return (await measureIn(doc, `(async () => {
    await document.fonts.ready;
    const q = (s) => { const el = document.querySelector(s); if (!el) throw new Error('GET / has no ' + s); return el; };
    const box = (s) => { const r = q(s).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }; };
    const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
    // WCAG relative luminance and contrast, over the half's own ground
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const over = (c, ground) => { const [r, g, b, a = 1] = rgb(c); const [R, G, B] = rgb(ground); return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)]; };
    const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const bg = (s) => getComputedStyle(q(s)).backgroundColor;
    const standsBg = bg('.stands-half'), keptBg = bg('.kept-half');
    const keptSentence = q('.kept-sentence'), ks = getComputedStyle(keptSentence);
    const opacity = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
    const ink = (el, prop) => { const c = getComputedStyle(el)[prop]; const [r, g, b, a = 1] = rgb(c); return contrast(over('rgba(' + r + ',' + g + ',' + b + ',' + a * opacity(el) + ')', keptBg), rgb(keptBg)); };
    // every kept word as a gap, as GET / serves one: the empty ship's ten blanks
    for (const w of keptSentence.querySelectorAll('.w')) { w.classList.add('gap'); w.textContent = ''; }
    const gaps = [...keptSentence.querySelectorAll('.w.gap')].map((g) => {
      const s = getComputedStyle(g);
      return { width: g.getBoundingClientRect().width / parseFloat(ks.fontSize), ink: parseFloat(s.borderBottomWidth) > 0 ? ink(g, 'borderBottomColor') : 0 };
    });
    return {
      viewport: innerWidth,
      stands: box('.stands-half'), kept: box('.kept-half'),
      standsBg, keptBg, groundContrast: contrast(rgb(standsBg), rgb(keptBg)),
      standsSentence: box('.stands-half .sentence'), standsHouse: box('.stands-half #house'),
      keptSentence: box('.kept-half .kept-sentence'), keptHouse: box('.kept-half #house-kept'),
      liveSize: parseFloat(getComputedStyle(q('.stands-half .sentence')).fontSize), keptSize: parseFloat(ks.fontSize),
      keptTextContrast: ink(keptSentence, 'color'),
      gaps,
      // the stacked layout's line pointing down to the kept half
      pointer: document.querySelector('.stands-half .kept-pointer') ? box('.stands-half .kept-pointer') : null,
      pointerShown: !!document.querySelector('.stands-half .kept-pointer') && getComputedStyle(q('.stands-half .kept-pointer')).display !== 'none',
    };
  })()`, size)) as Layout;
}

function bothHalves(l: Layout): void {
  // two distinct grounds, at a glance
  expect(l.standsBg, "the two halves share one ground").not.toBe(l.keptBg);
  expect(l.groundContrast, "the two grounds are too close in tone to read as two objects").toBeGreaterThanOrEqual(3);
  // each sentence sits directly above its own house, inside its own half
  expect(l.standsSentence.bottom, "the live sentence isn't above its house").toBeLessThanOrEqual(l.standsHouse.top + 1);
  expect(l.keptSentence.bottom, "the kept sentence isn't above its house").toBeLessThanOrEqual(l.keptHouse.top + 1);
  for (const [name, inner, outer] of [["live sentence", l.standsSentence, l.stands], ["live house", l.standsHouse, l.stands], ["kept sentence", l.keptSentence, l.kept], ["kept house", l.keptHouse, l.kept]] as const) {
    expect(inner.left, `the ${name} spills out of its half`).toBeGreaterThanOrEqual(outer.left - 1);
    expect(inner.right, `the ${name} spills out of its half`).toBeLessThanOrEqual(outer.right + 1);
  }
  // the kept sentence is a sentence, legible on its ground, never a caption, and never larger than the live one
  expect(l.keptSize / l.liveSize, "the kept sentence is set as a small caption").toBeGreaterThanOrEqual(0.6);
  expect(l.keptSize, "the kept sentence outranks the live one").toBeLessThan(l.liveSize);
  expect(l.keptTextContrast, "the kept sentence isn't legible on its ground").toBeGreaterThanOrEqual(4.5);
  // an empty kept ship: ten blanks, each wide enough to read as a missing word, and drawn visibly
  expect(l.gaps).toHaveLength(10);
  for (const [i, g] of l.gaps.entries()) {
    expect(g.width, `gap ${i} is too narrow to read as a missing word`).toBeGreaterThanOrEqual(1.2);
    expect(g.ink, `gap ${i} isn't visible on the kept ground`).toBeGreaterThanOrEqual(3);
  }
}

describe("two ships on GET /", () => {
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1280×800", [1280, 800]]] as const) {
    it(`sets the two halves side by side and equal (${name})`, async () => {
      const l = await layout([size[0], size[1]]);
      expect(Math.abs(l.stands.top - l.kept.top), "the halves aren't side by side").toBeLessThan(2);
      expect(l.stands.right, "the live half isn't on the left").toBeLessThanOrEqual(l.kept.left + 1);
      expect(Math.abs(l.stands.width - l.kept.width) / l.viewport, "the halves aren't equal").toBeLessThan(0.02);
      expect(l.stands.width + l.kept.width, "the halves don't share the page").toBeGreaterThan(l.viewport * 0.98);
      expect(l.pointerShown, "the pointer to the kept half shows beside it").toBe(false);
      bothHalves(l);
    }, 90_000);

    it(`keeps each house directly under its sentence, however long the notes (${name})`, async () => {
      const l = await layout([size[0], size[1]], true);
      // directly under: at most a little air (the part notation's line, margins), never the notes
      const near = size[1] * 0.15;
      expect(l.standsHouse.top - l.standsSentence.bottom, "the live house is pushed away from its sentence").toBeLessThanOrEqual(near);
      expect(l.keptHouse.top - l.keptSentence.bottom, "the kept house is pushed away from its sentence").toBeLessThanOrEqual(near);
    }, 90_000);
  }

  it("stacks the halves on a phone (390×844)", async () => {
    const l = await layout([390, 844]);
    expect(l.kept.top, "the kept half isn't below the live one").toBeGreaterThanOrEqual(l.stands.bottom - 1);
    expect(l.stands.width, "the live half isn't full width").toBeGreaterThan(l.viewport * 0.98);
    expect(l.kept.width, "the kept half isn't full width").toBeGreaterThan(l.viewport * 0.98);
    // the kept half is far below the fold: a line in the live half says it's there
    expect(l.pointerShown, "the stacked layout has no line pointing to the kept half").toBe(true);
    expect(l.pointer!.bottom, "the pointer isn't in the live half").toBeLessThanOrEqual(l.stands.bottom);
    bothHalves(l);
  }, 90_000);
});
