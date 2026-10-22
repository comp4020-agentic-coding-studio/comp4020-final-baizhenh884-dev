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

  // Only the tests a family is actually decided by: listing one that decides nothing (as "tall: 2 or more
  // tall letters" and "long: 7 letters or more" once were) reads as a rule the house doesn't have.
  it("defines every letter test a family uses, with its threshold, and no test that decides nothing", async () => {
    const { doc } = await get("/house/");
    const used = new Set(Object.values(FAMILY_ORDER).flat().map((s) => s.test).filter((t): t is NonNullable<typeof t> => t !== null));
    for (const key of used) {
      const row = doc.querySelector(`[data-test-def="${key}"]`);
      expect(row, `no definition of "${key}"`).not.toBeNull();
      expect(text(row), `"${key}" isn't defined as features.ts has it`).toContain(TESTS[key].means);
    }
    const listed = [...doc.querySelectorAll("[data-test-def]")].map((e) => e.getAttribute("data-test-def"));
    expect(listed.filter((k) => !used.has(k as never)), "the page defines a test no family uses").toEqual([]);
    // the letters also shape a part within its family, and length sets its reach: said once, not as a test
    expect(text(doc.querySelector("[data-shapes]")), "the page doesn't say what else the letters do").toMatch(/reach/i);
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
        return { mast: r('.mast'), nav: r('.mast nav'), name: getComputedStyle(document.querySelector('.mast .name')).fontFamily,
          parts: r('[data-table="parts"]'), letters: r('[data-table="letters"]'), scroll: document.documentElement.scrollWidth, vw: innerWidth,
          // a part's name may wrap at a space or after a hyphen, never inside a word: every place a new line
          // starts (measured letter by letter) must follow one of those
          brokenWords: [...document.querySelectorAll('[data-label]')].flatMap((e) => {
            const node = e.firstChild, t = node.textContent, cuts = [];
            let top = null;
            for (let i = 0; i < t.length; i++) {
              if (t[i] === ' ') continue;
              const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
              const y = Math.round(range.getBoundingClientRect().top);
              if (top !== null && y > top + 2 && !/[\\s-]/.test(t[i - 1])) cuts.push(t.slice(0, i) + ' / ' + t.slice(i));
              top = y;
            }
            return cuts;
          }) };
      })()`, [size[0], size[1]])) as any;
      const house = await page("/house/"), readme = await page("/readme/");
      expect(house.mast.left, "the masthead isn't where /readme/ has it").toBeCloseTo(readme.mast.left, 0);
      expect(house.name, "the masthead isn't set as /readme/ sets it").toBe(readme.name);
      // its way back to the sentence sits at the masthead's right end, as /readme/'s does
      expect(house.nav.right, "the masthead's nav isn't at its right end, as on /readme/").toBeCloseTo(readme.nav.right, 0);
      expect(house.scroll, "the page scrolls sideways").toBeLessThanOrEqual(house.vw);
      if (size[0] > 900) {
        expect(house.letters.left, "the two tables aren't side by side").toBeGreaterThanOrEqual(house.parts.right);
        expect(Math.abs(house.letters.top - house.parts.top), "the two tables don't start level").toBeLessThanOrEqual(2);
        expect(house.letters.right - house.parts.left, "the tables keep to a narrow column").toBeGreaterThan(size[0] * 0.6);
      } else {
        expect(house.letters.top, "the tables aren't stacked").toBeGreaterThanOrEqual(house.parts.bottom);
      }
      expect(house.brokenWords, "a part's name breaks inside a word").toEqual([]);
    }, 90_000);
  }
});
