import * as THREE from "three";
import { describe, expect, inject, it } from "vitest";
import { classifyMoment, type KeptShip } from "../src/lib/kept-moment";
import { buildShip } from "../src/lib/ship/build";
import { followView, flightAt, flightTarget, home, KEPT_POSE, LIVE_POSE, PALLET_PLANK, PALLET_SLOTS, partHome, place, posed } from "../src/lib/ship/stage";
import { arrivalAt, leavesAt } from "../src/lib/ship/motion";
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

// The flight as a visitor sees it, through the page's own camera at 1440×900 and 390×844 (the harbour's box
// at each, measured on the served page: 1440×722 under a new visitor's full band, the smaller of the two,
// and 390×351 on a phone): halfway through its flight, the plank is out over the water
// between the two ships, no bigger than it stood on the live ship, and the gap it flies to is still an
// outline. (Seen on 30 October: the copy flew at 1.69 times its size and was over the slipway by 300 ms.)
const HARBOURS = [["1440×900", "desktop", 1440, 722], ["390×844", "phone", 390, 351]] as const;
function onScreen(cam: THREE.PerspectiveCamera, p: THREE.Vector3) { const v = p.clone().project(cam); return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 }; }
function screenSize(cam: THREE.PerspectiveCamera, centre: THREE.Vector3, size: number, heightPx: number) {
  const a = centre.clone().project(cam), b = centre.clone().add(new THREE.Vector3(0, size, 0)).project(cam);
  return (Math.abs(b.y - a.y) / 2) * heightPx;
}

describe("the flight, at its midpoint", () => {
  for (const [name, layout, w, h] of HARBOURS) {
    const aspect = w / h;
    for (const [what, position] of [["the hull", 1], ["the stern", 3]] as const) {
      for (const dest of ["slipway", "pallet"] as const) {
        it(`flies ${what} over the water, its own size, to the ${dest}, the gap still an outline (${name})`, () => {
          const cam = new THREE.PerspectiveCamera();
          place(cam, layout, aspect);
          const ship = buildShip(["make", "anchor", "website", "that", "people", "would", "miss", "if", "it", "disappeared"]);
          posed(ship.root, LIVE_POSE);
          ship.root.updateMatrixWorld(true);
          const part = new THREE.Box3().setFromObject(ship.groups[position]), from = part.getCenter(new THREE.Vector3());
          const partSize = part.getSize(new THREE.Vector3()), largest = Math.max(partSize.x, partSize.y, partSize.z);
          const to = dest === "slipway" ? partHome(position, KEPT_POSE) : PALLET_SLOTS[0];
          const s1 = dest === "pallet" ? PALLET_PLANK / largest / LIVE_POSE.scale : 1;
          const mid = flightAt(from, to, 0.5, s1, dest === "pallet");
          ship.dispose();
          const a = onScreen(cam, from), b = onScreen(cam, to), m = onScreen(cam, mid.position);
          // between the two ships: a good part of the way across, neither still on the live ship nor already there
          const across = (m.x - a.x) / (b.x - a.x);
          expect(across, `halfway through, the plank is ${(100 * across).toFixed(0)}% of the way across`).toBeGreaterThan(0.25);
          expect(across).toBeLessThan(0.75);
          expect(m.y, "halfway through, the plank isn't above the water").toBeLessThan(Math.max(a.y, b.y));
          // its own size: never bigger than it stood on the live ship
          expect(mid.scale, `halfway through, the plank is ${mid.scale.toFixed(2)} times its size on the ship`).toBeLessThanOrEqual(1 + 1e-6);
          // the gap it flies to is still an outline: the kept part hasn't begun to show
          expect(arrivalAt(leavesAt(false) * 0.5).opacity, "the kept part shows before its plank has arrived").toBe(0);
        });
      }
    }
  }

  // A waiting plank on the pallet is a plank you can see, not a speck: at least 28px across at either size.
  for (const [name, layout, w, h] of HARBOURS) {
    it(`sets a waiting plank on the pallet large enough to see (${name})`, () => {
      const cam = new THREE.PerspectiveCamera();
      place(cam, layout, w / h);
      const px = screenSize(cam, PALLET_SLOTS[0], PALLET_PLANK, h);
      expect(px, `a waiting plank is ${px.toFixed(0)}px tall`).toBeGreaterThanOrEqual(28);
    });
  }
});

