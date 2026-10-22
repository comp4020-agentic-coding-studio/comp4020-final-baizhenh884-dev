import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { completedShip, deriveKeptShip, keptWhere, type CurrentWord, type KeptChange } from "../src/lib/kept-ship";

// Kept ships (docs/decisions/0003-settle-and-kept-ships.md): ship m0 =
// min(version) across the ten positions is the ship being built; the ship
// before it (m0 - 1) is shown instead, held complete, exactly while the
// single most recent change is the one that closed its last gap — re-derived
// on every read, never timed, from `changes` alone. Pure logic (like
// deriveTotal in src/lib/live-client.ts), so it's tested directly here
// without a database or a running app.

const STARTING = ["Make", "a", "website", "that", "people", "would", "miss", "if", "it", "disappeared"];

// A little model of the real schema: replay a sequence of [position, word]
// replacements over the maker's sentence, producing exactly the (changes,
// current) shapes deriveKeptShip reads from SQLite.
function simulate(replacements: [position: number, word: string][]): { changes: KeptChange[]; current: CurrentWord[] } {
  const words = [...STARTING];
  const versions = Array(10).fill(1);
  const changes: KeptChange[] = [];
  for (const [position, word] of replacements) {
    changes.push({ position, fromVersion: versions[position], fromWord: words[position] });
    words[position] = word;
    versions[position]++;
  }
  return { changes, current: words.map((word, i) => ({ word, version: versions[i] })) };
}

describe("Kept ships", () => {
  it("shows ship 1, all ten gaps, before any replacement", () => {
    const { changes, current } = simulate([]);
    const kept = deriveKeptShip(changes, current);
    expect(kept.ship).toBe(1);
    expect(kept.gaps).toEqual(Array(10).fill(true));
  });

  it("fills a position in ship 1 with its original word once that word is replaced away", () => {
    const { changes, current } = simulate([[3, "ox"]]);
    const kept = deriveKeptShip(changes, current);
    expect(kept.ship).toBe(1);
    expect(kept.gaps[3]).toBe(false);
    expect(kept.words[3]).toBe(STARTING[3]);
    expect(kept.gaps.filter((g) => g).length, "only the replaced position should stop being a gap").toBe(9);
  });

  it("holds ship 1 complete, with every original word, once its last gap closes", () => {
    const replacements: [number, string][] = STARTING.map((_, i) => [i, `v2-${i}`]);
    const { changes, current } = simulate(replacements);
    const kept = deriveKeptShip(changes, current);
    expect(kept.ship).toBe(1);
    expect(kept.gaps).toEqual(Array(10).fill(false));
    expect(kept.words).toEqual(STARTING);
  });

  it("stays ship 1, held, on a fresh read with no further change", () => {
    const replacements: [number, string][] = STARTING.map((_, i) => [i, `v2-${i}`]);
    const { changes, current } = simulate(replacements);
    const first = deriveKeptShip(changes, current);
    const again = deriveKeptShip(changes, current);
    expect(again).toEqual(first);
    expect(again.ship).toBe(1);
    expect(again.gaps).toEqual(Array(10).fill(false));
  });

  it("flips to ship 2 the instant any further replacement lands, correctly pre-filled wherever a position is already a version ahead", () => {
    // round 1: every position replaced once, completing (and holding) ship 1
    const round1: [number, string][] = STARTING.map((_, i) => [i, `v2-${i}`]);
    // two positions already replaced a second time before this read — ship 2
    // must show both as kept (their version-2 word), not as gaps
    const round2: [number, string][] = [
      [2, "v3-2"],
      [7, "v3-7"],
    ];
    const { changes, current } = simulate([...round1, ...round2]);
    const kept = deriveKeptShip(changes, current);
    expect(kept.ship).toBe(2);
    expect(kept.gaps[2]).toBe(false);
    expect(kept.gaps[7]).toBe(false);
    expect(kept.words[2]).toBe("v2-2"); // the word that stood at version 2, now kept
    expect(kept.words[7]).toBe("v2-7");
    expect(kept.gaps.filter((g) => g).length, "only the two already-twice-replaced positions should be filled").toBe(8);
  });

  // Only ship 1 holds (docs/decisions/0003): a later ship's completion is a
  // quiet beat on the page, never a hold, so the read after the change that
  // closes ship 2 already shows ship 3.
  it("never holds a later ship: the change that closes ship 2 shows ship 3 at once", () => {
    const round1: [number, string][] = STARTING.map((_, i) => [i, `v2-${i}`]);
    const round2: [number, string][] = STARTING.map((_, i) => [i, `v3-${i}`]);
    const { changes, current } = simulate([...round1, ...round2]);
    const kept = deriveKeptShip(changes, current);
    expect(kept.ship, "ship 2 is held after its last gap closed").toBe(3);
    expect(kept.gaps, "ship 3 starts empty").toEqual(Array(10).fill(true));
  });

  it("never reports a position as a gap and kept at once (gaps/words agree with one another)", () => {
    const { changes, current } = simulate([[0, "ox"], [0, "cat"], [4, "dog"]]);
    const kept = deriveKeptShip(changes, current);
    expect(kept.words).toHaveLength(10);
    expect(kept.gaps).toHaveLength(10);
  });
});

