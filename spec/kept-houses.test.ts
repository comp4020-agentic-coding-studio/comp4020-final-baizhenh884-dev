import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// Earlier houses (plan 1): a completed kept ship on its own at /?kept=k,
// one at a time like an earlier form. Read-only, never live, never listed
// together; the ship's number is in the URL only (navigation), never on the
// page. Anything that isn't a completed ship is 404. Derived from `changes`
// (src/lib/kept-ship.ts completedShip), nothing stored.
//
// The shared sentence carries every earlier spec file's changes, so the
// check drives it itself: fresh visitors move the positions furthest behind
// until ship 1 is complete. Only against a local app (it changes the
// sentence).

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const localOnly = (name: string, fn: () => Promise<void>, timeout?: number) =>
  it.skipIf(!local)(local ? name : `${name} [skipped: APP_URL is not local]`, fn, timeout);

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
  async get(path: string): Promise<{ status: number; doc: Document; raw: string }> {
    const res = await fetch(new URL(path, baseUrl), { headers: this.headers(), redirect: "manual" });
    this.remember(res);
    const raw = await res.text();
    return { status: res.status, doc: new JSDOM(raw).window.document, raw };
  }
  async sentence(): Promise<{ position: number; version: number; word: string }[]> {
    const { doc } = await this.get("/");
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

let n = 0;
const fresh = () => `kh${Date.now().toString(36)}${(n++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);

// fresh visitors move the positions furthest behind until every position is past version `k`
async function complete(k: number): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const now = await new Visitor().sentence();
    const behind = [...now].sort((a, b) => a.version - b.version || a.position - b.position)[0];
    if (behind.version > k) return;
    const v = new Visitor();
    await v.sentence();
    expect(await v.replace(behind, fresh())).toBe(303);
  }
  throw new Error(`ship ${k} didn't complete`);
}

describe("an earlier house, /?kept=k", () => {
  it("is 404 for anything that isn't a whole number", async () => {
    for (const k of ["0", "-1", "1.5", "x", "", "01x", "9999999999999999"]) {
      expect((await new Visitor().get(`/?kept=${encodeURIComponent(k)}`)).status, `/?kept=${k}`).toBe(404);
    }
  });

  localOnly("shows a completed ship on its own: its words, its house, no forms, never live, no number", async () => {
    await complete(1);
    const { status, doc, raw } = await new Visitor().get("/?kept=1");
    expect(status, "a completed ship isn't shown").toBe(200);
    const words = [...doc.querySelectorAll(".kept-sentence .w")].map((w) => w.textContent?.trim());
    expect(words, "ship 1 isn't the maker's ten words").toEqual(["Make", "a", "website", "that", "people", "would", "miss", "if", "it", "disappeared"]);
    expect(doc.querySelectorAll(".kept-sentence .w.gap"), "a completed ship has a gap").toHaveLength(0);
    expect(doc.querySelector('form[action="/replace"]'), "an earlier house can be changed").toBeNull();
    expect(doc.querySelector("#house-kept")?.getAttribute("aria-hidden"), "its house isn't decorative").toBe("true");
    expect(doc.querySelector(".stands-half"), "an earlier house shows the live half too").toBeNull();
    expect(raw, "an earlier house subscribes to the live stream").not.toContain("/events");
    // the ship's number is navigation in the URL only, never text on the page
    const text = doc.body.textContent ?? "";
    expect(text, "a number shows on the page").not.toMatch(/\d/);
    // one at a time: a way back to now, and no earlier house before ship 1
    expect(doc.querySelector('a[href="/"]'), "no way back to now").not.toBeNull();
    expect(doc.querySelector('a[rel="prev"]'), "ship 1 offers an earlier house").toBeNull();
  }, 120_000);

  localOnly("is 404 for the ship still being built and any ship after it", async () => {
    const now = await new Visitor().sentence();
    const building = Math.min(...now.map((p) => p.version));
    for (const k of [building, building + 1, building + 50]) expect((await new Visitor().get(`/?kept=${k}`)).status, `/?kept=${k}`).toBe(404);
  });

  localOnly("steps one house at a time: Earlier house and Later house between completed ships only", async () => {
    await complete(2);
    const two = (await new Visitor().get("/?kept=2")).doc;
    expect(two.querySelector('a[rel="prev"]')?.getAttribute("href"), "ship 2 doesn't lead back to ship 1").toBe("?kept=1");
    const one = (await new Visitor().get("/?kept=1")).doc;
    expect(one.querySelector('a[rel="next"]')?.getAttribute("href"), "ship 1 doesn't lead on to ship 2").toBe("?kept=2");
    // never listed together: one kept sentence on the page
    expect(two.querySelectorAll(".kept-sentence"), "more than one house is listed").toHaveLength(1);
    // the last completed ship leads on to now, not to the ship being built
    const now = await new Visitor().sentence();
    const last = Math.min(...now.map((p) => p.version)) - 1;
    const lastDoc = (await new Visitor().get(`/?kept=${last}`)).doc;
    expect(lastDoc.querySelector(`a[href="?kept=${last + 1}"]`), "the last completed house leads to one still being built").toBeNull();
  }, 120_000);
});