// The pallet stands where it's seen whole (the maker, 30 October: it sat behind the slipway's edge): from the
// fixed view at 1440 and 390, every slot's plank is inside the harbour's frame and clear of the kept ship at its
// tallest, so no part of the kept ship or its mast stands in front of a waiting plank.
describe("the pallet, in view", () => {
  for (const [name, layout, w, h] of HARBOURS) {
    it(`shows every waiting plank whole, in the frame and clear of the kept ship (${name})`, () => {
      const cam = new THREE.PerspectiveCamera();
      place(cam, layout, w / h);
      const tall = buildShip(Array(10).fill("bookkeeper"));
      posed(tall.root, KEPT_POSE);
      tall.root.updateMatrixWorld(true);
      const kept = new THREE.Box3().setFromObject(tall.root);
      tall.dispose();
      const screenBox = (b: THREE.Box3) => {
        const r = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity }, v = new THREE.Vector3();
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
          v.set(x, y, z).project(cam);
          const sx = ((v.x + 1) / 2) * w, sy = ((1 - v.y) / 2) * h;
          r.l = Math.min(r.l, sx); r.r = Math.max(r.r, sx); r.t = Math.min(r.t, sy); r.b = Math.max(r.b, sy);
        }
        return r;
      };
      const k = screenBox(kept);
      // the kept ship's own frame stands behind any plank that overlaps it only if the plank is nearer the camera
      const camDist = (p: THREE.Vector3) => p.distanceTo(cam.position);
      for (const [i, slot] of PALLET_SLOTS.entries()) {
        const half = PALLET_PLANK / 2, b = new THREE.Box3(slot.clone().subScalar(half), slot.clone().addScalar(half)), p = screenBox(b);
        expect(p.l >= 0 && p.r <= w && p.t >= 0 && p.b <= h, `slot ${i + 1}'s plank runs out of the frame`).toBe(true);
        const overlaps = p.l < k.r && k.l < p.r && p.t < k.b && k.t < p.b;
        if (overlaps) expect(camDist(slot), `slot ${i + 1}'s plank stands behind the kept ship`).toBeLessThan(camDist(kept.getCenter(new THREE.Vector3())) - kept.getSize(new THREE.Vector3()).z / 2);
      }
    });
  }
});

// On a phone the camera follows the plank (decision 0005): it starts and ends at the fixed view, and halfway
// through the flight both the plank and where it lands are in frame. A desktop never moves the camera for a flight.
describe("the phone's camera, following a plank", () => {
  for (const dest of ["slipway", "pallet"] as const) {
    it(`frames the plank and where it lands, and comes back (390×844, to the ${dest})`, () => {
      const [, layout, w, h] = HARBOURS[1];
      const from = partHome(1, LIVE_POSE), to = dest === "slipway" ? partHome(1, KEPT_POSE) : PALLET_SLOTS[0];
      const fixed = home(layout);
      for (const k of [0, 1]) {
        const v = followView(layout, from, to, k);
        expect(v.position, `the camera isn't at its fixed view at ${k}`).toEqual(fixed.position);
        expect(v.target).toEqual(fixed.target);
      }
      const v = followView(layout, from, to, 0.5), cam = new THREE.PerspectiveCamera(v.fov, w / h, 0.1, 400);
      cam.position.set(...v.position); cam.lookAt(...v.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      const inFrame = (p: THREE.Vector3) => { const q = p.clone().project(cam); return Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1; };
      expect(inFrame(flightAt(from, to, 0.5, 1, false).position), "halfway, the plank is out of frame").toBe(true);
      expect(inFrame(to), "halfway, where it lands is out of frame").toBe(true);
      // and it really moved: the follow isn't the fixed view
      expect(new THREE.Vector3(...v.position).distanceTo(new THREE.Vector3(...fixed.position)), "the camera didn't follow").toBeGreaterThan(1);
    });
  }
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
