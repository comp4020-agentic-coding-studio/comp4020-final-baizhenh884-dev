import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { LOG_LINES, logLine, logOf, type LogLine } from "../src/lib/log-record";
import { liveIn } from "./chrome";

// The log (docs/decisions/0006-the-log.md): the ship's record, not a feed of people. On GET /, below "Your plank",
// every successful replacement, newest first, one line each: the place and its part, the old word and the new one.
// Nothing that says when or who: no times or ages, no names, no visitor marks (the visitor's own included), no
// counts, no numbering beyond the 01–10 place. The latest LOG_LINES lines. A line whose old or new word is on the
// maker's blocklist isn't shown. Finished ships are never listed. Live from the change event; a load, a snapshot or
// a reconnect shows the record from SQLite. Derived from `changes`, nothing stored. No log on ?at=N or ?kept=k.
//
// The blocklist is applied on the server only: it never reaches a page (decision 0004), and a live line never needs
// it. A blocked word can't be a change's new word (it's refused), and a word blocked after it was placed takes a
// redeploy (the list is read at boot), after which every page reloads its log from SQLite. So the filter is checked
// here purely, with a list of its own, and the page's log only from what the server sends.

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const changesTheSentence = (name: string, fn: () => Promise<void>, timeout?: number) =>
  it.skipIf(!local)(local ? name : `${name} [skipped: APP_URL is not local]`, fn, timeout);

type Row = { position: number; fromWord: string; toWord: string };
const never = () => false;

describe("the log, from the record", () => {
  it("reads every replacement, newest first, as its place and part, old word and new", () => {
    const rows: Row[] = [
      { position: 6, fromWord: "miss", toWord: "wonder" },
      { position: 0, fromWord: "Make", toWord: "potato" },
      { position: 6, fromWord: "wonder", toWord: "whether" },
    ];
    expect(logOf(rows, never)).toEqual([
      { position: 6, part: "Sail", from: "wonder", to: "whether" },
      { position: 0, part: "Ram", from: "Make", to: "potato" },
      { position: 6, part: "Sail", from: "miss", to: "wonder" },
    ]);
  });

  it("carries nothing but the place, the part and the two words: no when, no who", () => {
    const [line] = logOf([{ position: 2, fromWord: "a", toWord: "b", visitor: "v1", createdAt: "2026-10-31T00:00:00Z", id: 7 } as Row], never);
    expect(Object.keys(line).sort()).toEqual(["from", "part", "position", "to"]);
  });

  it(`keeps the latest ${LOG_LINES} lines`, () => {
    expect(LOG_LINES).toBe(50);
    const rows: Row[] = Array.from({ length: 80 }, (_, i) => ({ position: i % 10, fromWord: `old${i}`, toWord: `new${i}` }));
    const log = logOf(rows, never);
    expect(log).toHaveLength(LOG_LINES);
    expect(log[0].to, "the newest isn't first").toBe("new79");
    expect(log.at(-1)!.to, "the oldest kept isn't the 50th newest").toBe("new30");
  });

  it("leaves out a line whose old or new word is on the blocklist, then keeps the latest of the rest", () => {
    const blocked = (w: string) => w === "badword";
    const rows: Row[] = [
      { position: 1, fromWord: "anchor", toWord: "badword" },
      { position: 1, fromWord: "badword", toWord: "timber" },
      { position: 3, fromWord: "that", toWord: "lantern" },
    ];
    expect(logOf(rows, blocked).map((l) => `${l.from}→${l.to}`)).toEqual(["that→lantern"]);
    // the cap counts lines shown, not lines hidden
    const many: Row[] = Array.from({ length: 60 }, (_, i) => ({ position: 0, fromWord: i % 2 ? "badword" : `a${i}`, toWord: `b${i}` }));
    expect(logOf(many, blocked)).toHaveLength(30);
  });

  it("writes a line as its place, its part, and old word → new word", () => {
    const line: LogLine = { position: 6, part: "Sail", from: "whether", to: "wonder" };
    expect(logLine(line)).toEqual({ place: "07 · Sail", change: "whether → wonder" });
  });
});

