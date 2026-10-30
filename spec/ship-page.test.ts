import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { PAINT, PARTS, partOf, RULES, VOWEL_COLOUR } from "../src/lib/ship/rules";
import { measureIn, servedPage } from "./chrome";

// GET /ship/, the shipwright's notes (docs/decisions/0005-the-ship.md): how
// each part reads a word. The ten parts, what each counts and what it makes,
// the vowel colours and the hull's paints, and worked examples, all generated
// from the rule table (src/lib/ship/rules.ts) so the page can't drift from the
// rule. Server-rendered and readable without a script; read-only, nothing to
// type into, never live, never a place to try a word (that would be the
// preview the ship refuses). Reached from GET /, /readme/, ?at=N and ?kept=k.
// GET /house/ answers 301 to it, so old links keep working.

const baseUrl = inject("baseUrl");
const get = async (path: string) => {
  const res = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  return { res, doc: new JSDOM(await res.text()).window.document };
};
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

describe("GET /ship/", () => {
  it("is a page of its own, with no script, no way to type or try a word, and nothing live", async () => {
    const { res, doc } = await get("/ship/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(doc.querySelectorAll("form, input, textarea, [contenteditable]"), "the page offers a place to try a word").toHaveLength(0);
    expect(doc.querySelectorAll("script"), "the page runs a script").toHaveLength(0);
    expect(doc.documentElement.innerHTML, "the page listens for live changes").not.toContain("/events");
  });

  it("lists the ten parts in order, each with what it reads and what it makes, as the rule table has them", async () => {
    const { doc } = await get("/ship/");
    const rows = [...doc.querySelectorAll("[data-part]")];
    expect(rows.map((r) => r.getAttribute("data-part")), "the parts aren't the ten in order").toEqual(PARTS);
    rows.forEach((row, p) => {
      expect(text(row.querySelector("[data-n]")), `${PARTS[p]}'s number`).toBe(String(p + 1).padStart(2, "0"));
      expect(text(row.querySelector("[data-reads]")), `what the ${PARTS[p]} reads`).toBe(RULES[p].reads);
      expect(text(row.querySelector("[data-makes]")), `what the ${PARTS[p]} makes`).toBe(RULES[p].makes);
    });
  });

  it("shows each vowel's colour and the hull's thirteen paints, as the rule table has them", async () => {
    const { doc } = await get("/ship/");
    for (const [v, c] of Object.entries(VOWEL_COLOUR)) {
      const sw = doc.querySelector(`[data-vowel="${v}"]`);
      expect(sw, `no swatch for ${v}`).not.toBeNull();
      expect(sw!.getAttribute("data-colour"), `${v}'s colour`).toBe(hex(c));
    }
    const paints = [...doc.querySelectorAll("[data-paint]")];
    expect(paints.map((p) => p.getAttribute("data-colour")), "the paints").toEqual(PAINT.map(hex));
    // each paint names the letters that give it (a and n the first, b and o the second, ...)
    paints.forEach((p, k) => expect(text(p).toLowerCase(), `paint ${k}`).toContain(String.fromCharCode(97 + k) + String.fromCharCode(110 + k)));
  });

  it("works its examples through the same rule: what each shows is partOf()'s", async () => {
    const { doc } = await get("/ship/");
    const examples = [...doc.querySelectorAll("[data-example]")];
    expect(examples.length, "fewer than three worked examples").toBeGreaterThanOrEqual(3);
    for (const ex of examples) {
      const p = Number(ex.getAttribute("data-position")), was = ex.getAttribute("data-was")!, word = ex.getAttribute("data-word")!;
      const a = partOf(p, was), b = partOf(p, word);
      expect(a.says, `the example ${was} → ${word} doesn't change the ${PARTS[p]}`).not.toBe(b.says);
      for (const s of [a.says, b.says, b.because]) expect(text(ex)).toContain(s);
    }
  });

  it("says the ship never reads what a word means", async () => {
    const { doc } = await get("/ship/");
    expect(text(doc.querySelector("article")), "the page doesn't say meaning plays no part").toMatch(/never (asks|reads) what a word means|not what it means/i);
  });

  it("is reached from GET /, /readme/, ?at=0 and an earlier ship, and links back to the sentence", async () => {
    for (const path of ["/", "/readme/", "/?at=0"]) {
      const { doc } = await get(path);
      const link = doc.querySelector('a[href="/ship/"]');
      expect(link, `${path} has no way to /ship/`).not.toBeNull();
      expect(text(link)).toMatch(/^How the planks are made$/i);
      expect(doc.querySelector('a[href="/house/"]'), `${path} still links /house/`).toBeNull();
    }
    const { doc } = await get("/ship/");
    expect(doc.querySelector('a[href="/"]'), "/ship/ has no way back to the sentence").not.toBeNull();
  });

  it("answers GET /house/ with a permanent redirect to /ship/", async () => {
    const { res } = await get("/house/");
    expect(res.status).toBe(301);
    expect(new URL(res.headers.get("location")!, baseUrl).pathname).toBe("/ship/");
  });

  for (const [name, size] of [["1920×1080", [1920, 1080]], ["phone 390×844", [390, 844]]] as const) {
    it(`reads in /readme/'s shell, with no sideways scroll (${name})`, async () => {
      const page = async (path: string) => (await measureIn(await servedPage(baseUrl, path), `(async () => {
        await document.fonts.ready;
        const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, right: b.right }; };
        return { mast: r('.mast'), nav: r('.mast nav'), name: getComputedStyle(document.querySelector('.mast .name')).fontFamily,
          scroll: document.documentElement.scrollWidth, vw: innerWidth };
      })()`, [size[0], size[1]])) as any;
      const ship = await page("/ship/"), readme = await page("/readme/");
      expect(ship.mast.left, "the masthead isn't where /readme/ has it").toBeCloseTo(readme.mast.left, 0);
      expect(ship.name, "the masthead isn't set as /readme/ sets it").toBe(readme.name);
      expect(ship.nav.right, "the masthead's nav isn't at its right end, as on /readme/").toBeCloseTo(readme.nav.right, 0);
      expect(ship.scroll, "the page scrolls sideways").toBeLessThanOrEqual(ship.vw);
    }, 90_000);
  }
});
