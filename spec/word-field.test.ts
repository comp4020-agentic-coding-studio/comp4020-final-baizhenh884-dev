import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// Choosing a word must give a field you can see and type into, in the word's
// own place, in every browser. jsdom has no layout, so this builds a page from
// the app's own markup and stylesheet and measures it in headless Chrome. The
// second run deletes the field-sizing rule, which is what a browser without
// that property (Safari, Firefox) is left with: a focused field that is
// focused and takes keystrokes, but is 0px wide, so the word just vanishes.
//
// Needs Chrome: set CHROME to its binary, or have google-chrome / chromium at
// the usual path. It fails, never skips, when there is none.

const baseUrl = inject("baseUrl");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chrome(): string {
  const candidates = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((p): p is string => !!p);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("no Chrome found: set CHROME to a Chrome or Chromium binary");
  return found;
}

// Opens the file in headless Chrome over its debugging port, runs the expression in the page, returns its value.
async function inChrome(file: string, expression: string, dir: string, size: [number, number]): Promise<unknown> {
  const port = 9700 + Math.floor(Math.random() * 200);
  const proc = spawn(chrome(), ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, "profile")}`, "about:blank"], { stdio: "ignore" });
  let socket: WebSocket | undefined;
  try {
    for (let i = 0; ; i++) {
      try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { if (i > 200) throw new Error("Chrome did not start"); await sleep(100); }
    }
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`file://${file}`)}`, { method: "PUT" })).json();
    const ws = (socket = new WebSocket(target.webSocketDebuggerUrl));
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map<number, (m: any) => void>();
    ws.onmessage = (m) => { const x = JSON.parse(String(m.data)); if (x.id && pending.has(x.id)) { pending.get(x.id)!(x); pending.delete(x.id); } };
    const send = (method: string, params: object = {}) => new Promise<any>((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
    await send("Emulation.setDeviceMetricsOverride", { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
    for (let i = 0; ; i++) {
      const ready = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
      if (ready.result?.result?.value === "complete") break;
      if (i > 200) throw new Error("the page did not load");
      await sleep(100);
    }
    const out = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (out.result?.exceptionDetails) throw new Error(out.result.exceptionDetails.exception?.description ?? out.result.exceptionDetails.text);
    return out.result?.result?.value;
  } finally {
    socket?.close();
    const exited = new Promise((r) => proc.once("exit", r));
    proc.kill();
    await Promise.race([exited, sleep(5000)]); // Chrome writes its profile until it is gone
  }
}

type Measure = { i: number; label: number; field: number; formBefore: number[]; formAfter: number[]; clipped: boolean; focused: boolean; value: string; hit: number };

const DESKTOP: [number, number] = [1440, 900];
const PHONE: [number, number] = [390, 844];

async function measure(withoutFieldSizing: boolean, size: [number, number] = DESKTOP): Promise<Measure[]> {
  const home = await (await fetch(new URL("/", baseUrl))).text();
  const doc = new JSDOM(home).window.document;
  let css = "";
  for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
    const href = new URL(link.getAttribute("href")!, baseUrl);
    let sheet = await (await fetch(href)).text();
    // a file page can't load the app's web fonts, and the words' widths are the layout under test: embed them
    for (const m of new Set(sheet.match(/url\((?!["']?data:)[^)]+\)/g) ?? [])) {
      const bytes = Buffer.from(await (await fetch(new URL(m.slice(4, -1).replace(/["']/g, ""), href))).arrayBuffer());
      sheet = sheet.split(m).join(`url(data:font/woff2;base64,${bytes.toString("base64")})`);
    }
    css += sheet;
  }
  for (const style of doc.querySelectorAll("style")) css += style.textContent;
  // the app's markup as served, with its own scripts left out so only the CSS is under test
  doc.querySelectorAll("script, link[rel='stylesheet'], style").forEach((n) => n.remove());
  const style = doc.createElement("style");
  style.textContent = css;
  doc.head.append(style);

  const dir = mkdtempSync(join(tmpdir(), "theseus-field-"));
  try {
    const file = join(dir, "page.html");
    writeFileSync(file, "<!doctype html>" + doc.documentElement.outerHTML);
    return (await inChrome(file, `(async () => {
      await document.fonts.ready;
      // a browser without the property: its @supports blocks are false (dropped) and their "not" blocks true (applied)
      if (${withoutFieldSizing}) for (const s of document.styleSheets) for (let i = s.cssRules.length - 1; i >= 0; i--) {
        const r = s.cssRules[i];
        if (!(r instanceof CSSSupportsRule) || !/field-sizing/.test(r.conditionText)) continue;
        if (/^not/.test(r.conditionText)) [...r.cssRules].forEach((inner, k) => s.insertRule(inner.cssText, i + 1 + k));
        s.deleteRule(i);
      }
      const box = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10) / 10); };
      const out = [];
      for (const [i, input] of [...document.querySelectorAll('.sentence input[name="word"]')].entries()) {
        const form = input.closest("form"), label = form.querySelector("label");
        // what a tap on the middle of the word reaches: that word's own form, or whichever neighbour overlaps it
        const lr = label.getBoundingClientRect(), under = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2)?.closest("form");
        const hit = under ? [...document.querySelectorAll('.sentence form')].indexOf(under) : -1;
        input.value = ""; input.blur();
        const formBefore = box(form);
        input.focus();
        const formAfter = box(form); // choosing moves nothing; what is then typed may grow the word
        input.value = "hello";
        out.push({ i, label: label.getBoundingClientRect().width, field: input.getBoundingClientRect().width, formBefore, formAfter,
          clipped: input.scrollWidth > input.clientWidth + 1, focused: document.activeElement === input, value: input.value, hit });
        input.value = ""; input.blur();
      }
      return out;
    })()`, dir, size)) as Measure[];
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

describe("choosing a word", () => {
  for (const [name, without] of [["with field-sizing", false], ["without field-sizing (Safari, Firefox)", true]] as const) {
    it(`gives a visible field in the word's place ${name}`, async () => {
      const rows = await measure(without);
      expect(rows.length).toBe(10);
      for (const r of rows) {
        expect(r.focused, `word ${r.i} takes focus`).toBe(true);
        expect(r.value, `word ${r.i} takes typing`).toBe("hello");
        // visible: at least as wide as the word it replaces, never a zero-width field
        expect(r.field, `word ${r.i}: the field is as wide as its word`).toBeGreaterThanOrEqual(r.label - 0.5);
        expect(r.field, `word ${r.i}: the field has width`).toBeGreaterThan(8);
        // what is typed is not cut off
        expect(r.clipped, `word ${r.i}: typing "hello" is not clipped`).toBe(false);
        // choosing a word does not move it, or change its line's height
        expect(r.formAfter, `word ${r.i}: choosing it moves nothing`).toEqual(r.formBefore);
      }
    }, 90_000);
  }

  for (const [name, size] of [["desktop 1440×900", DESKTOP], ["phone 390×844", PHONE]] as const) {
    it(`reaches the word that was touched, not a neighbour (${name})`, async () => {
      const rows = await measure(false, size);
      expect(rows.length).toBe(10);
      // the middle of every word belongs to that word: neighbouring short words must not cover each other
      expect(rows.map((r) => r.hit)).toEqual(rows.map((r) => r.i));
    }, 90_000);
  }
});
