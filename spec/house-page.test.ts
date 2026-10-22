import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { LETTERS, TESTS } from "../src/lib/house/features";
import { describeTerritory, FAMILY_ORDER, TERRITORIES } from "../src/lib/house/territories";
import { measureIn, servedPage } from "./chrome";

// GET /house/: how the house reads a word. The position-to-part table, each
// part's families in the order they're tried, the seven letter features and
// a few worked examples, all generated from src/lib/house/ so the page can't
// drift from the rule. Read-only: nothing to type into, nothing live, never a
// place to try a word (that would be the preview the house refuses). Reached
// from GET / and /readme/. It uses /readme/'s shell (masthead, nav, intro);
// on a desktop its two tables stand side by side, on a phone they stack.

const baseUrl = inject("baseUrl");
const get = async (path: string) => {
  const res = await fetch(new URL(path, baseUrl));
  return { res, doc: new JSDOM(await res.text()).window.document };
};
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("GET /house/", () => {
  it("is a page of its own, with no way to type or try a word, and nothing live", async () => {
    const { res, doc } = await get("/house/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(doc.querySelectorAll("form, input, textarea, [contenteditable]"), "the page offers a place to try a word").toHaveLength(0);
    expect(doc.querySelectorAll("script"), "the page runs a script").toHaveLength(0);
    expect(doc.documentElement.innerHTML, "the page listens for live changes").not.toContain("/events");
  });

  it("lists every position's part and its families in the order they're tried, as territories.ts has them", async () => {
    const { doc } = await get("/house/");
    const rows = [...doc.querySelectorAll("[data-part]")];
    expect(rows.map((r) => r.getAttribute("data-part")), "the parts aren't the ten territories in order").toEqual(TERRITORIES.map((t) => t.id));
    rows.forEach((row, p) => {
      expect(text(row.querySelector("[data-label]"))).toBe(TERRITORIES[p].label);
      const steps = [...row.querySelectorAll("[data-family]")];
      expect(steps.map((s) => s.getAttribute("data-family")), `${TERRITORIES[p].id}'s family order`).toEqual(FAMILY_ORDER[TERRITORIES[p].id].map((s) => s.family));
      steps.forEach((s, i) => {
        const test = FAMILY_ORDER[TERRITORIES[p].id][i].test;
        expect(s.getAttribute("data-test"), `${TERRITORIES[p].id} ${s.getAttribute("data-family")}'s test`).toBe(test ?? "");
      });
    });
  });

  it("names every letter test with its threshold, and the letter sets, as features.ts has them", async () => {
    const { doc } = await get("/house/");
    for (const [key, t] of Object.entries(TESTS)) {
      const row = doc.querySelector(`[data-test-def="${key}"]`);
      expect(row, `no definition of "${key}"`).not.toBeNull();
      expect(text(row), `"${key}" isn't defined as features.ts has it`).toContain(t.means);
    }
    for (const [name, set] of Object.entries(LETTERS)) {
      expect(text(doc.querySelector(`[data-letters="${name}"]`)), `the ${name} letters`).toBe([...set].join(" "));
    }
  });

  it("works its examples through the same rule: the families it shows are describeTerritory()'s", async () => {
    const { doc } = await get("/house/");
    const examples = [...doc.querySelectorAll("[data-example]")];
    expect(examples.length, "fewer than three worked examples").toBeGreaterThanOrEqual(3);
    for (const ex of examples) {
      const p = Number(ex.getAttribute("data-position")), was = ex.getAttribute("data-was")!, word = ex.getAttribute("data-word")!;
      const before = describeTerritory(p, was).family, after = describeTerritory(p, word).family;
      expect(before, `the example ${was} → ${word} doesn't change the family`).not.toBe(after);
      expect(text(ex)).toContain(before);
      expect(text(ex)).toContain(after);
    }
  });

  it("is reached from GET / and /readme/, beside About, and links back to the sentence", async () => {
    for (const path of ["/", "/readme/"]) {
      const { doc } = await get(path);
      expect(doc.querySelector('a[href="/house/"]'), `${path} has no way to /house/`).not.toBeNull();
      expect(text(doc.querySelector('a[href="/house/"]'))).toMatch(/^How the house reads a word$/i);
    }
    const { doc } = await get("/house/");
    expect(doc.querySelector('a[href="/"]'), "/house/ has no way back to the sentence").not.toBeNull();
  });

  // /readme/'s shell, so it reads as the same site; but at 1920 its two tables share the width rather than
  // leaving a narrow column with the screen empty, and on a phone they stack within the screen
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["phone 390×844", [390, 844]]] as const) {
    it(`sets its tables side by side on a desktop and stacked on a phone, in /readme/'s shell (${name})`, async () => {
      const page = async (path: string) => (await measureIn(await servedPage(baseUrl, path), `(async () => {
        await document.fonts.ready;
        const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
        return { mast: r('.mast'), name: getComputedStyle(document.querySelector('.mast .name')).fontFamily,
          parts: r('[data-table="parts"]'), letters: r('[data-table="letters"]'), scroll: document.documentElement.scrollWidth, vw: innerWidth };
      })()`, [size[0], size[1]])) as any;
      const house = await page("/house/"), readme = await page("/readme/");
      expect(house.mast.left, "the masthead isn't where /readme/ has it").toBeCloseTo(readme.mast.left, 0);
      expect(house.name, "the masthead isn't set as /readme/ sets it").toBe(readme.name);
      expect(house.scroll, "the page scrolls sideways").toBeLessThanOrEqual(house.vw);
      if (size[0] > 900) {
        expect(house.letters.left, "the two tables aren't side by side").toBeGreaterThanOrEqual(house.parts.right);
        expect(Math.abs(house.letters.top - house.parts.top), "the two tables don't start level").toBeLessThanOrEqual(2);
        expect(house.letters.right - house.parts.left, "the tables keep to a narrow column").toBeGreaterThan(size[0] * 0.6);
      } else {
        expect(house.letters.top, "the tables aren't stacked").toBeGreaterThanOrEqual(house.parts.bottom);
      }
    }, 90_000);
  }
});
