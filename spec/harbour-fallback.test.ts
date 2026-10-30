import { describe, expect, inject, it } from "vitest";
import { liveIn } from "./chrome";

// Without WebGL, or before it loads, the page is the sentence, its forms, the
// kept sentence and the waiting row, complete and usable; nothing waits on the
// canvas (CLAUDE.md "Scope (Final Project: the ship, in one harbour)"). The
// marking asks for exactly this: WebGL unavailable, and the sentence and the
// forms still work. Checked on the app's own page in headless Chrome: once with
// scripts off, once with WebGL refused (--disable-webgl), at a desktop and a
// phone size. Reads only: never changes the shared sentence.

const baseUrl = inject("baseUrl");
const SIZES = [["1440×900", [1440, 900]], ["phone 390×844", [390, 844]]] as const;

const PAGE = `(async () => {
  await document.fonts.ready;
  const forms = [...document.querySelectorAll('.sentence-strip .sentence form[action="/replace"]')];
  const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const harbour = document.querySelector('#harbour');
  const strips = ['.sentence-strip', '.kept-strip'].map((s) => document.querySelector(s));
  // a form works without a script: a POST to /replace with the position, the version seen and a word field
  const working = forms.filter((f) => f.method === 'post' && new URL(f.action).pathname === '/replace' && f.querySelector('input[name="position"]') && f.querySelector('input[name="version"]') && f.querySelector('input[name="word"]') && shown(f.querySelector('label')));
  const canvas = document.querySelector('#harbour canvas');
  const hb = harbour && harbour.getBoundingClientRect();
  return {
    forms: forms.length, working: working.length,
    sentence: shown(document.querySelector('.sentence-strip .sentence')), kept: shown(document.querySelector('.kept-strip .kept-sentence')),
    waiting: !!document.querySelector('.kept-strip .waiting'),
    canvas: !!canvas, harbourHeight: hb ? hb.height : 0,
    // nothing lies over the strips: the topmost element at each word's centre is that word (or inside its form)
    covered: forms.map((f) => { const l = f.querySelector('label'), r = l.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (y < 0 || y > innerHeight) return false; const top = document.elementFromPoint(x, y); return !!top && !f.contains(top); }).filter(Boolean).length,
    stripsShown: strips.every(shown), scroll: document.documentElement.scrollWidth, vw: innerWidth,
  };
})()`;

describe("the page without WebGL", () => {
  for (const [name, size] of SIZES) {
    it(`offers the whole page with scripts off: ten working forms, the sentence, the kept sentence and the waiting row (${name})`, async () => {
      const m = (await liveIn(new URL("/", baseUrl).href, PAGE, [size[0], size[1]], { noScript: true })) as any;
      expect(m.forms, "the sentence doesn't have ten forms").toBe(10);
      expect(m.working, "a form doesn't work without a script").toBe(10);
      expect(m.sentence, "the sentence isn't shown").toBe(true);
      expect(m.kept, "the kept sentence isn't shown").toBe(true);
      expect(m.waiting, "the waiting row isn't served").toBe(true);
      expect(m.canvas, "a canvas was drawn without a script").toBe(false);
      expect(m.stripsShown, "a strip isn't shown").toBe(true);
      expect(m.covered, "something lies over a word").toBe(0);
      expect(m.scroll, "the page scrolls sideways").toBeLessThanOrEqual(m.vw);
    }, 60_000);

    it(`offers the whole page with WebGL refused, the harbour giving way (${name})`, async () => {
      const m = (await liveIn(new URL("/", baseUrl).href, PAGE, [size[0], size[1]], { flags: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"], settleMs: 1500 })) as any;
      expect(m.working, "a form doesn't work without WebGL").toBe(10);
      expect(m.sentence && m.kept && m.waiting, "the sentence, kept sentence or waiting row is missing").toBe(true);
      expect(m.canvas, "a canvas was left without WebGL").toBe(false);
      expect(m.harbourHeight, "an empty harbour still takes the screen").toBeLessThanOrEqual(1);
      expect(m.covered, "something lies over a word").toBe(0);
      expect(m.scroll, "the page scrolls sideways").toBeLessThanOrEqual(m.vw);
    }, 60_000);
  }
});
