import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { deriveKeptShip, type CurrentWord, type KeptChange } from "../src/lib/kept-ship";

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

  it("never reports a position as a gap and kept at once (gaps/words agree with one another)", () => {
    const { changes, current } = simulate([[0, "ox"], [0, "cat"], [4, "dog"]]);
    const kept = deriveKeptShip(changes, current);
    expect(kept.words).toHaveLength(10);
    expect(kept.gaps).toHaveLength(10);
  });
});

// The rendered markup on GET / (Slice 4): the kept ship is read-only and
// decorative (no forms, aria-hidden), shown from the first load, and its
// text content reflects filled-vs-gap exactly as the live sentence changes —
// checked over HTTP against the running app, like spec/theseus.test.ts.
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

describe("Kept ship markup on GET /", () => {
  it("is read-only and decorative: no forms, aria-hidden", async () => {
    const v = new Visitor();
    const doc = await v.page();
    const plate = doc.querySelector(".kept-plate");
    expect(plate, "GET / has no kept-ship plate").not.toBeNull();
    expect(plate!.querySelector("form"), "the kept ship has an interactive form").toBeNull();
    const house = doc.querySelector("#house-kept");
    expect(house?.getAttribute("aria-hidden"), "the kept house isn't aria-hidden").toBe("true");
    const sentence = doc.querySelector(".kept-sentence");
    expect(sentence?.getAttribute("aria-hidden"), "the kept sentence isn't aria-hidden").toBe("true");
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
