import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { counts, PARTS, partOf, RULES, VOWEL_COLOUR, PAINT, paintOf } from "../src/lib/ship/rules";

// The ship's rules (docs/decisions/0005-the-ship.md, CLAUDE.md "Scope (Final
// Project: the ship, in one harbour)"): ten fixed parts, each reading one
// thing you can count in how a word is spelled, never what it means. Pure: no
// app state, so it runs the same against any APP_URL.
//
// The counts fixture was generated once from the approved prototype's feat()
// (docs/exploration/ship-prototype/theseus-harbour.html) over the house
// fixture's word pool and a few extremes. Every row is plain a–z, where the
// prototype's letters-only reading and this rule agree. What the prototype
// didn't decide (accents, other scripts, digits, a word with no letter) is
// pinned by hand below, as the maker decided on 30 October.

type Row = [string, number, string, number, number, number, number, number, string];
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ship-counts.json", import.meta.url), "utf8")) as { rows: Row[] };

describe("the ship's parts", () => {
  it("gives the ten positions their ten fixed parts, in order", () => {
    expect(PARTS).toEqual(["ram", "hull", "prow", "stern", "shields", "mast", "sail", "oars", "steering oar", "pennant"]);
  });

  it("has one rule per part, each saying what it reads and what it makes", () => {
    expect(RULES).toHaveLength(10);
    for (const r of RULES) {
      expect(r.reads.length, "a rule doesn't say what it reads").toBeGreaterThan(0);
      expect(r.makes.length, "a rule doesn't say what it makes").toBeGreaterThan(0);
    }
  });
});

