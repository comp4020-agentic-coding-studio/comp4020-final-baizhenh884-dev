import * as THREE from "three";
import { describe, expect, inject, it } from "vitest";
import { classifyMoment, type KeptShip } from "../src/lib/kept-moment";
import { buildShip } from "../src/lib/ship/build";
import { carryPath, catchPoint, CREW_MAX, crewSpots, followView, flightTarget, home, KEPT_POSE, LIVE_POSE, onQuay, PALLET_PLANK, PALLET_SLOTS, partHome, place, posed, tossAt } from "../src/lib/ship/stage";
import { arrivalAt, carryAt, landsAt } from "../src/lib/ship/motion";
import { liveIn } from "./chrome";

// The plank's carry (docs/decisions/0005-the-ship.md, amended 31 October):
// once the server has accepted a change, the old plank is tossed in a short
// arc from the live ship to the quay's edge, a shipwright catches it and
// carries it to its place in the one harbour: the kept ship's gap when it
// belongs to the ship shown, a slot on the pallet when it belongs to the
// next; for this visitor's own change and for every other visitor's change
// arriving live; never on a load, a snapshot or a reconnect. A new change
// finishes any carry still under way at once. The waiting word lands in its
// row with the plank. With reduced motion nothing is tossed or carried.
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

// The carry as a visitor sees it, through the page's own camera at 1440×900 and 390×844 (the harbour's box at
// each, measured on the served page: 1440×722 under a new visitor's full band, the smaller of the two, and
// 390×351 on a phone): at the end of its toss the plank is at the quay's edge, out of the live ship and its own
// size, and the gap it goes to is still an outline; while it's carried it's over the quay, never the water, and
// the shipwright carrying it stands on the quay too.
const HARBOURS = [["1440×900", "desktop", 1440, 722], ["390×844", "phone", 390, 351]] as const;
function onScreen(cam: THREE.PerspectiveCamera, p: THREE.Vector3) { const v = p.clone().project(cam); return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 }; }
function screenSize(cam: THREE.PerspectiveCamera, centre: THREE.Vector3, size: number, heightPx: number) {
  const a = centre.clone().project(cam), b = centre.clone().add(new THREE.Vector3(0, size, 0)).project(cam);
  return (Math.abs(b.y - a.y) / 2) * heightPx;
}
const SENTENCE = ["make", "anchor", "website", "that", "people", "would", "miss", "if", "it", "disappeared"];
const liveBox = () => { const ship = buildShip(SENTENCE); posed(ship.root, LIVE_POSE); ship.root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(ship.root); ship.dispose(); return b; };

