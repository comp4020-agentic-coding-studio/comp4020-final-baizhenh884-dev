import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { warmUp } from "./warm-up";

// The run's own warm-up (spec/global-setup.ts). Fly stops the machine when
// idle (fly.toml, min_machines_running = 0), and the first requests after a
// stop or a deploy are slow: the live run after PR #12's deploy failed
// several layout checks within ms of an 18 s first check, and one check timed
// out at 90 s, then passed in three reruns. Before any check runs, the run
// asks the site for its page until it answers fast, so no check pays for the
// cold start. Each server here stands in for the app: slow at first, then fast.

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

// answers every request after `slowFor` requests at once; before that, after `delayMs`
async function app(slowFor: number, delayMs: number): Promise<{ url: string; hits: () => number }> {
  let n = 0;
  const s = createServer((_req, res) => {
    const late = n++ < slowFor;
    setTimeout(() => res.end("ok"), late ? delayMs : 0);
  });
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  servers.push(s);
  return { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}/`, hits: () => n };
}

describe("the run warms the site up before any check", () => {
  it("keeps asking until the site answers fast several times in a row, and says how long each took", async () => {
    const site = await app(3, 600);
    const out = await warmUp(site.url, { fastMs: 300, inARow: 3, budgetMs: 20_000 });
    expect(out.warm).toBe(true);
    // three slow answers, then three fast ones in a row
    expect(site.hits()).toBe(6);
    expect(out.times).toHaveLength(6);
    expect(out.times.slice(0, 3).every((t) => t >= 600)).toBe(true);
    expect(out.times.slice(3).every((t) => t < 300)).toBe(true);
  }, 30_000);

  it("a slow answer between fast ones starts the count again", async () => {
    let n = 0;
    const s = createServer((_req, res) => setTimeout(() => res.end("ok"), n++ === 1 ? 600 : 0));
    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
    servers.push(s);
    const out = await warmUp(`http://127.0.0.1:${(s.address() as AddressInfo).port}/`, { fastMs: 300, inARow: 2, budgetMs: 20_000 });
    expect(out.warm).toBe(true);
    expect(out.times).toHaveLength(4); // fast, slow, fast, fast
  }, 30_000);

  it("gives up after its budget without throwing, saying the site never warmed", async () => {
    const site = await app(Infinity, 400);
    const started = Date.now();
    const out = await warmUp(site.url, { fastMs: 100, inARow: 3, budgetMs: 1_500 });
    expect(out.warm).toBe(false);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(out.times.length).toBeGreaterThan(0);
  }, 10_000);
});