// The rendered markup on GET / (Slice 4): the kept ship is read-only (no
// forms), shown from the first load; its house is decorative (aria-hidden)
// while its sentence is readable by a screen reader, each gap read as
// "blank"; and its text reflects filled-vs-gap exactly as the live sentence
// changes. Checked over HTTP against the running app, like
// spec/theseus.test.ts.
//
// What a screen reader is given: the text of every node not inside an
// aria-hidden subtree. A gap's visible span stays empty (it is drawn as a
// blank, spec/two-ships-layout.test.ts); its "blank" is visually hidden text.
const readable = (el: Element): string => {
  const walk = (n: Node): string =>
    n.nodeType === 3 ? n.textContent ?? "" : n.nodeType === 1 && (n as Element).getAttribute("aria-hidden") === "true" ? "" : [...n.childNodes].map(walk).join("");
  return walk(el).replace(/\s+/g, " ").trim();
};
const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const changesTheSentence = (name: string, fn: () => Promise<void>) =>
  it.skipIf(!local)(local ? name : `${name} [skipped: APP_URL is not local]`, fn);

class Visitor {
  private cookies = new Map<string, string>();
  private remember(res: Response): void {
    for (const header of res.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return { ...(cookie ? { cookie } : {}), ...extra };
  }
  async page(): Promise<Document> {
    const res = await fetch(new URL("/", baseUrl), { headers: this.headers() });
    this.remember(res);
    return new JSDOM(await res.text()).window.document;
  }
  async sentence(): Promise<{ position: number; version: number; word: string }[]> {
    const doc = await this.page();
    return [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')].map((form) => {
      const value = (n: string) => form.querySelector<HTMLInputElement>(`input[name="${n}"]`)?.value;
      return { position: Number(value("position")), version: Number(value("version")), word: form.querySelector("label")?.textContent?.trim() ?? "" };
    });
  }
  async replace(slot: { position: number; version: number }, word: string): Promise<number> {
    const res = await fetch(new URL("/replace", baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: this.headers({ "content-type": "application/x-www-form-urlencoded", origin: new URL(baseUrl).origin }),
      body: new URLSearchParams({ position: String(slot.position), version: String(slot.version), word }),
    });
    this.remember(res);
    return res.status;
  }
}

