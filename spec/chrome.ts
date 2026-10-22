import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";

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

// Opens the file in headless Chrome over its debugging port, runs the expression in the page, returns its value.
async function inChrome(file: string, expression: string, dir: string, size: [number, number]): Promise<unknown> {
  // Port 0: this Chrome picks a free port and writes it into its own fresh
  // profile, so a measurement can never reach another Chrome (one left over
  // on a guessed port used to take a launch's page and hang it).
  const profile = join(dir, "profile");
  const proc = spawn(chrome(), ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
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
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`file://${file}`)}`, { method: "PUT" })).json();
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
