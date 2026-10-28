import { readFileSync } from "node:fs";
import * as THREE from "three";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { buildBody } from "../src/lib/house/build";
import { place } from "../src/lib/house/camera";
import { drafting, notation as notation_, showDrafting } from "../src/lib/house/notation";
import { TERRITORIES } from "../src/lib/house/territories";
import { measureIn, QUERY_JS, servedPage, stageWords } from "./chrome";
import { EXTREMES, SENTENCES } from "./house-sentences";
import { SIZE_STEPS, sizeStep } from "../src/lib/sentence-step";

// The two ships on GET / (docs/decisions/0003-settle-and-kept-ships.md),
// measured in headless Chrome from the served markup and stylesheet. Two
// halves, "what stands" and "what was kept", each with its sentence above
// its own house: side by side and equal on a desktop, stacked on a phone,
// and always on two clearly different grounds. The kept sentence is set as a
// sentence (legible on its ground, at a size near the live one, but never
// larger than it: the live sentence stays primary). A gap shows the word
// still standing at its position, faint, with a second cue that isn't
// lightness (a dashed underline): legible as text (4.5:1 on its grid, like
// any text), and clearly fainter than a kept word (a ceiling). It used to be
// an empty underline, read at the 28 October playtest as a fill-in-the-blank
// quiz. A line under the kept half's label says what the sentence is.
//
// The shared sentence may hold any state, so the gap checks stage the kept
// sentence in the measured copy only (a gap is a ".w.gap" span holding the
// word still standing, as GET / serves one), never on the server.
//
// However long the live half's notes run (how-to, a settle trace naming many
// standing words, the Earlier link), each house stays directly under its
// own sentence on a desktop: the notes are lengthened in the measured copy
// only, the way a long trace lengthens them for a visitor.

const baseUrl = inject("baseUrl");

type Box = { left: number; top: number; right: number; bottom: number; width: number };
type Layout = {
  viewport: number;
  // what the page was measured at: so a failure says what Chrome actually laid out
  context: { innerWidth: number; innerHeight: number; fonts: string; fontsLoaded: number };
  stands: Box; kept: Box;
  standsBg: string; keptBg: string; groundContrast: number;
  standsSentence: Box; standsHouse: Box; keptSentence: Box; keptHouse: Box;
  liveSize: number; keptSize: number; keptTextContrast: number;
  gaps: { text: string; contrast: number; cue: string; cueInk: number }[]; keptWords: number[];
  note: { text: string; contrast: number; size: number; underSentence: boolean; right: number; hidden: boolean; lines: number; frameRight: number } | null;
  pointer: Box | null; pointerShown: boolean;
  // the question band above both halves: its question, and its steps while it's in full
  question: Box; steps: Box | null;
  // each live word, and the text shown under it in its slot (outside its form), if any
  slots: { word: string; under: string[] }[];
};

async function layout(size: [number, number], longNotes = false, longWords: boolean | string[] = false, folded = false): Promise<Layout> {
  const doc = await servedPage(baseUrl);
  // a staged long sentence, in the measured copy only: ten 13-letter words, or the words given
  if (longWords) stageWords(doc, longWords === true ? Array(10).fill("wordmvadgycfe") : longWords);
  // the band as GET / folds it for a visitor who has made a change (spec/question-band.test.ts)
  if (folded) {
    const band = doc.querySelector("#question");
    if (!band) throw new Error("GET / has no #question");
    band.querySelector(".ship")?.remove();
    band.querySelector(".how")?.remove();
    band.classList.add("folded");
  }
  if (longNotes) {
    const how = doc.querySelector("#how");
    if (!how) throw new Error("GET / has no #how");
    for (let i = 0; i < 12; i++) how.append(doc.createElement("br"), doc.createTextNode(`“standing${i}” still stands, settled.`));
  }
  return (await measureIn(doc, `(async () => {
    await document.fonts.ready;
    const q = ${QUERY_JS};
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
    // the kept sentence as GET / serves one part-built: even positions kept, odd ones gaps showing the word still standing
    const standing = [...document.querySelectorAll('.stands-half .sentence label')].map((l) => l.textContent.trim());
    keptSentence.querySelectorAll('.w').forEach((w, i) => {
      if (i % 2) { w.className = 'w gap'; w.textContent = standing[i]; } else { w.className = 'w'; w.textContent = 'kept' + i; }
    });
    // a text's contrast at the worst point of its ground (a grid line over the flat colour)
    const kh = getComputedStyle(q('.kept-half')), gridLine = (kh.backgroundImage.match(/rgba?\([^)]*\)/) || [null])[0];
    const flat = rgb(keptBg), grid = gridLine ? over(gridLine, keptBg) : flat;
    const onGround = (el, prop) => { const c = getComputedStyle(el)[prop]; const [r, g, b, a = 1] = rgb(c); const fg = over('rgba(' + r + ',' + g + ',' + b + ',' + a * opacity(el) + ')', keptBg);
      return Math.min(contrast(fg, flat), contrast(fg, grid)); };
    const words = [...keptSentence.querySelectorAll('.w:not(.gap)')].map((w) => onGround(w, 'color'));
    const gaps = [...keptSentence.querySelectorAll('.w.gap')].map((g) => {
      const s = getComputedStyle(g);
      return { text: g.textContent, contrast: onGround(g, 'color'), cue: s.textDecorationLine.includes('underline') ? s.textDecorationStyle : (parseFloat(s.borderBottomWidth) > 0 ? s.borderBottomStyle : 'none'),
        cueInk: s.textDecorationLine.includes('underline') ? ink(g, 'textDecorationColor') : (parseFloat(s.borderBottomWidth) > 0 ? ink(g, 'borderBottomColor') : 0) };
    });
    const note = document.querySelector('.kept-half .kept-note');
    const noteBox = note && note.getBoundingClientRect(), sentBox = keptSentence.getBoundingClientRect();
    return {
      viewport: innerWidth,
      context: { innerWidth, innerHeight, fonts: document.fonts.status, fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').length },
      stands: box('.stands-half'), kept: box('.kept-half'),
      standsBg, keptBg, groundContrast: contrast(rgb(standsBg), rgb(keptBg)),
      standsSentence: box('.stands-half .sentence'), standsHouse: box('.stands-half #house'),
      keptSentence: box('.kept-half .kept-sentence'), keptHouse: box('.kept-half #house-kept'),
      liveSize: parseFloat(getComputedStyle(q('.stands-half .sentence')).fontSize), keptSize: parseFloat(ks.fontSize),
      keptTextContrast: ink(keptSentence, 'color'),
      gaps, keptWords: words,
      note: note ? { text: note.textContent.trim(), contrast: onGround(note, 'color'), size: parseFloat(getComputedStyle(note).fontSize),
        // its text's own right edge: a no-wrap line runs past its box, and the text is what meets the frame
        underSentence: noteBox.top >= sentBox.bottom - 1, right: (() => { const r = document.createRange(); r.selectNodeContents(note); return r.getBoundingClientRect().right; })(),
        hidden: note.closest('[aria-hidden="true"]') !== null,
        lines: Math.round(noteBox.height / parseFloat(getComputedStyle(note).lineHeight)),
        // the kept half's inset hairline frame: its right edge on the page
        frameRight: (() => { const h = q('.kept-half'), r = h.getBoundingClientRect(), b = getComputedStyle(h, '::before'); return r.right - parseFloat(b.right); })() } : null,
      // the stacked layout's line pointing down to the kept half
      pointer: document.querySelector('.stands-half .kept-pointer') ? box('.stands-half .kept-pointer') : null,
      pointerShown: !!document.querySelector('.stands-half .kept-pointer') && getComputedStyle(q('.stands-half .kept-pointer')).display !== 'none',
      question: box('#question .question-line'), steps: document.querySelector('ol.how-to-play') ? box('ol.how-to-play') : null,
      slots: [...document.querySelectorAll('.stands-half .sentence form[action="/replace"]')].map((f) => ({
        word: f.querySelector('label').textContent,
        under: [...f.closest('.pos').querySelectorAll('*')].filter((el) => !f.contains(el) && el.children.length === 0 && el.textContent.trim()
          && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().top >= f.getBoundingClientRect().bottom - 1).map((el) => el.textContent.trim()) })),
    };
  })()`, size)) as Layout;
}

type Notation = {
  sentenceBottom: number; partBottom: number; restBottom: number; footTop: number;
  houseWidth: number; houseHeight: number; houseBottom: number;
  hidden: { sentence: number; house: number; kept: number };
  shown: { text: string; sentence: number; house: number; kept: number }[];
};

// The longest notation each part can show at this width, over every pair of
// pool words (src/lib/house/notation.ts): the whole reason on a desktop, the
// family change only on a phone. Measured, never a sample, so the layout is
// checked against the worst the page can actually say.
const POOL = [...new Set((JSON.parse(readFileSync(new URL("./fixtures/house-descriptors.json", import.meta.url), "utf8")).rows as [number, string][]).map((r) => r[1]))];
function longestNotations(width: number): string[] {
  const form = width <= 900 ? "phone" : "desktop";
  return TERRITORIES.map((_, position) => {
    let best = "";
    for (const was of POOL) for (const word of POOL) {
      const s = notation_({ position, word, was }, form);
      if (s.length > best.length) best = s;
    }
    return best;
  });
}

