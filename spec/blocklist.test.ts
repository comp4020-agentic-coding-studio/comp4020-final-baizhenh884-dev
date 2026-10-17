import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// The maker's blocklist (docs/decisions/0004-maker-blocklist.md). The server
// refuses a listed word as an invalid replacement: 422, nothing changes, the
// visitor's change isn't used up, the page never repeats the word, and the
// log says only reason=blocked. Matching is whole-word after NFKC and case
// folding, never a substring. With no list, boot logs one warning line.
//
// The list comes from BLOCKED_WORDS, the same variable the container is
// started with, and it is a meaningless test word here and in CI, never a
// real one: the real list is a Fly secret the maker sets. In CI an unset
// BLOCKED_WORDS fails rather than skips (CLAUDE.md: config a check depends on
// is declared explicitly on every CI run).

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const inCI = !!process.env.CI;
const BLOCKED = process.env.BLOCKED_WORDS?.split(",")[0]?.trim() ?? "";

function dockerLogsAvailable(): boolean {
  try { execSync("docker inspect app", { stdio: "ignore" }); return true; } catch { return false; }
}
const available = local && dockerLogsAvailable();

// needs a local app started with BLOCKED_WORDS, and the same word in the runner's environment
const listed = (name: string, fn: () => Promise<void>, timeout?: number) => {
  if (!local) return it.skip(`${name} [skipped: APP_URL is not local]`, fn);
  if (!BLOCKED) {
    if (inCI) return it(`${name} [BLOCKED_WORDS unset in CI]`, () => { throw new Error("BLOCKED_WORDS must be set in CI on every pass: checks.yml declares it"); });
    return it.skip(`${name} [skipped: BLOCKED_WORDS isn't set]`, fn);
  }
  return it(name, fn, timeout);
};
// also reads the container's stdout, as spec/logging.test.ts does
const listedWithLogs = (name: string, fn: () => Promise<void>, timeout?: number) => {
  if (local && BLOCKED && !available) {
    if (inCI) return it(`${name} [docker logs unavailable in CI]`, () => { throw new Error("docker inspect app failed: CI's container must be named 'app' and reachable"); });
    return it.skip(`${name} [skipped: docker logs unavailable locally]`, fn);
  }
  return listed(name, fn, timeout);
};
const dockerOnly = (name: string, fn: () => Promise<void>, timeout?: number) => {
  if (!local) return it.skip(`${name} [skipped: APP_URL is not local]`, fn);
  if (available) return it(name, fn, timeout);
  if (inCI) return it(`${name} [docker unavailable in CI]`, () => { throw new Error("docker inspect app failed: CI's container must be named 'app' and reachable"); });
  return it.skip(`${name} [skipped: docker unavailable locally]`, fn);
};

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
  tag(): string {
    return createHash("sha256").update(this.cookies.get("theseus_visitor") ?? "").digest("hex").slice(0, 8);
  }
  async sentence(): Promise<{ position: number; version: number; word: string }[]> {
    const res = await fetch(new URL("/", baseUrl), { headers: this.headers() });
    this.remember(res);
    const doc = new JSDOM(await res.text()).window.document;
    return [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')].map((form) => {
      const value = (n: string) => form.querySelector<HTMLInputElement>(`input[name="${n}"]`)?.value;
      return { position: Number(value("position")), version: Number(value("version")), word: form.querySelector("label")?.textContent?.trim() ?? "" };
    });
  }
  async replace(slot: { position: number; version: number }, word: string): Promise<{ status: number; text: string }> {
    const res = await fetch(new URL("/replace", baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: this.headers({ "content-type": "application/x-www-form-urlencoded", origin: new URL(baseUrl).origin }),
      body: new URLSearchParams({ position: String(slot.position), version: String(slot.version), word }),
    });
    this.remember(res);
    return { status: res.status, text: (await res.text()).replace(/<[^>]+>/g, " ") };
  }
}

