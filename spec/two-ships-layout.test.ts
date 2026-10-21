import * as THREE from "three";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { buildBody } from "../src/lib/house/build";
import { place } from "../src/lib/house/camera";
import { TERRITORIES } from "../src/lib/house/territories";
import { measureIn, QUERY_JS, servedPage } from "./chrome";
import { EXTREMES, SENTENCES } from "./house-sentences";

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
  // what the page was measured at: so a failure says what Chrome actually laid out
  context: { innerWidth: number; innerHeight: number; fonts: string; fontsLoaded: number };
  stands: Box; kept: Box;
  standsBg: string; keptBg: string; groundContrast: number;
  standsSentence: Box; standsHouse: Box; keptSentence: Box; keptHouse: Box;
  liveSize: number; keptSize: number; keptTextContrast: number;
  gaps: { width: number; ink: number }[];
  pointer: Box | null; pointerShown: boolean;
  // each live word, and the text shown under it in its slot (outside its form), if any
  slots: { word: string; under: string[] }[];
};

async function layout(size: [number, number], longNotes = false, longWords = false): Promise<Layout> {
  const doc = await servedPage(baseUrl);
  // a staged long sentence, in the measured copy only: ten 13-letter words
  if (longWords) for (const l of doc.querySelectorAll('.stands-half .sentence form[action="/replace"] label')) l.textContent = "wordmvadgycfe";
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
    // every kept word as a gap, as GET / serves one: the empty ship's ten blanks
    for (const w of keptSentence.querySelectorAll('.w')) { w.classList.add('gap'); w.textContent = ''; }
    const gaps = [...keptSentence.querySelectorAll('.w.gap')].map((g) => {
      const s = getComputedStyle(g);
      return { width: g.getBoundingClientRect().width / parseFloat(ks.fontSize), ink: parseFloat(s.borderBottomWidth) > 0 ? ink(g, 'borderBottomColor') : 0 };
    });
    return {
      viewport: innerWidth,
      context: { innerWidth, innerHeight, fonts: document.fonts.status, fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').length },
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
      slots: [...document.querySelectorAll('.stands-half .sentence form[action="/replace"]')].map((f) => ({
        word: f.querySelector('label').textContent,
        under: [...f.closest('.pos').querySelectorAll('*')].filter((el) => !f.contains(el) && el.children.length === 0 && el.textContent.trim()
          && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().top >= f.getBoundingClientRect().bottom - 1).map((el) => el.textContent.trim()) })),
    };
  })()`, size)) as Layout;
}

type Notation = {
  sentenceBottom: number; partBottom: number; footTop: number;
  houseWidth: number; houseHeight: number; houseBottom: number;
  hidden: { sentence: number; house: number; kept: number };
  shown: { text: string; sentence: number; house: number; kept: number }[];
};

// The live half with the part notation hidden, then showing each of the ten
// parts' notations in turn, as choosing a word shows it (served copy only).
async function notation(size: [number, number], longWords: boolean): Promise<Notation> {
  const doc = await servedPage(baseUrl);
  if (longWords) for (const l of doc.querySelectorAll('.stands-half .sentence form[action="/replace"] label')) l.textContent = "wordmvadgycfe";
  const labels = TERRITORIES.map((t, i) => `${String(i + 1).padStart(2, "0")} — ${t.label}`);
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
  // an empty kept ship: ten blanks, each wide enough to read as a missing word, and drawn visibly
  expect(l.gaps, "the kept sentence has no ten gaps" + m).toHaveLength(10);
  for (const [i, g] of l.gaps.entries()) {
    expect(g.width, `gap ${i} is too narrow to read as a missing word` + m).toBeGreaterThanOrEqual(1.2);
    expect(g.ink, `gap ${i} isn't visible on the kept ground` + m).toBeGreaterThanOrEqual(3);
  }
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

  // GET / shows only what stands now (the maker's decision): no earlier words
  // under the live words, so a long sentence never pushes the houses off the
  // first screen. The words are a staged long sentence in the measured copy;
  // whatever the server renders under them is what's under test.
  for (const [name, size, limit] of [["1920×1080", [1920, 1080], 2 / 3], ["phone 390×844", [390, 844], 0.85]] as const) {
    it(`shows nothing under a live word, and keeps the houses on the first screen with ten long words (${name})`, async () => {
      const l = await layout([size[0], size[1]], false, true);
      expect(l.slots).toHaveLength(10);
      for (const s of l.slots) expect(s.under, `words shown under "${s.word}"`).toEqual([]);
      expect(l.standsHouse.top, "the live house starts too far down the first screen").toBeLessThanOrEqual(size[1] * limit);
      // side by side, the kept house starts level with it; stacked, it's below by design (the pointer says so)
      if (size[0] > 900) expect(l.keptHouse.top, "the kept house starts too far down the first screen").toBeLessThanOrEqual(size[1] * limit);
    }, 90_000);
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
        // never over a house at rest: every body's topmost point is at least 8px below the notation
        const cam = new THREE.PerspectiveCamera();
        place(cam, n.houseWidth / n.houseHeight);
        const clear = n.partBottom - n.hidden.house + 8; // px from the canvas top
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
          expect(top, `"${words.join(" ")}" reaches the part notation`).toBeGreaterThanOrEqual(clear);
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
        if (longWords) for (const l of doc.querySelectorAll('.stands-half .sentence form[action="/replace"] label')) l.textContent = "wordmvadgycfe";
        const m = (await measureIn(doc, `(async () => {
          await document.fonts.ready;
          const q = (s) => document.querySelector(s);
          const inv = q('.stands-half .invite'), part = q('#part');
          if (!inv) return { missing: true };
          const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
          const at = () => ({ sentence: q('.stands-half .sentence').getBoundingClientRect().top, house: q('.stands-half #house').getBoundingClientRect().top, kept: q('#house-kept').getBoundingClientRect().top });
          const rest = { inv: box(inv), visible: getComputedStyle(inv).visibility === 'visible' && getComputedStyle(inv).display !== 'none', text: inv.textContent.trim(),
            lineHeight: parseFloat(getComputedStyle(inv).lineHeight) || 18, hidden: inv.closest('[aria-hidden="true"]') !== null, at: at(),
            sentenceBottom: q('.stands-half .sentence').getBoundingClientRect().bottom, half: box(q('.stands-half')) };
          part.hidden = false; part.textContent = '08 — upper-right volume';
          const chosen = { invVisible: getComputedStyle(inv).visibility === 'visible' && getComputedStyle(inv).display !== 'none', part: box(part), at: at() };
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
        // choosing a word: the notation takes the same slot, the invitation steps aside, nothing moves
        expect(chosen.invVisible, "the invitation stays while a part's notation is shown").toBe(false);
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
        const q = (s) => document.querySelector(s);
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
      if (longWords) for (const l of doc.querySelectorAll('.stands-half .sentence form[action="/replace"] label')) l.textContent = "wordmvadgycfe";
      // where the sentence and house stood without the links: the header row mustn't grow
      const withoutLinks = doc.cloneNode(true) as Document;
      withoutLinks.querySelectorAll("a.to-kept, a.to-stands").forEach((a) => a.remove());
      const baseline = (await measureIn(withoutLinks, `(async () => { await document.fonts.ready; const t = (s) => document.querySelector(s).getBoundingClientRect().top; return { sentence: t('.stands-half .sentence'), house: t('.stands-half #house'), invite: t('.stands-half .invite') }; })()`, [390, 844])) as { sentence: number; house: number; invite: number };
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const settle = () => new Promise((r) => setTimeout(r, 900)); // a smooth scroll has finished
        const q = (s) => document.querySelector(s);
        const down = q('.stands-half a.to-kept'), up = q('.kept-half a.to-stands');
        if (!down || !up) return { missing: { down: !!down, up: !!up } };
        await settle();
        const atLoad = scrollY;
        const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
        const style = (el) => { const s = getComputedStyle(el); return [s.fontSize, s.letterSpacing, s.textTransform].join(' '); };
        const t = (s) => q(s).getBoundingClientRect().top;
        const placed = { sentence: t('.stands-half .sentence'), house: t('.stands-half #house'), invite: t('.stands-half .invite') };
        const downBox = box(down), standsLabel = box(q('.stands-half .half-label')), upBox = box(up), keptLabel = box(q('.kept-half .kept-label'));
        const sameStyle = style(down) === style(q('.stands-half .half-label')) && style(up) === style(q('.kept-half .kept-label'));
        const footer = q('.stands-half .kept-pointer');
        const footerLinked = !!footer && (footer.tagName === 'A' || !!footer.closest('a') || !!footer.querySelector('a'));
        const target = (a) => q(a.getAttribute('href'));
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