// The live half with the part notation hidden, then showing each part's
// longest notation in turn, as an accepted change shows it (served copy only).
async function notation(size: [number, number], longWords: boolean): Promise<Notation> {
  const doc = await servedPage(baseUrl);
  if (longWords) stageWords(doc, Array(10).fill("wordmvadgycfe"));
  const labels = longestNotations(size[0]);
  return (await measureIn(doc, `(async () => {
    await document.fonts.ready;
    const q = ${QUERY_JS};
    const part = q('#part'), house = q('.stands-half #house');
    const at = () => ({ sentence: q('.stands-half .sentence').getBoundingClientRect().top, house: house.getBoundingClientRect().top, kept: q('#house-kept').getBoundingClientRect().top });
    const hidden = at(), h = house.getBoundingClientRect();
    let partBottom = 0;
    const shown = ${JSON.stringify(labels)}.map((text) => {
      part.hidden = false; part.textContent = text;
      partBottom = Math.max(partBottom, part.getBoundingClientRect().bottom);
      const s = { text, ...at() };
      part.hidden = true; part.textContent = '';
      return s;
    });
    return {
      // the row at rest (the invitation, and the way to /house/ beside it, or under it on a phone)
      restBottom: q('.stands-half .invite-row').getBoundingClientRect().bottom,
      sentenceBottom: q('.stands-half .sentence').getBoundingClientRect().bottom, partBottom,
      footTop: q('.stands-half .foot').getBoundingClientRect().top,
      houseWidth: h.width, houseHeight: h.height, houseBottom: h.bottom, hidden, shown,
    };
  })()`, size)) as Notation;
}

// the measured numbers, appended to every assertion message in a test that reads the whole layout
const r = (b: Box) => `[${b.left.toFixed(1)},${b.top.toFixed(1)} → ${b.right.toFixed(1)},${b.bottom.toFixed(1)}]`;
const measured = (l: Layout) =>
  ` | viewport ${l.context.innerWidth}x${l.context.innerHeight}, fonts ${l.context.fonts} (${l.context.fontsLoaded} loaded)` +
  ` | stands ${r(l.stands)} kept ${r(l.kept)} | live sentence ${r(l.standsSentence)} house ${r(l.standsHouse)}` +
  ` | kept sentence ${r(l.keptSentence)} house ${r(l.keptHouse)} | sizes ${l.liveSize}/${l.keptSize}px`;

function bothHalves(l: Layout): void {
  const m = measured(l);
  // two distinct grounds, at a glance
  expect(l.standsBg, "the two halves share one ground" + m).not.toBe(l.keptBg);
  expect(l.groundContrast, "the two grounds are too close in tone to read as two objects" + m).toBeGreaterThanOrEqual(3);
  // each sentence sits directly above its own house, inside its own half
  expect(l.standsSentence.bottom, "the live sentence isn't above its house" + m).toBeLessThanOrEqual(l.standsHouse.top + 1);
  expect(l.keptSentence.bottom, "the kept sentence isn't above its house" + m).toBeLessThanOrEqual(l.keptHouse.top + 1);
  for (const [name, inner, outer] of [["live sentence", l.standsSentence, l.stands], ["live house", l.standsHouse, l.stands], ["kept sentence", l.keptSentence, l.kept], ["kept house", l.keptHouse, l.kept]] as const) {
    expect(inner.left, `the ${name} spills out of its half` + m).toBeGreaterThanOrEqual(outer.left - 1);
    expect(inner.right, `the ${name} spills out of its half` + m).toBeLessThanOrEqual(outer.right + 1);
  }
  // the kept sentence is a sentence, legible on its ground, never a caption, and never larger than the live one
  expect(l.keptSize / l.liveSize, "the kept sentence is set as a small caption" + m).toBeGreaterThanOrEqual(0.6);
  expect(l.keptSize, "the kept sentence outranks the live one" + m).toBeLessThan(l.liveSize);
  expect(l.keptTextContrast, "the kept sentence isn't legible on its ground" + m).toBeGreaterThanOrEqual(4.5);
  // a gap: the word still standing there, legible as text (4.5:1 on its grid, the floor every text keeps), and
  // clearly fainter than every kept word (the ceiling: at most 60% of the faintest kept word's contrast)
  expect(l.gaps, "the staged kept sentence has no five gaps" + m).toHaveLength(5);
  expect(l.keptWords, "the staged kept sentence has no five kept words" + m).toHaveLength(5);
  const faintestKept = Math.min(...l.keptWords);
  for (const [i, g] of l.gaps.entries()) {
    expect(g.text, `gap ${i} doesn't show the word still standing` + m).not.toBe("");
    expect(g.contrast, `gap "${g.text}" is too faint to read on its grid` + m).toBeGreaterThanOrEqual(4.5);
    expect(g.contrast, `gap "${g.text}" is as strong as a kept word (${faintestKept.toFixed(2)}:1)` + m).toBeLessThanOrEqual(faintestKept * 0.6);
    // a second cue, not lightness alone: a dashed line under it, never solid (a word) or dotted (your own word)
    expect(g.cue, `gap "${g.text}" has no cue but its lightness` + m).toBe("dashed");
    expect(g.cueInk, `gap "${g.text}"'s dashed line isn't visible on the kept ground` + m).toBeGreaterThanOrEqual(1.5);
  }
  // under the kept sentence: what it is, as text, like any caption (6:1). Under the sentence, over the kept house's
  // empty top band, not under the label: a line there grew the row both halves share and pushed the live house
  // off the first screen with the longest words. The kept house stays clear of it (checked on real geometry below)
  expect(l.note, "there's no line saying what the kept sentence is" + m).not.toBeNull();
  expect(l.note!.text, "the line under the kept sentence isn't the agreed one" + m).toBe("Replaced words, back in their places. Faint words still stand.");
  expect(l.note!.underSentence, "the line isn't under the kept sentence" + m).toBe(true);
  expect(l.note!.right, "the line under the kept sentence runs out of its half" + m).toBeLessThanOrEqual(l.kept.right + 1);
  // on a desktop: one line, with real room before the kept half's frame (it once ended 3px from it at 1280)
  if (l.viewport > 900) {
    expect(l.note!.lines, "the line under the kept sentence wraps on a desktop" + m).toBe(1);
    expect(l.note!.frameRight - l.note!.right, "the line under the kept sentence crowds the kept half's frame" + m).toBeGreaterThanOrEqual(24);
  }
  expect(l.note!.hidden, "the line under the kept sentence is hidden from assistive technology" + m).toBe(false);
  expect(l.note!.contrast, "the line under the kept sentence is too faint" + m).toBeGreaterThanOrEqual(6);
}

