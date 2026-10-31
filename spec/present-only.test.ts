import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { liveIn } from "./chrome";

// GET / shows only what stands now (the maker's decision, Slice 5c): a word
// that has been replaced appears nowhere in the live sentence, not even as
// an earlier word under its position. Where it went is the kept half's
// business, and the whole history stays one step away at ?at=N, which still
// shows it exactly as before. Over HTTP, like spec/theseus.test.ts; the
// replacements are local-only test data.

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const changesTheSentence = (name: string, fn: () => Promise<void>) =>
  it.skipIf(!local)(local ? name : `${name} [skipped: APP_URL is not local]`, fn);

let n = 0;
const unique = () => `now${Date.now().toString(36)}${(n++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);

async function page(path = "/", cookie = ""): Promise<{ doc: Document; cookie: string }> {
  const res = await fetch(new URL(path, baseUrl), { headers: cookie ? { cookie } : {} });
  const set = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { doc: new JSDOM(await res.text()).window.document, cookie: set || cookie };
}

// a fresh visitor replaces one position with a word, as a browser would
async function replace(position: number, word: string): Promise<void> {
  const { doc, cookie } = await page();
  const form = [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')].find((f) => f.querySelector<HTMLInputElement>('input[name="position"]')!.value === String(position))!;
  const version = form.querySelector<HTMLInputElement>('input[name="version"]')!.value;
  const res = await fetch(new URL("/replace", baseUrl), {
    method: "POST", redirect: "manual",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: new URL(baseUrl).origin },
    body: new URLSearchParams({ position: String(position), version, word }),
  });
  expect(res.status, `replacing position ${position}`).toBe(303);
}

// The shipwrights' total (decision 0005, "Co-presence") is drawn as figures, never written as a number: not in
// the page's text, not in an attribute, not in anything a visitor's browser can read off the page. With the
// page's own stream and three more open from here, the total is at least four; this reads every text node and
// every attribute of the live page in Chrome and looks for it. The 01–10 positions name places, not counts, and
// the stream's own data is pinned in spec/realtime.test.ts.
// the latest total a fresh stream is told, read over a fixed window (the stream itself never ends)
const crewTotal = async (): Promise<number> => {
  const c = new AbortController(), timer = setTimeout(() => c.abort(), 2500);
  let buffer = "";
  try {
    const res = await fetch(new URL("/events", baseUrl), { headers: { accept: "text/event-stream" }, signal: c.signal });
    const reader = res.body!.getReader(), decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }
  } catch {
    // the window closed
  } finally {
    clearTimeout(timer);
  }
  const m = [...buffer.matchAll(/event: crew\ndata: (\{[^\n]*\})/g)].at(-1);
  if (!m) throw new Error("no crew event on GET /events");
  return (JSON.parse(m[1]) as { total: number }).total;
};

describe("the shipwrights are never a number", () => {
  it.skipIf(!local)("with several streams open, GET / writes their total nowhere", async () => {
    const extra = await Promise.all([0, 1, 2].map(() => {
      const c = new AbortController();
      return fetch(new URL("/events", baseUrl), { headers: { accept: "text/event-stream" }, signal: c.signal }).then(() => c);
    }));
    try {
      const found = (await liveIn(baseUrl, `(async () => {
        await new Promise((r) => setTimeout(r, 2500));
        const texts = [], walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement.closest('script, style')) texts.push(n.data);
        const attrs = [];
        for (const el of document.querySelectorAll('*')) for (const a of el.attributes) attrs.push(a.name + '=' + a.value);
        return { texts, attrs };
      })()`, [1440, 900])) as { texts: string[]; attrs: string[] };
      const total = await crewTotal();
      expect(total, "the streams opened here aren't counted").toBeGreaterThanOrEqual(4);
      const alone = new RegExp(`(^|[^0-9.])${total}([^0-9]|$)`);
      // a position names a place (01–10 in labels, data-part, position fields); everything else is checked
      for (const t of found.texts) expect(alone.test(t), `the page writes the shipwrights' total in "${t.trim().slice(0, 80)}"`).toBe(false);
      for (const a of found.attrs) if (/crew|wright|figure|present|total|count/i.test(a)) expect(alone.test(a), `an attribute carries the shipwrights' total: ${a}`).toBe(false);
    } finally {
      for (const c of extra) c.abort();
    }
  }, 60_000);
});

describe("GET / shows only what stands now", () => {
  changesTheSentence("a replaced word appears nowhere in the live sentence, and still in its earlier form", async () => {
    const first = unique(), second = unique();
    await replace(0, first);
    await replace(0, second);
    const { doc } = await page();
    const sentence = doc.querySelector(".sentence-strip .sentence");
    expect(sentence, "GET / has no live sentence").not.toBeNull();
    expect(sentence!.textContent, `the replaced word "${first}" still shows in the live sentence`).not.toContain(first);
    expect(sentence!.textContent).toContain(second);
    // ?at=N, the form just before now, is unchanged: the earlier word stands there
    const prev = doc.querySelector<HTMLAnchorElement>('a[rel~="prev"][href*="at="]')!.getAttribute("href")!;
    const earlier = (await page(prev)).doc;
    expect(earlier.querySelector(".sentence.past")?.textContent, "the earlier form lost its word").toContain(first);
  });
});
