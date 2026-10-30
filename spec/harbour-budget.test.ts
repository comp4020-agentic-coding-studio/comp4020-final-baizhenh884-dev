import { gzipSync } from "node:zlib";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { liveIn } from "./chrome";

// What GET / costs a phone (CLAUDE.md "Scope (Final Project: the ship, in one
// harbour)", the maker's 200 KB budget of 30 October): three loads as a
// deferred module, so the sentence is painted before any script runs; and all
// the script GET / loads (the page's own module scripts and every module they
// import, followed over HTTP as a browser would) stays within 200 KB gzipped.
// Reads only.

const baseUrl = inject("baseUrl");
const BUDGET = 200 * 1024;

describe("what GET / costs a phone", () => {
  it("loads its scripts as deferred modules, none render-blocking in the head", async () => {
    const doc = new JSDOM(await (await fetch(new URL("/", baseUrl))).text()).window.document;
    const scripts = [...doc.querySelectorAll("script")];
    expect(scripts.length, "GET / loads no script").toBeGreaterThan(0);
    for (const s of scripts) {
      const blocking = !s.type.match(/module|json|importmap/) && !s.hasAttribute("defer") && !s.hasAttribute("async") && !!s.getAttribute("src");
      expect(blocking, `a classic script blocks the page: ${s.outerHTML.slice(0, 120)}`).toBe(false);
      if (s.closest("head")) expect(s.type === "module" || s.hasAttribute("defer") || s.hasAttribute("async") || !s.getAttribute("src"), "a script in the head blocks the first paint").toBe(true);
    }
  });

  it("keeps all the script GET / loads within 200 KB gzipped", async () => {
    const html = await (await fetch(new URL("/", baseUrl))).text();
    const doc = new JSDOM(html).window.document;
    const seen = new Map<string, number>();
    const queue: string[] = [];
    let inline = 0;
    for (const s of doc.querySelectorAll("script")) {
      const src = s.getAttribute("src");
      if (src) queue.push(new URL(src, baseUrl).href);
      else { inline += gzipSync(s.textContent ?? "").length; for (const [, rel] of (s.textContent ?? "").matchAll(/(?:import|from)\s*["']([^"']+\.js)["']/g)) queue.push(new URL(rel, baseUrl).href); }
    }
    for (const l of doc.querySelectorAll('link[rel="modulepreload"]')) queue.push(new URL(l.getAttribute("href")!, baseUrl).href);
    while (queue.length) {
      const url = queue.pop()!;
      if (seen.has(url)) continue;
      const res = await fetch(url);
      expect(res.status, `${url} doesn't load`).toBe(200);
      const code = await res.text();
      seen.set(url, gzipSync(code).length);
      for (const [, rel] of code.matchAll(/(?:import\s*\(?|from)\s*["']([^"']+\.js)["']/g)) queue.push(new URL(rel, url).href);
    }
    const total = inline + [...seen.values()].reduce((a, b) => a + b, 0);
    const list = [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([u, n]) => `${new URL(u).pathname} ${(n / 1024).toFixed(1)} KB`).join(", ");
    process.stdout.write(`\n::notice title=script budget::${(total / 1024).toFixed(1)} KB gzipped of 200 KB: ${list}\n`);
    expect(seen.size, "GET / loads no module").toBeGreaterThan(0);
    expect(total, `GET /'s scripts are ${(total / 1024).toFixed(1)} KB gzipped: ${list}`).toBeLessThanOrEqual(BUDGET);
  });

  // The sentence is there at first contentful paint on a phone, painted by the server's markup and stylesheet:
  // with scripts off, Chrome still records a first contentful paint and the whole sentence is on the first
  // screen, so the first paint never waits on a script (racing the script's start against the paint would
  // depend on how fast the machine is, not on the page).
  it("paints the sentence at first contentful paint on a phone with no script at all (390×844)", async () => {
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => {
      // no timer here: with scripts off the page runs none, and a sleep in this expression never wakes (probed);
      // the harness waits in node instead (settleMs), since the paint can be recorded just after the load
      // (once, on main's CI run of e898ba0, no paint had been recorded yet when this ran)
      await document.fonts.ready;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      const sent = document.querySelector('.sentence-strip .sentence'), r = sent && sent.getBoundingClientRect();
      return { fcp: fcp ? fcp.startTime : null, top: r ? r.top : null, bottom: r ? r.bottom : null, words: sent ? sent.querySelectorAll('label').length : 0, vh: innerHeight };
    })()`, [390, 844], { noScript: true, settleMs: 1500 })) as { fcp: number | null; top: number | null; bottom: number | null; words: number; vh: number };
    expect(m.fcp, "Chrome recorded no first contentful paint without a script").not.toBeNull();
    expect(m.words, "the sentence's words aren't there").toBe(10);
    expect(m.top!, "the sentence isn't on the phone's first screen").toBeLessThan(m.vh);
  }, 60_000);
});
