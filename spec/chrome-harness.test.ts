import { createServer, type Server } from "node:net";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { measureIn } from "./chrome";

// The layout checks' own harness (spec/chrome.ts). Each measurement must talk
// only to the Chrome it launched. A Chrome left from an earlier measurement
// (one that outlived its 5 s exit) kept its debugging port, and a later
// launch that drew the same port from a fixed range reached it instead,
// opened its page there and waited forever: the one-off 90 s/120 s timeouts in
// sentence-wrap and two-ships-layout. Here every port the old range could
// draw is held by a decoy that accepts connections and never answers; a
// measurement must still finish, in its own browser.

const decoys: Server[] = [];
const sockets = new Set<import("node:net").Socket>();

beforeAll(async () => {
  for (let port = 9700; port < 9900; port++) {
    const s = createServer((socket) => { sockets.add(socket); socket.on("error", () => {}); }); // accepts, never replies
    await new Promise<void>((resolve) => { s.once("error", () => resolve()); s.listen(port, "127.0.0.1", () => { decoys.push(s); resolve(); }); });
  }
});
afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await Promise.all(decoys.map((s) => new Promise((r) => s.close(r))));
});

describe("headless Chrome for the layout checks", () => {
  it("measures in the Chrome it launched, whatever else holds a debugging port", async () => {
    // the viewport meta every served page carries (src/layouts/Page.astro):
    // without it, mobile emulation falls back to a fixed 980px desktop-compat
    // viewport regardless of the requested width, which no real layout check
    // ever hits (every page under test declares it).
    const doc = new JSDOM('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title><p id=x>here</p>').window.document;
    const out = await measureIn(doc, "document.getElementById('x').textContent + ' ' + innerWidth", [800, 600]);
    expect(out).toBe("here 800");
  }, 30_000);

  // A phone-sized measurement (any width at or under 900, the app's own
  // breakpoint) must match what the marking environment actually sees: Chrome
  // DevTools' device toolbar, which emulates a touch device (mobile: true) for
  // every phone preset. Desktop-mode emulation at a narrow width is a
  // different, unmarked device: on Linux and Windows (classic scrollbars) its
  // vertical scrollbar reserves ~15px of layout width that `innerWidth` doesn't
  // report, so a full-width element measures short of the viewport — a gap
  // DevTools' own phone emulation never has (overlay-only, touch, no reserved
  // track). This is pinned at the harness, not per test: every phone-width
  // layout check inherits it from measureIn/inChrome.
  it("measures a phone-sized viewport the way DevTools' device toolbar does: touch, no reserved scrollbar track", async () => {
    // the viewport meta every served page carries, and a page tall enough to
    // need a vertical scrollbar, so a reserved track would show
    const doc = new JSDOM('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title><body style="margin:0"><div id=box style="width:100%;height:3000px"></div></body>').window.document;
    const out = (await measureIn(
      doc,
      "JSON.stringify({ boxWidth: document.getElementById('box').getBoundingClientRect().width, maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches })",
      [390, 844],
    )) as string;
    expect(JSON.parse(out)).toEqual({ boxWidth: 390, maxTouchPoints: 1, coarse: true });
  }, 30_000);
});