// a fresh visitor replaces a position with a word, as a browser would (test data, local only)
async function replace(position: number, word: string): Promise<number> {
  const r0 = await fetch(new URL("/", baseUrl));
  const cookie = r0.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const v = (await r0.text()).match(new RegExp(`name="position" value="${position}"><input type="hidden" name="version" value="([0-9]+)"`))![1];
  const res = await fetch(new URL("/replace", baseUrl), { method: "POST", redirect: "manual", headers: { cookie, origin: new URL(baseUrl).origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ position: String(position), version: v, word }) });
  return res.status;
}
let n = 0;
const fresh = (k: string) => `${k}${Date.now().toString(36)}${(n++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);
const page = async (path = "/") => new JSDOM(await (await fetch(new URL(path, baseUrl))).text()).window.document;
const lines = (doc: Document) => [...doc.querySelectorAll("#log ol > li")].map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim());

describe("the log on GET /", () => {
  changesTheSentence("shows each replacement at the top, newest first, as its place and part, old → new", async () => {
    const before = (await page()).querySelectorAll("#log ol > li")[0]?.textContent;
    const a = fresh("logone"), b = fresh("logtwo");
    expect(await replace(6, a), "the first change was refused").toBe(303);
    expect(await replace(2, b), "the second change was refused").toBe(303);
    const doc = await page();
    const log = doc.querySelector<HTMLElement>("#log");
    expect(log, "GET / has no log").not.toBeNull();
    expect(log!.hidden, "the log is hidden with lines in it").toBe(false);
    const shown = lines(doc);
    expect(shown[0], "the newest replacement isn't first").toMatch(new RegExp(`^03 · Prow .* → ${b}$`));
    expect(shown[1], "the one before isn't second").toMatch(new RegExp(`^07 · Sail .* → ${a}$`));
    expect(before === undefined || shown.length >= 2).toBe(true);
    expect(shown.length, "the log runs past its latest lines").toBeLessThanOrEqual(50);
  });

  changesTheSentence("says nothing about when or who, not even which line is yours", async () => {
    const r0 = await fetch(new URL("/", baseUrl));
    const cookie = r0.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const html = await r0.text();
    const v = html.match(/name="position" value="4"><input type="hidden" name="version" value="([0-9]+)"/)![1];
    const word = fresh("mine");
    await fetch(new URL("/replace", baseUrl), { method: "POST", redirect: "manual", headers: { cookie, origin: new URL(baseUrl).origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ position: "4", version: v, word }) });
    // as the visitor who made it
    const doc = new JSDOM(await (await fetch(new URL("/", baseUrl), { headers: { cookie } })).text()).window.document;
    const log = doc.querySelector("#log")!;
    // each line is its place and part, and the old and new word, and nothing else: no time, no count, no name
    // (a visitor's word may hold any letters or digits, so this reads the line's parts, not its characters)
    for (const li of log.querySelectorAll("ol > li")) {
      const place = li.querySelector(".place")?.textContent?.trim() ?? "", from = li.querySelector(".from")?.textContent ?? "", to = li.querySelector(".to")?.textContent ?? "";
      expect(place, "a line's place isn't its 01–10 and part").toMatch(/^(0[1-9]|10) · (Ram|Hull|Prow|Stern|Shields|Mast|Sail|Oars|Rudder|Pennant)$/);
      expect((li.textContent ?? "").replace(/\s+/g, " ").trim(), "a line says more than its place and its two words").toBe(`${place} ${from} → ${to}`);
      expect([...li.querySelectorAll("*")].every((e) => e.tagName === "SPAN"), "a line holds more than text").toBe(true);
      expect(li.querySelector("time, [datetime]"), "a line carries a time").toBeNull();
    }
    const mine = [...log.querySelectorAll("ol > li")].find((li) => li.textContent?.includes(word))!;
    expect(mine, "the visitor's own change isn't in the log").toBeDefined();
    const others = [...log.querySelectorAll("ol > li")].filter((li) => li !== mine);
    // marked no differently from anyone else's: the same markup, no mark, no extra class
    expect(mine.querySelector("mark"), "the visitor's own line is marked").toBeNull();
    for (const o of others.slice(0, 3)) expect(mine.className, "the visitor's own line is told apart").toBe(o.className);
    expect(log.textContent, "the log names who made a change").not.toMatch(/\byou\b|\byour\b|visitor/i);
  });

  it("is a list read in order, under its heading, never announced line by line", async () => {
    const doc = await page();
    const log = doc.querySelector("#log")!;
    expect(log.tagName.toLowerCase()).toBe("section");
    expect(log.querySelector("h2")?.textContent?.trim(), "the log has no heading").toBe("The log");
    expect(log.getAttribute("aria-labelledby"), "the log isn't named by its heading").toBe(log.querySelector("h2")!.id);
    expect(log.querySelector("ol"), "the log isn't a list").not.toBeNull();
    expect(log.closest("[aria-live]") ?? log.querySelector("[aria-live]"), "the log announces its lines").toBeNull();
    expect(log.closest('[aria-hidden="true"]'), "the log is hidden from screen readers").toBeNull();
  });

  it("never lists ships, and has no log on an earlier form or an earlier ship", async () => {
    const doc = await page();
    expect(doc.querySelectorAll("#log a[href*='kept=']"), "the log lists ships").toHaveLength(0);
    for (const path of ["/?at=0", "/?kept=1"]) {
      const res = await fetch(new URL(path, baseUrl));
      if (res.status !== 200) continue; // no completed ship yet: ?kept=1 is 404
      const earlier = new JSDOM(await res.text()).window.document;
      expect(earlier.querySelector("#log"), `${path} has a log`).toBeNull();
    }
  });

  changesTheSentence("adds another visitor's change at the top, live, once, and a reload shows the same record", async () => {
    const word = fresh("livelog");
    let ok = 0;
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => {
      const h = document.querySelector('#harbour');
      for (let i = 0; i < 150 && !h.hasAttribute('data-ready'); i++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 800));
      const read = () => [...document.querySelectorAll('#log ol > li')].map((li) => li.textContent.replace(/\\s+/g, ' ').trim());
      const before = read();
      for (let i = 0; i < 300 && !read()[0]?.endsWith(${JSON.stringify(word)}); i++) await new Promise((r) => setTimeout(r, 20));
      const after = read();
      await new Promise((r) => setTimeout(r, 1500));
      return { before, after, later: read(), hidden: document.querySelector('#log').hidden };
    })()`, [1440, 900], { then: async () => { await new Promise((r) => setTimeout(r, 2200)); ok = await replace(8, word); } })) as { before: string[]; after: string[]; later: string[]; hidden: boolean };
    expect(ok, "the other visitor's change was refused").toBe(303);
    expect(m.after[0], "another visitor's change didn't reach the log live").toMatch(new RegExp(`^09 · Rudder .* → ${word}$`));
    expect(m.after.slice(1, 1 + Math.min(m.before.length, 49)), "the earlier lines moved or went").toEqual(m.before.slice(0, Math.min(m.before.length, 49)));
    expect(m.later.filter((l) => l.endsWith(word)), "the line arrived more than once").toHaveLength(1);
    expect(m.hidden, "the log is hidden with lines in it").toBe(false);
    // a fresh load reads the same record from SQLite
    expect(lines(await page()).slice(0, m.later.length), "the live log differs from a fresh load").toEqual(m.later.slice(0, Math.min(50, m.later.length)));
  }, 120_000);
});