describe("two ships on GET /", () => {
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1280×800", [1280, 800]]] as const) {
    it(`sets the two halves side by side and equal (${name})`, async () => {
      const l = await layout([size[0], size[1]]);
      const m = measured(l);
      expect(Math.abs(l.stands.top - l.kept.top), "the halves aren't side by side" + m).toBeLessThan(2);
      expect(l.stands.right, "the live half isn't on the left" + m).toBeLessThanOrEqual(l.kept.left + 1);
      expect(Math.abs(l.stands.width - l.kept.width) / l.viewport, "the halves aren't equal" + m).toBeLessThan(0.02);
      expect(l.stands.width + l.kept.width, "the halves don't share the page" + m).toBeGreaterThan(l.viewport * 0.98);
      expect(l.pointerShown, "the pointer to the kept half shows beside it" + m).toBe(false);
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

  // The houses are the body of the sentence, not a thumbnail under it: on a
  // desktop each house's row takes at least half the screen's height, both
  // rows level, with the live sentence (stepped to two lines) and the
  // invitation above them on the first screen. The notes under the houses may
  // fall below the first screen, reachable by scrolling. Measured with the
  // maker's sentence and with a long one (the live sentence when this was
  // written), each at the size step GET / renders for it, and an empty kept
  // ship, in the measured copy only.
  const LONG_SENTENCE = ["potato", "every", "ceremony", "that", "students", "will", "tythbvgbv", "whether", "it", "peel"];
  const MAKER_SENTENCE = ["Make", "a", "website", "that", "people", "would", "miss", "if", "it", "disappeared"];
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1440×900", [1440, 900]], ["1280×800", [1280, 800]]] as const) {
    for (const [which, words] of [["the maker's sentence", MAKER_SENTENCE], ["a long sentence", LONG_SENTENCE]] as const) {
      it(`gives each house at least half the screen, under the sentence and the invitation (${name}, ${which})`, async () => {
        const doc = await servedPage(baseUrl);
        stageWords(doc, [...words]);
        const m = (await measureIn(doc, `(async () => {
          await document.fonts.ready;
          const q = ${QUERY_JS};
          // the kept sentence as long as GET / makes it: every position a gap showing the word still standing
          const live = [...document.querySelectorAll('.stands-half .sentence label')].map((l) => l.textContent.trim());
          q('.kept-sentence').querySelectorAll('.w').forEach((w, i) => { w.className = 'w gap'; w.textContent = live[i]; });
          const b = (s) => q(s).getBoundingClientRect();
          const inv = b('.stands-half .invite'), how = b('#how');
          return { stands: b('.stands-half #house').height, kept: b('#house-kept').height, standsTop: b('.stands-half #house').top, keptTop: b('#house-kept').top,
            invTop: inv.top, invBottom: inv.bottom, invShown: getComputedStyle(q('.stands-half .invite')).visibility === 'visible',
            howTop: how.top, howHeight: how.height, howShown: getComputedStyle(q('#how')).display !== 'none', page: document.documentElement.scrollHeight,
            scrolls: getComputedStyle(document.documentElement).overflowY !== 'hidden' && getComputedStyle(document.body).overflowY !== 'hidden' };
        })()`, [size[0], size[1]])) as Record<string, number | boolean>;
        const at = ` (house rows ${(m.stands as number).toFixed(0)}/${(m.kept as number).toFixed(0)}px of ${size[1]})`;
        expect(m.stands, "the live house's row is under half the screen" + at).toBeGreaterThanOrEqual(size[1] * 0.5 - 0.5);
        expect(m.kept, "the kept house's row is under half the screen" + at).toBeGreaterThanOrEqual(size[1] * 0.5 - 0.5);
        expect(Math.abs((m.standsTop as number) - (m.keptTop as number)), "the houses aren't level" + at).toBeLessThanOrEqual(1);
        // the first screen still says what to do, above the house
        expect(m.invShown, "the invitation isn't shown").toBe(true);
        expect(m.invBottom, "the invitation is below the first screen").toBeLessThanOrEqual(size[1]);
        expect(m.invTop, "the invitation isn't above the house").toBeLessThanOrEqual(m.standsTop as number);
        // the instructions are on the page and reachable by scrolling
        expect(m.howShown && (m.howHeight as number) > 0, "the instructions aren't shown").toBe(true);
        expect(m.howTop, "the instructions are past the end of the page").toBeLessThan(m.page as number);
        expect(m.scrolls, "the page can't scroll to the instructions").toBe(true);
      }, 90_000);
    }
  }

  // A third line never shrinks the house (CLAUDE.md "Enforced"): wherever the
  // step's prediction misses (an untested platform), the sentence takes a
  // line more and the house row keeps its half-screen floor, both houses
  // level. Forced here with long words at the smallest step, where they set
  // a third line in any browser (the step is pinned, not predicted).
  for (const [name, size] of [["1440×900", [1440, 900]], ["1280×800", [1280, 800]]] as const) {
    it(`keeps each house's half-screen row when the sentence takes a third line (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      stageWords(doc, Array(10).fill("wordmvadgycfe"));
      doc.querySelector(".stands-half .sentence")!.setAttribute("data-step", String(SIZE_STEPS.length - 1));
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const q = ${QUERY_JS};
        const labels = [...document.querySelectorAll('.stands-half .sentence label')];
        const b = (s) => q(s).getBoundingClientRect();
        return { lines: new Set(labels.map((l) => Math.round(l.getBoundingClientRect().top))).size, step: q('.stands-half .sentence').getAttribute('data-step'),
          stands: b('.stands-half #house').height, kept: b('#house-kept').height, standsTop: b('.stands-half #house').top, keptTop: b('#house-kept').top };
      })()`, [size[0], size[1]])) as { lines: number; step: string; stands: number; kept: number; standsTop: number; keptTop: number };
      const at = ` (${m.lines} lines at step ${m.step}; rows ${m.stands.toFixed(0)}/${m.kept.toFixed(0)}px, tops ${m.standsTop.toFixed(0)}/${m.keptTop.toFixed(0)}, screen ${size[1]})`;
      expect(m.lines, "the staged sentence didn't take a third line, so this proves nothing" + at).toBeGreaterThan(2);
      expect(m.stands, "a third line shrank the live house's row" + at).toBeGreaterThanOrEqual(size[1] * 0.5 - 0.5);
      expect(m.kept, "a third line shrank the kept house's row" + at).toBeGreaterThanOrEqual(size[1] * 0.5 - 0.5);
      expect(Math.abs(m.standsTop - m.keptTop), "a third line left the houses unlevel" + at).toBeLessThanOrEqual(1);
    }, 90_000);
  }

  // The live sentence stays on two lines on a desktop: it steps down through a
  // few fixed sizes (src/lib/sentence-step.ts), the step GET / renders. At its
  // smallest step it still outranks the kept sentence. Ten 24-letter words may
  // still wrap past two lines at the smallest step: that sentence can't fit
  // two lines at any size the floor allows, and is checked here only to stay
  // at the floor and keep the house on the first screen.
  //
  // What this proves, and what it doesn't: the step is predicted from glyph
  // widths, so two lines holds only where this check has run, Chrome on macOS
  // (locally) and on Linux (CI). On any other platform or browser (Windows,
  // Safari, Firefox) a sentence near the margin could set a third line. That
  // costs a line of height, never house size: the half-screen check above
  // holds the house row at 50vh whatever the sentence does.
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1440×900", [1440, 900]], ["1280×800", [1280, 800]]] as const) {
    it(`keeps the live sentence to two lines, at its step, over the 500-sentence set (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      const set = [MAKER_SENTENCE, LONG_SENTENCE, ...SENTENCES];
      const steps = set.map((w) => sizeStep(w));
      // For each sentence: its lines at its step, and how much room this browser leaves on its last
      // line (the column's right edge minus the line's end, as a share of the column). sizeStep()
      // can't see this platform's glyph widths, so every run reports its tightest sentences: a
      // failure, and a pass, both say how much margin the step function actually needs here.
      const out = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const sent = document.querySelector('.stands-half .sentence'), labels = [...sent.querySelectorAll('label')];
        const col = sent.getBoundingClientRect();
        const lines = () => new Set(labels.map((l) => Math.round(l.getBoundingClientRect().top))).size;
        return ${JSON.stringify(set)}.map((ws, i) => {
          ws.forEach((w, j) => (labels[j].textContent = w)); sent.setAttribute('data-step', ${JSON.stringify(steps)}[i]);
          const end = sent.querySelector('.end').getBoundingClientRect().right;
          return { lines: lines(), room: (col.right - end) / col.width, font: parseFloat(getComputedStyle(sent).fontSize) };
        });
      })()`, [size[0], size[1]])) as { lines: number; room: number; font: number }[];
      const say = (i: number) => `"${set[i].join(" ")}" (${out[i].lines} lines at step ${steps[i]}, ${out[i].font}px, last line ${(100 * out[i].room).toFixed(2)}% short of the column)`;
      const tightest = out.map((_, i) => i).filter((i) => out[i].lines <= 2).sort((a, b) => out[a].room - out[b].room).slice(0, 3).map(say);
      // always visible: CI shows it as an annotation on the run, so a pass also reports the margin
      process.stdout.write(`\n::notice title=sentence-step ${name}::tightest two-line sentences: ${tightest.join(" | ")}\n`);
      const over = out.flatMap((o, i) => (o.lines > 2 ? [say(i)] : []));
      expect(over.slice(0, 3), `${over.length} sentences wrap past two lines; the tightest that fit: ${tightest.join(" | ")}`).toEqual([]);
    }, 120_000);

    it(`at its smallest step the live sentence still outranks the kept one, and the longest words keep the house on screen (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      stageWords(doc, Array(10).fill("w".repeat(24)));
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const q = ${QUERY_JS};
        return { step: q('.stands-half .sentence').getAttribute('data-step'), live: parseFloat(getComputedStyle(q('.stands-half .sentence')).fontSize),
          kept: parseFloat(getComputedStyle(q('.kept-sentence')).fontSize), houseTop: q('.stands-half #house').getBoundingClientRect().top };
      })()`, [size[0], size[1]])) as { step: string; live: number; kept: number; houseTop: number };
      expect(Number(m.step), "ten 24-letter words aren't at the smallest step").toBe(SIZE_STEPS.length - 1);
      expect(m.live, "at its smallest step the live sentence doesn't outrank the kept one").toBeGreaterThan(m.kept);
      expect(m.houseTop, "the longest words push the house off the first screen").toBeLessThan(size[1]);
    }, 90_000);
  }

  // GET / shows only what stands now (the maker's decision): no earlier words
  // under the live words, so a long sentence never pushes the houses off the
  // first screen. The words are a staged long sentence in the measured copy;
  // whatever the server renders under them is what's under test. On a phone
  // this holds once the question band is folded (a visitor who has made a
  // change); a new visitor's full band is checked below.
  for (const [name, size, limit] of [["1920×1080", [1920, 1080], 2 / 3], ["phone 390×844", [390, 844], 0.85]] as const) {
    it(`shows nothing under a live word, and keeps the houses on the first screen with ten long words (${name}${size[0] > 900 ? "" : ", band folded"})`, async () => {
      const l = await layout([size[0], size[1]], false, true, size[0] <= 900);
      expect(l.slots).toHaveLength(10);
      for (const s of l.slots) expect(s.under, `words shown under "${s.word}"`).toEqual([]);
      expect(l.standsHouse.top, "the live house starts too far down the first screen").toBeLessThanOrEqual(size[1] * limit);
      // side by side, the kept house starts level with it; stacked, it's below by design (the pointer says so)
      if (size[0] > 900) expect(l.keptHouse.top, "the kept house starts too far down the first screen").toBeLessThanOrEqual(size[1] * limit);
    }, 90_000);
  }

  // A new visitor on a phone (the band in full): the first screen holds the
  // band's question, its three steps and the whole live sentence; the house
  // may start below the fold, one scroll away. Measured with the maker's
  // sentence and a long one. Ten 13-letter words make the sentence alone
  // ~520px tall, more than a first screen leaves under the band; that
  // visitor's house is one scroll further, and once they've made a change the
  // folded band brings it back to the first screen (above).
  for (const [which, words] of [["the maker's sentence", ["Make", "a", "website", "that", "people", "would", "miss", "if", "it", "disappeared"]], ["a long sentence", ["potato", "every", "ceremony", "that", "students", "will", "tythbvgbv", "whether", "it", "peel"]]] as const) {
    it(`opens a new visitor's phone on the question, how to play and the whole sentence (phone 390×844, band in full, ${which})`, async () => {
      const l = await layout([390, 844], false, [...words]);
      expect(l.steps, "the band isn't in full for a new visitor").not.toBeNull();
      expect(l.question.top, "the question isn't on the first screen").toBeGreaterThanOrEqual(0);
      expect(l.steps!.bottom, "how to play runs past the first screen").toBeLessThanOrEqual(844);
      expect(l.standsSentence.bottom, "the live sentence runs past the first screen under the band").toBeLessThanOrEqual(844);
    }, 90_000);
  }

  // The line under the kept sentence lies over the kept house's own empty top
  // band, as the part notation does over the live house's: every kept house at
  // rest stays clear of it, by 8px on a desktop and 16px on a phone, on real
  // geometry through the page's own camera at the measured canvas size (both
  // houses are the same body and camera). Measured with the longest kept
  // sentence: every position a gap showing a long word still standing.
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1280×800", [1280, 800]], ["phone 390×844", [390, 844]]] as const) {
    it(`keeps every kept house at rest clear of the line under the kept sentence (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      stageWords(doc, Array(10).fill("wordmvadgycfe"));
      doc.querySelectorAll(".kept-sentence .w").forEach((w) => { w.className = "w gap"; w.textContent = "wordmvadgycfe"; });
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const q = ${QUERY_JS};
        const h = q('#house-kept').getBoundingClientRect();
        return { noteBottom: q('.kept-half .kept-note').getBoundingClientRect().bottom, houseTop: h.top, houseWidth: h.width, houseHeight: h.height };
      })()`, [size[0], size[1]])) as { noteBottom: number; houseTop: number; houseWidth: number; houseHeight: number };
      const cam = new THREE.PerspectiveCamera();
      place(cam, m.houseWidth / m.houseHeight);
      const clear = m.noteBottom - m.houseTop + (size[0] <= 900 ? 16 : 8); // px from the canvas top
      const v = new THREE.Vector3();
      for (const words of [...SENTENCES, ...EXTREMES, Array(10).fill("wordmvadgycfe")]) {
        const body = buildBody(words);
        body.root.updateMatrixWorld(true);
        let top = Infinity;
        body.root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const p = mesh.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) top = Math.min(top, ((1 - v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).project(cam).y) / 2) * m.houseHeight);
        });
        body.dispose();
        expect(top, `the kept house of "${words.join(" ")}" reaches the line under the kept sentence`).toBeGreaterThanOrEqual(clear);
      }
    }, 120_000);
  }

  // The part notation ("05 — entry") and the live house. The notation lies
  // over the canvas's own empty top band, so the house starts right under
  // the sentence; choosing a word shows the notation without moving anything;
  // and no house at rest ever reaches it. "At rest" is the contract: during
  // an exchange (under a second) the old part lifts, and for the tallest
  // bodies the grammar allows it may pass briefly under the notation (before
  // this, the same lift was cut off by the canvas edge). The maker accepted
  // that; settled bodies are what's checked here, on real geometry through
  // the page's own camera at the measured canvas size.
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["phone 390×844", [390, 844]]] as const) {
    for (const longWords of [false, true]) {
      it(`sets the part notation over the live house's empty band, without a jump (${name}${longWords ? ", ten long words" : ""})`, async () => {
        const n = await notation([size[0], size[1]], longWords);
        // no jump: showing any part's notation moves neither the sentence nor either house
        for (const s of n.shown) for (const k of ["sentence", "house", "kept"] as const) {
          expect(Math.abs(s[k] - n.hidden[k]), `showing "${s.text}" moves the ${k}`).toBeLessThanOrEqual(0.5);
        }
        // tight: the house starts right under the sentence (the notation's line is not reserved above it)
        expect(n.hidden.house - n.sentenceBottom, "the live house is held away from its sentence").toBeLessThanOrEqual(20);
        // never smaller: a phone's house keeps its height; a desktop's fills its row down to the notes
        if (size[0] <= 900) expect(n.houseHeight, "the phone's house got smaller").toBeGreaterThanOrEqual(Math.min(size[0] * 0.8, 420) - 0.5);
        else expect(n.houseBottom, "the desktop house no longer reaches its notes").toBeGreaterThanOrEqual(n.footTop - 1);
        // level: side by side, the two houses start together
        if (size[0] > 900) expect(Math.abs(n.hidden.kept - n.hidden.house), "the two houses aren't level").toBeLessThanOrEqual(1);
        // never over a house at rest: every body's topmost point is clear of the notation, and of the row at
        // rest (the invitation and its /house/ link), by 8px on a desktop and by a comfortable 16px on a
        // phone, where the notation is the family change only (measured at 25px; a fraction of a pixel of
        // slack once broke on font metrics alone)
        const cam = new THREE.PerspectiveCamera();
        place(cam, n.houseWidth / n.houseHeight);
        const clear = Math.max(n.partBottom, n.restBottom) - n.hidden.house + (size[0] <= 900 ? 16 : 8); // px from the canvas top
        const v = new THREE.Vector3();
        for (const words of [...SENTENCES, ...EXTREMES, Array(10).fill("wordmvadgycfe")]) {
          const body = buildBody(words);
          body.root.updateMatrixWorld(true);
          let top = Infinity;
          body.root.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const p = mesh.geometry.attributes.position;
            for (let i = 0; i < p.count; i++) top = Math.min(top, ((1 - v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).project(cam).y) / 2) * n.houseHeight);
          });
          body.dispose();
          expect(top, `"${words.join(" ")}" reaches the part notation or the row at rest`).toBeGreaterThanOrEqual(clear);
        }
      }, 120_000);
    }
  }

  // The first ten seconds (plan D): at rest, the part notation's slot invites
  // a stranger to change a word, in the notation's own quiet caps, on one line.
  // Choosing a word swaps the notation in, in the same slot: nothing moves
  // either way, and the house stays right under the sentence. Decorative to
  // assistive technology (each word field is already described by #how).
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["phone 390×844", [390, 844]]] as const) {
    for (const longWords of [false, true]) {
      it(`invites a stranger to change a word at rest, in the notation's slot, moving nothing (${name}${longWords ? ", ten long words" : ""})`, async () => {
        const doc = await servedPage(baseUrl);
        if (longWords) stageWords(doc, Array(10).fill("wordmvadgycfe"));
        const m = (await measureIn(doc, `(async () => {
          await document.fonts.ready;
          const q = ${QUERY_JS};
          const inv = q('.stands-half .invite'), part = q('#part');
          if (!inv) return { missing: true };
          const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
          const at = () => ({ sentence: q('.stands-half .sentence').getBoundingClientRect().top, house: q('.stands-half #house').getBoundingClientRect().top, kept: q('#house-kept').getBoundingClientRect().top });
          // the link to /house/ at rest, beside the invitation (the invitation itself is decorative)
          const link = document.querySelector('.stands-half .invite-row a[href="/house/"]');
          const seen = (el) => !!el && getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
          const rest = { inv: box(inv), visible: getComputedStyle(inv).visibility === 'visible' && getComputedStyle(inv).display !== 'none', text: inv.textContent.trim(),
            link: link ? { seen: seen(link), box: box(link), hidden: link.closest('[aria-hidden="true"]') !== null, text: link.textContent.trim() } : null,
            lineHeight: parseFloat(getComputedStyle(inv).lineHeight) || 18, hidden: inv.closest('[aria-hidden="true"]') !== null, at: at(),
            sentenceBottom: q('.stands-half .sentence').getBoundingClientRect().bottom, half: box(q('.stands-half')) };
          part.hidden = false; part.textContent = '08 — upper-right volume';
          const chosen = { invVisible: getComputedStyle(inv).visibility === 'visible' && getComputedStyle(inv).display !== 'none', part: box(part), at: at(), linkSeen: seen(link) };
          return { rest, chosen };
        })()`, [size[0], size[1]])) as any;
        expect(m.missing, "GET / has no invitation under the sentence").toBeUndefined();
        const { rest, chosen } = m;
        expect(rest.visible, "the invitation isn't shown at rest").toBe(true);
        expect(rest.text.length, "the invitation is empty").toBeGreaterThan(0);
        expect(rest.inv.height, "the invitation wraps onto a second line").toBeLessThan(rest.lineHeight * 1.5);
        expect(rest.inv.right, "the invitation runs out of its half").toBeLessThanOrEqual(rest.half.right + 1);
        expect(rest.hidden, "the invitation isn't decorative to assistive technology").toBe(true);
        expect(rest.inv.top, "the invitation isn't under the sentence").toBeGreaterThanOrEqual(rest.sentenceBottom - 1);
        expect(rest.at.house - rest.sentenceBottom, "the invitation pushed the house away from its sentence").toBeLessThanOrEqual(20);
        // beside it on a desktop, a real link to /house/ (28 October playtest: nobody found it), on the
        // invitation's row, inside the half. A phone has no room for it (~70px free beside the invitation,
        // ~207px needed), and a line of its own under the invitation would come within 12px of the tallest
        // houses (the notation keeps 16px): there the band's masthead link and the foot reach /house/ instead
        expect(rest.link, "there's no link to /house/ beside the invitation").not.toBeNull();
        if (size[0] > 900) {
          expect(rest.link.seen, "the /house/ link beside the invitation isn't shown at rest").toBe(true);
          expect(rest.link.hidden, "the /house/ link is hidden from assistive technology").toBe(false);
          expect(rest.link.text, "the /house/ link doesn't say what it is").toMatch(/how the house reads a word/i);
          expect(Math.abs(rest.link.box.top - rest.inv.top), "the /house/ link isn't on the invitation's row").toBeLessThanOrEqual(4);
          expect(rest.link.box.right, "the /house/ link runs out of its half").toBeLessThanOrEqual(rest.half.right + 1);
          expect(rest.link.box.left >= rest.inv.right, "the /house/ link lies on the invitation").toBe(true);
        } else expect(rest.link.seen, "a phone shows the /house/ link beside the invitation, where there's no room for it").toBe(false);
        // choosing a word: the notation takes the same slot, the invitation steps aside, nothing moves
        expect(chosen.invVisible, "the invitation stays while a part's notation is shown").toBe(false);
        expect(chosen.linkSeen, "the /house/ link stays over the notation while a word is chosen").toBe(false);
        expect(Math.abs(chosen.part.top - rest.inv.top), "the notation isn't in the invitation's slot").toBeLessThanOrEqual(1);
        for (const k of ["sentence", "house", "kept"] as const) expect(Math.abs(chosen.at[k] - rest.at[k]), `choosing a word moves the ${k}`).toBeLessThanOrEqual(0.5);
      }, 90_000);
    }
  }

  // The settling line (plan C) lies inside its word's own box, thin, never
  // red, and moves nothing: the sentence wraps and the house stands exactly
  // as without it. Placed in the measured copy the way live-client adds it.
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["phone 390×844", [390, 844]]] as const) {
    it(`sets the settling line inside its word, thin and not red, moving nothing (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const q = ${QUERY_JS};
        const at = () => [...document.querySelectorAll('.stands-half .sentence form[action="/replace"] label')].map((l) => { const r = l.getBoundingClientRect(); return [r.left, r.top]; }).concat([[0, q('.stands-half #house').getBoundingClientRect().top]]);
        const before = at();
        const pos = document.querySelectorAll('.stands-half .sentence .pos')[4];
        const line = document.createElement('span');
        line.className = 'settling'; line.setAttribute('aria-hidden', 'true');
        line.style.setProperty('--from', '0.4'); line.style.setProperty('--ms', '4000ms');
        pos.append(line);
        await new Promise((r) => setTimeout(r, 50));
        const after = at(), lr = line.getBoundingClientRect(), wr = pos.querySelector('label').getBoundingClientRect();
        const c = (getComputedStyle(line).backgroundColor.match(/[\\d.]+/g) || []).map(Number);
        return { moved: Math.max(...before.map((b, i) => Math.hypot(b[0] - after[i][0], b[1] - after[i][1]))), line: { left: lr.left, right: lr.right, top: lr.top, bottom: lr.bottom, height: lr.height },
          word: { left: wr.left, right: wr.right, top: wr.top, bottom: wr.bottom }, red: c[0] > 150 && c[1] < 90 && c[2] < 90, color: c };
      })()`, [size[0], size[1]])) as any;
      expect(m.moved, "the settling line moved the sentence or the house").toBeLessThanOrEqual(0.5);
      expect(m.line.height, "the settling line isn't a thin line").toBeGreaterThan(0);
      expect(m.line.height, "the settling line isn't a thin line").toBeLessThanOrEqual(3);
      expect(m.line.left, "the settling line runs out of its word").toBeGreaterThanOrEqual(m.word.left - 1);
      expect(m.line.right, "the settling line runs out of its word").toBeLessThanOrEqual(m.word.right + 1);
      expect(m.line.top, "the settling line isn't under its word").toBeGreaterThanOrEqual(m.word.bottom - 2);
      expect(m.red, `the settling line is red (${m.color})`).toBe(false);
    }, 90_000);
  }

  // A word in hand, being typed over (src/lib/house/notation.ts drafting): the
  // line in the notation's slot names the part, the word being replaced,
  // struck, and the family the draft would give it (on a desktop with the
  // test that decided it), or, if another visitor replaced the word, the new
  // word and "choose again". Never the keys. One line, so it moves nothing,
  // and every house at rest stays clear of it by 8px on a desktop and 16px on
  // a phone, on real geometry through the page's own camera. Only a long word
  // is shortened (the struck one, or the new one in the stale line), with an
  // ellipsis; the prediction itself is never cut. Read like the notation: at
  // least 4.5:1 on its ground. Set in the measured copy by the page's own
  // showDrafting(), so the markup and the CSS under test are the page's.
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1440×900", [1440, 900]], ["1280×800", [1280, 800]], ["phone 390×844", [390, 844]]] as const) {
    it(`keeps the drafting line to one line in the notation's slot, clear of the house, shortening only a long word (${name})`, async () => {
      const form = size[0] <= 900 ? "phone" : "desktop";
      const W = "w".repeat(24);
      // the longest prediction the page can show: every part, every draft in the pool, the longest line
      const pool = ["people", "hollow", "incomprehensibilities", "bookkeeper", "rhythm", "a", W];
      const longest = (word: string, now?: string) => {
        let best = drafting({ position: 0, word, draft: pool[0], now }, form);
        for (let position = 0; position < 10; position++) for (const draft of pool) {
          const d = drafting({ position, word, draft, now }, form);
          if (Object.values(d).join("").length > Object.values(best).join("").length) best = d;
        }
        return best;
      };
      const cases = [longest("people"), longest(W), longest("people", W)];
      const out: any[] = [];
      for (const d of cases) {
        const doc = await servedPage(baseUrl);
        stageWords(doc, Array(10).fill("wordmvadgycfe"));
        showDrafting(doc.getElementById("part")!, d);
        out.push(await measureIn(doc, `(async () => {
          await document.fonts.ready;
          const q = ${QUERY_JS};
          const part = q('#part'), cs = getComputedStyle(part), kids = [...part.children];
          const cut = (el) => el.scrollWidth > el.clientWidth + 1;
          const r = part.getBoundingClientRect(), half = q('.stands-half').getBoundingClientRect(), inv = q('.stands-half .invite').getBoundingClientRect(), h = q('.stands-half #house').getBoundingClientRect();
          const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
          const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
          const ground = rgb(getComputedStyle(part.closest('.half')).backgroundColor), [x, y] = [lum(rgb(cs.color)), lum(ground)].sort((m, n) => n - m);
          return { height: r.height, line: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.45, right: r.right, bottom: r.bottom, halfRight: half.right, top: r.top, invTop: inv.top,
            pieces: kids.map((k) => ({ tag: k.tagName.toLowerCase(), text: k.textContent, cut: cut(k), right: k.getBoundingClientRect().right, ellipsis: getComputedStyle(k).textOverflow, struck: getComputedStyle(k).textDecorationLine })),
            houseTop: h.top, houseWidth: h.width, houseHeight: h.height, sentence: q('.stands-half .sentence').getBoundingClientRect().bottom, contrast: (x + 0.05) / (y + 0.05) };
        })()`, [size[0], size[1]]));
      }
      const v = new THREE.Vector3();
      const bodies = [...SENTENCES, ...EXTREMES, Array(10).fill("wordmvadgycfe")].map((words) => buildBody(words));
      try {
        for (const [i, m] of out.entries()) {
          const what = `"${Object.values(cases[i]).join("")}"`;
          expect(m.height, `${what} wraps`).toBeLessThan(m.line * 1.5);
          expect(m.right, `${what} runs out of its half`).toBeLessThanOrEqual(m.halfRight + 1);
          expect(Math.abs(m.top - m.invTop), `${what} isn't in the notation's slot`).toBeLessThanOrEqual(1);
          expect(m.houseTop - m.sentence, `${what} pushed the house away`).toBeLessThanOrEqual(20);
          expect(m.contrast, `${what} is too faint on its ground`).toBeGreaterThanOrEqual(4.5);
          const struck = m.pieces.find((p: any) => p.tag === "del");
          expect(struck?.struck, `${what} doesn't strike the replaced word`).toContain("line-through");
          // only a word may be shortened: the part, the prediction and "choose again" are never cut
          for (const p of m.pieces) {
            if (p.tag === "del" || p.tag === "b") { if (p.cut) expect(p.ellipsis, `${what}: a shortened word doesn't end in an ellipsis`).toBe("ellipsis"); }
            else { expect(p.cut, `${what} cuts "${p.text}"`).toBe(false); expect(p.right, `${what} cuts "${p.text}"`).toBeLessThanOrEqual(m.right + 1); }
          }
          // every house at rest stays clear of the line
          const cam = new THREE.PerspectiveCamera();
          place(cam, m.houseWidth / m.houseHeight);
          const clear = m.bottom - m.houseTop + (size[0] <= 900 ? 16 : 8);
          for (const body of bodies) {
            body.root.updateMatrixWorld(true);
            let top = Infinity;
            body.root.traverse((o) => {
              const mesh = o as THREE.Mesh;
              if (!mesh.isMesh) return;
              const p = mesh.geometry.attributes.position;
              for (let k = 0; k < p.count; k++) top = Math.min(top, ((1 - v.fromBufferAttribute(p, k).applyMatrix4(mesh.matrixWorld).project(cam).y) / 2) * m.houseHeight);
            });
            expect(top, `a house reaches the drafting line ${what}`).toBeGreaterThanOrEqual(clear);
          }
        }
      } finally { for (const b of bodies) b.dispose(); }
      expect(out[0].pieces.some((p: any) => p.cut), "a short word is shortened").toBe(false);
      // on a phone a 24-letter word can't fit whole beside the rest, so it alone is shortened: struck, or new in the stale line
      if (size[0] <= 900) {
        expect(out[1].pieces.find((p: any) => p.tag === "del").cut, "a 24-letter struck word isn't shortened on its own").toBe(true);
        expect(out[2].pieces.find((p: any) => p.tag === "b").cut, "a 24-letter new word isn't shortened on its own").toBe(true);
      }
    }, 180_000);
  }

  // The focused word field shows a visible keyboard focus: a 2px outline in
  // ink. It never touches a neighbouring word, on the same line or the lines
  // above and below, with at least a pixel of air (on a phone the words sit
  // ~5px apart, so the outline's offset is smaller there). Measured for every
  // word, empty field, as focusing it shows it.
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["phone 390×844", [390, 844]]] as const) {
    for (const longWords of [false, true]) {
      it(`outlines the focused word in ink, clear of every neighbouring word (${name}${longWords ? ", ten long words" : ""})`, async () => {
        const doc = await servedPage(baseUrl);
        if (longWords) stageWords(doc, Array(10).fill("wordmvadgycfe"));
        const rows = (await measureIn(doc, `(async () => {
          await document.fonts.ready;
          const forms = [...document.querySelectorAll('.stands-half .sentence form[action="/replace"]')];
          const ground = getComputedStyle(document.querySelector('.stands-half')).backgroundColor;
          return forms.map((f, i) => {
            const input = f.querySelector('input[name="word"]');
            input.focus();
            const cs = getComputedStyle(input), r = input.getBoundingClientRect();
            const grow = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth);
            const o = { left: r.left - grow, right: r.right + grow, top: r.top - grow, bottom: r.bottom + grow };
            // the closest any other word comes to the outline (negative: overlapping), and which word that is
            let air = Infinity, near = -1, nearBox = null;
            forms.forEach((g, j) => {
              if (j === i) return;
              const b = g.querySelector('label').getBoundingClientRect();
              const dx = Math.max(b.left - o.right, o.left - b.right), dy = Math.max(b.top - o.bottom, o.top - b.bottom);
              if (Math.max(dx, dy) < air) { air = Math.max(dx, dy); near = j; nearBox = b; }
            });
            const fix = (b) => b && [b.left, b.top, b.right, b.bottom].map((v) => +v.toFixed(2));
            const sentence = document.querySelector('.stands-half .sentence');
            // everything needed to explain a failure without rerunning it
            const why = { position: i + 1, neighbour: near + 1, neighbourWord: near >= 0 ? forms[near].querySelector('label').textContent : null,
              step: sentence.getAttribute('data-step'), fontSize: getComputedStyle(sentence).fontSize, viewport: [innerWidth, innerHeight],
              field: fix(r), outline: fix({ left: o.left, top: o.top, right: o.right, bottom: o.bottom }), neighbourBox: fix(nearBox),
              outlineOffset: cs.outlineOffset, outlineWidth: cs.outlineWidth, fonts: document.fonts.status };
            const out = { word: f.querySelector('label').textContent, focused: document.activeElement === input, style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor, ground, air, why };
            input.blur();
            return out;
          });
        })()`, [size[0], size[1]])) as { word: string; focused: boolean; style: string; width: number; color: string; ground: string; air: number; why: object }[];
        const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const lum = (c: number[]) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        for (const w of rows) {
          expect(w.focused, `"${w.word}" can't be focused`).toBe(true);
          expect(w.style, `"${w.word}" shows no focus outline`).not.toBe("none");
          expect(w.width, `"${w.word}"'s focus outline is too thin to see`).toBeGreaterThanOrEqual(2);
          const [a, b] = [lum(rgb(w.color)), lum(rgb(w.ground))].sort((m, n) => n - m);
          expect((a + 0.05) / (b + 0.05), `"${w.word}"'s focus outline doesn't stand out from the ground`).toBeGreaterThanOrEqual(3);
          expect(w.air, `"${w.word}"'s focus outline touches a neighbouring word: ${JSON.stringify({ air: +w.air.toFixed(2), ...w.why })}`).toBeGreaterThanOrEqual(1);
        }
      }, 90_000);
    }
  }

  // Every word at rest carries a faint solid line under it, the label's own
  // underline (so the word's box and the sentence's wrap don't move), on every
  // device. It was a phone's alone, a desktop showing nothing until a word was
  // pointed at; at the 28 October playtest, people on a desktop didn't see the
  // words could be clicked. It must never be taken for the visitor's own word
  // (a dotted line, darker) or a kept gap (a faint word with a dashed line, on
  // the other ground): solid, never dotted, and fainter than the mark. Staged in the
  // measured copy: one word marked as the visitor's, as GET / renders one.
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1280×800", [1280, 800]], ["phone 390×844", [390, 844]]] as const) {
    it(`marks the words as changeable at rest on every device, never like your own word (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      const label = doc.querySelector('.stands-half .sentence form[action="/replace"] label')!;
      const mark = doc.createElement("mark");
      mark.textContent = label.textContent;
      label.replaceChildren(mark);
      const plain = (await measureIn(await servedPage(baseUrl), `(async () => { await document.fonts.ready;
        return [...document.querySelectorAll('.stands-half .sentence label')].map((l) => { const r = l.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }); })()`, [size[0], size[1]])) as number[][];
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
        const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        const ground = rgb(getComputedStyle(document.querySelector('.stands-half')).backgroundColor);
        // a line's contrast on the field, its alpha laid over the ground
        const contrast = (c) => { const [r, g, b, a = 1] = rgb(c), k = [r * a + ground[0] * (1 - a), g * a + ground[1] * (1 - a), b * a + ground[2] * (1 - a)];
          const [x, y] = [lum(k), lum(ground)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const line = (el) => { const cs = getComputedStyle(el); const on = cs.textDecorationLine.includes('underline');
          return { on, style: cs.textDecorationStyle, contrast: on ? contrast(cs.textDecorationColor) : 1 }; };
        const labels = [...document.querySelectorAll('.stands-half .sentence label')];
        const rest = labels.slice(1).map((l) => ({ word: l.textContent, ...line(l) }));
        const mine = line(labels[0].querySelector('mark')), mineLabel = line(labels[0]);
        const boxes = labels.map((l) => { const r = l.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
        const media = ["(hover: none)", "(hover: hover)", "(any-hover: hover)", "(pointer: fine)", "(pointer: coarse)", "(pointer: none)"].filter((q) => matchMedia(q).matches).join(" ");
        return { rest, mine, mineLabel, boxes, media };
      })()`, [size[0], size[1]])) as { rest: { word: string; on: boolean; style: string; contrast: number }[]; mine: { style: string; contrast: number }; mineLabel: { on: boolean; contrast: number }; boxes: number[][]; media: string };
      for (const w of m.rest) {
        expect(w.on && w.contrast > 1.05, `"${w.word}" shows no line at rest (matched: ${m.media})`).toBe(true);
        expect(w.style, `"${w.word}"'s line at rest is drawn like your own word's`).toBe("solid");
        expect(w.contrast, `"${w.word}"'s line at rest is as strong as your own word's`).toBeLessThan(m.mine.contrast);
      }
      // your word: its dotted line alone, not doubled by the resting one
      expect(m.mineLabel.on && m.mineLabel.contrast > 1.05, "your own word carries the resting line under its dotted one").toBe(false);
      expect(m.mine.style, "your own word's line isn't dotted").toBe("dotted");
      // the line moves nothing: every word's box is where it is without a mark staged
      m.boxes.slice(1).forEach((b, i) => b.forEach((v, k) => expect(Math.abs(v - plain[i + 1][k]), `the resting line moved "${m.rest[i].word}"`).toBeLessThanOrEqual(0.5)));
    }, 90_000);
  }

  it("never invites on an earlier form (?at=N)", async () => {
    const res = await fetch(new URL("/?at=0", baseUrl));
    expect(res.status).toBe(200);
    const doc = new JSDOM(await res.text()).window.document;
    expect(doc.querySelector(".invite"), "an earlier form invites a change").toBeNull();
  });

  // On a phone the kept house is one to two screens down (974px fresh, 1390px
  // with ten long words, measured at 390x844), and the footer line saying so
  // can itself fall below the first screen (992px with ten long words). So
  // the way there is in the header row, where desktop shows the two labels
  // side by side: "What stands" on the left, a link "What was kept ↓" on the
  // right, in the same caps; the kept half's header links back up. It reads
  // as the page's structure, not a button. The footer line stays as it is,
  // unlinked (the moment's acknowledgements use it). Tap-only: the page never
  // scrolls by itself. Plain anchors, so it works without JavaScript (this
  // copy runs none). Nothing above the sentence grows, so the invitation and
  // the house keep their places.
  for (const longWords of [false, true]) {
    it(`links to the kept half and back from the header rows on a phone, never scrolling by itself (390×844${longWords ? ", ten long words" : ""})`, async () => {
      const doc = await servedPage(baseUrl);
      if (longWords) stageWords(doc, Array(10).fill("wordmvadgycfe"));
      // where the sentence and house stood without the links: the header row mustn't grow
      const withoutLinks = doc.cloneNode(true) as Document;
      withoutLinks.querySelectorAll("a.to-kept, a.to-stands").forEach((a) => a.remove());
      const baseline = (await measureIn(withoutLinks, `(async () => { await document.fonts.ready; const t = (s) => document.querySelector(s).getBoundingClientRect().top; return { sentence: t('.stands-half .sentence'), house: t('.stands-half #house'), invite: t('.stands-half .invite') }; })()`, [390, 844])) as { sentence: number; house: number; invite: number };
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const settle = () => new Promise((r) => setTimeout(r, 900)); // a smooth scroll has finished
        const q = ${QUERY_JS};
        const down = document.querySelector('.stands-half a.to-kept'), up = document.querySelector('.kept-half a.to-stands'); // may be absent: reported as missing
        if (!down || !up) return { missing: { down: !!down, up: !!up } };
        await settle();
        const atLoad = scrollY;
        const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
        const style = (el) => { const s = getComputedStyle(el); return [s.fontSize, s.letterSpacing, s.textTransform].join(' '); };
        const t = (s) => q(s).getBoundingClientRect().top;
        const placed = { sentence: t('.stands-half .sentence'), house: t('.stands-half #house'), invite: t('.stands-half .invite') };
        const downBox = box(down), standsLabel = box(q('.stands-half .half-label')), upBox = box(up), keptLabel = box(q('.kept-half .kept-label'));
        const sameStyle = style(down) === style(q('.stands-half .half-label')) && style(up) === style(q('.kept-half .kept-label'));
        const footer = document.querySelector('.stands-half .kept-pointer'); // may be absent: reported below, not thrown
        const footerLinked = !!footer && (footer.tagName === 'A' || !!footer.closest('a') || !!footer.querySelector('a'));
        const target = (a) => document.querySelector(a.getAttribute('href')); // may be absent: reported below, not thrown
        down.click(); await settle();
        const house = box(q('#house-kept'));
        const downTarget = !!target(down) && target(down).classList.contains('kept-half');
        up.click(); await settle();
        const sentence = box(q('.stands-half .sentence'));
        return { atLoad, downBox, standsLabel, upBox, keptLabel, sameStyle, footerLinked, placed, house, downTarget,
          upTarget: !!target(up) && target(up).classList.contains('stands-half'), sentence, downText: down.textContent.trim(), upText: up.textContent.trim() };
      })()`, [390, 844])) as any;
      expect(m.missing, "the phone has no header link to the kept half, or none back").toBeUndefined();
      expect(m.atLoad, "the page scrolled by itself on load").toBe(0);
      // in the header rows, beside the labels, in their caps
      expect(m.downText, "the link down isn't 'What was kept ↓'").toMatch(/^What was kept\s*↓$/i);
      expect(m.upText, "the link back isn't 'Back to what stands ↑'").toMatch(/^Back to what stands\s*↑$/i);
      expect(m.sameStyle, "the header links aren't in the labels' caps").toBe(true);
      expect(Math.abs(m.downBox.top - m.standsLabel.top), "'What was kept' isn't on the 'What stands' row").toBeLessThanOrEqual(2);
      expect(m.downBox.left, "'What was kept' isn't to the right of 'What stands'").toBeGreaterThan(m.standsLabel.right);
      expect(Math.abs(m.upBox.top - m.keptLabel.top), "the way back isn't on the 'What was kept' row").toBeLessThanOrEqual(2);
      expect(m.upBox.left, "the way back isn't to the right of 'What was kept'").toBeGreaterThan(m.keptLabel.right);
      expect(m.downBox.bottom, "the link down isn't on the first screen").toBeLessThanOrEqual(844);
      expect(m.footerLinked, "the footer line became a link").toBe(false);
      // nothing above the sentence grew: the sentence, the invitation and the house keep their places
      for (const k of ["sentence", "invite", "house"] as const) expect(Math.abs(m.placed[k] - baseline[k]), `the header link moved the ${k}`).toBeLessThanOrEqual(0.5);
      // the jumps themselves
      expect(m.downTarget, "the link doesn't lead to the kept half").toBe(true);
      expect(m.house.top, "following the link leaves the kept house below the screen").toBeLessThan(844);
      expect(m.house.top, "following the link scrolls past the kept house").toBeGreaterThanOrEqual(0);
      expect(m.upTarget, "the way back doesn't lead to what stands").toBe(true);
      expect(m.sentence.top, "the way back doesn't bring the live sentence into view").toBeGreaterThanOrEqual(0);
      expect(m.sentence.bottom, "the way back doesn't bring the live sentence into view").toBeLessThanOrEqual(844);
    }, 90_000);
  }

  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1280×800", [1280, 800]]] as const) {
    it(`shows neither header link when the halves stand side by side (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      const shown = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        return [...document.querySelectorAll('a.to-kept, a.to-stands')].filter((a) => getComputedStyle(a).display !== 'none').length;
      })()`, [size[0], size[1]])) as number;
      expect(shown, "a phone link shows beside the halves").toBe(0);
    }, 90_000);
  }

  // The captions (the instructions, your trace, the kept note) are read, not
  // glanced at: at least 15px on a desktop and 14px on a phone, at a contrast
  // of at least 6:1 on their half's ground (measured over the ground, opacity
  // included). A trace is staged in the measured copy the way GET / renders one.
  // The invitation is the first line a stranger reads, so it is held to the
  // same contrast; it keeps its own small caps size (the notation's slot).
  for (const [name, size, px] of [["1920×1080", [1920, 1080], 15], ["phone 390×844", [390, 844], 14]] as const) {
    it(`sets the captions large and dark enough to read (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      if (!doc.querySelector('section[aria-labelledby="trace-heading"]')) {
        const section = doc.createElement("section");
        section.setAttribute("aria-labelledby", "trace-heading");
        section.innerHTML = '<h2 id="trace-heading">Your trace</h2><p role="status">Your word “ferry” still stands, marked in the sentence above. You can act again, anywhere but place 01, where it stands.</p>';
        doc.getElementById("how")!.after(section);
      }
      const rows = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
        const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        const opacity = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
        return [['instructions', '#how'], ['trace', 'section[aria-labelledby="trace-heading"] [role="status"]'], ['kept note', '.kept-half .kept-note'], ['invitation line', '.stands-half .invite']].map(([what, sel]) => {
          const el = document.querySelector(sel), cs = getComputedStyle(el), ground = rgb(getComputedStyle(el.closest('.half')).backgroundColor);
          const [r, g, b, a = 1] = rgb(cs.color), k = a * opacity(el), c = [r * k + ground[0] * (1 - k), g * k + ground[1] * (1 - k), b * k + ground[2] * (1 - k)];
          const [x, y] = [lum(c), lum(ground)].sort((m, n) => n - m);
          return { what, size: parseFloat(cs.fontSize), contrast: (x + 0.05) / (y + 0.05) };
        });
      })()`, [size[0], size[1]])) as { what: string; size: number; contrast: number }[];
      for (const r of rows) {
        if (r.what !== "invitation line") expect(r.size, `the ${r.what} are too small to read`).toBeGreaterThanOrEqual(px);
        expect(r.contrast, `the ${r.what} are too faint on their ground`).toBeGreaterThanOrEqual(6);
      }
    }, 60_000);
  }

  // A drawing sheet: the live half on drafting paper (#ECE8DF), the kept half a
  // blueprint (#1D3350), each with a faint grid, and every label (the small
  // caps: half labels, the invitation, the notation, links) lettered in IBM
  // Plex Mono, served by the app itself. Every label is legible where it lies:
  // at least 4.5:1, and every caption at least 6:1, measured against the
  // darkest point of its ground, a grid line, never the flat colour alone.
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1280×800", [1280, 800]], ["phone 390×844", [390, 844]]] as const) {
    it(`draws a sheet and a blueprint, lettered in Plex Mono, every label legible on its grid (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      // the served stylesheet carries the font itself; no third-party font host
      const css = doc.querySelector("style")!.textContent!;
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
        const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const over = ([r, g, b, a = 1], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
        // a half's ground, and its grid line laid over it: the darker (or, on the blueprint, the lighter) of the two is the worst case for text
        const grounds = (half) => {
          const cs = getComputedStyle(half), flat = rgb(cs.backgroundColor), line = (cs.backgroundImage.match(/rgba?\\([^)]*\\)/) || [null])[0];
          return { flat, grid: line ? over(rgb(line), flat) : null, image: cs.backgroundImage, size: cs.backgroundSize };
        };
        const halves = { stands: grounds(document.querySelector('.stands-half')), kept: grounds(document.querySelector('.kept-half')) };
        const worst = (el, fg) => { const g = halves[el.closest('.kept-half') ? 'kept' : 'stands']; return Math.min(ratio(fg, g.flat), g.grid ? ratio(fg, g.grid) : Infinity); };
        const ink = (el) => { const cs = getComputedStyle(el); let k = 1; for (let e = el; e; e = e.parentElement) k *= Number(getComputedStyle(e).opacity);
          const [r, g, b, a = 1] = rgb(cs.color), half = halves[el.closest('.kept-half') ? 'kept' : 'stands'].flat; return over([r, g, b, a * k], half); };
        const shown = (el) => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
        const labels = [...document.querySelectorAll('.two .caps')].filter(shown).map((el) => ({ what: (el.className + ' ' + el.textContent.trim()).slice(0, 60),
          family: getComputedStyle(el).fontFamily, contrast: worst(el, ink(el)) }));
        const captions = ['#how', '.kept-half .kept-note', '.stands-half .invite'].map((s) => document.querySelector(s)).filter((el) => el && shown(el))
          .map((el) => ({ what: el.id || el.className, contrast: worst(el, ink(el)) }));
        const plex = [...document.fonts].filter((f) => /IBM Plex Mono/.test(f.family) && f.status === 'loaded').length;
        return { halves, labels, captions, plex };
      })()`, [size[0], size[1]])) as {
        halves: Record<"stands" | "kept", { flat: number[]; grid: number[] | null; image: string; size: string }>;
        labels: { what: string; family: string; contrast: number }[]; captions: { what: string; contrast: number }[]; plex: number;
      };
      expect(css, "the stylesheet loads a font from a third-party host").not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
      expect(m.halves.stands.flat.slice(0, 3), "the live half isn't on drafting paper").toEqual([236, 232, 223]);
      expect(m.halves.kept.flat.slice(0, 3), "the kept half isn't a blueprint").toEqual([29, 51, 80]);
      for (const k of ["stands", "kept"] as const) {
        expect(m.halves[k].grid, `the ${k} half has no grid`).not.toBeNull();
        expect(m.halves[k].image, `the ${k} half's grid isn't ruled both ways`).toMatch(/linear-gradient.*linear-gradient/);
      }
      expect(m.plex, "IBM Plex Mono isn't loaded").toBeGreaterThan(0);
      expect(m.labels.length, "no labels measured").toBeGreaterThan(2);
      for (const l of m.labels) {
        expect(l.family, `"${l.what}" isn't lettered in IBM Plex Mono`).toMatch(/^"?IBM Plex Mono"?/);
        expect(l.contrast, `"${l.what}" is too faint on its grid`).toBeGreaterThanOrEqual(4.5);
      }
      for (const c of m.captions) expect(c.contrast, `the ${c.what} is too faint on its grid`).toBeGreaterThanOrEqual(6);
    }, 90_000);
  }

  // The foot is set, not just wrapped. No caption ends on one word alone on its
  // last line ("rebuilt.", "else.", "house."): the measured copy stages a trace
  // the way GET / renders one, so the trace is held to it too. The site's two
  // links read as two units: neither breaks inside itself anywhere, and side
  // by side they share one line, clear of the notes and captions, still last
  // in reading order (placed by the stylesheet, never moved in the markup).
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1440×900", [1440, 900]], ["1280×800", [1280, 800]], ["phone 390×844", [390, 844]]] as const) {
    it(`ends no caption on a lone word, and keeps the site's links whole (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      if (!doc.querySelector('section[aria-labelledby="trace-heading"]')) {
        const section = doc.createElement("section");
        section.setAttribute("aria-labelledby", "trace-heading");
        section.innerHTML = '<h2 id="trace-heading">Your trace</h2><p role="status">Your word “ferry” still stands, marked in the sentence above. You can act again, anywhere but place 01, where it stands.</p>';
        doc.getElementById("how")!.after(section);
      }
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        // the last two words of an element's text: on different lines, the last stands alone
        const lone = (el) => {
          const words = [];
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n; (n = walker.nextNode()); ) {
            if (n.parentElement.closest('.sr-only, .esc') && getComputedStyle(n.parentElement).clipPath !== 'none') continue;
            for (const w of n.textContent.matchAll(/\\S+/g)) words.push([n, w.index, w.index + w[0].length]);
          }
          if (words.length < 2) return false;
          const top = ([n, a, b]) => { const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b); return r.getClientRects()[0].top; };
          return Math.abs(top(words.at(-1)) - top(words.at(-2))) > 2;
        };
        const captions = [['the plate note', '.stands-half .plate-note'], ['the kept plate note', '.kept-half .plate-note'], ['the instructions', '#how'],
          ['the trace', 'section[aria-labelledby="trace-heading"] [role="status"]'], ['the kept note', '.kept-half .kept-note'], ['the question', '.stands-half .question']]
          .map(([what, sel]) => ({ what, lone: lone(document.querySelector(sel)) }));
        const nav = document.querySelector('.stands-half .foot .about');
        const links = [...nav.querySelectorAll('a')].map((a) => ({ text: a.textContent, lines: a.getClientRects().length, top: a.getBoundingClientRect().top }));
        const nb = nav.getBoundingClientRect();
        const overlaps = [...document.querySelectorAll('.stands-half .foot :is(#how, section, .earlier, .plate-note, .question)')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > nb.top + 0.5 && r.top < nb.bottom - 0.5 && r.right > nb.left && r.left < nb.right; })
          .map((el) => el.id || el.className || el.tagName);
        const after = (sel) => { const el = document.querySelector(sel); return !el || !!(el.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING); };
        return { captions, links, overlaps, last: after('#how') && after('.stands-half .earlier') && after('section[aria-labelledby="trace-heading"]') };
      })()`, [size[0], size[1]])) as { captions: { what: string; lone: boolean }[]; links: { text: string; lines: number; top: number }[]; overlaps: string[]; last: boolean };
      for (const c of m.captions) expect(c.lone, `${c.what} ends on a lone word`).toBe(false);
      for (const l of m.links) expect(l.lines, `"${l.text}" breaks across lines`).toBe(1);
      if (size[0] > 900) expect(Math.abs(m.links[0].top - m.links[1].top), "the site's links don't share one line").toBeLessThanOrEqual(1);
      expect(m.overlaps, "the site's links overlap the notes").toEqual([]);
      expect(m.last, "the site's links aren't last in reading order").toBe(true);
    }, 90_000);
  }

  // A phone has no Escape key: the instructions' "Press Escape to cancel."
  // takes no visible space there, while a screen reader still reads it in
  // #how (every word field is described by it). A desktop shows it.
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["phone 390×844", [390, 844]]] as const) {
    it(`shows "Press Escape to cancel" only where there's an Escape key, and always to a screen reader (${name})`, async () => {
      const doc = await servedPage(baseUrl);
      const how = doc.getElementById("how");
      expect(how?.textContent, "#how doesn't say Press Escape to cancel").toContain("Press Escape to cancel.");
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        // a miss says what the measured page held where the instructions belong (CI once found no #how
        // here, in a page whose served copy had one), instead of failing inside createTreeWalker
        const foot = document.querySelector('.stands-half .foot');
        if (!document.getElementById('how')) throw new Error('the measured page has no #how | ids=' + JSON.stringify([...document.querySelectorAll('[id]')].map((e) => e.id)) +
          ' foot(600)=' + JSON.stringify(foot ? foot.innerHTML.slice(0, 600) : null) + ' halves=' + document.querySelectorAll('.half').length);
        const how = (${QUERY_JS})('#how');
        const walker = document.createTreeWalker(how, NodeFilter.SHOW_TEXT);
        let node; while ((node = walker.nextNode()) && !node.textContent.includes('Escape'));
        const el = node.parentElement, r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        // still in the accessibility tree: not display:none, not visibility:hidden, not aria-hidden
        const read = cs.display !== 'none' && cs.visibility !== 'hidden' && !el.closest('[aria-hidden="true"]');
        return { width: r.width, height: r.height, read, own: el !== how };
      })()`, [size[0], size[1]])) as { width: number; height: number; read: boolean; own: boolean };
      expect(m.read, "a screen reader can't read it").toBe(true);
      if (size[0] <= 900) {
        expect(m.own, "the Escape sentence isn't its own element, so it can't be hidden alone").toBe(true);
        expect(m.width * m.height, "a phone shows the Escape sentence").toBeLessThanOrEqual(1);
      } else {
        expect(m.width, "a desktop doesn't show the Escape sentence").toBeGreaterThan(20);
      }
    }, 60_000);
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