let n2 = 0;
const unusedWord = (all: { word: string }[]): string => {
  let word: string;
  do {
    word = `kept${Date.now().toString(36)}${(n2++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);
  } while (all.some((s) => s.word === word));
  return word;
};

// Your word, kept (plan B): a word that stood at version g of its position
// belongs to kept ship g. Relative to the ship the page shows, it is in it,
// waiting in a later one, or in one already built and no longer shown. Ship
// 1 is the maker's words, so a visitor's word is never in it.
// Earlier houses (plan 1): a completed kept ship, reached on its own at
// /?kept=k. Ship k is complete once every position has been replaced past
// version k; its words are the words that stood at version k, by the same
// rule deriveKeptShip uses. Anything else is not a house to show.
describe("a completed kept ship", () => {
  it("is nothing before any ship completes, and nothing for 0, negatives or fractions", () => {
    const s = simulate([[3, "a3"]]);
    for (const k of [0, -1, 1, 1.5, 2]) expect(completedShip(s.changes, s.current, k), `ship ${k}`).toBeNull();
  });

  it("is ship 1's ten original words once every position has been replaced", () => {
    const s = simulate(STARTING.map((_, i) => [i, `v2-${i}`]));
    expect(completedShip(s.changes, s.current, 1)).toEqual(STARTING);
    expect(completedShip(s.changes, s.current, 2), "ship 2 isn't complete yet").toBeNull();
  });

  it("is the same words deriveKeptShip showed for that ship while it was being built", () => {
    const steps: [number, string][] = [];
    for (let round = 2; round <= 4; round++) for (let i = 0; i < 10; i++) steps.push([i, `r${round}-${i}`]);
    steps.push([5, "one-more"]); // so the last completed ship isn't the one being shown
    const s = simulate(steps);
    for (const k of [1, 2, 3]) {
      // the same ship as deriveKeptShip builds it, one change before it completes (a later ship's
      // completion shows the next one at once), plus the one word that completing change kept
      const before = deriveKeptShip(...(Object.values(simulate(steps.slice(0, k * 10 - 1))) as [KeptChange[], CurrentWord[]]));
      expect(before.ship, `setup: ship ${k} isn't the one being built`).toBe(k);
      expect(before.gaps.filter(Boolean), `setup: ship ${k} isn't one word short`).toHaveLength(1);
      const last = steps[k * 10 - 1][0];
      const expected = before.words.map((w, i) => (i === last ? (k === 1 ? STARTING[i] : `r${k}-${i}`) : w));
      expect(completedShip(s.changes, s.current, k), `ship ${k}`).toEqual(expected);
    }
    expect(completedShip(s.changes, s.current, 4), "ship 4 is still being built").toBeNull();
  });
});

describe("where a replaced word is kept", () => {
  it("is shown, later or earlier, against the ship the page shows", () => {
    expect(keptWhere(3, 3)).toBe("shown");
    expect(keptWhere(5, 3)).toBe("later");
    expect(keptWhere(2, 3)).toBe("earlier");
  });

  it("follows a real history: a visitor's word stays later until its ship is shown, then earlier once passed", () => {
    // a visitor's word at position 4 (version 2), then every position moves on
    const steps: [number, string][] = [[4, "mine"], [4, "next"]];
    let s = simulate(steps);
    const g = 2; // "mine" stood at version 2 of position 4
    expect(keptWhere(g, deriveKeptShip(s.changes, s.current).ship), "while ship 1 is being built").toBe("later");
    for (const p of [0, 1, 2, 3, 5, 6, 7, 8, 9]) steps.push([p, `w${p}`]);
    s = simulate(steps); // ship 1 complete and held
    expect(deriveKeptShip(s.changes, s.current).ship).toBe(1);
    expect(keptWhere(g, deriveKeptShip(s.changes, s.current).ship), "ship 1 holds only the maker's words").toBe("later");
    steps.push([0, "after"]);
    s = simulate(steps);
    expect(deriveKeptShip(s.changes, s.current).ship).toBe(2);
    expect(keptWhere(g, deriveKeptShip(s.changes, s.current).ship), "ship 2 is shown, and holds it").toBe("shown");
    expect(deriveKeptShip(s.changes, s.current).words[4], "ship 2 doesn't hold the visitor's word at its position").toBe("mine");
    for (const p of [1, 2, 3, 5, 6, 7, 8, 9]) steps.push([p, `x${p}`]);
    s = simulate(steps); // ship 2 complete: later ships never hold, so ship 3 shows
    expect(deriveKeptShip(s.changes, s.current).ship).toBe(3);
    expect(keptWhere(g, deriveKeptShip(s.changes, s.current).ship), "once its ship is passed").toBe("earlier");
  });
});

