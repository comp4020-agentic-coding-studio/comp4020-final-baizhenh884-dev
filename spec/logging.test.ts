import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, inject, it } from "vitest";

// Crit 10's logging contract ("Fly by instruments"): the server logs who did
// what, server-side, to stdout, so it outlives the crit (CLAUDE.md "Scope
// (Crit 10)", docs/decisions/0002-pseudonymous-visitor-and-logging.md).
//
// These checks read the running container's stdout via `docker logs app`, the
// name CI's own checks.yml gives the container. They never diff "new lines
// since the last capture": vitest can run requests within one test
// concurrently (realtime.test.ts's own trial loop does this with
// Promise.all), and fileParallelism:false only serializes *files*, not
// requests within a file, and a lingering stream's close can log late. So
// every check scans the FULL captured log and matches by content it alone
// could have produced: its own visitor tag or a globally-unique nonce word,
// never by position.
//
// The tag is recomputed here independently of the app's own visitorTag()
// (sha256 of the raw cookie, first 8 hex characters): checks against a tag
// the implementation produced itself would agree with a wrong implementation
// too. This hardcodes the contract, not the function.
function expectedTag(cookie: string): string {
  return createHash("sha256").update(cookie).digest("hex").slice(0, 8);
}

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const inCI = !!process.env.CI;

