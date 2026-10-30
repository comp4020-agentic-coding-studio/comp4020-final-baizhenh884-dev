import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { measureIn, servedPage } from "./chrome";

// The question first (the redesign's top band): above both halves of GET /,
// the question, one sentence on Theseus's ship, and how to play in three
// numbered steps, in full until this visitor has made a change. After that,
// the server knows from their trace, and the band is the question alone, on
// one line. It's the page's own text (read, not decorative), never live: it
// changes only on a fresh page from the server, so another visitor's change
// never folds it. It names no rule the app doesn't keep: under settle mode a
// visitor replaces a piece at a time, and a replaced word is kept only where
// the kept ship still has a gap for it, so "replaced words are kept", not
// "your word is kept".

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const QUESTION = "If every plank is replaced, is it still the same ship?";

class Visitor {
  private cookies = new Map<string, string>();
  private remember(res: Response): void {
    for (const header of res.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return { ...(cookie ? { cookie } : {}), ...extra };
  }
  async page(path = "/"): Promise<{ html: string; doc: Document }> {
    const res = await fetch(new URL(path, baseUrl), { headers: this.headers(), redirect: "manual" });
    this.remember(res);
    const html = await res.text();
    return { html, doc: new JSDOM(html).window.document };
  }
  async replaceAny(): Promise<number> {
    const { doc } = await this.page("/");
    const forms = [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')];
    const form = forms[Math.floor(Math.random() * forms.length)];
    const value = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value;
    const word = `band${Date.now().toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);
    const res = await fetch(new URL("/replace", baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: this.headers({ "content-type": "application/x-www-form-urlencoded", origin: new URL(baseUrl).origin }),
      body: new URLSearchParams({ position: value("position"), version: value("version"), word }),
    });
    this.remember(res);
    return res.status;
  }
}

const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const localOnly = (name: string, fn: () => Promise<void>, timeout?: number) =>
  local ? it(name, fn, timeout) : it.skip(`${name} [skipped: APP_URL is not local]`, fn, timeout);

describe("the question first", () => {
  it("opens a new visitor's page with the question, Theseus's ship, and how to play in three steps", async () => {
    const { doc } = await new Visitor().page("/");
    const band = doc.querySelector("#question");
    expect(band, "GET / has no question band").not.toBeNull();
    expect(band!.closest("[aria-hidden='true']"), "the band is hidden from assistive technology").toBeNull();
    // above the harbour: before it in the page
    const harbour = doc.querySelector("#harbour")!;
    expect(band!.compareDocumentPosition(harbour) & doc.defaultView!.Node.DOCUMENT_POSITION_FOLLOWING, "the band isn't above the harbour").toBeTruthy();
    expect(text(band!.querySelector(".question-line")), "the band doesn't ask the question").toBe(QUESTION);
    expect(text(band!.querySelector(".ship")), "the band doesn't name Theseus's ship").toMatch(/Theseus.s ship/);
    const steps = [...band!.querySelectorAll("ol.how-to-play > li")].map(text);
    expect(steps, "how to play isn't three steps").toHaveLength(3);
    expect(steps[0]).toMatch(/word/i);
    expect(steps[1]).toMatch(/Enter/);
    expect(steps[2]).toMatch(/kept/i);
    // replaced words go to the ship of old planks, or wait for the next (decided 29 October; the ship, 30 October)
    expect(steps[2]).toBe("Replaced words are kept on the slipway: in the ship of old planks, or waiting for the next.");
  });

  // The 28 October playtest: people expected meaning to change the house, and didn't find how it read a word.
  // Step 2 says a plank is rebuilt from the spelling, not the meaning; the band links the shipwright's notes.
  it("says a plank is rebuilt from how a word is spelled, not what it means, and links how the planks are made", async () => {
    const { doc } = await new Visitor().page("/");
    const band = doc.querySelector("#question")!;
    const step2 = text(band.querySelectorAll("ol.how-to-play > li")[1]);
    expect(step2, "step 2 doesn't say the plank is rebuilt from the spelling").toMatch(/plank.*spell/i);
    expect(step2, "step 2 doesn't say meaning doesn't count").toMatch(/not (by |from )?what it means|not its meaning/i);
    // one link, with the question, so it stays when the band folds (two would be read twice)
    const links = band.querySelectorAll('a[href="/ship/"]');
    expect(links, "the band doesn't link to /ship/ exactly once").toHaveLength(1);
    const link = links[0];
    expect(text(link), "the /ship/ link doesn't say what it is").toMatch(/^how the planks are made$/i);
    expect(link!.closest("[aria-hidden='true']"), "the /ship/ link is hidden from assistive technology").toBeNull();
  });

  // Step 1 names the device's own gesture: click on a desktop, tap on a phone. Both are in the page (no
  // device guess on the server); the layout shows only the device's own (measured in the layout check below).
  it("names the gesture for each device in step 1: click on a desktop, tap on a phone", async () => {
    const { doc } = await new Visitor().page("/");
    const step1 = doc.querySelectorAll("#question ol.how-to-play > li")[0];
    expect(step1.querySelector(".on-desktop")?.textContent?.trim(), "step 1 has no desktop wording").toMatch(/^Click any word/);
    expect(step1.querySelector(".on-phone")?.textContent?.trim(), "step 1 has no phone wording").toMatch(/^Tap any word/);
  });

  // what the band says is true of the rules (docs/decisions/0003)
  it("claims nothing the rules don't do", async () => {
    const { doc } = await new Visitor().page("/");
    const all = text(doc.querySelector("#question"));
    expect(all, "the band says each visitor replaces one piece (settle allows more)").not.toMatch(/\breplaces one\b|\bone piece\b|\bonce\b/i);
    expect(all, "the band promises a visitor's own word is kept (only where a gap waits for it)").not.toMatch(/\byour (word|replaced word) is kept\b|\bthe word you replaced is kept\b/i);
  });

  it("is never on an earlier form or an earlier ship", async () => {
    const v = new Visitor();
    const { doc } = await v.page("/?at=0");
    expect(doc.querySelector("#question"), "an earlier form shows the question band").toBeNull();
  });

  localOnly("folds to the question alone once this visitor has made a change, and stays full for anyone who hasn't", async () => {
    const author = new Visitor(), stranger = new Visitor();
    await author.page("/");
    await stranger.page("/");
    expect(await author.replaceAny(), "the staged replacement wasn't accepted").toBe(303);
    const after = (await author.page("/")).doc.querySelector("#question");
    expect(after, "the band is gone after a change, not folded").not.toBeNull();
    expect(text(after!.querySelector(".question-line"))).toBe(QUESTION);
    expect(after!.querySelector(".ship"), "the folded band still tells Theseus's ship").toBeNull();
    expect(after!.querySelector("ol.how-to-play"), "the folded band still shows how to play").toBeNull();
    // /ship/ stays one step away once the band is folded: the link stands with the question, not in how to play
    expect(after!.querySelector('.question-main a[href="/ship/"]'), "the folded band loses its link to /ship/").not.toBeNull();
    // another visitor's change never folds a stranger's band
    const still = (await stranger.page("/")).doc.querySelector("#question");
    expect(still!.querySelector("ol.how-to-play"), "someone else's change folded a stranger's band").not.toBeNull();
  }, 30_000);

  // laid out: in full, three steps beside the question on a desktop and under it on a phone; folded, one
  // line; every text in it legible on the paper's grid line (4.5:1, its captions 6:1)
  for (const [name, size] of [["1920×1080", [1920, 1080]], ["1440×900", [1440, 900]], ["1280×800", [1280, 800]], ["phone 390×844", [390, 844]]] as const) {
    it(`sets the band legibly, and folded to one line (${name})`, async () => {
      const full = await servedPage(baseUrl);
      const folded = await servedPage(baseUrl);
      // the folded form, as GET / renders it for a visitor with a change (the server's own markup, below)
      const band = folded.querySelector("#question")!;
      band.querySelector(".ship")?.remove();
      band.querySelector(".how")?.remove();
      band.classList.add("folded");
      const measure = `(async () => {
        await document.fonts.ready;
        const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
        const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const over = ([r, g, b, a = 1], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
        const band = document.querySelector('#question'), bs = getComputedStyle(band);
        const flat = rgb(bs.backgroundColor), line = (bs.backgroundImage.match(/rgba?\\([^)]*\\)/) || [null])[0], grid = line ? over(rgb(line), flat) : flat;
        const texts = [...band.querySelectorAll('h2, p, li, .caps, a')].filter((el) => el.getBoundingClientRect().height > 0).map((el) => {
          const fg = over(rgb(getComputedStyle(el).color), flat);
          return { what: (el.className || el.tagName) + ' ' + el.textContent.trim().slice(0, 30), contrast: Math.min(ratio(fg, flat), ratio(fg, grid)), caption: !el.matches('.caps, .question-line') };
        });
        const q = band.querySelector('.question-line'), qr = q.getBoundingClientRect(), qs = getComputedStyle(q);
        const steps = [...band.querySelectorAll('ol.how-to-play > li')].map((li) => li.getBoundingClientRect());
        const shown = (sel) => { const el = band.querySelector(sel); return !!el && el.getBoundingClientRect().width > 0; };
        const link = band.querySelector('a[href="/ship/"]'), lr = link && link.getBoundingClientRect();
        return { texts, qLines: Math.round(qr.height / parseFloat(qs.lineHeight)), qRight: qr.right, width: innerWidth, flat, bottom: band.getBoundingClientRect().bottom,
          stepsBeside: steps.length ? steps[0].left > qr.right - 1 : null, click: shown('.on-desktop'), tap: shown('.on-phone'),
          link: lr ? { shown: lr.width > 0, right: lr.right, bottom: lr.bottom } : null };
      })()`;
      type M = { texts: { what: string; contrast: number; caption: boolean }[]; qLines: number; qRight: number; width: number; flat: number[]; bottom: number; stepsBeside: boolean | null;
        click: boolean; tap: boolean; link: { shown: boolean; right: number; bottom: number } | null };
      const f = (await measureIn(full, measure, [size[0], size[1]])) as M;
      const g = (await measureIn(folded, measure, [size[0], size[1]])) as M;
      expect(f.flat.slice(0, 3), "the band isn't on the drafting paper").toEqual([236, 232, 223]);
      for (const t of [...f.texts, ...g.texts]) expect(t.contrast, `"${t.what}" is too faint on the band`).toBeGreaterThanOrEqual(t.caption ? 6 : 4.5);
      expect(f.qRight, "the question runs out of the page").toBeLessThanOrEqual(f.width);
      if (size[0] > 900) expect(f.stepsBeside, "the steps aren't beside the question on a desktop").toBe(true);
      else expect(f.stepsBeside, "the steps aren't under the question on a phone").toBe(false);
      if (size[0] > 900) expect(g.qLines, "folded, the question isn't on one line").toBe(1);
      // step 1 shows the device's own gesture only
      expect([f.click, f.tap], "step 1 doesn't show only the device's own gesture").toEqual(size[0] > 900 ? [true, false] : [false, true]);
      // the /ship/ link is shown, in full and folded, inside the page
      for (const [form, x] of [["in full", f], ["folded", g]] as const) {
        expect(x.link?.shown, `the band's /ship/ link isn't shown (${form})`).toBe(true);
        expect(x.link!.right, `the band's /ship/ link runs out of the page (${form})`).toBeLessThanOrEqual(x.width);
      }
      expect(g.bottom, "folded, the band isn't shorter than in full").toBeLessThan(f.bottom);
    }, 90_000);
  }
});
