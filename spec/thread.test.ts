import * as THREE from "three";
import { describe, expect, inject, it } from "vitest";
import { buildBody } from "../src/lib/house/build";
import { place } from "../src/lib/house/camera";
import { drafting, notation } from "../src/lib/house/notation";
import { anchorOf, threadPath, type ThreadRects } from "../src/lib/house/thread";
import { measureIn, QUERY_JS, servedPage } from "./chrome";

// The leader line (desktop only): from the chosen word's part notation to its
// territory, never over text. For every position, with the notation as it
// reads at rest and as it reads while a replacement is typed, the path the
// page draws (src/lib/house/thread.ts) stays clear, by 3px, of every word of
// the sentence (the chosen one included) and of the notation's own text. The
// territory's anchor is projected through the page's camera at the measured
// canvas size, from a body built of the words on the page. Reads only.

const baseUrl = inject("baseUrl");
type R = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const AIR = 3;

// every point of an SVG path of straight segments ("M x y L x y ..."), a pixel apart
function points(d: string): { x: number; y: number }[] {
  const n = (d.match(/-?[\d.]+/g) ?? []).map(Number), out: { x: number; y: number }[] = [];
  for (let i = 2; i < n.length; i += 2) {
    const [x0, y0, x1, y1] = [n[i - 2], n[i - 1], n[i], n[i + 1]], steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let s = 0; s <= steps; s++) out.push({ x: x0 + ((x1 - x0) * s) / steps, y: y0 + ((y1 - y0) * s) / steps });
  }
  return out;
}

describe("the leader line", () => {
  for (const longWords of [false, true]) {
    for (const typing of [false, true]) {
      it(`never runs over a word or the notation, at any position (1920×1080${longWords ? ", ten long words" : ""}${typing ? ", while typing" : ""})`, async () => {
        const doc = await servedPage(baseUrl);
        const labels = [...doc.querySelectorAll('.stands-half .sentence form[action="/replace"] label')];
        if (longWords) for (const l of labels) l.textContent = "wordmvadgycfe";
        const words = labels.map((l) => l.textContent!.trim());
        const texts = words.map((word, position) => (typing ? drafting({ position, word }, "desktop") : notation({ position, word })));
        const m = (await measureIn(doc, `(async () => {
          await document.fonts.ready;
          const q = ${QUERY_JS};
          const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
          const part = q('#part'), labels = [...document.querySelectorAll('.stands-half .sentence form[action="/replace"] label')];
          return ${JSON.stringify(texts)}.map((t) => {
            part.hidden = false;
            if (typeof t === 'string') part.textContent = t;
            else { part.replaceChildren(...[['span', t.lead], ['del', t.was], ['span', t.tail]].map(([tag, s]) => { const e = document.createElement(tag); e.textContent = s; return e; })); }
            const range = document.createRange(); range.selectNodeContents(part);
            const out = { words: labels.map(box), sentence: box(q('.stands-half .sentence')), column: box(q('.stands-half .text')), notation: box(range), canvas: box(q('.stands-half #house')) };
            part.hidden = true; part.textContent = '';
            return out;
          });
        })()`, [1920, 1080])) as { words: R[]; sentence: R; column: R; notation: R; canvas: R }[];
        const body = buildBody(words);
        const crossings: string[] = [];
        for (const [position, at] of m.entries()) {
          const cam = new THREE.PerspectiveCamera();
          place(cam, at.canvas.width / at.canvas.height);
          const a = anchorOf(body, position, cam, at.canvas)!;
          const rects: ThreadRects = { notation: at.notation };
          const d = threadPath(a, rects);
          const pts = points(d);
          const end = pts.at(-1)!;
          expect(Math.hypot(end.x - a.x, end.y - a.y), `the line for ${position + 1} doesn't reach its part`).toBeLessThan(0.5);
          const near = (r: R) => pts.find((p) => p.x > r.left - AIR && p.x < r.right + AIR && p.y > r.top - AIR && p.y < r.bottom + AIR);
          at.words.forEach((r, i) => { const p = near(r); if (p) crossings.push(`${position + 1} "${words[position]}" runs over "${words[i]}" at ${p.x.toFixed(0)},${p.y.toFixed(0)} (${d})`); });
          const p = near(at.notation);
          if (p) crossings.push(`${position + 1} "${words[position]}" runs over its notation at ${p.x.toFixed(0)},${p.y.toFixed(0)} (${d})`);
        }
        body.dispose();
        expect(crossings.slice(0, 6), `${crossings.length} crossings`).toEqual([]);
      }, 120_000);
    }
  }
});