describe("Kept ship markup on GET /", () => {
  it("is read-only, its house decorative and its sentence readable", async () => {
    const v = new Visitor();
    const doc = await v.page();
    const plate = doc.querySelector(".kept-plate");
    expect(plate, "GET / has no kept-ship plate").not.toBeNull();
    expect(plate!.querySelector("form"), "the kept ship has an interactive form").toBeNull();
    const house = doc.querySelector("#house-kept");
    expect(house?.getAttribute("aria-hidden"), "the kept house isn't aria-hidden").toBe("true");
    const sentence = doc.querySelector(".kept-sentence");
    expect(sentence, "GET / has no kept sentence").not.toBeNull();
    expect(sentence!.closest('[aria-hidden="true"]'), "the kept sentence is hidden from screen readers").toBeNull();
    // a gap is a blank waiting for its word (drawn as one, spec/two-ships-layout.test.ts), never a glyph standing in for it
    for (const gap of doc.querySelectorAll(".kept-sentence .w.gap")) expect(gap.textContent, "a gap holds visible text").toBe("");
  });

  it("reads to a screen reader as ten words, a gap as 'blank', the way the kept ship is derived", async () => {
    const doc = await new Visitor().page();
    const sentence = doc.querySelector(".kept-sentence")!;
    const words = [...sentence.querySelectorAll(".w")].map((w) => (w.classList.contains("gap") ? "blank" : w.textContent!.trim()));
    expect(words).toHaveLength(10);
    expect(readable(sentence), "the kept sentence doesn't read as its words and blanks").toContain(`${words.join(" ")}.`);
  });

  // what the kept sentence is, said once under its house: a first visitor
  // reads the words above as replaced and the gaps as still standing. GET /
  // only: an earlier form has no kept half (houses stay level with it,
  // spec/two-ships-layout.test.ts)
  const KEPT_LINE = "The words above have been replaced in the sentence; the gaps are words that still stand there.";
  it("says under its house what its words and gaps are, on GET / only", async () => {
    const doc = await new Visitor().page();
    const lines = [...doc.querySelectorAll(".kept-half .foot p")].map((p) => p.textContent?.trim());
    expect(lines, "the kept half's foot doesn't say what its words and gaps are").toContain(KEPT_LINE);
    expect(doc.querySelector(".kept-half .foot")?.closest('[aria-hidden="true"]'), "the line is hidden from screen readers").toBeNull();
    const earlier = new JSDOM(await (await fetch(new URL("/?at=0", baseUrl))).text()).window.document;
    expect(earlier.body.textContent, "an earlier form says what a kept half shows").not.toContain(KEPT_LINE);
  });

  // The shared sentence accumulates every other spec file's replacements, so
  // this never assumes which ship is currently shown or which position is a
  // gap: it reads the kept ship's own rendered gaps, picks one, replaces
  // exactly that position (the word a gap waits for is always the word
  // standing there right now — docs/decisions/0003), and checks that gap
  // alone closes with that word, text content only.
  changesTheSentence("fills a gap with the word that stood there, the moment it's replaced", async () => {
    const v = new Visitor();
    const doc1 = await v.page();
    const spans = [...doc1.querySelectorAll<HTMLElement>(".kept-sentence .w")];
    expect(spans, "the kept ship has no ten word spans").toHaveLength(10);
    const gapIndex = spans.findIndex((s) => s.classList.contains("gap"));
    expect(gapIndex, "no gap to fill: every position is already kept").toBeGreaterThanOrEqual(0);

    const before = await v.sentence();
    const slot = before[gapIndex];
    const word = unusedWord(before);
    expect(await v.replace(slot, word)).toBe(303);

    const doc2 = await v.page();
    const after = [...doc2.querySelectorAll<HTMLElement>(".kept-sentence .w")];
    expect(after[gapIndex].classList.contains("gap"), "the replaced gap is still a gap").toBe(false);
    expect(after[gapIndex].textContent?.trim(), "the kept ship doesn't show the word that stood there").toBe(slot.word);
  });
});
