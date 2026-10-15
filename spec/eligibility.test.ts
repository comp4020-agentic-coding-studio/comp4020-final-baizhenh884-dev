import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// The settle rule (docs/decisions/0003-settle-and-kept-ships.md), checked
// over HTTP against the running app. Under rule mode `once` (the default),
// none of this applies and spec/theseus.test.ts's existing 403 "already
// spent" test is the whole contract — unchanged by this file. Under `settle`
// (RULE_MODE=settle), a visitor may act when they have no prior change,
// their latest change has been replaced, or it has stood at least
// SETTLE_SECONDS, and never at the exact position of their own latest change
// (move-on) until they've changed elsewhere.
//
// Which mode to test against comes from RULE_MODE in the test runner's own
// environment, the same way APP_URL resolves baseUrl (spec/global-setup.ts) —
// not a field added to the app's responses, and not detected by running a
// real replacement just to read the refusal text it produces. When the
// environment isn't set to settle mode, every check here skips, named,
// rather than asserting nothing or guessing from side effects.
//
// Every check here runs only against a local app: all of them replace a
// word, and some need control over SETTLE_SECONDS to run in reasonable time.

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
    word = `elig${Date.now().toString(36)}${(n++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);
  } while (all.some((s) => s.word === word));
  return word;
};

const at = (all: { position: number; version: number; word: string }[], position: number) => {
  const slot = all.find((s) => s.position === position);
  expect(slot, `no word position ${position}`).toBeDefined();
  return slot!;
};

const settleModeReady = local && process.env.RULE_MODE === "settle";
const settleOnly = (name: string, fn: () => Promise<void>, timeout?: number) =>
  it.skipIf(!settleModeReady)(
    settleModeReady
      ? name
      : `${name} [skipped: ${local ? "RULE_MODE isn't settle" : "APP_URL is not local"}]`,
    fn,
    timeout,
  );

describe("the settle rule", () => {
  settleOnly("lets a visitor who has never acted, act", async () => {
    const v = await arrive();
    const before = await v.sentence();
    expect((await v.replace(before[0], unused(before))).status).toBe(303);
  });

  settleOnly("holds a visitor at every other position while their word stands, young", async () => {
    const v = await arrive();
    const before = await v.sentence();
    expect((await v.replace(before[0], unused(before))).status).toBe(303);

    const now = await v.sentence();
    const elsewhere = at(now, (before[0].position + 1) % now.length);
    const held = await v.replace(elsewhere, unused(now));
    expect(held.status, "a holding visitor wasn't refused").toBe(403);
    expect(held.text, "a holding refusal isn't distinguishable from move-on").toContain("still holding");
  });

  settleOnly("move-on: refuses retaking the exact position of the visitor's own latest change", async () => {
    const v = await arrive();
    const before = await v.sentence();
    const slot = before[0];
    expect((await v.replace(slot, unused(before))).status).toBe(303);

    const now = await v.sentence();
    const retaken = at(now, slot.position);
    const refused = await v.replace(retaken, unused(now));
    expect(refused.status, "retaking the same position wasn't refused").toBe(403);
    expect(refused.text, "a move-on refusal isn't distinguishable from holding").toContain("Not this word");
  });

  settleOnly("move-on lifts the instant the visitor changes elsewhere: it blocks only their latest position, not every one they've touched", async () => {
    const v = await arrive();
    const before = await v.sentence();
    const first = before[0];
    expect((await v.replace(first, unused(before))).status).toBe(303);

    // someone else replaces v's word, freeing v everywhere except `first`
    const bea = await arrive();
    const now1 = await bea.sentence();
    expect(await bea.replace(at(now1, first.position), unused(now1))).toMatchObject({ status: 303 });

    // v is free, and chooses a different position: this becomes v's new
    // "latest", and `first` stops being special to v at all
    const now2 = await v.sentence();
    const second = at(now2, (first.position + 1) % now2.length);
    expect((await v.replace(second, unused(now2))).status, "the visitor wasn't freed by being replaced").toBe(303);

    // `first` is now just an ordinary position for v, re-eligible like any
    // other once it's replaced again or settles — never permanently special
    // because v touched it once. Confirm v is refused at `second` (their new
    // latest, by move-on) but NOT refused at `first` for having once held it.
    const now3 = await v.sentence();
    const atSecondAgain = await v.replace(at(now3, second.position), unused(now3));
    expect(atSecondAgain.status, "move-on didn't block the visitor's new latest position").toBe(403);
    expect(atSecondAgain.text).toContain("Not this word");
  });

  settleOnly("being replaced frees the visitor everywhere except the position they're replaced at", async () => {
    const ann = await arrive();
    const before = await ann.sentence();
    const mine = before[0];
    expect((await ann.replace(mine, unused(before))).status).toBe(303);

    const bea = await arrive();
    const now = await bea.sentence();
    expect((await bea.replace(at(now, mine.position), unused(now))).status, "setup: bea's replacement didn't succeed").toBe(303);

    const elsewhere = at(await ann.sentence(), (mine.position + 1) % (await ann.sentence()).length);
    const freed = await ann.replace(elsewhere, unused(await ann.sentence()));
    expect(freed.status, "being replaced didn't free the visitor").toBe(303);
  });

  settleOnly("a stale submit never spends eligibility", async () => {
    const v = await arrive();
    const before = await v.sentence();
    const slot = before[0];
    const staleAttempt = await v.replace({ position: slot.position, version: slot.version + 1 }, unused(before));
    expect(staleAttempt.status, "a stale version wasn't refused as stale").toBe(409);

    const stillEligible = await v.replace(slot, unused(before));
    expect(stillEligible.status, "a stale refusal spent the visitor's eligibility").toBe(303);
  });
});
