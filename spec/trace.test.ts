import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// "Your trace" under the settle rule (docs/decisions/0003-settle-and-kept-ships.md,
// the handoff recorded at /Users/baizhenhuang/.claude/plans/vectorized-singing-horizon.md).
// Under rule mode `once` the trace stays exactly what spec/theseus.test.ts already
// asserts — this file only adds the once-mode regression guards that confirm
// nothing settle-only leaks in. Under `settle`, a visitor's trace carries:
//   - their latest change (the existing <del>/word markup, unchanged, plus an
//     appended eligibility sentence naming a blocked territory by its
//     territories.ts label, or nothing extra when they're free everywhere)
//   - every other standing word of theirs (always "settled" by construction)
//   - every other replaced word of theirs, newest first, each named "kept"
//
// Gated the same way spec/eligibility.test.ts gates: RULE_MODE from the test
// runner's own environment, never probed from response text. CI always sets
// RULE_MODE explicitly (checks.yml runs both passes), so an unset RULE_MODE
// there is a real failure, not a deliberate skip.

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);

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

  async page(path = "/"): Promise<{ status: number; doc: Document }> {
    const res = await fetch(new URL(path, baseUrl), { headers: this.headers(), redirect: "manual" });
    this.remember(res);
    return { status: res.status, doc: new JSDOM(await res.text()).window.document };
  }

  async sentence(): Promise<{ position: number; version: number; word: string }[]> {
    const { doc } = await this.page("/");
    return [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')].map((form) => {
      const value = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
      return {
        position: Number(value("position")),
        version: Number(value("version")),
        word: form.querySelector("label")?.textContent?.trim() ?? "",
      };
    });
  }

  async replace(slot: { position: number; version: number }, word: string): Promise<{ status: number; text: string }> {
    const res = await fetch(new URL("/replace", baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: this.headers({
        "content-type": "application/x-www-form-urlencoded",
        origin: new URL(baseUrl).origin,
      }),
      body: new URLSearchParams({ position: String(slot.position), version: String(slot.version), word }),
    });
    this.remember(res);
    const text = await res.text();
    return { status: res.status, text };
  }
}

async function arrive(): Promise<Visitor> {
  const v = new Visitor();
  await v.page("/");
  return v;
}

