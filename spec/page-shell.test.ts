import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { measureIn, servedPage } from "./chrome";

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
const PAGES = ["/", "/ship/", "/readme/", "/?at=0"];

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

  // A page that isn't there (a first-visit review, 1 November: /nope, ?at=abc and ?kept=0 fell to Astro's own
  // black page, with no way back): still a 404, in the site's own shell, with the way back to the sentence.
  for (const path of ["/nope", "/?at=abc", "/?kept=0"]) {
    it(`answers a page that isn't there with a 404 in the site's own shell, and the way back (${path})`, async () => {
      const res = await fetch(new URL(path, baseUrl));
      expect(res.status, `GET ${path}`).toBe(404);
      const doc = new JSDOM(await res.text()).window.document;
      const h1s = [...doc.querySelectorAll("h1")];
      expect(h1s.map((h) => h.textContent?.trim()), `${path} isn't in the site's shell`).toEqual(["Theseus"]);
      expect(h1s[0].closest("header"), `${path}'s h1 isn't in its header`).not.toBeNull();
      expect(doc.querySelectorAll("main"), `${path} has no single main`).toHaveLength(1);
      const back = [...doc.querySelectorAll("a[href]")].some((a) => new URL(a.getAttribute("href")!, new URL(path, baseUrl)).pathname === "/" && !new URL(a.getAttribute("href")!, new URL(path, baseUrl)).search);
      expect(back, `${path} has no way back to the sentence`).toBe(true);
    });
  }

  // The masthead's name is one word on one line: on a phone the band's links once squeezed it to "These / us"
  // (a first-visit review, 1 November, at 360–390 px wide).
  for (const path of ["/", "/ship/", "/readme/"]) {
    for (const width of [360, 390]) {
      it(`keeps the masthead's name on one line on a phone (${path}, ${width} px)`, async () => {
        const m = (await measureIn(await servedPage(baseUrl, path), `(async () => {
          await document.fonts.ready;
          // as the page's script shows it: GET /'s way to replay the opening story, beside How the planks are made
          document.querySelector('#story-open')?.removeAttribute('hidden');
          const n = document.querySelector('header .name'), s = getComputedStyle(n);
          return { height: n.getBoundingClientRect().height, font: parseFloat(s.fontSize), scroll: document.documentElement.scrollWidth, vw: innerWidth };
        })()`, [width, 800])) as { height: number; font: number; scroll: number; vw: number };
        expect(m.height, `the name breaks onto a second line (${Math.round(m.height)} px tall)`).toBeLessThan(1.5 * m.font);
        expect(m.scroll, "the page scrolls sideways").toBeLessThanOrEqual(m.vw);
      }, 60_000);
    }
  }
});
