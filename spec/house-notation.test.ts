import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { drafting, notation, said, showDrafting } from "../src/lib/house/notation";
import { describeTerritory, TERRITORIES, TESTS } from "../src/lib/house/territories";

// The part notation's words (#part, and what a screen reader hears of the same
// change). Every part of it comes from describeTerritory(): the family, and
// after a change the family before and after and the letter tests that
// decided it, never a second copy of the rule. A desktop says the whole
// reason; a phone, where the reason would reach the house
// (spec/two-ships-layout.test.ts), says the family change only.
// Pure: no app state, so it runs the same against any APP_URL.

const rows = JSON.parse(readFileSync(new URL("./fixtures/house-descriptors.json", import.meta.url), "utf8")).rows as [number, string][];
const POOL = [...new Set(rows.map((r) => r[1]))];
const WORDS = [...POOL, "a", "y", "rhythm", "bookkeeper", "queue", "incomprehensibilities"];
const label = (p: number) => `${String(p + 1).padStart(2, "0")} — ${TERRITORIES[p].label}`;
const reasonWords = (p: number, w: string) => describeTerritory(p, w).reason.map((r) => (r.holds ? TESTS[r.test].yes : TESTS[r.test].no)).join(", ");

describe("the part notation", () => {
  it("names the part and its family while a word is in hand, from describeTerritory()", () => {
    for (let p = 0; p < 10; p++) for (const w of WORDS) {
      expect(notation({ position: p, word: w })).toBe(`${label(p)} · ${describeTerritory(p, w).family}`);
    }
  });

  it("after a change, names the family before and after and, on a desktop, every test that decided it", () => {
    const wrong: string[] = [];
    for (let p = 0; p < 10; p++) for (const a of WORDS.slice(0, 60)) for (const b of WORDS) {
      const A = describeTerritory(p, a).family, B = describeTerritory(p, b).family;
      const want = A === B ? `${label(p)} · ${B}, unchanged · ${reasonWords(p, b)}` : `${label(p)} · ${A} → ${B} · ${reasonWords(p, b)}`;
      const got = notation({ position: p, word: b, was: a }, "desktop");
      if (got !== want) wrong.push(`${p} ${a}→${b}: ${got}`);
    }
    expect(wrong.slice(0, 5), `${wrong.length} wrong`).toEqual([]);
  });

  it("on a phone, names the family change only: no reason, nothing elided", () => {
    for (let p = 0; p < 10; p++) for (const a of WORDS.slice(0, 40)) for (const b of WORDS.slice(0, 120)) {
      const A = describeTerritory(p, a).family, B = describeTerritory(p, b).family;
      const got = notation({ position: p, word: b, was: a }, "phone");
      expect(got).toBe(A === B ? `${label(p)} · ${B}, unchanged` : `${label(p)} · ${A} → ${B}`);
      expect(got).not.toContain("…");
    }
  });

  // hand-checked against the rule, so the exact wording is pinned
  it("reads the way a person would check it", () => {
    expect(notation({ position: 4, word: "cut", was: "people" }, "desktop")).toBe("05 — entry · arch → cut · not mostly round, short");
    expect(notation({ position: 4, word: "cut", was: "people" }, "phone")).toBe("05 — entry · arch → cut");
    expect(notation({ position: 4, word: "door", was: "people" }, "desktop")).toBe("05 — entry · arch, unchanged · mostly round");
    expect(notation({ position: 4, word: "door", was: "people" }, "phone")).toBe("05 — entry · arch, unchanged");
    expect(notation({ position: 2, word: "hammock", was: "website" }, "desktop")).toBe("03 — central hall · clerestory → block · fewer than 2 repeats, not open");
    expect(notation({ position: 0, word: "jump" })).toBe("01 — ground · stilts");
  });

  // While a replacement is being typed: the word being replaced, struck, and
  // the keys, in the notation's slot. A desktop keeps the part and its family
  // (of the word that stands: typing never previews the house); a phone says
  // only what's being replaced and how to send it. Three pieces, so the page
  // can strike the word and shorten it alone when it's long
  // (spec/two-ships-layout.test.ts): the keys are never cut.
  it("while typing, names the word being replaced and the keys", () => {
    expect(drafting({ position: 4, word: "people" }, "desktop")).toEqual({ lead: "05 — entry · arch · replacing ", was: "people", tail: " · Enter to replace · Esc to cancel" });
    expect(drafting({ position: 4, word: "people" }, "phone")).toEqual({ lead: "Replacing ", was: "people", tail: " · Enter to replace" });
    for (let p = 0; p < 10; p++) for (const w of WORDS) {
      const d = drafting({ position: p, word: w }, "desktop");
      expect(d.lead).toBe(`${notation({ position: p, word: w })} · replacing `);
      expect(d.was).toBe(w);
      expect(drafting({ position: p, word: w }, "phone").was).toBe(w);
    }
  });

  // the slot gets the three pieces as text, the replaced word struck (a <del>), never as markup
  it("sets the drafting line as text, the replaced word struck", () => {
    const doc = new JSDOM('<p id="part" hidden></p>').window.document;
    const part = doc.getElementById("part")!;
    showDrafting(part, drafting({ position: 4, word: "<b>x</b>" }, "phone"));
    expect(part.hidden).toBe(false);
    expect(part.textContent).toBe("Replacing <b>x</b> · Enter to replace");
    expect(part.querySelector("b"), "a word became markup").toBeNull();
    expect(part.querySelector("del")?.textContent).toBe("<b>x</b>");
    // and the plain notation afterwards leaves no struck word behind
    part.textContent = notation({ position: 4, word: "door" });
    expect(part.querySelector("del")).toBeNull();
  });

  // what the polite live region says of the same change: positions, words and families, never who or when
  it("tells a screen reader the same family change, in plain words", () => {
    expect(said({ position: 4, word: "cut", was: "people" })).toBe("Changed: word 5 is now “cut”; the entry goes from arch to cut.");
    expect(said({ position: 4, word: "door", was: "people" })).toBe("Changed: word 5 is now “door”; the entry stays arch.");
    for (let p = 0; p < 10; p++) for (const b of WORDS.slice(0, 50)) {
      const s = said({ position: p, word: b, was: WORDS[0] });
      expect(s).toContain(describeTerritory(p, b).family);
      expect(s).toContain(TERRITORIES[p].label);
      expect(s).not.toMatch(/\d{1,2}:\d{2}|ago|second|minute|visitor|someone/i);
    }
  });
});