let n = 0;
const unused = (all: { word: string }[]): string => {
  let word: string;
  do {
    word = `trc${Date.now().toString(36)}${(n++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);
  } while (all.some((s) => s.word === word));
  return word;
};

const at = (all: { position: number; version: number; word: string }[], position: number) => {
  const slot = all.find((s) => s.position === position);
  expect(slot, `no word position ${position}`).toBeDefined();
  return slot!;
};

// the place a trace names, as the sentence's own notation numbers it ("01"):
// a number, never the part of the house (spec/trace-text.test.ts pins the wording)
const PLACE = (position: number) => `place ${String(position + 1).padStart(2, "0")}`;

const traceSection = (doc: Document) => doc.querySelector('section[aria-labelledby="trace-heading"]');
const traceStatus = (doc: Document) => doc.querySelector('section [role="status"], aside [role="status"]');

const inCI = !!process.env.CI;
const settleModeReady = local && process.env.RULE_MODE === "settle";
const settleOnly = (name: string, fn: () => Promise<void>, timeout?: number) => {
  if (settleModeReady) return it(name, fn, timeout);
  if (!local) return it.skip(`${name} [skipped: APP_URL is not local]`, fn, timeout);
  if (inCI && !process.env.RULE_MODE) {
    return it(`${name} [RULE_MODE unset in CI]`, () => {
      throw new Error("RULE_MODE must be 'once' or 'settle' in CI, never unset: checks.yml runs both passes explicitly");
    });
  }
  return it.skip(`${name} [skipped: RULE_MODE isn't settle]`, fn, timeout);
};

const onceModeReady = local && process.env.RULE_MODE !== "settle";
const onceOnly = (name: string, fn: () => Promise<void>, timeout?: number) => {
  if (onceModeReady) return it(name, fn, timeout);
  if (!local) return it.skip(`${name} [skipped: APP_URL is not local]`, fn, timeout);
  if (inCI && !process.env.RULE_MODE) {
    return it(`${name} [RULE_MODE unset in CI]`, () => {
      throw new Error("RULE_MODE must be 'once' or 'settle' in CI, never unset: checks.yml runs both passes explicitly");
    });
  }
  return it.skip(`${name} [skipped: RULE_MODE is settle]`, fn, timeout);
};

const settleSeconds = Number(process.env.SETTLE_SECONDS ?? 300);
const settleByAgeOnly = (name: string, fn: () => Promise<void>, timeout?: number) => {
  if (!local) return it.skip(`${name} [skipped: APP_URL is not local]`, fn, timeout);
  if (inCI && !process.env.RULE_MODE) {
    return it(`${name} [RULE_MODE unset in CI]`, () => {
      throw new Error("RULE_MODE must be 'once' or 'settle' in CI, never unset: checks.yml runs both passes explicitly");
    });
  }
  if (!settleModeReady) return it.skip(`${name} [skipped: RULE_MODE isn't settle]`, fn, timeout);
  if (settleSeconds <= 10) return it(name, fn, timeout);
  if (inCI) {
    return it(`${name} [SETTLE_SECONDS too long for CI]`, () => {
      throw new Error("SETTLE_SECONDS must be short (checks.yml sets 3) so this can actually wait it out in CI");
    });
  }
  return it.skip(`${name} [skipped: SETTLE_SECONDS is too long to wait out here]`, fn, timeout);
};

describe("Your trace", () => {
  settleOnly("shows no trace section for a visitor who has never acted", async () => {
    const v = await arrive();
    const { doc } = await v.page("/");
    expect(traceStatus(doc), "a visitor who hasn't changed anything is shown a trace").toBeNull();
  });

  settleOnly("holding: names the held word, marks it, no <del>, and the eligibility clause blocks it there", async () => {
    const v = await arrive();
    const before = await v.sentence();
    const slot = before[0];
    const word = unused(before);
    expect((await v.replace(slot, word)).status).toBe(303);

    const { doc } = await v.page("/");
    const status = traceStatus(doc)!;
    expect(status, "no trace shown for a holding visitor").not.toBeNull();
    expect(status.textContent).toContain(word);
    expect(status.querySelector("del"), "a held word is shown as removed").toBeNull();

    const form = [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')].find(
      (f) => f.querySelector<HTMLInputElement>('input[name="position"]')?.value === String(slot.position),
    )!;
    expect(form.querySelector("label mark"), "the held word isn't marked in the sentence").not.toBeNull();

    const now = await v.sentence();
    const held = await v.replace(at(now, slot.position), unused(now));
    expect(held.status, "the trace shows eligibility but the server still refuses the held position").toBe(403);
  });

  settleOnly("free-but-blocked by replacement: names the blocked place, where the word stood, and still shows what replaced the word", async () => {
    const ann = await arrive();
    const before = await ann.sentence();
    const slot = before[0];
    const anns = unused(before);
    expect((await ann.replace(slot, anns)).status).toBe(303);

    const bea = await arrive();
    const now = await bea.sentence();
    const beas = unused(now);
    expect((await bea.replace(at(now, slot.position), beas)).status).toBe(303);

    const { doc } = await ann.page("/");
    const status = traceStatus(doc)!;
    expect(status.querySelector("del")?.textContent?.trim(), "the replaced word isn't marked removed").toBe(anns);
    expect(status.textContent).toContain(beas);
    expect(status.textContent, "the eligibility clause doesn't name the blocked place, in the past").toContain(`anywhere but ${PLACE(slot.position)}, where it stood.`);
  });

  settleByAgeOnly(
    "free-but-blocked by age: a fresh load after SETTLE_SECONDS shows the word standing and settled",
    async () => {
      const v = await arrive();
      const before = await v.sentence();
      const slot = before[0];
      const word = unused(before);
      expect((await v.replace(slot, word)).status).toBe(303);

      await new Promise((resolve) => setTimeout(resolve, (settleSeconds + 1) * 1000));

      const { doc } = await v.page("/");
      const status = traceStatus(doc)!;
      expect(status.querySelector("del"), "a settled word is shown as removed").toBeNull();
      expect(status.textContent).toContain(word);
      expect(status.textContent, "the eligibility clause doesn't name the now-settled place, in the present").toContain(`anywhere but ${PLACE(slot.position)}, where it stands.`);

      const now = await v.sentence();
      const settledAgain = await v.replace(at(now, (slot.position + 1) % now.length), unused(now));
      expect(settledAgain.status, "settling by age didn't actually free the visitor").toBe(303);
    },
    20_000,
  );

  // Needs an untouched first word still standing once a second change is
  // made, so freeing must come from aging, not from someone else's
  // replacement (which would move it into "replaced", not "standing").
  settleByAgeOnly(
    "lists every other standing word, each labelled settled",
    async () => {
      const v = await arrive();
      const before = await v.sentence();
      const firstWord = unused(before);
      expect((await v.replace(at(before, 0), firstWord)).status).toBe(303);

      await new Promise((resolve) => setTimeout(resolve, (settleSeconds + 1) * 1000));

      const now = await v.sentence();
      expect(at(now, 0).word, "setup: the first word was replaced by someone else, not left to settle").toBe(firstWord);
      const secondWord = unused(now);
      expect((await v.replace(at(now, 1), secondWord)).status).toBe(303);

      const { doc } = await v.page("/");
      const section = traceSection(doc)!;
      expect(section.textContent, "the standing-but-not-latest word is missing from the trace").toContain(firstWord);
      expect(section.textContent, "a standing word isn't labelled settled").toMatch(/settled/i);

      // both positions are marked in the sentence
      for (const position of [0, 1]) {
        const form = [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')].find(
          (f) => f.querySelector<HTMLInputElement>('input[name="position"]')?.value === String(position),
        )!;
        expect(form.querySelector("label mark"), `position ${position} isn't marked`).not.toBeNull();
      }
    },
    20_000,
  );

  settleOnly("lists replaced words newest first, each named as kept", async () => {
    const v = await arrive();

    // v's first change, at position 0
    const before = await v.sentence();
    const firstWord = unused(before);
    expect((await v.replace(at(before, 0), firstWord)).status).toBe(303);

    // a fresh visitor replaces it: frees v everywhere except position 0 (move-on)
    const beaA = await arrive();
    const replacedFirst = unused(await beaA.sentence());
    expect((await beaA.replace(at(await beaA.sentence(), 0), replacedFirst)).status).toBe(303);

    // v's second change, at position 1 — now v's latest
    const now1 = await v.sentence();
    const secondWord = unused(now1);
    expect((await v.replace(at(now1, 1), secondWord)).status).toBe(303);

    // a different fresh visitor replaces that too (beaA is themselves still
    // holding position 0 and move-on blocked there, so they can't act again
    // yet): frees v everywhere except position 1
    const beaB = await arrive();
    const replacedSecond = unused(await beaB.sentence());
    expect((await beaB.replace(at(await beaB.sentence(), 1), replacedSecond)).status).toBe(303);

    // v's third change, at position 2 — the new latest; positions 0 and 1 are
    // now both "replaced" in v's trace, position 1 (the more recent of the two) first
    const now2 = await v.sentence();
    const latestWord = unused(now2);
    expect((await v.replace(at(now2, 2), latestWord)).status).toBe(303);

    const { doc } = await v.page("/");
    const section = traceSection(doc)!;
    const text = section.textContent ?? "";
    expect(text, "the first replaced word is missing").toContain(firstWord);
    expect(text, "the second replaced word is missing").toContain(secondWord);
    expect(text, "a replaced word isn't named as kept").toMatch(/kept/i);
    // newest first: v's second change (position 1) names before v's first (position 0)
    expect(text.indexOf(secondWord)).toBeLessThan(text.indexOf(firstWord));
  });

  // Your word, kept (plan B): each replaced word says where it's kept,
  // against the kept ship shown now: in it ("kept in the house opposite"),
  // waiting ("kept for a later house"), or already built ("kept in a house
  // already built"). Only its author sees it, and when it's in the ship
  // shown, its place in the kept sentence is marked on their page only.
  settleOnly("says where a replaced word is kept, and marks it in the kept sentence on its author's page only", async () => {
    const author = await arrive();
    const start = await author.sentence();
    // the author's word at the position furthest behind, so its ship comes round soonest
    const p = [...start].sort((a, b) => a.version - b.version || a.position - b.position)[0].position;
    const mine = unused(start);
    expect((await author.replace(at(start, p), mine)).status).toBe(303);
    // a fresh visitor replaces it: the author's word is now kept
    expect((await (await arrive()).replace(at(await author.sentence(), p), unused(await author.sentence()))).status).toBe(303);

    const where = async () => {
      const { doc } = await author.page("/");
      const text = traceSection(doc)?.textContent?.replace(/\s+/g, " ") ?? "";
      const keptWords = [...doc.querySelectorAll(".kept-sentence .w")].map((w) => w.textContent?.trim() ?? "");
      return { doc, text, keptWords };
    };
    let w = await where();
    expect(w.text, "the replaced word isn't named").toContain(mine);
    expect(w.text, "the trace doesn't say where it's kept").toMatch(/kept in the ship of old planks|kept for a later ship|kept in a ship already built/);

    // bring the shown ship round to the author's word: fresh visitors move the positions furthest behind
    for (let i = 0; i < 60 && w.keptWords[p] !== mine; i++) {
      const now = await author.sentence();
      const behind = [...now].sort((a, b) => a.version - b.version || a.position - b.position)[0];
      expect((await (await arrive()).replace(behind, unused(now))).status).toBe(303);
      w = await where();
    }
    expect(w.keptWords[p], "the kept ship never came round to the author's word").toBe(mine);
    expect(w.text, "the trace doesn't say the word is in the ship of old planks").toContain("kept in the ship of old planks");
    const mark = w.doc.querySelectorAll(".kept-sentence .w")[p];
    expect(mark.querySelector("mark") ?? (mark.closest("mark") as Element | null), "the author's kept word isn't marked for them").not.toBeNull();

    // nobody else sees it marked
    const other = await (await arrive()).page("/");
    expect(other.doc.querySelector(".kept-sentence mark"), "another visitor sees a kept word marked").toBeNull();
  }, 120_000);

  onceOnly("trace rendering is unaffected by the settle-only shape: no settled/kept labels, no extra lists", async () => {
    const alice = await arrive();
    const before = await alice.sentence();
    const slot = before[0];
    const word = unused(before);
    expect((await alice.replace(slot, word)).status).toBe(303);

    const { doc } = await alice.page("/");
    const section = traceSection(doc)!;
    expect(section.textContent, "once mode shows a settle-only label").not.toMatch(/settled|kept/i);
    expect(section.querySelectorAll("ul").length, "once mode's trace grew a list").toBe(0);
  });

  onceOnly("explains the rule under once mode with the exact text, Escape included", async () => {
    const v = await arrive();
    const { doc } = await v.page("/");
    const how = doc.querySelector("#how");
    expect(how?.textContent?.trim()).toBe(
      "Choose a word, type its replacement and press Enter. Press Escape to cancel. You get one change, and it can't be undone. Anyone after you can change any word, including yours.",
    );
  });

  // Under settle mode the rule paragraph says only what always applies (the maker, 31 October); the hold is said in
  // the visitor's own holding line, only while it holds (spec/trace-text.test.ts).
  settleOnly("explains the settle rule under settle mode, honestly, and the hold only where it applies", async () => {
    const v = await arrive();
    const { doc } = await v.page("/");
    const how = doc.querySelector("#how");
    expect(how?.textContent?.trim()).toBe("Choose a word, type its replacement and press Enter. Press Escape to cancel. Anyone can change any word, yours too.");
  });
});