describe("what a word counts", () => {
  it("matches the approved prototype's counts for every pool word", () => {
    const wrong: string[] = [];
    for (const [word, letters, vowels, consonants, tall, round, hanging, repeated, first] of fixture.rows) {
      const c = counts(word);
      const got = [c.letters, c.vowels.join(""), c.consonants, c.tall, c.round, c.hanging, c.repeated, c.first];
      const want = [letters, vowels, consonants, tall, round, hanging, repeated, first];
      if (JSON.stringify(got) !== JSON.stringify(want)) wrong.push(`${word}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
    }
    expect(wrong.slice(0, 10), `${wrong.length} of ${fixture.rows.length} differ`).toEqual([]);
  });

  // the pennant is the exception: it carries the word as written, its case included (decided 30 October)
  it("reads only the written form: letter case and surrounding space change no count and no part but the pennant", () => {
    expect(counts("  Website ")).toEqual(counts("website"));
    for (let p = 0; p < 9; p++) expect(partOf(p, "  Website ").value).toEqual(partOf(p, "website").value);
    expect(partOf(9, "  Website ").value).toBe("Website");
  });

  // decided 30 October: accents are stripped (é counts as e), letters of other scripts count as letters and
  // consonants, digits and punctuation count as nothing
  it("strips accents, counts other scripts as consonants, and ignores digits and punctuation", () => {
    expect(counts("café")).toEqual(counts("cafe"));
    expect(counts("naïve")).toEqual(counts("naive"));
    const jp = counts("日本");
    expect([jp.letters, jp.vowels, jp.consonants, jp.tall, jp.round, jp.hanging], "other scripts").toEqual([2, [], 2, 0, 0, 0]);
    expect(counts("it's")).toEqual(counts("its"));
    expect(counts("r2d2")).toEqual(counts("rd"));
    // a letter of another script repeated is a repeated letter
    expect(counts("日日").repeated).toBe(1);
  });

  it("paints the hull by the first Latin letter, and a word without one the default paint", () => {
    expect(counts("日本").first).toBeNull();
    expect(counts("日a").first).toBe("a");
    expect(paintOf(counts("日本"))).toBe(PAINT[0]);
    expect(paintOf(counts("123"))).toBe(PAINT[0]);
  });
});

describe("what each part makes", () => {
  // the prototype's caps and minimums (RULES and build in theseus-harbour.html), stated as numbers here
  it("ram: a blunt ram with no repeated letter, a beak with one, a trident with two or more", () => {
    expect(partOf(0, "cat").value).toBe("blunt");
    expect(partOf(0, "letter").value).toBe("trident"); // t, e repeated
    expect(partOf(0, "hammock").value).toBe("beak"); // m
  });

  it("hull: one of thirteen paints by the first letter, a and n sharing one", () => {
    expect(PAINT).toHaveLength(13);
    expect(partOf(1, "anchor").value).toBe(partOf(1, "night").value);
    expect(partOf(1, "anchor").value).not.toBe(partOf(1, "boat").value);
  });

  it("prow: straight with no round letter, curled once per round letter up to six", () => {
    expect(partOf(2, "hi").value).toBe(0);
    expect(partOf(2, "bed").value).toBe(3);
    expect(partOf(2, "doodlesbooks").value).toBe(6);
  });

  it("stern: one plume per consonant, at least one and at most nine", () => {
    expect(partOf(3, "aeiou").value).toBe(1);
    expect(partOf(3, "strengths").value).toBe(8);
    expect(partOf(3, "incomprehensibilities").value).toBe(9);
  });

  it("shields: one per vowel, in that vowel's colour, at most eight, none for a word without a vowel", () => {
    expect(partOf(4, "rhythm").value).toEqual([]);
    expect(partOf(4, "queue").value).toEqual(["u", "e", "u", "e"]);
    expect(partOf(4, "incomprehensibilities").value).toHaveLength(8);
    expect(Object.keys(VOWEL_COLOUR).sort()).toEqual(["a", "e", "i", "o", "u"]);
  });

  it("mast: one step taller per tall letter, up to five", () => {
    expect(partOf(5, "sea").value).toBe(0);
    expect(partOf(5, "tall").value).toBe(3);
    expect(partOf(5, "thankfulbloodthirsty").value).toBe(5);
  });

  it("sail: one stripe per letter, vowels in their colour, at least one stripe", () => {
    expect(partOf(6, "sea").value).toEqual(["s", "e", "a"]);
    expect(partOf(6, "123").value).toHaveLength(1);
  });

  it("oars: one per letter a side, at least one and at most twelve", () => {
    expect(partOf(7, "it").value).toBe(2);
    expect(partOf(7, "incomprehensibilities").value).toBe(12);
  });

  it("steering oar: one step deeper per hanging letter, up to four", () => {
    expect(partOf(8, "it").value).toBe(0);
    expect(partOf(8, "jiggly").value).toBe(4);
    expect(partOf(8, "jigglypuppy").value).toBe(4);
  });

  it("pennant: the word itself, exactly as written", () => {
    expect(partOf(9, "Café").value).toBe("Café");
    expect(partOf(9, "123").value).toBe("123");
    expect(partOf(9, "  it's ").value).toBe("it's");
  });

  // decided 30 October: a word with no letter at all still gives every part its minimum
  it("gives every part its minimum for a word with no letter at all, and the pennant the word as written", () => {
    const min = Array.from({ length: 10 }, (_, p) => partOf(p, "123").value);
    expect(min).toEqual(["blunt", PAINT[0], 0, 1, [], 0, [null], 1, 0, "123"]);
    expect(partOf(6, "!!").value, "a sail with no letter is one plain stripe").toEqual([null]);
  });

  it("decides each part from its own position's word only", () => {
    for (let p = 0; p < 10; p++) expect(partOf(p, "website")).toEqual(partOf(p, "website"));
    expect(() => partOf(10, "a")).toThrow(RangeError);
  });
});

describe("why, in words", () => {
  // the notation and /ship/ read these; one table, so the reason is the rule
  it("says what the part made of a word and the count that decided it", () => {
    expect(partOf(7, "whether").says).toBe("7 oars a side");
    expect(partOf(7, "whether").because).toBe("7 letters");
    expect(partOf(0, "potato").says).toBe("trident");
    expect(partOf(0, "potato").because).toBe("2 repeated letters");
    expect(partOf(1, "bubble").says).toBe("paint “B”");
    expect(partOf(1, "bubble").because).toBe("starts with “b”");
    expect(partOf(1, "123").because).toBe("no Latin letter");
    expect(partOf(2, "lantern").says).toBe("curl ×1");
    expect(partOf(2, "it").says).toBe("straight prow");
    expect(partOf(3, "that").says).toBe("3 plumes");
    expect(partOf(4, "students").says).toBe("2 shields a side");
    expect(partOf(4, "rhythm").says).toBe("no shields");
    expect(partOf(5, "would").says).toBe("mast height 2");
    expect(partOf(6, "wonder").says).toBe("6 stripes");
    expect(partOf(6, "wonder").because).toBe("spelled W·O·N·D·E·R");
    expect(partOf(8, "it").says).toBe("depth 0");
    expect(partOf(9, "disappeared").says).toBe("“disappeared” on the pennant");
    expect(partOf(9, "disappeared").because).toBe("the word, as written");
  });

  it("uses one for one and the plural otherwise", () => {
    expect(partOf(3, "aeiou").says).toBe("1 plume");
    expect(partOf(7, "a").says).toBe("1 oar a side");
    expect(partOf(5, "tall").because).toBe("3 tall letters");
    expect(partOf(5, "it").because).toBe("1 tall letter");
  });
});