function dockerLogsAvailable(): boolean {
  try {
    execSync("docker inspect app", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const available = local && dockerLogsAvailable();

// Local-but-no-docker (e.g. `astro dev`) skips; a non-local APP_URL skips,
// same as the existing mutating realtime/live-client checks, and for the same
// reason (they'd otherwise need a visitor and the deployed container isn't
// ours to read). In CI, checks.yml always names the container "app", so a
// missing or unreadable one is a real failure, never a silent skip.
const dockerOnly = (name: string, fn: () => Promise<void>, timeout?: number) => {
  if (!local) return it.skip(`${name} [skipped: APP_URL is not local]`, fn);
  if (available) return it(name, fn, timeout);
  if (inCI) {
    return it(`${name} [docker logs unavailable in CI]`, () => {
      throw new Error("docker inspect app failed: CI's container must be named 'app' and reachable");
    });
  }
  return it.skip(`${name} [skipped: docker logs unavailable locally]`, fn);
};

// freed/settled only ever log under rule mode settle (docs/decisions/0003);
// RULE_MODE comes from the test runner's own environment, the same way
// spec/eligibility.test.ts reads it, not from anything the app's responses
// or logs reveal. In CI, RULE_MODE is always explicit (checks.yml runs both
// passes), so an unset value there is a real failure, not a skip.
const settleModeReady = available && process.env.RULE_MODE === "settle";
const dockerSettleOnly = (name: string, fn: () => Promise<void>, timeout?: number) => {
  if (!local) return it.skip(`${name} [skipped: APP_URL is not local]`, fn);
  if (!available) {
    if (inCI) {
      return it(`${name} [docker logs unavailable in CI]`, () => {
        throw new Error("docker inspect app failed: CI's container must be named 'app' and reachable");
      });
    }
    return it.skip(`${name} [skipped: docker logs unavailable locally]`, fn);
  }
  if (inCI && !process.env.RULE_MODE) {
    return it(`${name} [RULE_MODE unset in CI]`, () => {
      throw new Error("RULE_MODE must be 'once' or 'settle' in CI, never unset: checks.yml runs both passes explicitly");
    });
  }
  if (settleModeReady) return it(name, fn, timeout);
  return it.skip(`${name} [skipped: RULE_MODE isn't settle]`, fn);
};

function logs(): string {
  return execSync("docker logs app", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

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

  // The raw visitor cookie value, if one has been set yet.
  cookie(): string | null {
    return this.cookies.get("theseus_visitor") ?? null;
  }

  async get(path = "/"): Promise<{ status: number; doc: Document; raw: string }> {
    const res = await fetch(new URL(path, baseUrl), { headers: this.headers(), redirect: "manual" });
    this.remember(res);
    const raw = await res.text();
    return { status: res.status, doc: new JSDOM(raw).window.document, raw };
  }

  async sentence(): Promise<{ position: number; version: number; word: string }[]> {
    const { doc } = await this.get("/");
    return [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')].map((form) => {
      const value = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
      return {
        position: Number(value("position")),
        version: Number(value("version")),
        word: form.querySelector("label")?.textContent?.trim() ?? "",
      };
    });
  }

  async replace(slot: { position: number; version: number }, word: string): Promise<{ status: number; raw: string }> {
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
    const raw = await res.text();
    return { status: res.status, raw };
  }

  // the visitor tag the contract (not the app's own code) says this
  // visitor's cookie should produce
  tag(): string {
    const cookie = this.cookie();
    expect(cookie, "this visitor has no cookie yet to tag").not.toBeNull();
    return expectedTag(cookie!);
  }
}

async function arrive(): Promise<Visitor> {
  const v = new Visitor();
  await v.get("/");
  return v;
}

let n = 0;
const unique = (): string =>
  `logtest${Date.now().toString(36)}${(n++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);

// a GET /events connection, closed in afterEach whatever the test did
const open = new Set<AbortController>();
afterEach(() => {
  for (const c of open) c.abort();
  open.clear();
});

async function connectEvents(v: Visitor): Promise<void> {
  const controller = new AbortController();
  open.add(controller);
  const cookie = v.cookie();
  const res = await fetch(new URL("/events", baseUrl), {
    headers: cookie ? { cookie: `theseus_visitor=${cookie}`, accept: "text/event-stream" } : { accept: "text/event-stream" },
    signal: controller.signal,
  });
  expect(res.status, "GET /events didn't open").toBe(200);
  // drain in the background so the server sees the connection as open
  void (async () => {
    const reader = res.body!.getReader();
    try {
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // aborted on close
    }
  })();
  // give the server a turn to register the subscription before we act
  await new Promise((resolve) => setTimeout(resolve, 50));
}

// Find a line in `log` containing `needle`; return its [xxxxxx] request id.
function requestIdOf(log: string, needle: string): string {
  const line = log.split("\n").find((l) => l.includes(needle));
  expect(line, `no log line contains ${JSON.stringify(needle)}`).toBeDefined();
  const match = line!.match(/^\[([0-9a-f]{6})\]/);
  expect(match, `log line has no [xxxxxx] request id: ${line}`).not.toBeNull();
  return match![1];
}

describe("Theseus server-side logging", () => {
  dockerOnly("logs exactly one outcome line naming a replacement and its visitor tag", async () => {
    const ann = await arrive();
    const slot = (await ann.sentence())[0];
    const word = unique();

    expect((await ann.replace(slot, word)).status).toBe(303);

    const log = logs();
    const lines = log.split("\n").filter((l) => l.includes(word));
    expect(lines.length, "a replacement didn't log exactly one line naming it").toBe(1);
    expect(lines[0], "the outcome line doesn't name 'replaced'").toMatch(/\breplaced\b/);
    expect(lines[0], "the outcome line doesn't carry the visitor's tag").toContain(`v=${ann.tag()}`);
  });

  dockerOnly("logs a broadcast reaching at least one open stream, correlated by request id", async () => {
    const bea = await arrive();
    await connectEvents(bea);

    const ann = await arrive();
    const slot = (await ann.sentence())[1];
    const word = unique();
    expect((await ann.replace(slot, word)).status).toBe(303);

    const log = logs();
    const reqId = requestIdOf(log, word);
    const broadcastLine = log.split("\n").find((l) => l.startsWith(`[${reqId}]`) && l.includes("broadcast"));
    expect(broadcastLine, `no broadcast line shares request id [${reqId}] with the replacement`).toBeDefined();
    const streams = broadcastLine!.match(/streams=(\d+)/);
    expect(streams, "the broadcast line doesn't name a streams count").not.toBeNull();
    expect(Number(streams![1]), "the broadcast didn't reach the open stream").toBeGreaterThanOrEqual(1);
  });

  dockerOnly("tags two different browsers differently, and the same browser consistently", async () => {
    const ann = await arrive(); // ann's first request
    const bea = await arrive();
    expect(ann.tag(), "two different cookies produced the same tag").not.toBe(bea.tag());

    await ann.get("/"); // ann again, a second "tab": same cookie jar, another request

    const log = logs();
    const annLines = log.split("\n").filter((l) => l.includes(`v=${ann.tag()}`));
    const annRequestIds = new Set(annLines.map((l) => l.match(/^\[([0-9a-f]{6})\]/)?.[1]).filter(Boolean));
    expect(annRequestIds.size, "ann's two requests didn't both log a line carrying her tag").toBeGreaterThanOrEqual(2);
    expect(log, "bea's tag never appears in the log").toContain(`v=${bea.tag()}`);
  });

  dockerOnly("a brand-new visitor's first access line carries the same tag as its visitor-new line", async () => {
    const v = new Visitor();
    await v.get("/");
    const tag = v.tag();

    const log = logs();
    const newLine = log.split("\n").find((l) => l.includes("visitor-new") && l.includes(`v=${tag}`));
    expect(newLine, "no visitor-new line carries this visitor's tag").toBeDefined();
    const reqId = requestIdOf(log, newLine!);
    const accessLine = log.split("\n").find((l) => l.startsWith(`[${reqId}]`) && / GET \//.test(l));
    expect(accessLine, `no access line shares request id [${reqId}] with visitor-new`).toBeDefined();
    expect(accessLine, "the first access line used v=none instead of the decided tag").toContain(`v=${tag}`);
  });

  dockerOnly("never logs the raw visitor cookie value", async () => {
    const ann = await arrive();
    const cookie = ann.cookie();
    expect(cookie, "setup: no cookie was issued").not.toBeNull();
    const slot = (await ann.sentence())[0];
    await ann.replace(slot, unique());
    await connectEvents(ann);

    const log = logs();
    expect(log, "the raw visitor cookie appears in the logs").not.toContain(cookie!);
  });

  dockerOnly("never reflects a log line or request id into a public response", async () => {
    const ann = await arrive();
    const slot = (await ann.sentence())[0];
    const page = (await ann.get("/")).raw;
    const reply = (await ann.replace(slot, unique())).raw;

    expect(page, "GET / leaks something log-line-shaped").not.toMatch(/\[[0-9a-f]{6}\]/);
    expect(reply, "the /replace response leaks something log-line-shaped").not.toMatch(/\[[0-9a-f]{6}\]/);
    expect(page, "GET / leaks a v= tag").not.toMatch(/\bv=[0-9a-f]{8}\b/);
  });

  dockerSettleOnly("logs who a replacement frees, tagged with the freed visitor's own tag, not the replacer's", async () => {
    const ann = await arrive();
    const slot = (await ann.sentence())[0];
    const annsWord = unique();
    expect((await ann.replace(slot, annsWord)).status).toBe(303);

    const bea = await arrive();
    const now = await bea.sentence();
    const held = now.find((s) => s.word === annsWord)!;
    const beasWord = unique();
    expect((await bea.replace(held, beasWord)).status).toBe(303);

    const log = logs();
    const reqId = requestIdOf(log, beasWord);
    const freedLine = log.split("\n").find((l) => l.startsWith(`[${reqId}]`) && l.includes("freed"));
    expect(freedLine, `no freed line shares request id [${reqId}] with bea's replacement`).toBeDefined();
    expect(freedLine, "the freed line names bea's tag instead of ann's").toContain(`v=${ann.tag()}`);
    expect(freedLine, "the freed line names the replacer's own tag").not.toContain(`v=${bea.tag()}`);
  });

  dockerSettleOnly(
    "logs a settled event, naming the visitor and position, the first time a request observes it",
    async () => {
      const settleSeconds = Number(process.env.SETTLE_SECONDS ?? 300);
      if (settleSeconds > 10) {
        // mirrors spec/eligibility.test.ts's settleByAgeOnly: this needs a
        // short SETTLE_SECONDS (checks.yml sets 3) to be practical to wait out
        throw new Error("SETTLE_SECONDS must be short (checks.yml sets 3) for this check to wait it out");
      }
      const ann = await arrive();
      const before = await ann.sentence();
      const held = before[0];
      expect((await ann.replace(held, unique())).status).toBe(303);

      await new Promise((resolve) => setTimeout(resolve, (settleSeconds + 1) * 1000));

      const now = await ann.sentence();
      const elsewhere = now.find((s) => s.position !== held.position)!;
      const freedWord = unique();
      expect((await ann.replace(elsewhere, freedWord)).status, "setup: settling didn't free the visitor").toBe(303);

      const log = logs();
      const reqId = requestIdOf(log, freedWord);
      const settledLine = log.split("\n").find((l) => l.startsWith(`[${reqId}]`) && l.includes("settled"));
      expect(settledLine, `no settled line shares request id [${reqId}] with the request it enabled`).toBeDefined();
      expect(settledLine, "the settled line doesn't name the visitor's tag").toContain(`v=${ann.tag()}`);
      expect(settledLine, "the settled line doesn't name the position that settled").toContain(`pos=${held.position}`);
    },
    20_000,
  );
});
