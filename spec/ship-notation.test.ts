import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { drafting, foreseen, notation, said, showDrafting } from "../src/lib/ship/notation";
import { PARTS, partOf } from "../src/lib/ship/rules";

// The part notation's words (#part, and what a screen reader hears of the
// same change), for the ship (docs/decisions/0005-the-ship.md). Everything in
// it comes from the rule table (partOf in src/lib/ship/rules.ts), never a
// second copy: the part, what it made of the word, and on a desktop the count
// that decided it. A phone says the change only. The contract is the house
// notation's (same slot, same pieces, same stale line, same live regions);
// only the words are the ship's. Pure: no app state.

const rows = JSON.parse(readFileSync(new URL("./fixtures/ship-counts.json", import.meta.url), "utf8")).rows as [string][];
const WORDS = [...rows.map((r) => r[0]), "Café", "日本", "123", "it's"];
const name = (p: number) => PARTS[p][0].toUpperCase() + PARTS[p].slice(1);
const label = (p: number) => `${String(p + 1).padStart(2, "0")} · ${name(p)}`;
const change = (p: number, was: string, w: string) => {
  const a = partOf(p, was).says, b = partOf(p, w).says;
  return a === b ? `${b}, unchanged` : `${a} → ${b}`;
};

describe("the part notation", () => {
  it("names the part and what the word makes of it while a word is in hand", () => {
    for (let p = 0; p < 10; p++) for (const w of WORDS) expect(notation({ position: p, word: w })).toBe(`${label(p)} · ${partOf(p, w).says}`);
  });

  it("after a change, names before and after and, on a desktop, the count that decided it", () => {
    const wrong: string[] = [];
    for (let p = 0; p < 10; p++) for (const a of WORDS.slice(0, 40)) for (const b of WORDS) {
      const want = `${label(p)} · ${change(p, a, b)} · ${partOf(p, b).because}`;
      const got = notation({ position: p, word: b, was: a }, "desktop");
      if (got !== want) wrong.push(`${p} ${a}→${b}: ${got}`);
      expect(notation({ position: p, word: b, was: a }, "phone")).toBe(`${label(p)} · ${change(p, a, b)}`);
    }
    expect(wrong.slice(0, 5), `${wrong.length} wrong`).toEqual([]);
  });

  // hand-checked against the rule, so the exact wording is pinned
  it("reads the way a person would check it", () => {
    expect(notation({ position: 7, word: "whether", was: "if" }, "desktop")).toBe("08 · Oars · 2 oars a side → 7 oars a side · 7 letters");
    expect(notation({ position: 7, word: "whether", was: "if" }, "phone")).toBe("08 · Oars · 2 oars a side → 7 oars a side");
    expect(notation({ position: 1, word: "night", was: "anchor" }, "desktop")).toBe("02 · Hull · paint “N”, unchanged · starts with “n”");
    expect(notation({ position: 0, word: "potato" })).toBe("01 · Ram · trident");
    expect(notation({ position: 8, word: "it" })).toBe("09 · Steering oar · depth 0");
  });

  // While a replacement is typed: the part (its number alone on a phone), the word being replaced, struck,
  // and what the draft would make, from the same rule; a desktop adds the count. Never the keys.
  it("while typing, names the part, the word being replaced and what the draft would make", () => {
    expect(drafting({ position: 7, word: "if", draft: "whether" }, "desktop")).toEqual({ lead: "08 · Oars · ", was: "if", rest: " · 2 oars a side → 7 oars a side · 7 letters" });
    expect(drafting({ position: 7, word: "if", draft: "whether" }, "phone")).toEqual({ lead: "08 · ", was: "if", rest: " · 2 oars a side → 7 oars a side" });
    for (let p = 0; p < 10; p++) for (const was of WORDS.slice(0, 20)) for (const w of WORDS.slice(0, 120)) {
      expect(drafting({ position: p, word: was, draft: w }, "desktop")).toEqual({ lead: `${label(p)} · `, was, rest: ` · ${change(p, was, w)} · ${partOf(p, w).because}` });
      expect(drafting({ position: p, word: was, draft: w }, "phone")).toEqual({ lead: `${String(p + 1).padStart(2, "0")} · `, was, rest: ` · ${change(p, was, w)}` });
    }
  });

  it("never names a key: Enter and Escape are in the rule paragraph", () => {
    for (let p = 0; p < 10; p++) for (const form of ["desktop", "phone"] as const) for (const draft of ["", "hollow", " x", "w".repeat(25)]) {
      expect(Object.values(drafting({ position: p, word: "people", draft }, form)).join(""), `${p} ${form} ${JSON.stringify(draft)}`).not.toMatch(/enter|esc/i);
    }
  });

  it("predicts nothing from a draft that can't be a word, and trims one that can", () => {
    for (const draft of ["two words", "w".repeat(25), "tab\there", ""]) {
      expect(drafting({ position: 7, word: "if", draft }, "desktop")).toEqual({ lead: "08 · Oars · ", was: "if", rest: "" });
    }
    expect(drafting({ position: 7, word: "if", draft: "  whether " }, "phone")).toEqual({ lead: "08 · ", was: "if", rest: " · 2 oars a side → 7 oars a side" });
    // a word of digits is a word: it predicts every part's minimum
    expect(drafting({ position: 7, word: "if", draft: "123" }, "phone").rest).toBe(" · 2 oars a side → 1 oar a side");
  });

  it("when the word was replaced while typing, says the new word and to choose again", () => {
    for (const form of ["desktop", "phone"] as const) {
      expect(drafting({ position: 7, word: "if", draft: "whether", now: "X" }, form)).toEqual({ lead: "08 · ", was: "if", rest: " · now “", now: "X", end: "” · choose again" });
    }
  });

  it("reads the draft from its spelling alone, never the blocklist", () => {
    const src = (f: string) => readFileSync(new URL(`../src/lib/${f}`, import.meta.url), "utf8");
    const reached = new Set<string>(), queue = ["ship/notation.ts", "live-client.ts"];
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

  it("sets the drafting line as text, the replaced word struck", () => {
    const doc = new JSDOM('<p id="part" hidden></p>').window.document;
    const part = doc.getElementById("part")!;
    showDrafting(part, drafting({ position: 7, word: "<b>x</b>", draft: "whether" }, "phone"));
    expect(part.hidden).toBe(false);
    expect(part.textContent).toBe("08 · <b>x</b> · 3 oars a side → 7 oars a side");
    expect(part.querySelector("b"), "a word became markup").toBeNull();
    expect(part.querySelector("del")?.textContent).toBe("<b>x</b>");
    showDrafting(part, drafting({ position: 7, word: "if", draft: "whether", now: "<i>y</i>" }, "phone"));
    expect(part.textContent).toBe("08 · if · now “<i>y</i>” · choose again");
    expect(part.querySelector("i"), "a word became markup").toBeNull();
  });

  it("tells a screen reader the prediction, or that the word was replaced, in plain words", () => {
    expect(foreseen({ position: 7, word: "if", draft: "whether" })).toBe("Oars: 2 oars a side would become 7 oars a side; 7 letters.");
    expect(foreseen({ position: 1, word: "anchor", draft: "night" })).toBe("Hull: paint “N” would stay paint “N”; starts with “n”.");
    expect(foreseen({ position: 7, word: "if", draft: "two words" })).toBe("");
    expect(foreseen({ position: 7, word: "if", draft: "" })).toBe("");
    expect(foreseen({ position: 7, word: "if", draft: "whether", now: "X" })).toBe("Oars were changed to X by someone else. Choose them again.");
    expect(foreseen({ position: 0, word: "if", draft: "whether", now: "X" })).toBe("Ram was changed to X by someone else. Choose it again.");
  });

  it("tells a screen reader the same change, in plain words, never who or when", () => {
    expect(said({ position: 7, word: "whether", was: "if" })).toBe("Changed: word 8 is now “whether”; the oars go from 2 oars a side to 7 oars a side.");
    expect(said({ position: 1, word: "night", was: "anchor" })).toBe("Changed: word 2 is now “night”; the hull stays paint “N”.");
    expect(said({ position: 0, word: "potato", was: "make" })).toBe("Changed: word 1 is now “potato”; the ram goes from blunt to trident.");
    for (let p = 0; p < 10; p++) for (const b of WORDS.slice(0, 50)) {
      const s = said({ position: p, word: b, was: WORDS[0] });
      expect(s).toContain(partOf(p, b).says);
      expect(s).toContain(PARTS[p]);
      expect(s).not.toMatch(/\d{1,2}:\d{2}|ago|second|minute|visitor|someone/i);
    }
  });
});
