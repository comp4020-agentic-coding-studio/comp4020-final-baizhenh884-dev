import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

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