async function arrive(): Promise<Visitor> {
  const v = new Visitor();
  await v.sentence();
  return v;
}
let n = 0;
const fresh = () => `bl${Date.now().toString(36)}${(n++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);

// a variant of the listed word a visitor might type: other case, fullwidth letters (NFKC folds them)
const fullwidth = (w: string) => [...w].map((c) => (/[a-z]/i.test(c) ? String.fromCodePoint(c.codePointAt(0)! + 0xfee0) : c)).join("");

describe("the maker's blocklist", () => {
  listed("refuses a listed word, in any case or width, with 422, without using up the change or naming the word", async () => {
    const v = await arrive();
    for (const word of [BLOCKED, BLOCKED.toUpperCase(), fullwidth(BLOCKED)]) {
      const slot = (await v.sentence())[2];
      const { status, text } = await v.replace(slot, word);
      expect(status, `"${word}" wasn't refused as invalid`).toBe(422);
      expect(text, "the refusal page repeats the word").not.toContain(word);
      expect(text.toLowerCase(), "the refusal page repeats the word").not.toContain(BLOCKED.toLowerCase());
      expect(text, "the refusal doesn't say the word can't be used").toContain("That word can't be used here.");
      expect((await v.sentence())[2], "a refused word changed the sentence").toEqual(slot);
    }
    // the change wasn't used: the same visitor can still make an ordinary one
    expect((await v.replace((await v.sentence())[2], fresh())).status, "a refused listed word used up the change").toBe(303);
  });

  listed("allows a word that only contains a listed word", async () => {
    const v = await arrive();
    // a short unique prefix: the listed word plus a long suffix would pass 24 characters and be refused for length
    const word = `${(n++).toString(36).replace(/\d/g, (d) => "abcdefghij"[+d])}${BLOCKED}`;
    expect([...word].length, "the test word is too long to tell a blocklist refusal apart").toBeLessThanOrEqual(24);
    expect((await v.replace((await v.sentence())[4], word)).status, "a word containing a listed word was refused").toBe(303);
  });

  listedWithLogs("logs a refusal as reason=blocked, never the word", async () => {
    const v = await arrive();
    expect((await v.replace((await v.sentence())[6], BLOCKED)).status).toBe(422);
    const log = execSync("docker logs app", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const mine = log.split("\n").filter((l) => l.includes(`v=${v.tag()}`));
    expect(mine.some((l) => / invalid .*reason=blocked/.test(l)), `no "invalid reason=blocked" line for v=${v.tag()}`).toBe(true);
    // a refused word is never logged; an accepted word is (ADR 0002), and one may contain the listed word
    const refusals = log.split("\n").filter((l) => / invalid /.test(l));
    expect(refusals.filter((l) => l.toLowerCase().includes(BLOCKED.toLowerCase())), "a refusal's log line contains the listed word").toEqual([]);
  });

  // A second, short-lived container from the same image with no list: it
  // starts, and says once that the blocklist is empty. Never fails, never
  // silent. The server loads its own modules on the first request (Astro's
  // built entry imports pages and middleware lazily), so the line is read
  // after one request, before any response that request could have shown.
  dockerOnly("starts without a list, and says so once, before its first response", async () => {
    const image = execSync("docker inspect --format '{{.Config.Image}}' app", { encoding: "utf8" }).trim();
    const name = `app-noblock-${process.pid}`;
    execSync(`docker run -d --rm --init --name ${name} -p 127.0.0.1::8080 -e PORT=8080 -e RULE_MODE=once --tmpfs /data ${image}`, { stdio: "ignore" });
    try {
      const port = execSync(`docker port ${name} 8080`, { encoding: "utf8" }).trim().split(":").pop();
      let status = 0;
      for (let i = 0; i < 100 && !status; i++) {
        try { status = (await fetch(`http://127.0.0.1:${port}/`)).status; } catch { await new Promise((r) => setTimeout(r, 100)); }
      }
      expect(status, "the app without a list didn't answer").toBe(200);
      const log = execSync(`docker logs ${name} 2>&1`, { encoding: "utf8" });
      const access = log.split("\n").findIndex((l) => /GET \/ status=/.test(l));
      const warnings = log.split("\n").filter((l) => /blocklist/i.test(l));
      expect(warnings, "boot didn't say once that the blocklist is empty").toHaveLength(1);
      expect(warnings[0]).toMatch(/blocklist is empty/i);
      expect(log.split("\n").findIndex((l) => /blocklist/i.test(l)), "the warning came after the first response").toBeLessThan(access);
      expect(execSync(`docker inspect --format '{{.State.Running}}' ${name}`, { encoding: "utf8" }).trim(), "the app didn't start without a list").toBe("true");
    } finally {
      execSync(`docker stop ${name}`, { stdio: "ignore" });
    }
  }, 60_000);
});
