import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// GET /?at=N is the sentence after N replacements, read-only. When N is every replacement so far, it's the
// sentence as it stands, and it says so: a first-visit review (1 November) found ?at=N for the latest N still
// labelled "An earlier form". Reads only: never changes the shared sentence.

const baseUrl = inject("baseUrl");
const page = async (path: string) => {
  const res = await fetch(new URL(path, baseUrl));
  expect(res.status, `GET ${path}`).toBe(200);
  return new JSDOM(await res.text()).window.document;
};

describe("an earlier form", () => {
  it("doesn't call the sentence as it stands an earlier form", async () => {
    // the number of replacements so far: one past GET /'s Earlier link (none yet: 0)
    const prev = (await page("/")).querySelector('a[rel~="prev"]')?.getAttribute("href");
    const count = prev ? Number(new URL(prev, baseUrl).searchParams.get("at")) + 1 : 0;
    const state = (doc: Document) => doc.querySelector(".form-state")?.textContent?.trim() ?? "";
    const now = await page(`/?at=${count}`);
    expect(state(now), `?at=${count} is the sentence as it stands, read-only`).toMatch(/read-only/i);
    expect(state(now), `?at=${count} calls the sentence as it stands an earlier form`).not.toMatch(/earlier/i);
    if (count > 0) expect(state(await page(`/?at=${count - 1}`)), `?at=${count - 1} isn't labelled an earlier form`).toMatch(/earlier form/i);
  });
});