describe("the carry, step by step", () => {
  for (const [what, position] of [["the hull", 1], ["the stern", 3]] as const) {
    for (const dest of ["slipway", "pallet"] as const) {
      const from = partHome(position, LIVE_POSE), to = dest === "slipway" ? partHome(position, KEPT_POSE) : PALLET_SLOTS[0];
      const caught = catchPoint(position);

      it(`tosses ${what} out of the live ship to the quay's edge, a short arc, the gap still an outline (to the ${dest})`, () => {
        const live = liveBox();
        expect(tossAt(from, caught, 0).distanceTo(from), "the toss doesn't start where the part stood").toBeLessThan(1e-6);
        expect(tossAt(from, caught, 1).distanceTo(caught), "the toss doesn't end at the catch").toBeLessThan(1e-6);
        expect(live.containsPoint(caught), "the catch is inside the live ship").toBe(false);
        expect(onQuay(caught.x, caught.z), "the catch isn't on the quay").toBe(true);
        // short: it rises a little over its way, never the old long arc over the water
        let top = -Infinity;
        for (let k = 0; k <= 1; k += 0.05) top = Math.max(top, tossAt(from, caught, k).y);
        expect(top - Math.max(from.y, caught.y), "the toss isn't an arc").toBeGreaterThan(0.4);
        expect(top - Math.max(from.y, caught.y), "the toss is a long arc, not a short one").toBeLessThan(3);
        expect(arrivalAt(carryAt(700).toss === 1 ? 700 : 0).opacity, "the kept part shows as the plank is caught").toBe(0);
      });

      it(`carries ${what} over the quay, never the water, with its shipwright on the quay (to the ${dest})`, () => {
        for (let c = 0; c <= 1; c += 0.05) {
          const p = carryPath(caught, to, c);
          expect(onQuay(p.figure.x, p.figure.z), `the shipwright is off the quay at ${c.toFixed(2)}`).toBe(true);
          expect(onQuay(p.plank.x, p.plank.z), `the plank is over the water at ${c.toFixed(2)}`).toBe(true);
          expect(p.plank.y, "the plank is under the shipwright's feet").toBeGreaterThan(p.figure.y);
        }
        expect(carryPath(caught, to, 0).plank.distanceTo(caught), "the carry doesn't start where the plank was caught").toBeLessThan(0.6);
        expect(carryPath(caught, to, 1).plank.distanceTo(to), "the carry doesn't end at its place").toBeLessThan(1e-6);
      });
    }
  }

  for (const [name, layout, w, h] of HARBOURS) {
    it(`keeps every waiting shipwright on the quay, in the frame and clear of the live hull (${name})`, () => {
      const cam = new THREE.PerspectiveCamera();
      place(cam, layout, w / h);
      expect(CREW_MAX).toBe(8);
      expect(crewSpots(20)).toHaveLength(CREW_MAX);
      expect(crewSpots(0)).toHaveLength(0);
      const ship = buildShip(SENTENCE);
      posed(ship.root, LIVE_POSE);
      ship.root.updateMatrixWorld(true);
      const hull = new THREE.Box3().setFromObject(ship.groups[1]);
      ship.dispose();
      const spots = crewSpots(CREW_MAX);
      for (const [i, s] of spots.entries()) {
        expect(onQuay(s.x, s.z), `shipwright ${i + 1} stands in the water`).toBe(true);
        const v = s.clone().add(new THREE.Vector3(0, 1, 0)).project(cam);
        expect(Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1, `shipwright ${i + 1} is out of the frame`).toBe(true);
        // never between the camera and the hull: a figure's height in front of the hull's box, on screen
        const a = onScreen(cam, s), hb = [hull.min, hull.max].map((p) => onScreen(cam, p));
        const overHull = a.x > Math.min(hb[0].x, hb[1].x) && a.x < Math.max(hb[0].x, hb[1].x) && s.z > hull.max.z;
        expect(overHull, `shipwright ${i + 1} stands in front of the live hull`).toBe(false);
      }
      for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) expect(spots[a].distanceTo(spots[b]), "two shipwrights stand in one place").toBeGreaterThan(0.6);
    });
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
// fixed view at 1440 and 390, every slot's plank is inside the harbour's frame, and nothing of the kept ship (its
// real geometry, at its tallest) stands between the camera and any part of the plank: rays from the camera to the
// plank's centre and corners reach the plank before they meet the kept ship.
describe("the pallet, in view", () => {
  for (const [name, layout, w, h] of HARBOURS) {
    it(`shows every waiting plank whole, in the frame and clear of the kept ship (${name})`, () => {
      const cam = new THREE.PerspectiveCamera();
      place(cam, layout, w / h);
      const tall = buildShip(Array(10).fill("bookkeeper"));
      posed(tall.root, KEPT_POSE);
      tall.root.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      for (const [i, slot] of PALLET_SLOTS.entries()) {
        const half = PALLET_PLANK / 2;
        const points = [slot.clone(), ...[-1, 1].flatMap((x) => [-1, 1].map((y) => slot.clone().add(new THREE.Vector3(x * half, y * half * 0.6, half))))];
        for (const p of points) {
          const v = p.clone().project(cam);
          expect(Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1, `slot ${i + 1}'s plank runs out of the frame`).toBe(true);
          const dir = p.clone().sub(cam.position), dist = dir.length();
          ray.set(cam.position, dir.normalize());
          const hit = ray.intersectObject(tall.root, true).find((x) => (x.object as THREE.Mesh).isMesh);
          expect(hit && hit.distance < dist - 0.05, `the kept ship stands in front of slot ${i + 1}'s plank`).toBeFalsy();
        }
      }
      tall.dispose();
    });
  }
});

// On a phone the camera follows the plank (decision 0005): it starts and ends at the fixed view, and halfway
// through the carry both the plank and where it's set down are in frame. A desktop never moves the camera for it.
describe("the phone's camera, following a plank", () => {
  for (const dest of ["slipway", "pallet"] as const) {
    it(`frames the plank and where it's set down, and comes back (390×844, to the ${dest})`, () => {
      const [, layout, w, h] = HARBOURS[1];
      const from = partHome(1, LIVE_POSE), to = dest === "slipway" ? partHome(1, KEPT_POSE) : PALLET_SLOTS[0], caught = catchPoint(1);
      const fixed = home(layout);
      for (const k of [0, 1]) {
        const v = followView(layout, from, to, k);
        expect(v.position, `the camera isn't at its fixed view at ${k}`).toEqual(fixed.position);
        expect(v.target).toEqual(fixed.target);
      }
      const v = followView(layout, from, to, 0.5), cam = new THREE.PerspectiveCamera(v.fov, w / h, 0.1, 400);
      cam.position.set(...v.position); cam.lookAt(...v.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      const inFrame = (p: THREE.Vector3) => { const q = p.clone().project(cam); return Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1; };
      expect(inFrame(carryPath(caught, to, 0.5).plank), "halfway, the plank is out of frame").toBe(true);
      expect(inFrame(to), "halfway, where it's set down is out of frame").toBe(true);
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
    for (const at of [300, 900, ${landsAt(false) + 400}, 4600]) {
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
    expect(grew(m.shots[0]) || grew(m.shots[1]), "the waiting word landed before its plank was set down").toBe(false);
    expect(grew(m.shots[2]), "the waiting word didn't land once its plank was set down").toBe(true);
    expect(m.shots.slice(0, 2).some((s) => s.flying === String(w! + 1)), "no plank flew to the pallet").toBe(true);
  }, 120_000);

  // A new change finishes any carry still under way at once: a first plank carried to the rack, then a second
  // visitor's change 600 ms into that carry. The first plank is set down at once, so its waiting word is in the
  // row right after the second change (it lands only with its plank), while the second plank is on its way
  // (data-flying names its place), and everything is set down in the end.
  localOnly("finishes a carry still under way at once when a second change arrives", async () => {
    if ((await moments()).waiting! < 0) {
      const { crossing } = await moments();
      expect(await secondVisitor(crossing!, fresh("first")), "staging a position for the next ship was refused").toBe(true);
    }
    const { waiting, crossing } = await moments();
    expect(waiting !== null && waiting >= 0 && crossing !== null && crossing >= 0 && waiting !== crossing, "no waiting and crossing pair to stage").toBe(true);
    const a = fresh("firstcarry"), b = fresh("secondcarry");
    const ok = [false, false];
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => {
      const harbour = document.querySelector('#harbour');
      const label = (p) => document.querySelectorAll('.sentence-strip .sentence label')[p].textContent.trim();
      const row = () => [...document.querySelectorAll('.kept-strip .waiting .ws .w')].map((w) => w.textContent.trim());
      for (let i = 0; i < 500 && label(${waiting}) !== ${JSON.stringify(a)}; i++) await new Promise((r) => setTimeout(r, 20));
      const during = { flying: harbour.getAttribute('data-flying'), row: row() };
      for (let i = 0; i < 500 && label(${crossing}) !== ${JSON.stringify(b)}; i++) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => setTimeout(r, 150));
      const after = { flying: harbour.getAttribute('data-flying'), row: row() };
      await new Promise((r) => setTimeout(r, 4200));
      return { during, after, end: harbour.getAttribute('data-flying') };
    })()`, [1440, 900], { steps: [READY], then: async () => {
      ok[0] = await secondVisitor(waiting!, a);
      await new Promise((r) => setTimeout(r, 600));
      ok[1] = await secondVisitor(crossing!, b);
    } })) as { during: { flying: string | null; row: string[] }; after: { flying: string | null; row: string[] }; end: string | null };
    expect(ok, "a change was refused").toEqual([true, true]);
    expect(m.during.flying, "the first plank was never carried").toBe(String(waiting! + 1));
    expect(m.during.row, "the first word landed before its plank was set down").not.toContain(a);
    expect(m.after.row, "the second change didn't finish the first carry: its word isn't in the row").toContain(a);
    expect(m.after.flying, "the second plank isn't on its way").toBe(String(crossing! + 1));
    expect(m.end, "a plank was still on its way long after it should have been set down").toBeNull();
  }, 120_000);

  // The shipwrights are drawn from the stream's total, at most CREW_MAX of them, and change as views open and
  // close: the harbour says how many it draws (data-crew, read by this check only: never text a visitor reads, and
  // spec/present-only.test.ts keeps the total off the page's words).
  localOnly("draws one shipwright per open view, up to the cap, and follows views opening and closing", async () => {
    let extra: AbortController[] = [];
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => {
      const harbour = document.querySelector('#harbour');
      const read = () => Number(harbour.getAttribute('data-crew') ?? 0);
      for (let i = 0; i < 50 && read() === 0; i++) await new Promise((r) => setTimeout(r, 100));
      const alone = read();
      await new Promise((r) => setTimeout(r, 2500));
      const more = read();
      await new Promise((r) => setTimeout(r, 2500));
      return { alone, more, after: read() };
    })()`, [1440, 900], { steps: [READY], then: async () => {
      await new Promise((r) => setTimeout(r, 600));
      extra = await Promise.all([0, 1].map(async () => { const c = new AbortController(); await fetch(new URL("/events", baseUrl), { headers: { accept: "text/event-stream" }, signal: c.signal }); return c; }));
      await new Promise((r) => setTimeout(r, 2500));
      for (const c of extra) c.abort();
    } })) as { alone: number; more: number; after: number };
    expect(m.alone, "no shipwright for this view").toBeGreaterThanOrEqual(1);
    expect(m.more, "two more views didn't add two shipwrights").toBe(Math.min(CREW_MAX, m.alone + 2));
    expect(m.after, "closing them didn't take their shipwrights away").toBe(m.alone);
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
