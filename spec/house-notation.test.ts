import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { drafting, foreseen, notation, said, showDrafting } from "../src/lib/house/notation";
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

  // While a replacement is being typed (decided after the 28 October playtest):
  // the word being replaced, struck, and the family the draft would give its
  // part, never the keys (they're in the rule paragraph). A desktop adds the
  // test that decided that family, in its yes/no words; a phone doesn't, so
  // it stays one line. The same rule as an accepted change's notation, from
  // describeTerritory(): the prediction is notation({ ..., was }) with the
  // struck word set in. In pieces, so the page strikes the replaced word and
  // shortens only a long word (spec/two-ships-layout.test.ts). Text only:
  // the house never shows a draft.
  const lastTest = (p: number, w: string) => {
    const r = describeTerritory(p, w).reason.at(-1);
    return r ? (r.holds ? TESTS[r.test].yes : TESTS[r.test].no) : null;
  };
  const change = (p: number, was: string, w: string) => {
    const A = describeTerritory(p, was).family, B = describeTerritory(p, w).family;
    return A === B ? `${B}, unchanged` : `${A} → ${B}`;
  };

  it("while typing, names the part, the word being replaced and the family the draft would give it", () => {
    expect(drafting({ position: 4, word: "people", draft: "hollow" }, "desktop")).toEqual({ lead: "05 — entry · ", was: "people", rest: " · arch → nested · not short" });
    expect(drafting({ position: 4, word: "people", draft: "hollow" }, "phone")).toEqual({ lead: "05 — entry · ", was: "people", rest: " · arch → nested" });
    expect(drafting({ position: 4, word: "people", draft: "door" }, "desktop")).toEqual({ lead: "05 — entry · ", was: "people", rest: " · arch, unchanged · mostly round" });
    expect(drafting({ position: 2, word: "website", draft: "brightly" }, "desktop")).toEqual({ lead: "03 — central hall · ", was: "website", rest: " · clerestory → block · not open" });
    for (let p = 0; p < 10; p++) for (const was of WORDS.slice(0, 30)) for (const w of WORDS) {
      const d = drafting({ position: p, word: was, draft: w }, "desktop"), t = lastTest(p, w);
      expect(d).toEqual({ lead: `${label(p)} · `, was, rest: ` · ${change(p, was, w)}${t ? ` · ${t}` : ""}` });
      expect(drafting({ position: p, word: was, draft: w }, "phone")).toEqual({ lead: `${label(p)} · `, was, rest: ` · ${change(p, was, w)}` });
    }
  });

  it("never names a key: Enter and Escape are in the rule paragraph", () => {
    for (let p = 0; p < 10; p++) for (const form of ["desktop", "phone"] as const) for (const draft of ["", "hollow", " x", "w".repeat(25)]) {
      const d = drafting({ position: p, word: "people", draft }, form);
      expect(Object.values(d).join(""), `${p} ${form} ${JSON.stringify(draft)}`).not.toMatch(/enter|esc/i);
    }
  });

  // a draft that isn't a word yet (spaces inside, too long) predicts nothing; an empty one is the plain notation
  it("predicts nothing from a draft that can't be a word, and leaves an empty draft to the plain notation", () => {
    for (const draft of ["two words", "w".repeat(25), "tab\there"]) {
      expect(drafting({ position: 4, word: "people", draft }, "desktop")).toEqual({ lead: "05 — entry · ", was: "people", rest: "" });
    }
    // surrounding spaces are trimmed, as the server trims them
    expect(drafting({ position: 4, word: "people", draft: "  hollow " }, "phone")).toEqual({ lead: "05 — entry · ", was: "people", rest: " · arch → nested" });
    expect(drafting({ position: 4, word: "people", draft: "w".repeat(24) }, "phone").rest).not.toBe("");
  });

  // Another visitor replaced the word while this one was typing: sending would be refused as stale,
  // so the line says what to do, and the new word is its own piece, so a long one shrinks alone.
  it("when the word was replaced while typing, says the new word and to choose again", () => {
    for (const form of ["desktop", "phone"] as const) {
      expect(drafting({ position: 4, word: "people", draft: "hollow", now: "X" }, form)).toEqual({ lead: "05 — entry · ", was: "people", rest: " · now “", now: "X", end: "” · choose again" });
    }
  });

  // the spelling is all it reads: the maker's blocklist never reaches the client
  it("reads the draft from its spelling alone, never the blocklist", () => {
    const src = (f: string) => readFileSync(new URL(`../src/lib/${f}`, import.meta.url), "utf8");
    const reached = new Set<string>(), queue = ["house/notation.ts", "house/page.ts", "live-client.ts"];
    while (queue.length) {
      const f = queue.pop()!;
      if (reached.has(f)) continue;
      reached.add(f);
      for (const [, rel] of src(f).matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
        const next = new URL(rel + (rel.endsWith(".ts") ? "" : ".ts"), new URL(`../src/lib/${f}`, import.meta.url)).pathname.split("/src/lib/")[1];
        if (next) queue.push(next);
      }
    }
    expect([...reached].filter((f) => /blocklist|^word\.ts$/.test(f)), "the page's scripts reach the blocklist").toEqual([]);
  });

  // the slot gets the pieces as text, the replaced word struck (a <del>), never as markup
  it("sets the drafting line as text, the replaced word struck", () => {
    const doc = new JSDOM('<p id="part" hidden></p>').window.document;
    const part = doc.getElementById("part")!;
    showDrafting(part, drafting({ position: 4, word: "<b>x</b>", draft: "hollow" }, "phone"));
    expect(part.hidden).toBe(false);
    expect(part.textContent).toBe(`05 — entry · <b>x</b> · ${notation({ position: 4, word: "hollow", was: "<b>x</b>" }, "phone").split(" · ")[1]}`);
    expect(part.querySelector("b"), "a word became markup").toBeNull();
    expect(part.querySelector("del")?.textContent).toBe("<b>x</b>");
    showDrafting(part, drafting({ position: 4, word: "people", draft: "hollow", now: "<i>y</i>" }, "phone"));
    expect(part.textContent).toBe("05 — entry · people · now “<i>y</i>” · choose again");
    expect(part.querySelector("i"), "a word became markup").toBeNull();
    // and the plain notation afterwards leaves no struck word behind
    part.textContent = notation({ position: 4, word: "door" });
    expect(part.querySelector("del")).toBeNull();
  });

  // What the draft's own live region says, once typing pauses (src/lib/live-client.ts): the same
  // prediction in words, or the stale case and what to do; never a key, never who or when.
  it("tells a screen reader the prediction, or that the word was replaced, in plain words", () => {
    expect(foreseen({ position: 4, word: "people", draft: "hollow" })).toBe("Entry: arch would become nested; not short.");
    expect(foreseen({ position: 4, word: "people", draft: "door" })).toBe("Entry: arch would stay arch; mostly round.");
    expect(foreseen({ position: 4, word: "people", draft: "two words" })).toBe("");
    expect(foreseen({ position: 4, word: "people", draft: "" })).toBe("");
    expect(foreseen({ position: 4, word: "people", draft: "hollow", now: "X" })).toBe("Entry was changed to X by someone else. Choose it again.");
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
