import * as THREE from "three";
import { describe, expect, inject, it } from "vitest";
import { classifyMoment, type KeptShip } from "../src/lib/kept-moment";
import { flightTarget, KEPT_POSE, LIVE_POSE, PALLET_SLOTS, partHome } from "../src/lib/ship/stage";
import { leavesAt } from "../src/lib/ship/motion";
import { liveIn } from "./chrome";

// The plank's flight (docs/decisions/0005-the-ship.md): once the server has
// accepted a change, the old plank flies from the live ship to its place in
// the one harbour: the kept ship's gap when it belongs to the ship shown, a
// slot on the pallet when it belongs to the next; for this visitor's own
// change and for every other visitor's change arriving live; never on a load,
// a snapshot or a reconnect. The waiting word lands in its row with the
// plank. With reduced motion nothing flies.
//
// Where it flies is pure (src/lib/ship/stage.ts), checked here without a
// renderer. That it happens on a real page, for another visitor's change, is
// checked in headless Chrome against the local app (a second visitor makes
// the change over HTTP, with its own cookie): the word arrives, a plank is in
// flight for that place (the harbour's data-flying; the sea moves every
// frame, so movement is no evidence) and lands, and a waiting word lands in
// its row only with its plank. How it looks is the maker's judgement, from
// frame sequences, never claimed by a check.

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const localOnly = (name: string, fn: () => Promise<void>, timeout?: number) => it.skipIf(!local)(local ? name : `${name} [skipped: APP_URL is not local]`, fn, timeout);

// the ship shown has two gaps (places 4 and 9), so replacing one crosses without completing it
const ship = (k: Partial<KeptShip> = {}): KeptShip => ({ words: Array(10).fill("w"), gaps: Array(10).fill(false).map((_, i) => i === 3 || i === 8), next: Array(10).fill(null), ...k });

describe("where a plank flies", () => {
  it("flies a plank that crosses into the ship shown to its own gap on the kept ship", () => {
    const before = ship(), after = ship({ gaps: Array(10).fill(false).map((_, i) => i === 3) });
    const moment = classifyMoment(before, after, 8)!;
    expect(moment.kind).toBe("cross");
    const to = flightTarget(moment, after);
    const gap = partHome(8, KEPT_POSE);
    expect(to.distanceTo(gap), "the plank doesn't fly to its own gap").toBeLessThan(1e-6);
  });

  it("flies a plank for the next ship to a slot on the pallet, never to the kept ship", () => {
    // place 3 is already kept in the ship shown: its next replacement belongs to the next ship
    const before = ship(), after = ship({ next: Array(10).fill(null).map((_, i) => (i === 2 ? "was" : null)) });
    const moment = classifyMoment(before, after, 2)!;
    expect(moment.kind).toBe("wait");
    const to = flightTarget(moment, after);
    expect(PALLET_SLOTS.some((s) => s.distanceTo(to) < 1e-6), "the plank doesn't fly to a pallet slot").toBe(true);
    expect(to.distanceTo(partHome(2, KEPT_POSE)), "the plank flies to the kept ship").toBeGreaterThan(1);
  });

  it("gives each waiting plank its own slot on the pallet, in place order, and no two the same", () => {
    const next = Array(10).fill(null).map((_, i) => (i % 3 === 0 ? `w${i}` : null));
    const slots = next.flatMap((w, i) => (w === null ? [] : [flightTarget({ position: i, kind: "wait" }, ship({ next }))]));
    for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) expect(slots[a].distanceTo(slots[b]), "two planks share a slot").toBeGreaterThan(0.3);
    expect(PALLET_SLOTS.length, "the pallet can't hold every waiting plank").toBeGreaterThanOrEqual(10);
  });

  it("flies from the live ship: the start is the part where it stands on the live ship", () => {
    for (let p = 0; p < 10; p++) {
      const live = partHome(p, LIVE_POSE), kept = partHome(p, KEPT_POSE);
      expect(live.distanceTo(kept), `part ${p + 1} starts where it lands`).toBeGreaterThan(1);
    }
  });

  it("brings no flight from a snapshot: no moment, no target", () => {
    expect(classifyMoment(ship(), ship(), null as unknown as number)).toBeNull();
  });
});

// A second browser makes the change: a fresh visitor with its own cookie, from node, once the watched page
// has drawn its harbour and taken its first snapshot (the steps wait for both), while the page's expression is
// already watching for the word.
async function secondVisitor(position: number, word: string): Promise<boolean> {
  const r0 = await fetch(new URL("/", baseUrl));
  const cookie = r0.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const v = (await r0.text()).match(new RegExp(`name="position" value="${position}"><input type="hidden" name="version" value="([0-9]+)"`))![1];
  const res = await fetch(new URL("/replace", baseUrl), { method: "POST", redirect: "manual", headers: { cookie, origin: new URL(baseUrl).origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ position: String(position), version: v, word }) });
  return res.status === 303;
}
const fresh = (k: string) => `${k}${Date.now().toString(36).replace(/\d/g, (d) => "abcdefghij"[+d])}`;
// the page is ready to watch: its harbour drawn, and the live stream's first snapshot taken
const READY = `(async () => {
  const h = document.querySelector('#harbour');
  for (let i = 0; i < 150 && !h.hasAttribute('data-ready'); i++) await new Promise((r) => setTimeout(r, 100));
  if (!h.hasAttribute('data-ready')) throw new Error('the harbour never drew');
  await new Promise((r) => setTimeout(r, 800));
})()`;

