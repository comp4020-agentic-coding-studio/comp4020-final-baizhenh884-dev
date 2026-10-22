import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// Every page's shell: one visible h1 (the masthead's "Theseus", in its own
// look), a main landmark and a header, a meta description, the Open Graph
// tags a shared link needs (with an image that loads), and a favicon that
// loads. Reads only: never changes the shared sentence.

const baseUrl = inject("baseUrl");
const get = async (path: string) => {
  const res = await fetch(new URL(path, baseUrl));
  expect(res.status, `GET ${path}`).toBe(200);
  return new JSDOM(await res.text()).window.document;
};
const PAGES = ["/", "/house/", "/readme/", "/?at=0"];

describe("every page's shell", () => {
  for (const path of PAGES) {
    it(`has one h1, a main and a header, and says what it is (${path})`, async () => {
      const doc = await get(path);
      const h1s = [...doc.querySelectorAll("h1")];
      expect(h1s, `${path} doesn't have exactly one h1`).toHaveLength(1);
      expect(h1s[0].textContent?.trim(), `${path}'s h1 isn't the masthead's name`).toBe("Theseus");
      expect(h1s[0].closest("header"), `${path}'s h1 isn't in its header`).not.toBeNull();
      expect(doc.querySelectorAll("main"), `${path} has no single main`).toHaveLength(1);
      const description = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";
      expect(description.length, `${path} has no meta description`).toBeGreaterThan(20);
    });

    it(`carries the Open Graph tags a shared link needs (${path})`, async () => {
      const doc = await get(path);
      const og = (p: string) => doc.querySelector(`meta[property="og:${p}"]`)?.getAttribute("content")?.trim() ?? "";
      for (const p of ["title", "description", "type", "url", "image"]) expect(og(p), `${path} has no og:${p}`).not.toBe("");
      // the image a shared link shows must load, as an image
      const image = await fetch(new URL(og("image"), baseUrl));
      expect(image.status, "og:image doesn't load").toBe(200);
      expect(image.headers.get("content-type"), "og:image isn't a PNG").toMatch(/^image\/png/);
    });
  }

  it("has a favicon that loads, linked from every page", async () => {
    for (const path of PAGES) {
      const href = (await get(path)).querySelector('link[rel="icon"]')?.getAttribute("href");
      expect(href, `${path} links no favicon`).toBeTruthy();
      const icon = await fetch(new URL(href!, baseUrl));
      expect(icon.status, `${path}'s favicon doesn't load`).toBe(200);
      expect(icon.headers.get("content-type"), "the favicon isn't an image").toMatch(/^image\//);
    }
  });
});
