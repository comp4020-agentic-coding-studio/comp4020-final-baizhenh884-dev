import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { sizeStep } from "../src/lib/sentence-step";
import { renderKeptSentence, renderWaiting } from "../src/lib/kept-sentence";

// Layout checks: jsdom has no layout, so these build a page from the app's own
// served markup and stylesheet and measure it in headless Chrome.
//
// Needs Chrome: set CHROME to its binary, or have google-chrome / chromium at
// the usual path. It fails, never skips, when there is none.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A query helper for use inside a measureIn() expression (it runs in the
// measured page, not in Node, so it's a string of browser JS, not a
// function). A missing element is a dead end mid-measurement with no way to
// say more than "not found" unless the failure carries its own context: an
// unreproduced CI failure once reported a missing element with nothing to
// show whether the page had even loaded. This names the selector and what
// the document actually was at that moment (URL, ready state, title, the
// start of its body) so a recurrence explains itself without a retry.
export const QUERY_JS = `(s) => {
  const el = document.querySelector(s);
  if (el) return el;
  throw new Error('GET / has no ' + s + ' | url=' + document.URL + ' readyState=' + document.readyState +
    ' title=' + JSON.stringify(document.title) + ' body(300)=' + JSON.stringify(document.body ? document.body.innerHTML.slice(0, 300) : null));
}`;

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

// What a live page load may change about the browser: extra Chrome flags (e.g. --disable-webgl), scripts off,
// reduced motion, and steps to run in the page (each awaited, in order) before the expression measures it.
export type LiveOptions = { flags?: string[]; noScript?: boolean; reducedMotion?: boolean; steps?: string[]; settleMs?: number };

