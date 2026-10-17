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
    const doc = new JSDOM("<!doctype html><title>t</title><p id=x>here</p>").window.document;
    const out = await measureIn(doc, "document.getElementById('x').textContent + ' ' + innerWidth", [800, 600]);
    expect(out).toBe("here 800");
  }, 30_000);
});