// whether a position's next replacement crosses into the ship shown or waits for the next, read from GET /
async function moments(): Promise<{ crossing: number | null; waiting: number | null }> {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  const versions = [...html.matchAll(/name="version" value="(\d+)"/g)].map((m) => Number(m[1]));
  const m0 = Math.min(...versions);
  // version m0: its word is in the ship shown (a crossing, or its gap); m0+1: the next ship, waiting
  return { crossing: versions.findIndex((v) => v === m0), waiting: versions.findIndex((v) => v === m0 + 1) };
}

describe("a plank flying on a real page, for another visitor's change", () => {
  const watch = (position: number, word: string) => `(async () => {
    const harbour = document.querySelector('#harbour');
    const label = () => document.querySelectorAll('.sentence-strip .sentence label')[${position}].textContent.trim();
    const waiting = () => [...document.querySelectorAll('.kept-strip .waiting .ws .w')].map((w) => w.textContent);
    const before = waiting();
    for (let i = 0; i < 500 && label() !== ${JSON.stringify(word)}; i++) await new Promise((r) => setTimeout(r, 20));
    const t0 = performance.now(), arrived = label() === ${JSON.stringify(word)};
    const shots = [];
    for (const at of [300, 900, ${leavesAt(false) + 500}, 3600]) {
      await new Promise((r) => setTimeout(r, Math.max(0, at - (performance.now() - t0))));
      shots.push({ at, waiting: waiting(), flying: harbour.getAttribute('data-flying') });
    }
    return { arrived, before, shots };
  })()`;
  type Run = { arrived: boolean; before: string[]; shots: { at: number; waiting: string[]; flying: string | null }[] };
  const run = async (position: number, word: string) => {
    let ok = false;
    const m = (await liveIn(new URL("/", baseUrl).href, watch(position, word), [1440, 900], { steps: [READY], then: async () => { ok = await secondVisitor(position, word); } })) as Run;
    return { ok, ...m };
  };

  localOnly("flies another visitor's replaced plank to the slipway: the word arrives and the harbour moves", async () => {
    const { crossing } = await moments();
    expect(crossing, "no position crosses into the ship shown").not.toBeNull();
    const word = fresh("crossed");
    const m = await run(crossing!, word);
    expect(m.ok, "the second visitor's change was refused").toBe(true);
    expect(m.arrived, "another visitor's word never reached the page").toBe(true);
    // the sea moves every frame, so movement alone proves nothing: a plank is in flight, for this place
    expect(m.shots.slice(0, 2).some((s) => s.flying === String(crossing! + 1)), "no plank flew for another visitor's change").toBe(true);
    expect(m.shots.at(-1)!.flying, "the plank was still flying long after it should have landed").toBeNull();
  }, 120_000);

  localOnly("flies a plank for the next ship to the pallet, its word landing in the row only with the plank", async () => {
    const { waiting } = await moments();
    if (waiting === null || waiting < 0) {
      // make one: replace the oldest position once, so some position stands at the next ship's version
      const { crossing } = await moments();
      expect(await secondVisitor(crossing!, fresh("first")), "staging a position for the next ship was refused").toBe(true);
    }
    const w = (await moments()).waiting;
    expect(w !== null && w >= 0, "no position waits for the next ship").toBe(true);
    const word = fresh("waited");
    const m = await run(w!, word);
    expect(m.ok && m.arrived, "the second visitor's change never reached the page").toBe(true);
    const grew = (s: { waiting: string[] }) => s.waiting.length > m.before.length;
    expect(grew(m.shots[0]), "the waiting word landed before its plank had left (300 ms)").toBe(false);
    expect(grew(m.shots[2]), "the waiting word didn't land once its plank had").toBe(true);
    expect(m.shots.slice(0, 2).some((s) => s.flying === String(w! + 1)), "no plank flew to the pallet").toBe(true);
  }, 120_000);

  localOnly("flies nothing on a load: a fresh page's harbour stands still once drawn", async () => {
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => {
      const h = document.querySelector('#harbour');
      for (let i = 0; i < 150 && !h.hasAttribute('data-ready'); i++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 1500));
      return { ready: h.hasAttribute('data-ready'), flying: h.getAttribute('data-flying') };
    })()`, [1440, 900], { reducedMotion: true })) as { ready: boolean; flying: string | null };
    expect(m.ready, "the harbour never drew").toBe(true);
    expect(m.flying, "a plank is flying on a fresh load").toBeNull();
  }, 60_000);
});
