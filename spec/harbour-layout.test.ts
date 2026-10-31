import * as THREE from "three";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { buildShip } from "../src/lib/ship/build";
import { drafting, showDrafting } from "../src/lib/ship/notation";
import { KEPT_POSE, LIVE_POSE, place, posed } from "../src/lib/ship/stage";
import { SIZE_STEPS, sizeStep } from "../src/lib/sentence-step";
import { STARTING_WORDS } from "../src/lib/sentence";
import { liveIn, measureIn, QUERY_JS, servedPage, stageHarbour, type HarbourState } from "./chrome";
import { EXTREMES, SENTENCES } from "./ship-sentences";

// GET / as one harbour (docs/decisions/0005-the-ship.md), measured in headless
// Chrome from the served markup and stylesheet, scripts left out. One scene:
// the live ship on the water, the kept ship on its slipway, the pallet; the
// sentence on a parchment strip that shares the first screen with it (over or
// under the scene on a desktop, as the prototype's panel does; with it on a
// phone once the band is folded), never covering the live ship's hull at
// rest; the kept sentence on its own strip and the notes (the rule, your
// trace, Earlier form, the plate note) in their own block, either of which
// may fall below.
//
// Every check stages its whole state with stageHarbour (spec/chrome.ts): the
// words, the kept ship, the waiting row, the band, the trace and the ways
// back, set as the server renders them. Nothing a check measures comes from
// what an earlier spec file left in the shared container. Where a check needs
// the scene (the hull, a part tag), it projects the ship's real geometry
// through the page's own camera (src/lib/ship/stage.ts) at the measured
// harbour's size.

const baseUrl = inject("baseUrl");
const MAKER = [...STARTING_WORDS];
const LONG13 = Array(10).fill("wordmvadgycfe");
const LONG24 = Array(10).fill("w".repeat(24));
const KEPT_PART: HarbourState["kept"] = {
  words: MAKER.map((w, i) => (i % 2 ? w : `kept${i}`)),
  gaps: MAKER.map((_, i) => i % 2 === 1),
  next: MAKER.map((_, i) => (i === 2 ? "ceremony" : i === 6 ? "wonder" : null)),
};
const BASE: HarbourState = { words: MAKER, kept: KEPT_PART, band: "folded", trace: null, earlierForm: 3, earlierShip: null };
const DESKTOPS = [["1920×1080", [1920, 1080]], ["1440×900", [1440, 900]], ["1280×800", [1280, 800]]] as const;
const PHONE = ["phone 390×844", [390, 844]] as const;
const ALL = [...DESKTOPS, PHONE] as const;
const isPhone = (size: readonly [number, number]) => size[0] <= 900;

async function staged(state: Partial<HarbourState> = {}): Promise<Document> {
  const doc = await servedPage(baseUrl);
  stageHarbour(doc, { ...BASE, ...state });
  return doc;
}

const BOX = `(el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }`;
const CONTRAST = `
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const opacity = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  // the ground an element is read on: the nearest ancestor with an opaque background
  const groundOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length && (c[3] ?? 1) > 0.9) return c.slice(0, 3); } return [255, 255, 255]; };
  const inkOn = (el, prop = 'color') => { const [r, g, b, a = 1] = rgb(getComputedStyle(el)[prop]), k = a * opacity(el), G = groundOf(el); return ratio([r * k + G[0] * (1 - k), g * k + G[1] * (1 - k), b * k + G[2] * (1 - k)], G); };
`;