// Opens the page (a file, or the app's URL) in headless Chrome over its debugging port, runs the expression in it, returns its value.
async function inChrome(file: string, expression: string, dir: string, size: [number, number], opts: LiveOptions = {}): Promise<unknown> {
  // Port 0: this Chrome picks a free port and writes it into its own fresh
  // profile, so a measurement can never reach another Chrome (one left over
  // on a guessed port used to take a launch's page and hang it).
  const profile = join(dir, "profile");
  const proc = spawn(chrome(), ["--headless=new", "--disable-gpu", "--no-sandbox", ...(opts.flags ?? []), "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let socket: WebSocket | undefined;
  try {
    let port = 0;
    for (let i = 0; !port; i++) {
      try { port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]); } catch { /* not written yet */ }
      if (!port) { if (i > 200 || proc.exitCode !== null) throw new Error("Chrome did not start"); await sleep(100); }
    }
    for (let i = 0; ; i++) {
      try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { if (i > 200) throw new Error("Chrome did not answer"); await sleep(100); }
    }
    const live = /^https?:/.test(file);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = (socket = new WebSocket(target.webSocketDebuggerUrl));
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map<number, (m: any) => void>();
    ws.onmessage = (m) => { const x = JSON.parse(String(m.data)); if (x.id && pending.has(x.id)) { pending.get(x.id)!(x); pending.delete(x.id); } };
    const send = (method: string, params: object = {}) => new Promise<any>((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
    // A phone-sized viewport (the app's own breakpoint, 900px) is measured the
    // way the marking environment actually sees it: Chrome DevTools' device
    // toolbar, which emulates a touch device (mobile: true) for every phone
    // preset. Desktop-mode emulation at a narrow width is a different, unmarked
    // device: on classic scrollbars (Linux, Windows) it reserves a scrollbar
    // track `innerWidth` doesn't report, so a full-width element measures short
    // of the viewport (spec/chrome-harness.test.ts).
    const mobile = size[0] <= 900;
    await send("Emulation.setDeviceMetricsOverride", { width: size[0], height: size[1], deviceScaleFactor: 1, mobile });
    if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    if (opts.noScript) await send("Emulation.setScriptExecutionDisabled", { value: true });
    if (opts.reducedMotion) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    // navigated only once the device is set, so the page loads as this device would load it
    const page = live ? new URL(file).href : new URL(`file://${file}`).href;
    await send("Page.enable");
    await send("Page.navigate", { url: page });
    // Loaded means this page, complete: a new tab that hasn't begun its navigation is still about:blank, whose
    // readyState is already "complete", and a check measured there found no page at all (url=about:blank in CI).
    for (let i = 0; ; i++) {
      const ready = await send("Runtime.evaluate", { expression: "[document.URL, document.readyState]", returnByValue: true });
      const [url, state] = ready.result?.result?.value ?? [];
      if (url === page && state === "complete") break;
      if (i > 200) throw new Error(`the page did not load: the tab is on ${url} (${state}), not ${page}`);
      await sleep(100);
    }
    if (opts.settleMs) await sleep(opts.settleMs);
    for (const step of opts.steps ?? []) {
      const r = await send("Runtime.evaluate", { expression: step, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    }
    const out = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (out.result?.exceptionDetails) throw new Error(out.result.exceptionDetails.exception?.description ?? out.result.exceptionDetails.text);
    return out.result?.result?.value;
  } finally {
    socket?.close();
    const exited = new Promise((r) => proc.once("exit", r));
    proc.kill();
    // Chrome writes its profile until it is gone; one that ignores SIGTERM is killed, never left running
    if ((await Promise.race([exited.then(() => true), sleep(5000).then(() => false)])) === false) {
      proc.kill("SIGKILL");
      await Promise.race([exited, sleep(5000)]);
    }
  }
}

// A page as served (GET / unless another path is named), its stylesheet (and
// web fonts) inlined, its scripts left out so only the markup and CSS are
// under test. Reads only; never changes the shared sentence.
export async function servedPage(baseUrl: string, path = "/"): Promise<Document> {
  const res = await fetch(new URL(path, baseUrl));
  const home = await res.text();
  // A layout check builds a page from this markup: if GET / didn't actually
  // serve one (a non-200, or not HTML — an unreproduced CI failure once found
  // a layout check reporting a missing element with no sign the page itself
  // was ever at fault), say so here, not as a confusing "no such element"
  // three steps later.
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("text/html")) {
    throw new Error(`GET ${path} is not a 200 HTML page: status=${res.status} content-type=${contentType || "(none)"} body(300)=${home.slice(0, 300)}`);
  }
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
  doc.querySelectorAll("script, link[rel='stylesheet'], style").forEach((n) => n.remove());
  const style = doc.createElement("style");
  style.textContent = css;
  doc.head.append(style);
  return doc;
}

// Opens one of the app's own pages (scripts and all, as a visitor's browser would) in headless Chrome at this
// size and returns the expression's value. For what only a live page shows: the canvas, the scripts, a flight.
export async function liveIn(url: string, expression: string, size: [number, number], opts: LiveOptions = {}): Promise<unknown> {
  const dir = mkdtempSync(join(tmpdir(), "theseus-live-"));
  try {
    return await inChrome(url, expression, dir, size, opts);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

// Renders the document in headless Chrome at this size and returns the expression's value.
export async function measureIn(doc: Document, expression: string, size: [number, number]): Promise<unknown> {
  const dir = mkdtempSync(join(tmpdir(), "theseus-layout-"));
  try {
    const file = join(dir, "page.html");
    writeFileSync(file, "<!doctype html>" + doc.documentElement.outerHTML);
    return await inChrome(file, expression, dir, size);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

// Stages words in a served copy of GET / exactly as GET / would render them:
// each word's label and its field's placeholder (an empty focused field is
// sized to its placeholder), and the sentence's size step. Staging only the
// labels left the server's own words in the placeholders and the server's
// step on the sentence, so a layout check measured a mix of two sentences
// that depended on what earlier spec files had left in the shared one: the
// focus-outline check once failed, intermittently, because a focused field
// was drawn at the width of a leftover word (spec/two-ships-layout.test.ts).
export function stageWords(doc: Document, words: string[]): void {
  const forms = [...doc.querySelectorAll('.sentence-strip .sentence form[action="/replace"]')];
  if (forms.length !== 10) throw new Error(`GET / has ${forms.length} word forms in .sentence-strip, not 10`);
  forms.forEach((f, i) => {
    f.querySelector("label")!.textContent = words[i];
    f.querySelector<HTMLInputElement>('input[name="word"]')!.setAttribute("placeholder", words[i]);
  });
  doc.querySelector(".sentence-strip .sentence")?.setAttribute("data-step", String(sizeStep(words)));
}

// The whole state a harbour layout check measures, set in a served copy of
// GET / exactly as the server renders it, so no check depends on what an
// earlier spec file left in the shared container (CLAUDE.md "Verification").
// Every server-derived element the harbour page shows is set here: the live
// words (labels, placeholders, versions, this visitor's mark) and the
// sentence's step; the kept sentence and the waiting row, through the page's
// own live renderers (src/lib/kept-sentence.ts, which spec/kept-sentence
// checks against what GET / serves); the question band, in full or folded;
// the visitor's trace; and the two ways back (Earlier form, Earlier ship).
export type HarbourState = {
  words: string[];
  versions?: number[];
  // the kept ship shown: its words, which positions are gaps (showing the word still standing), and the next ship's
  kept?: { words: string[]; gaps: boolean[]; next?: (string | null)[] };
  // positions holding this visitor's own word (marked in the sentence) and own kept word (marked in the kept sentence)
  mine?: number[];
  keptMine?: number[];
  // the band folds once this visitor has made a change
  band?: "full" | "folded";
  // the trace's paragraph (and any list items), or none
  trace?: { status: string; items?: string[] } | null;
  earlierForm?: number | null; // ?at=N, or none
  earlierShip?: number | null; // ?kept=k, or none
};

export function stageHarbour(doc: Document, state: HarbourState): void {
  const { words } = state;
  if (words.length !== 10) throw new Error("stageHarbour needs ten words");
  stageWords(doc, words);
  const mine = new Set(state.mine ?? []);
  doc.querySelectorAll('.sentence-strip .sentence form[action="/replace"]').forEach((f, i) => {
    const label = f.querySelector("label")!;
    label.textContent = "";
    if (mine.has(i)) { const m = doc.createElement("mark"); m.textContent = words[i]; label.append(m); } else label.textContent = words[i];
    f.querySelector<HTMLInputElement>('input[name="version"]')!.setAttribute("value", String(state.versions?.[i] ?? 1));
  });
  doc.querySelector("[data-sentence-summary]")!.textContent = `The sentence now reads: ${words.join(" ")}.`;
  const kept = state.kept ?? { words: [...words], gaps: Array(10).fill(false), next: Array(10).fill(null) };
  const keptEl = doc.querySelector(".kept-strip .kept-sentence");
  const row = doc.querySelector<HTMLElement>(".kept-strip .waiting");
  if (!keptEl || !row) throw new Error("GET / has no .kept-strip .kept-sentence or .waiting");
  renderKeptSentence(keptEl, { words: kept.words, gaps: kept.gaps, next: kept.next ?? Array(10).fill(null) }, new Set(state.keptMine ?? []));
  renderWaiting(row, kept.next ?? Array(10).fill(null));
  // the band, as GET / folds it for a visitor who has made a change (spec/question-band.test.ts)
  const band = doc.querySelector("#question");
  if (!band) throw new Error("GET / has no #question");
  if ((state.band ?? "full") === "folded") {
    band.querySelector(".ship")?.remove();
    band.querySelector(".how")?.remove();
    band.classList.add("folded");
  } else if (band.classList.contains("folded")) throw new Error("the served band is folded; stage a full band from a page served to a new visitor");
  doc.body.classList.toggle("band-folded", (state.band ?? "full") === "folded");
  doc.querySelector("main")?.classList.toggle("band-folded", (state.band ?? "full") === "folded");
  // the trace, as GET / renders it under the rule paragraph
  doc.querySelector('section[aria-labelledby="trace-heading"]')?.remove();
  if (state.trace) {
    const sec = doc.createElement("section");
    sec.setAttribute("aria-labelledby", "trace-heading");
    const h = doc.createElement("h2"); h.id = "trace-heading"; h.textContent = "Your trace";
    const p = doc.createElement("p"); p.setAttribute("role", "status"); p.textContent = state.trace.status;
    sec.append(h, p);
    if (state.trace.items?.length) { const ul = doc.createElement("ul"); ul.className = "trace-standing"; for (const t of state.trace.items) { const li = doc.createElement("li"); li.textContent = t; ul.append(li); } sec.append(ul); }
    doc.querySelector("#how")!.after(sec);
  }
  // the ways back: Earlier form in the notes (rel=prev, the HTTP contract), Earlier ship under the kept sentence
  const form = doc.querySelector('.notes a[rel="prev"]')?.closest("p");
  if (state.earlierForm == null) form?.remove();
  else if (form) form.querySelector("a")!.setAttribute("href", `?at=${state.earlierForm}`);
  else {
    const p = doc.createElement("p"); p.className = "earlier caps";
    const a = doc.createElement("a"); a.setAttribute("rel", "prev"); a.setAttribute("href", `?at=${state.earlierForm}`); a.textContent = "Earlier form";
    p.append(a);
    (doc.querySelector('.notes section[aria-labelledby="trace-heading"]') ?? doc.querySelector("#how"))!.after(p);
  }
  const ship = doc.querySelector(".kept-strip a.earlier-ship")?.closest("p");
  if (state.earlierShip == null) ship?.remove();
  else if (ship) ship.querySelector("a")!.setAttribute("href", `?kept=${state.earlierShip}`);
  else {
    const p = doc.createElement("p"); p.className = "earlier caps";
    const a = doc.createElement("a"); a.className = "earlier-ship caps"; a.setAttribute("href", `?kept=${state.earlierShip}`); a.textContent = "Earlier ship";
    p.append(a);
    doc.querySelector(".kept-strip .plate-note")!.after(p);
  }
}