// where the live ship's hull reaches on screen, at rest, for a harbour box of this size: real geometry through the page's camera
function hullOnScreen(words: readonly string[], harbour: { left: number; top: number; width: number; height: number }, layout: "desktop" | "phone"): { left: number; top: number; right: number; bottom: number } {
  const ship = buildShip(words), cam = new THREE.PerspectiveCamera();
  place(cam, layout, harbour.width / harbour.height);
  posed(ship.root, LIVE_POSE);
  ship.root.updateMatrixWorld(true);
  const v = new THREE.Vector3(), r = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  ship.groups[1].traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.role !== "paint") return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).project(cam);
      const x = harbour.left + ((v.x + 1) / 2) * harbour.width, y = harbour.top + ((1 - v.y) / 2) * harbour.height;
      r.left = Math.min(r.left, x); r.right = Math.max(r.right, x); r.top = Math.min(r.top, y); r.bottom = Math.max(r.bottom, y);
    }
  });
  ship.dispose();
  return r;
}
// the same for the kept ship, whole
function keptOnScreen(words: readonly string[], harbour: { left: number; top: number; width: number; height: number }, layout: "desktop" | "phone") {
  const ship = buildShip(words), cam = new THREE.PerspectiveCamera();
  place(cam, layout, harbour.width / harbour.height);
  posed(ship.root, KEPT_POSE);
  ship.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(ship.root), r = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }, v = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    v.set(x, y, z).project(cam);
    const sx = harbour.left + ((v.x + 1) / 2) * harbour.width, sy = harbour.top + ((1 - v.y) / 2) * harbour.height;
    r.left = Math.min(r.left, sx); r.right = Math.max(r.right, sx); r.top = Math.min(r.top, sy); r.bottom = Math.max(r.bottom, sy);
  }
  ship.dispose();
  return r;
}
const overlap = (a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

type Frame = {
  vw: number; vh: number; scroll: number;
  harbour: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  strip: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  sentence: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  kept: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  question: { top: number; bottom: number }; steps: { top: number; bottom: number } | null;
  lines: number; step: string; liveSize: number; keptSize: number;
};
const FRAME = `(async () => {
  await document.fonts.ready;
  const q = ${QUERY_JS}, box = ${BOX};
  const sent = q('.sentence-strip .sentence'), labels = [...sent.querySelectorAll('label')];
  return { vw: innerWidth, vh: innerHeight, scroll: document.documentElement.scrollWidth,
    harbour: box(q('#harbour')), strip: box(q('.sentence-strip')), sentence: box(sent), kept: box(q('.kept-strip')),
    question: box(q('#question .question-line')), steps: document.querySelector('ol.how-to-play') ? box(q('ol.how-to-play')) : null,
    lines: new Set(labels.map((l) => Math.round(l.getBoundingClientRect().top))).size, step: sent.getAttribute('data-step'),
    liveSize: parseFloat(getComputedStyle(sent).fontSize), keptSize: parseFloat(getComputedStyle(q('.kept-sentence')).fontSize) };
})()`;
// the live page's harbour drawn (a canvas in it, and its first frame painted)
const DRAWN = `(async () => { const h = document.querySelector('#harbour'); for (let i = 0; i < 150 && !h.hasAttribute('data-ready'); i++) await new Promise((r) => setTimeout(r, 100)); if (!h.hasAttribute('data-ready')) throw new Error('the harbour never drew'); await new Promise((r) => setTimeout(r, 600)); })()`;
const frame = async (doc: Document, size: readonly [number, number]) => (await measureIn(doc, FRAME, [size[0], size[1]])) as Frame;

describe("the harbour on GET /", () => {
  it("serves one harbour, decorative, and the strips as the accessible page", async () => {
    const doc = new JSDOM(await (await fetch(new URL("/", baseUrl))).text()).window.document;
    const harbour = doc.querySelectorAll("#harbour");
    expect(harbour, "GET / doesn't have exactly one harbour").toHaveLength(1);
    expect(harbour[0].getAttribute("aria-hidden"), "the harbour isn't decorative").toBe("true");
    expect(doc.querySelector("#house, #house-kept, .two, .half"), "GET / still serves the two halves").toBeNull();
    expect(doc.querySelectorAll('.sentence-strip .sentence form[action="/replace"]'), "the sentence strip doesn't hold the ten forms").toHaveLength(10);
    expect(doc.querySelector(".kept-strip .kept-sentence"), "there's no kept strip").not.toBeNull();
    expect(doc.querySelector(".kept-strip .waiting"), "the kept strip has no waiting row").not.toBeNull();
  });

  // The sentence shares the first screen with the harbour (the maker, 30 October): on a desktop the whole
  // sentence strip sits over or under the scene within the first screen, never below the fold, ten 13-letter
  // words and a trace included; the kept strip may fall below.
  for (const [name, size] of DESKTOPS) {
    for (const [what, state] of [["the maker's words", {}], ["ten 13-letter words and a trace", { words: LONG13, trace: { status: "Your word “ferry” still stands, marked in the sentence above. You can act again, anywhere but place 01, where it stands." } }], ["a new visitor's full band", { band: "full" as const }]] as const) {
      it(`keeps the whole sentence strip on the first screen with the harbour (${name}, ${what})`, async () => {
        const f = await frame(await staged(state), size);
        expect(f.harbour.top, "the harbour starts below the first screen").toBeLessThan(f.vh * 0.5);
        expect(f.harbour.height, "the harbour is a strip, not a scene").toBeGreaterThan(f.vh * 0.45);
        expect(f.sentence.bottom, `the sentence runs below the first screen (${f.sentence.bottom} of ${f.vh})`).toBeLessThanOrEqual(f.vh);
        expect(f.strip.bottom, "the sentence strip runs below the first screen").toBeLessThanOrEqual(f.vh);
        // over or under the scene: within the harbour's width, never beside it in a column of its own
        expect(f.strip.left, "the strip isn't over or under the scene").toBeGreaterThanOrEqual(f.harbour.left - 1);
        expect(f.strip.right, "the strip isn't over or under the scene").toBeLessThanOrEqual(f.harbour.right + 1);
        expect(f.scroll, "the page scrolls sideways").toBeLessThanOrEqual(f.vw);
      }, 90_000);
    }
  }

  // On a phone with the band folded (this visitor has made a change), the harbour and the whole sentence fit the
  // first screen together, ten 13-letter words included; with the band in full, the whole sentence comes first.
  for (const words of [MAKER, LONG13]) {
    it(`fits the harbour and the whole sentence on a phone's first screen once the band is folded (390×844${words === LONG13 ? ", ten 13-letter words" : ""})`, async () => {
      const f = await frame(await staged({ words, band: "folded" }), PHONE[1]);
      expect(f.sentence.bottom, "the sentence runs below the first screen").toBeLessThanOrEqual(f.vh);
      expect(f.harbour.top, "the harbour isn't on the first screen").toBeLessThan(f.vh);
      expect(f.harbour.bottom, "the harbour runs below the first screen").toBeLessThanOrEqual(f.vh);
      expect(f.harbour.height, "the harbour is too small to read on a phone").toBeGreaterThanOrEqual(f.vw * 0.55);
      expect(overlap(f.harbour, f.sentence), "the sentence lies over the harbour on a phone").toBe(0);
      expect(f.scroll, "the page scrolls sideways").toBeLessThanOrEqual(f.vw);
    }, 90_000);
  }
  it("opens a new visitor's phone on the question, how to play and the whole sentence, before the harbour (390×844, band in full)", async () => {
    const f = await frame(await staged({ band: "full" }), PHONE[1]);
    expect(f.steps, "the full band has no steps").not.toBeNull();
    expect(f.sentence.bottom, "the sentence runs below the first screen").toBeLessThanOrEqual(f.vh);
    expect(f.sentence.top, "the sentence doesn't come before the harbour").toBeLessThan(f.harbour.top);
    expect(f.steps!.bottom, "how to play doesn't come before the sentence").toBeLessThanOrEqual(f.sentence.top);
  }, 90_000);

  // At rest the sentence strip never covers the live ship's hull (the harbour's counterpart of the house's
  // "clear of every house at rest"): the hull's real geometry through the page's camera, every sentence of the
  // 500-sentence set and the extremes, against the strip as laid out with the longest words.
  for (const [name, size] of ALL) {
    it(`never covers the live ship's hull with the sentence strip at rest (${name})`, async () => {
      const f = await frame(await staged({ words: LONG13 }), size);
      const layout = isPhone(size) ? "phone" : "desktop";
      const bad: string[] = [];
      for (const words of [...SENTENCES.slice(0, 120), ...EXTREMES]) {
        const hull = hullOnScreen(words, f.harbour, layout);
        if (overlap(hull, f.strip) > 0) bad.push(`"${words.join(" ")}": hull ${JSON.stringify(hull)} under the strip ${JSON.stringify(f.strip)}`);
        expect(hull.top, `the hull of "${words.join(" ")}" isn't in the harbour`).toBeGreaterThanOrEqual(f.harbour.top);
        expect(hull.bottom, `the hull of "${words.join(" ")}" isn't in the harbour`).toBeLessThanOrEqual(f.harbour.bottom);
      }
      expect(bad.slice(0, 3), `${bad.length} hulls covered`).toEqual([]);
    }, 180_000);
  }

  // the kept ship is in the scene, whole, at rest, on a desktop's first screen; a phone shows it in the same canvas
  for (const [name, size] of ALL) {
    it(`sets the kept ship on its slipway inside the harbour (${name})`, async () => {
      const f = await frame(await staged(), size);
      for (const words of [MAKER, ...EXTREMES]) {
        const k = keptOnScreen(words, f.harbour, isPhone(size) ? "phone" : "desktop");
        expect(k.left, "the kept ship runs out of the harbour").toBeGreaterThanOrEqual(f.harbour.left - 1);
        expect(k.right, "the kept ship runs out of the harbour").toBeLessThanOrEqual(f.harbour.right + 1);
        expect(k.top, "the kept ship runs out of the harbour").toBeGreaterThanOrEqual(f.harbour.top - 1);
        if (!isPhone(size)) expect(overlap(k, f.strip), "the sentence strip covers the kept ship").toBe(0);
      }
    }, 90_000);
  }

  // The sentence's size step (src/lib/sentence-step.ts) is a prediction from glyph widths against the strip's
  // measure: two lines over the 500-sentence set at every desktop width, Chrome on macOS and Linux only.
  for (const [name, size] of DESKTOPS) {
    it(`keeps the live sentence to two lines, at its step, over the 500-sentence set (${name})`, async () => {
      const doc = await staged();
      const set = [MAKER, ...SENTENCES];
      const steps = set.map((w) => sizeStep(w));
      const out = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        const sent = document.querySelector('.sentence-strip .sentence'), labels = [...sent.querySelectorAll('label')];
        const col = sent.getBoundingClientRect();
        return ${JSON.stringify(set)}.map((ws, i) => {
          ws.forEach((w, j) => (labels[j].textContent = w)); sent.setAttribute('data-step', ${JSON.stringify(steps)}[i]);
          const end = sent.querySelector('.end').getBoundingClientRect().right;
          return { lines: new Set(labels.map((l) => Math.round(l.getBoundingClientRect().top))).size, room: (col.right - end) / col.width };
        });
      })()`, [size[0], size[1]])) as { lines: number; room: number }[];
      const say = (i: number) => `"${set[i].join(" ")}" (${out[i].lines} lines at step ${steps[i]}, ${(100 * out[i].room).toFixed(2)}% short)`;
      const tightest = out.map((_, i) => i).filter((i) => out[i].lines <= 2).sort((a, b) => out[a].room - out[b].room).slice(0, 3).map(say);
      process.stdout.write(`\n::notice title=sentence-step ${name}::tightest two-line sentences: ${tightest.join(" | ")}\n`);
      const over = out.flatMap((o, i) => (o.lines > 2 ? [say(i)] : []));
      expect(over.slice(0, 3), `${over.length} sentences wrap past two lines`).toEqual([]);
    }, 120_000);

    it(`at its smallest step the live sentence still outranks the kept one (${name})`, async () => {
      const f = await frame(await staged({ words: LONG24 }), size);
      expect(Number(f.step), "ten 24-letter words aren't at the smallest step").toBe(SIZE_STEPS.length - 1);
      expect(f.liveSize, "the live sentence doesn't outrank the kept one").toBeGreaterThan(f.keptSize);
    }, 90_000);
  }

  // Each live word carries "01·Ram" above it; nothing is shown under a word
  for (const [name, size] of [DESKTOPS[0], PHONE]) {
    it(`names each word's position and part above it, and shows nothing under it (${name})`, async () => {
      const m = (await measureIn(await staged({ words: LONG13 }), `(async () => {
        await document.fonts.ready;
        return [...document.querySelectorAll('.sentence-strip .sentence .pos')].map((p) => {
          const l = p.querySelector('label'), lr = l.getBoundingClientRect(), b = getComputedStyle(p, '::before'), br = p.getBoundingClientRect();
          const under = [...p.querySelectorAll('*')].filter((el) => !p.querySelector('form').contains(el) && el.children.length === 0 && el.textContent.trim() && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().top >= lr.bottom - 1).map((e) => e.textContent.trim());
          return { tag: b.content, word: l.textContent, under, above: parseFloat(b.top) < 0 || br.top < lr.top };
        });
      })()`, [size[0], size[1]])) as { tag: string; word: string; under: string[]; above: boolean }[];
      const parts = ["Ram", "Hull", "Prow", "Stern", "Shields", "Mast", "Sail", "Oars", "Rudder", "Pennant"];
      m.forEach((p, i) => {
        // the number from the sentence's own counter (01 to 10, spec/numbering.test.ts), the part's name after it; Chrome reports attr() resolved
        expect(p.tag, `word ${i + 1} doesn't carry its number and part`).toMatch(new RegExp(`^counter\\(\\w+, decimal-leading-zero\\) "·${parts[i]}" / ""$`));
        expect(p.above, `word ${i + 1}'s part isn't above it`).toBe(true);
        expect(p.under, `something is shown under "${p.word}"`).toEqual([]);
      });
    }, 90_000);
  }

  // A label narrower than most words, so a short word between long ones keeps its ordinary spacing (the maker,
  // 30 October: "all ⎵⎵⎵ ceremony" on the live page). A sentence of that shape, composed for the check: no gap
  // between two words' letters is more than about twice an ordinary word space, at 1440 and 390.
  const SHORT_AMONG_LONG = ["harbour", "all", "ceremony", "this", "students", "will", "wonder", "whether", "it", "sail"];
  for (const [name, size] of [DESKTOPS[1], PHONE]) {
    it(`keeps a short word's spacing ordinary, its label no wider than the gap allows (${name})`, async () => {
      const m = (await measureIn(await staged({ words: SHORT_AMONG_LONG }), `(async () => {
        await document.fonts.ready;
        const sent = document.querySelector('.sentence-strip .sentence');
        const letters = [...sent.querySelectorAll('label')].map((l) => { const r = document.createRange(); r.selectNodeContents(l); return r.getBoundingClientRect(); });
        // an ordinary word space at this size: the width of a space in the sentence's own face
        const probe = document.createElement('span'); probe.textContent = 'a a'; probe.style.whiteSpace = 'pre'; sent.append(probe);
        const one = document.createElement('span'); one.textContent = 'aa'; sent.append(one);
        const space = probe.getBoundingClientRect().width - one.getBoundingClientRect().width; probe.remove(); one.remove();
        const gaps = [];
        for (let i = 1; i < letters.length; i++) if (Math.abs(letters[i].top - letters[i - 1].top) < 4) gaps.push({ i, gap: letters[i].left - letters[i - 1].right });
        return { space, gaps };
      })()`, [size[0], size[1]])) as { space: number; gaps: { i: number; gap: number }[] };
      expect(m.gaps.length, "no two words share a line").toBeGreaterThan(0);
      for (const g of m.gaps) expect(g.gap, `the gap before "${SHORT_AMONG_LONG[g.i]}" is ${g.gap.toFixed(0)}px, an ordinary space ${m.space.toFixed(0)}px`).toBeLessThanOrEqual(m.space * 2.2);
    }, 90_000);
  }

  // The notation's slot: one line, moving nothing; the drafting line likewise, only a word shortened
  for (const [name, size] of ALL) {
    it(`keeps the drafting line to one line in the notation's slot, shortening only a long word (${name})`, async () => {
      const form = isPhone(size) ? "phone" : "desktop";
      const W = "w".repeat(24), pool = ["people", "whether", "incomprehensibilities", "bookkeeper", "rhythm", "a", W, "123"];
      const longest = (word: string, now?: string) => {
        let best = drafting({ position: 0, word, draft: pool[0], now }, form);
        for (let position = 0; position < 10; position++) for (const draft of pool) {
          const d = drafting({ position, word, draft, now }, form);
          if (Object.values(d).join("").length > Object.values(best).join("").length) best = d;
        }
        return best;
      };
      const cases = [longest("people"), longest(W), longest("people", W), longest(W, W)];
      for (const d of cases) {
        const doc = await staged({ words: LONG13 });
        const before = (await measureIn(doc, `(async () => { await document.fonts.ready; const b = (s) => document.querySelector(s).getBoundingClientRect().top; return [b('.sentence-strip .sentence'), b('#harbour'), b('.kept-strip')]; })()`, [size[0], size[1]])) as number[];
        showDrafting(doc.getElementById("part")!, d);
        const m = (await measureIn(doc, `(async () => {
          await document.fonts.ready;
          ${CONTRAST}
          const q = ${QUERY_JS}, part = q('#part'), cs = getComputedStyle(part), r = part.getBoundingClientRect(), strip = q('.sentence-strip').getBoundingClientRect();
          const b = (s) => document.querySelector(s).getBoundingClientRect().top;
          return { height: r.height, line: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.45, right: r.right, stripRight: strip.right, top: r.top, inviteTop: q('.sentence-strip .invite-row').getBoundingClientRect().top,
            after: [b('.sentence-strip .sentence'), b('#harbour'), b('.kept-strip')], contrast: inkOn(part),
            pieces: [...part.children].map((k) => ({ tag: k.tagName.toLowerCase(), text: k.textContent, cut: k.scrollWidth > k.clientWidth + 1, right: k.getBoundingClientRect().right, ellipsis: getComputedStyle(k).textOverflow, struck: getComputedStyle(k).textDecorationLine })) };
        })()`, [size[0], size[1]])) as any;
        const what = `"${Object.values(d).join("")}"`;
        expect(m.height, `${what} wraps`).toBeLessThan(m.line * 1.5);
        expect(m.right, `${what} runs out of its strip`).toBeLessThanOrEqual(m.stripRight + 1);
        expect(Math.abs(m.top - m.inviteTop), `${what} isn't in the notation's slot`).toBeLessThanOrEqual(1);
        m.after.forEach((t: number, k: number) => expect(Math.abs(t - before[k]), `${what} moved ${["the sentence", "the harbour", "the kept strip"][k]}`).toBeLessThanOrEqual(0.5));
        expect(m.contrast, `${what} is too faint on its ground`).toBeGreaterThanOrEqual(4.5);
        expect(m.pieces.find((p: any) => p.tag === "del")?.struck, `${what} doesn't strike the replaced word`).toContain("line-through");
        for (const p of m.pieces) {
          if (p.tag === "del" || p.tag === "b") { if (p.cut) expect(p.ellipsis, `${what}: a shortened word has no ellipsis`).toBe("ellipsis"); }
          else expect(p.cut, `${what} cuts "${p.text}"`).toBe(false);
        }
        // in the stale line the struck word is never shortened on a desktop
        if (d.now !== undefined && !isPhone(size)) expect(m.pieces.find((p: any) => p.tag === "del").cut, `${what} shortens the replaced word`).toBe(false);
      }
    }, 180_000);
  }

  // The invitation at rest, in the notation's slot, with the way to /ship/ beside it on a desktop; hidden while a word is chosen
  for (const [name, size] of [DESKTOPS[0], PHONE]) {
    it(`invites a stranger to change a word at rest, in the notation's slot, moving nothing (${name})`, async () => {
      const doc = await staged();
      const m = (await measureIn(doc, `(async () => {
        await document.fonts.ready;
        ${CONTRAST}
        const q = ${QUERY_JS}, box = ${BOX};
        const inv = q('.sentence-strip .invite'), link = document.querySelector('.sentence-strip .invite-row a[href="/ship/"]');
        const at = () => [q('.sentence-strip .sentence').getBoundingClientRect().top, q('#harbour').getBoundingClientRect().top];
        const rest = { inv: box(inv), shown: getComputedStyle(inv).visibility !== 'hidden', link: link ? { box: box(link), seen: getComputedStyle(link).display !== 'none' && link.getBoundingClientRect().width > 0, text: link.textContent.trim() } : null, at: at(), contrast: inkOn(inv) };
        const part = q('#part'); part.hidden = false; part.textContent = '08 · Oars · 2 oars a side'; document.body.classList.add('selecting');
        return { rest, chosen: { invShown: getComputedStyle(inv).visibility !== 'hidden', linkSeen: link ? getComputedStyle(link).visibility !== 'hidden' && getComputedStyle(link).display !== 'none' : false, at: at(), partTop: box(part).top } };
      })()`, [size[0], size[1]])) as any;
      expect(m.rest.shown, "the invitation isn't shown at rest").toBe(true);
      expect(m.rest.contrast, "the invitation is too faint").toBeGreaterThanOrEqual(4.5);
      expect(m.chosen.invShown, "the invitation stays while a word is chosen").toBe(false);
      expect(Math.abs(m.chosen.partTop - m.rest.inv.top), "the notation isn't in the invitation's slot").toBeLessThanOrEqual(1);
      m.chosen.at.forEach((t: number, k: number) => expect(Math.abs(t - m.rest.at[k]), "choosing a word moved the page").toBeLessThanOrEqual(0.5));
      if (!isPhone(size)) {
        expect(m.rest.link?.seen, "there's no way to /ship/ beside the invitation").toBe(true);
        expect(m.rest.link.text).toMatch(/^How the planks are made$/i);
        expect(m.rest.link.box.left, "the /ship/ link lies on the invitation").toBeGreaterThanOrEqual(m.rest.inv.right);
        expect(m.chosen.linkSeen, "the /ship/ link stays over the notation").toBe(false);
      }
    }, 90_000);
  }

  // The settling line under a holding word: thin, inside its word, never red, moving nothing
  for (const [name, size] of [DESKTOPS[0], PHONE]) {
    it(`sets the settling line inside its word, thin and not red, moving nothing (${name})`, async () => {
      const m = (await measureIn(await staged(), `(async () => {
        await document.fonts.ready;
        const q = ${QUERY_JS};
        const at = () => [...document.querySelectorAll('.sentence-strip .sentence label')].map((l) => { const r = l.getBoundingClientRect(); return [r.left, r.top]; }).concat([[0, q('#harbour').getBoundingClientRect().top]]);
        const before = at(), pos = document.querySelectorAll('.sentence-strip .sentence .pos')[4];
        const line = document.createElement('span'); line.className = 'settling'; line.setAttribute('aria-hidden', 'true');
        line.style.setProperty('--from', '0.4'); line.style.setProperty('--ms', '4000ms'); pos.append(line);
        await new Promise((r) => setTimeout(r, 50));
        const after = at(), lr = line.getBoundingClientRect(), wr = pos.querySelector('label').getBoundingClientRect();
        const c = (getComputedStyle(line).backgroundColor.match(/[\\d.]+/g) || []).map(Number);
        return { moved: Math.max(...before.map((b, i) => Math.hypot(b[0] - after[i][0], b[1] - after[i][1]))), h: lr.height, l: lr.left, r: lr.right, t: lr.top, wl: wr.left, wr: wr.right, wb: wr.bottom, red: c[0] > 150 && c[1] < 90 && c[2] < 90 };
      })()`, [size[0], size[1]])) as any;
      expect(m.moved, "the settling line moved the page").toBeLessThanOrEqual(0.5);
      expect(m.h).toBeGreaterThan(0);
      expect(m.h, "the settling line isn't thin").toBeLessThanOrEqual(3);
      expect(m.l).toBeGreaterThanOrEqual(m.wl - 1);
      expect(m.r).toBeLessThanOrEqual(m.wr + 1);
      expect(m.t, "the settling line isn't under its word").toBeGreaterThanOrEqual(m.wb - 2);
      expect(m.red, "the settling line is red").toBe(false);
    }, 90_000);
  }

  // The focused word: a 2px ink outline, clear of every neighbouring word, a phone included
  for (const [name, size] of [DESKTOPS[0], PHONE]) {
    for (const words of [MAKER, LONG13]) {
      it(`outlines the focused word in ink, clear of every neighbouring word (${name}${words === LONG13 ? ", ten long words" : ""})`, async () => {
        const rows = (await measureIn(await staged({ words }), `(async () => {
          await document.fonts.ready;
          ${CONTRAST}
          const forms = [...document.querySelectorAll('.sentence-strip .sentence form[action="/replace"]')];
          return forms.map((f, i) => {
            const input = f.querySelector('input[name="word"]'); input.focus();
            const cs = getComputedStyle(input), r = input.getBoundingClientRect(), grow = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth);
            const o = { left: r.left - grow, right: r.right + grow, top: r.top - grow, bottom: r.bottom + grow };
            let air = Infinity;
            forms.forEach((g, j) => { if (j === i) return; const b = g.querySelector('label').getBoundingClientRect(); air = Math.min(air, Math.max(b.left - o.right, o.left - b.right, b.top - o.bottom, o.top - b.bottom)); });
            const out = { word: f.querySelector('label').textContent, focused: document.activeElement === input, style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), contrast: inkOn(input, 'outlineColor'), air };
            input.blur(); return out;
          });
        })()`, [size[0], size[1]])) as { word: string; focused: boolean; style: string; width: number; contrast: number; air: number }[];
        for (const w of rows) {
          expect(w.focused, `"${w.word}" can't be focused`).toBe(true);
          expect(w.style, `"${w.word}" shows no focus outline`).not.toBe("none");
          expect(w.width).toBeGreaterThanOrEqual(2);
          expect(w.contrast, `"${w.word}"'s focus outline doesn't stand out`).toBeGreaterThanOrEqual(3);
          expect(w.air, `"${w.word}"'s focus outline touches a neighbour`).toBeGreaterThanOrEqual(1);
        }
      }, 90_000);
    }
  }

  // Every word at rest carries a faint solid underline; your own word a dotted one, darker; nothing moves for it
  for (const [name, size] of [DESKTOPS[0], DESKTOPS[2], PHONE]) {
    it(`marks the words as changeable at rest on every device, never like your own word (${name})`, async () => {
      const plain = (await measureIn(await staged(), `(async () => { await document.fonts.ready; return [...document.querySelectorAll('.sentence-strip .sentence label')].map((l) => { const r = l.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }); })()`, [size[0], size[1]])) as number[][];
      const m = (await measureIn(await staged({ mine: [0] }), `(async () => {
        await document.fonts.ready;
        ${CONTRAST}
        const line = (el) => { const cs = getComputedStyle(el), on = cs.textDecorationLine.includes('underline'); return { on, style: cs.textDecorationStyle, contrast: on ? inkOn(el, 'textDecorationColor') : 1 }; };
        const labels = [...document.querySelectorAll('.sentence-strip .sentence label')];
        return { rest: labels.slice(1).map((l) => ({ word: l.textContent, ...line(l) })), mine: line(labels[0].querySelector('mark')), mineLabel: line(labels[0]),
          boxes: labels.map((l) => { const r = l.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }) };
      })()`, [size[0], size[1]])) as any;
      for (const w of m.rest) {
        expect(w.on && w.contrast > 1.05, `"${w.word}" shows no line at rest`).toBe(true);
        expect(w.style).toBe("solid");
        expect(w.contrast, `"${w.word}"'s line is as strong as your own word's`).toBeLessThan(m.mine.contrast);
      }
      expect(m.mineLabel.on && m.mineLabel.contrast > 1.05, "your word carries the resting line under its dotted one").toBe(false);
      expect(m.mine.style).toBe("dotted");
      m.boxes.slice(1).forEach((b: number[], i: number) => b.forEach((v, k) => expect(Math.abs(v - plain[i + 1][k]), "the resting line moved a word").toBeLessThanOrEqual(0.5)));
    }, 90_000);
  }

  // The kept strip: the kept sentence (gaps faint over a dashed line, within the 4.5 floor and 60% ceiling),
  // the kept note, the waiting row; legible on its ground; never wider than the page
  for (const [name, size] of ALL) {
    it(`sets the kept strip legible: kept words, faint gaps with a dashed line, the note and the waiting row (${name})`, async () => {
      const m = (await measureIn(await staged(), `(async () => {
        await document.fonts.ready;
        ${CONTRAST}
        const q = ${QUERY_JS}, box = ${BOX}, k = q('.kept-strip .kept-sentence');
        const words = [...k.querySelectorAll('.w:not(.gap)')].map((w) => inkOn(w));
        const gaps = [...k.querySelectorAll('.w.gap')].map((g) => { const s = getComputedStyle(g); return { text: g.textContent, contrast: inkOn(g), cue: s.textDecorationLine.includes('underline') ? s.textDecorationStyle : (parseFloat(s.borderBottomWidth) > 0 ? s.borderBottomStyle : 'none') }; });
        const note = q('.kept-strip .kept-note'), row = q('.kept-strip .waiting');
        return { words, gaps, note: { text: note.textContent.trim(), contrast: inkOn(note) }, row: { shown: !row.hidden && row.getBoundingClientRect().height > 0, label: row.querySelector('.label').textContent.trim(), words: [...row.querySelectorAll('.ws .w')].map((w) => ({ text: w.textContent, contrast: inkOn(w), n: getComputedStyle(w, '::before').content })) },
          strip: box(q('.kept-strip')), vw: innerWidth };
      })()`, [size[0], size[1]])) as any;
      expect(m.words.length).toBeGreaterThan(0);
      for (const c of m.words) expect(c, "a kept word is too faint").toBeGreaterThanOrEqual(4.5);
      const faintest = Math.min(...m.words);
      for (const g of m.gaps) {
        expect(g.contrast, `the gap "${g.text}" is too faint to read`).toBeGreaterThanOrEqual(4.5);
        expect(g.contrast, `the gap "${g.text}" reads like a kept word`).toBeLessThanOrEqual(faintest * 0.6 + 0.01);
        expect(g.cue, `the gap "${g.text}" has no dashed line`).toBe("dashed");
      }
      expect(m.note.text).toBe("Replaced words, back in their places. Faint words still stand.");
      expect(m.note.contrast).toBeGreaterThanOrEqual(6);
      expect(m.row.shown, "the waiting row isn't shown").toBe(true);
      expect(m.row.label).toBe("Waiting for the next ship:");
      expect(m.row.words.map((w: any) => w.text)).toEqual(["ceremony", "wonder"]);
      for (const w of m.row.words) { expect(w.contrast).toBeGreaterThanOrEqual(6); expect(w.n).toMatch(/0[37]/); }
      expect(m.strip.right, "the kept strip runs out of the page").toBeLessThanOrEqual(m.vw + 1);
    }, 90_000);
  }

  // Below the harbour, one column, three sections, each saying one thing once (the maker, 31 October: the page
  // repeated itself): the ship of old planks (its sentence, one caption, the last plank, the waiting row), your plank
  // (the rule in a sentence or two, and your trace), the log; then the foot: How the planks are made · Earlier form.
  // No side column; the question is asked once, in the band; nothing said twice.
  it("says each thing once below the harbour, in one column: the ship of old planks, your plank, the log", async () => {
    const doc = new JSDOM(await (await fetch(new URL("/", baseUrl))).text()).window.document;
    const order = ["#kept", "#your-plank", "#log", ".page-foot"].map((sel) => doc.querySelector(sel));
    for (const [i, el] of order.entries()) expect(el, `there's no ${["ship of old planks", "your plank", "log", "foot"][i]} section`).not.toBeNull();
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & 4, "the sections aren't in order").toBeTruthy();
    expect(doc.querySelector("#your-plank #how"), "the rule isn't in your plank").not.toBeNull();
    expect(doc.querySelector("#your-plank")!.querySelector("h2")?.textContent?.trim()).toBe("Your plank");
    expect(doc.querySelector(".foot-aside, .notes"), "the side column is still there").toBeNull();
    const text = (doc.body.textContent ?? "").replace(/\s+/g, " ");
    const count = (t: string) => text.split(t).length - 1;
    expect(count("If every plank is replaced, is it still the same ship?"), "the question is asked more than once").toBe(1);
    expect(count("Ten words. Ten planks."), "the band's title is repeated").toBe(0);
    expect(count("Replaced words are kept here"), "the kept strip says what it is twice").toBe(0);
    expect(count("Replaced words, back in their places. Faint words still stand."), "the kept note isn't said once").toBe(1);
    const foot = [...doc.querySelectorAll(".page-foot .foot-links a")].map((a) => a.textContent?.trim());
    expect(foot[0], "the foot doesn't lead to how the planks are made").toBe("How the planks are made");
  });
  for (const [name, size] of [DESKTOPS[1], PHONE]) {
    it(`lays the sections below the harbour in one column (${name})`, async () => {
      const m = (await measureIn(await staged({ earlierForm: 3 }), `(async () => {
        await document.fonts.ready;
        // the sections shown (the log keeps its place hidden until it has lines)
        return ['#kept', '#your-plank', '#log', '.page-foot'].map((s) => document.querySelector(s)).filter((el) => !el.hidden).map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
      })()`, [size[0], size[1]])) as { top: number; bottom: number; left: number; right: number }[];
      for (let i = 1; i < m.length; i++) expect(m[i].top, "a section sits beside another, not below it").toBeGreaterThanOrEqual(m[i - 1].bottom - 1);
      for (const r of m) expect(r.right, "a section runs out of the page").toBeLessThanOrEqual(size[0] + 1);
    }, 60_000);
  }

  // The captions: large and dark enough to read on their ground
  for (const [name, size] of [DESKTOPS[0], PHONE]) {
    it(`sets the captions large and dark enough to read (${name})`, async () => {
      const px = isPhone(size) ? 14 : 15;
      const rows = (await measureIn(await staged({ trace: { status: "Your word “ferry” still stands, marked in the sentence above. You can act again, anywhere but place 01, where it stands." } }), `(async () => {
        await document.fonts.ready;
        ${CONTRAST}
        return [['instructions', '#how'], ['trace', 'section[aria-labelledby="trace-heading"] [role="status"]'], ['kept note', '.kept-strip .kept-note'], ['invitation', '.sentence-strip .invite']].map(([what, sel]) => {
          const el = document.querySelector(sel); return { what, size: parseFloat(getComputedStyle(el).fontSize), contrast: inkOn(el) };
        });
      })()`, [size[0], size[1]])) as { what: string; size: number; contrast: number }[];
      for (const r of rows) {
        if (r.what !== "invitation") expect(r.size, `the ${r.what} are too small`).toBeGreaterThanOrEqual(px);
        expect(r.contrast, `the ${r.what} are too faint`).toBeGreaterThanOrEqual(r.what === "invitation" ? 4.5 : 6);
      }
    }, 60_000);
  }

  // No caption ends on a lone word; the site's links stay whole and last in reading order
  for (const [name, size] of ALL) {
    it(`ends no caption on a lone word, and keeps the site's links whole (${name})`, async () => {
      const m = (await measureIn(await staged({ earlierForm: 3, trace: { status: "Your word “ferry” still stands, marked in the sentence above. You can act again, anywhere but place 01, where it stands." } }), `(async () => {
        await document.fonts.ready;
        const lone = (el) => {
          const words = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n; (n = walker.nextNode()); ) { if (n.parentElement.closest('.sr-only, .esc') && getComputedStyle(n.parentElement).clipPath !== 'none') continue; for (const w of n.textContent.matchAll(/\\S+/g)) words.push([n, w.index, w.index + w[0].length]); }
          if (words.length < 2) return false;
          const top = ([n, a, b]) => { const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b); return r.getClientRects()[0].top; };
          return Math.abs(top(words.at(-1)) - top(words.at(-2))) > 2;
        };
        const captions = [['the instructions', '#how'], ['the trace', 'section[aria-labelledby="trace-heading"] [role="status"]'], ['the kept note', '.kept-strip .kept-note']]
          .map(([what, sel]) => ({ what, lone: document.querySelector(sel) ? lone(document.querySelector(sel)) : 'missing' }));
        const nav = document.querySelector('.page-foot');
        const links = [...nav.querySelectorAll('a')].map((a) => ({ text: a.textContent, lines: a.getClientRects().length, top: a.getBoundingClientRect().top }));
        const after = (sel) => { const el = document.querySelector(sel); return !el || !!(el.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING); };
        return { captions, links, last: after('#how') && after('.kept-strip .waiting') && after('#log') };
      })()`, [size[0], size[1]])) as any;
      for (const c of m.captions) expect(c.lone, `${c.what} ends on a lone word`).toBe(false);
      // the page's foot (the maker, 31 October): How the planks are made · Earlier form, then the site's About
      expect(m.links.map((l: any) => l.text), "the foot's links").toEqual(["How the planks are made", "Earlier form", "About Theseus"]);
      for (const l of m.links) expect(l.lines, `"${l.text}" breaks across lines`).toBe(1);
      expect(m.last, "the site's links aren't last in reading order").toBe(true);
    }, 90_000);
  }

  // A phone has no Escape key: "Press Escape to cancel." takes no visible space there, but is read
  for (const [name, size] of [DESKTOPS[0], PHONE]) {
    it(`shows "Press Escape to cancel" only where there's an Escape key, and always to a screen reader (${name})`, async () => {
      const m = (await measureIn(await staged(), `(async () => {
        await document.fonts.ready;
        const how = (${QUERY_JS})('#how'), walker = document.createTreeWalker(how, NodeFilter.SHOW_TEXT);
        let node; while ((node = walker.nextNode()) && !node.textContent.includes('Escape'));
        const el = node.parentElement, r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return { width: r.width, height: r.height, read: cs.display !== 'none' && cs.visibility !== 'hidden' && !el.closest('[aria-hidden="true"]'), own: el !== how };
      })()`, [size[0], size[1]])) as any;
      expect(m.read, "a screen reader can't read it").toBe(true);
      if (isPhone(size)) { expect(m.own).toBe(true); expect(m.width * m.height, "a phone shows the Escape sentence").toBeLessThanOrEqual(1); }
      else expect(m.width, "a desktop doesn't show the Escape sentence").toBeGreaterThan(20);
    }, 60_000);
  }

  // On a phone the kept strip is below: the sentence strip's header names it and links there, and back; plain anchors
  it("links to the kept strip and back on a phone, plain anchors, never scrolling by itself (390×844)", async () => {
    const doc = await staged();
    const toKept = doc.querySelector('.sentence-strip a[href="#kept"]'), back = doc.querySelector('.kept-strip a[href="#sentence"]');
    expect(toKept?.textContent?.trim()).toBe("What was kept ↓");
    expect(back?.textContent?.trim()).toBe("Back to the sentence ↑");
    expect(doc.getElementById("kept")?.classList.contains("kept-strip"), "#kept isn't the kept strip").toBe(true);
    expect(doc.getElementById("sentence")?.classList.contains("sentence-strip"), "#sentence isn't the sentence strip").toBe(true);
    const m = (await measureIn(doc, `(async () => { await document.fonts.ready; const s = (sel) => { const e = document.querySelector(sel), cs = getComputedStyle(e); return cs.display !== 'none' && e.getBoundingClientRect().width > 0; }; return { phone: s('.sentence-strip a[href="#kept"]'), desk: null, y: scrollY }; })()`, [390, 844])) as any;
    expect(m.phone, "a phone doesn't show the way to the kept strip").toBe(true);
    expect(m.y, "the page scrolled by itself").toBe(0);
    const d = (await measureIn(await staged(), `(async () => { await document.fonts.ready; const e = document.querySelector('.sentence-strip a[href="#kept"]'); return getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; })()`, [1920, 1080])) as boolean;
    expect(d, "a desktop shows the phone's way to the kept strip").toBe(false);
  }, 90_000);

  // Orbit on a desktop only, within the prototype's limits, with a way back to the fixed view; a phone never
  // takes the page's scroll over the canvas. "Back to the harbour" is a real button, hidden until the view has moved.
  // The wheel and touch scroll the page, never the camera (the maker, 31 October: the wheel over the scene zoomed,
  // so people didn't find the page below): a real wheel gesture over the drawn canvas moves the page down and
  // leaves the camera where it was. Zoom is the + and − buttons beside the way back, real buttons, shown on a
  // desktop at rest (so they can be found) and never on a phone.
  for (const size of [[1440, 900], [390, 844]] as const) {
    it(`scrolls the page, never the camera, for a wheel over the harbour (${size[0]}×${size[1]})`, async () => {
      // the harbour's middle, in the first screen: where the wheel lands
      const at = (await liveIn(new URL("/", baseUrl).href, `(() => { const r = document.querySelector('#harbour').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(Math.max(r.top + 40, Math.min(r.bottom - 40, innerHeight / 2)))]; })()`, [size[0], size[1]], { steps: [DRAWN] })) as [number, number];
      // what's under the wheel before it turns (the canvas, not a strip over it), then how far the page moved; the
      // sea moves every frame, so the canvas's pixels are no evidence about the camera, the page's scroll is
      const m = (await liveIn(new URL("/", baseUrl).href, `(() => ({ on: window.__on, scroll: scrollY }))()`, [size[0], size[1]], {
        steps: [DRAWN, `(() => { window.__on = document.elementFromPoint(${at[0]}, ${at[1]})?.tagName === 'CANVAS'; })()`],
        wheel: { x: at[0], y: at[1], dy: 400 },
      })) as { on: boolean; scroll: number };
      expect(m.on, "the wheel didn't land on the harbour's canvas").toBe(true);
      expect(m.scroll, "a wheel over the harbour didn't scroll the page").toBeGreaterThan(100);
    }, 120_000);
  }
  it("zooms by + and − beside the way back, real buttons, on a desktop only", async () => {
    const doc = new JSDOM(await (await fetch(new URL("/", baseUrl))).text()).window.document;
    for (const [id, name] of [["zoom-in", "Zoom in"], ["zoom-out", "Zoom out"]] as const) {
      const b = doc.querySelector<HTMLButtonElement>(`button#${id}`);
      expect(b, `there's no ${name} button`).not.toBeNull();
      expect(b!.type).toBe("button");
      expect(b!.getAttribute("aria-label"), `the ${name} button isn't named`).toBe(name);
      expect(b!.closest('[aria-hidden="true"]'), `${name} is hidden from assistive technology`).toBeNull();
    }
    // on the live page, once its harbour is drawn (they're dead without one: no script or no WebGL shows none)
    const SHOWN = `(() => { const b = document.querySelector('#zoom-in'); return !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0; })()`;
    // on failure, say what the page saw, so a difference between machines can be read from the message
    const SEEN = `(() => { const b = document.querySelector('#zoom-in'), g = document.querySelector('.view-controls'); return { shown: ${SHOWN}, fine: matchMedia('(pointer: fine)').matches, hover: matchMedia('(hover: hover)').matches, ready: document.querySelector('#harbour').hasAttribute('data-ready'), canvas: !!document.querySelector('#harbour canvas'), group: g && getComputedStyle(g).display, button: b && getComputedStyle(b).display, width: innerWidth }; })()`;
    const desk = (await liveIn(new URL("/", baseUrl).href, SEEN, [1440, 900], { steps: [DRAWN] })) as { shown: boolean };
    expect(desk.shown, `a desktop doesn't show the zoom buttons at rest: ${JSON.stringify(desk)}`).toBe(true);
    expect(await liveIn(new URL("/", baseUrl).href, SHOWN, [390, 844], { steps: [DRAWN] }), "a phone shows the zoom buttons").toBe(false);
    expect(await liveIn(new URL("/", baseUrl).href, SHOWN, [1440, 900], { noScript: true }), "the zoom buttons show with nothing to zoom (no script)").toBe(false);
  }, 90_000);
  it("offers a way back to the harbour's fixed view, a real button hidden at rest", async () => {
    const doc = new JSDOM(await (await fetch(new URL("/", baseUrl))).text()).window.document;
    const home = doc.querySelector<HTMLButtonElement>("button#home");
    expect(home, "there's no way back to the fixed view").not.toBeNull();
    expect(home!.type).toBe("button");
    expect(home!.textContent?.trim()).toBe("Back to the harbour");
    expect(home!.hidden, "the way back shows at rest").toBe(true);
    expect(home!.closest('[aria-hidden="true"]'), "the way back is hidden from assistive technology").toBeNull();
  });
  it("never takes a phone's page scroll over the harbour (390×844)", async () => {
    const m = (await measureIn(await staged(), `(async () => { await document.fonts.ready; const h = document.querySelector('#harbour'); return getComputedStyle(h).touchAction; })()`, [390, 844])) as string;
    expect(m, "the harbour takes a phone's vertical scroll").toMatch(/pan-y|auto|manipulation/);
  }, 60_000);

  it("never invites on an earlier form (?at=N), and shows its ship alone", async () => {
    const res = await fetch(new URL("/?at=0", baseUrl));
    expect(res.status).toBe(200);
    const doc = new JSDOM(await res.text()).window.document;
    expect(doc.querySelector(".invite"), "an earlier form invites a change").toBeNull();
    expect(doc.querySelector("#harbour")?.getAttribute("data-scene"), "an earlier form's scene isn't its ship alone").toBe("earlier");
    expect(doc.querySelector(".kept-strip"), "an earlier form shows the kept strip").toBeNull();
  });
});
