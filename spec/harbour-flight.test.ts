import * as THREE from "three";
import { describe, expect, inject, it } from "vitest";
import { classifyMoment, type KeptShip } from "../src/lib/kept-moment";
import { buildShip } from "../src/lib/ship/build";
import { CARRIED_MIN_PX, carriedScale, FIGURE_HEIGHT, heldAt, carryPath, catchPoint, CRADLE_BLOCKS, CREW_MAX, crewSpots, followView, flightTarget, home, KEPT_POSE, LIVE_POSE, onQuay, PALLET_PLANK, PALLET_SLOTS, partHome, place, posed, tossAt } from "../src/lib/ship/stage";
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

  // Seen at 1440 (the maker, 31 October: mid-carry the figure and its armful were a few pixels, so the plank seemed to
  // vanish at the quay's edge and reappear on the slipway): from 20% to 80% of the carry the plank, at the size it's
  // carried (carriedScale), spans at least CARRIED_MIN_PX on its larger side through the fixed camera, and nothing
  // stands between the camera and it: not the kept ship (its tallest), the cradle's blocks or the rack's planks.
  for (const [what, position] of [["the hull", 1], ["the stern", 3], ["the ram", 0]] as const) {
    for (const dest of ["slipway", "pallet"] as const) {
      it(`carries ${what} large enough to see and in plain view, mid-carry at 1440×900 (to the ${dest})`, () => {
        const [, layout, w, h] = HARBOURS[0];
        const cam = new THREE.PerspectiveCamera();
        place(cam, layout, w / h);
        const ship = buildShip(SENTENCE);
        posed(ship.root, LIVE_POSE);
        ship.root.updateMatrixWorld(true);
        const part = ship.groups[position], box0 = new THREE.Box3().setFromObject(part), centre0 = box0.getCenter(new THREE.Vector3()), size = box0.getSize(new THREE.Vector3());
        const k = carriedScale(Math.max(size.x, size.y, size.z));
        expect(k, `${what} is carried at ${k.toFixed(2)} of its size, not about half`).toBeGreaterThanOrEqual(0.45);
        // what stands in the way: the kept ship at its tallest, the cradle, every waiting plank's box
        const tall = buildShip(Array(10).fill("bookkeeper"));
        posed(tall.root, KEPT_POSE);
        const block = new THREE.BoxGeometry(1, 1, 1), blockers = new THREE.Group();
        blockers.add(tall.root);
        for (const b of CRADLE_BLOCKS) { const m = new THREE.Mesh(block); m.position.set(...b.at); m.scale.set(...b.size); blockers.add(m); }
        for (const p of PALLET_SLOTS) { const m = new THREE.Mesh(block); m.position.copy(p); m.scale.set(PALLET_PLANK, PALLET_PLANK * 0.6, PALLET_PLANK * 0.6); blockers.add(m); }
        blockers.updateMatrixWorld(true);
        const to = dest === "slipway" ? partHome(position, KEPT_POSE) : PALLET_SLOTS[0], ray = new THREE.Raycaster();
        for (let c = 0.2; c <= 0.8 + 1e-9; c += 0.1) {
          // where the page draws it: held overhead, its underside on the hands
          const at = heldAt(carryPath(catchPoint(position), to, c).plank, size.y, k);
          // the part's own box, carried: scaled about its centre and moved there
          const corners = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((l) => new THREE.Vector3(i ? box0.max.x : box0.min.x, j ? box0.max.y : box0.min.y, l ? box0.max.z : box0.min.z).sub(centre0).multiplyScalar(k).add(at))));
          const q = corners.map((p) => onScreen(cam, p));
          const px = Math.max((Math.max(...q.map((v) => v.x)) - Math.min(...q.map((v) => v.x))) * w, (Math.max(...q.map((v) => v.y)) - Math.min(...q.map((v) => v.y))) * h);
          expect(px, `${(100 * c).toFixed(0)}% through the carry ${what} is ${px.toFixed(0)}px across`).toBeGreaterThanOrEqual(CARRIED_MIN_PX);
          for (const p of [at, ...corners.map((x) => x.clone().lerp(at, 0.3))]) {
            const d = p.clone().sub(cam.position), dist = d.length();
            ray.set(cam.position, d.normalize());
            const hit = ray.intersectObject(blockers, true).find((x) => (x.object as THREE.Mesh).isMesh);
            expect(hit && hit.distance < dist - 0.05, `${(100 * c).toFixed(0)}% through the carry something stands in front of ${what}`).toBeFalsy();
          }
        }
        expect(CARRIED_MIN_PX).toBeGreaterThanOrEqual(40);
        ship.dispose(); tall.dispose(); block.dispose();
      });
    }
  }

  for (const [name, layout, w, h] of HARBOURS) {
    it(`keeps every waiting shipwright on the quay, in the frame, clear of the live hull and the rack (${name})`, () => {
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
      // never mixed in with the rack's planks: on screen, no waiting figure (its whole height) overlaps a slot's
      // plank (seen in the first frames, 31 October: a figure behind the rack read as part of its plank)
      const box = (pts: THREE.Vector3[]) => { const q = pts.map((p) => onScreen(cam, p)); return { x0: Math.min(...q.map((v) => v.x)), x1: Math.max(...q.map((v) => v.x)), y0: Math.min(...q.map((v) => v.y)), y1: Math.max(...q.map((v) => v.y)) }; };
      const half = PALLET_PLANK / 2;
      const planks = PALLET_SLOTS.map((p) => box([-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => p.clone().add(new THREE.Vector3(x * half, y * half * 0.6, z * half * 0.6)))))));
      // a toy scale, seen (the maker, 31 October: 1.5–2× the first figures, which stood 1.75 tall). At that size the
      // waiting crowd overlaps, the ones behind partly hidden (the maker's choice, 31 October: a full room reads as a
      // dense crowd; only the quay's near end is clear of the hull, the rack and the frame), except the first three
      expect(FIGURE_HEIGHT, "the shipwrights aren't 1.5–2× the first figures").toBeGreaterThanOrEqual(1.75 * 1.5);
      expect(FIGURE_HEIGHT).toBeLessThanOrEqual(1.75 * 2);
      // the first three (the common case: a marker's two windows, a classmate) each keep a head in full view, apart
      // from every other figure: no other figure's body or head covers any part of it. The rest fill in behind.
      const H = FIGURE_HEIGHT;
      const head = (p: THREE.Vector3) => box([p.clone().add(new THREE.Vector3(-H * 0.07, H * 0.82, 0)), p.clone().add(new THREE.Vector3(H * 0.07, H, 0))]);
      const whole = (p: THREE.Vector3) => box([-1, 1].flatMap((x) => [0, H].map((y) => p.clone().add(new THREE.Vector3(x * H * 0.17, y, 0)))));
      for (let i = 0; i < Math.min(3, spots.length); i++) {
        const hd = head(spots[i]);
        for (let j = 0; j < spots.length; j++) {
          if (j === i) continue;
          // only a figure nearer the camera can cover it; among the first three, heads stay apart either way
          const o = j < 3 ? head(spots[j]) : null, b = whole(spots[j]);
          if (o) expect(hd.x0 < o.x1 && hd.x1 > o.x0 && hd.y0 < o.y1 && hd.y1 > o.y0, `shipwrights ${i + 1} and ${j + 1}'s heads touch`).toBe(false);
          if (spots[j].z > spots[i].z) expect(hd.x0 < b.x1 && hd.x1 > b.x0 && hd.y0 < b.y1 && hd.y1 > b.y0, `shipwright ${j + 1} covers shipwright ${i + 1}'s head`).toBe(false);
        }
      }
      for (const [i, s] of spots.entries()) {
        const f = box([-1, 1].flatMap((x) => [0, FIGURE_HEIGHT].map((y) => s.clone().add(new THREE.Vector3(x * FIGURE_HEIGHT * 0.17, y, 0)))));
        for (const [k, p] of planks.entries()) expect(f.x0 < p.x1 && f.x1 > p.x0 && f.y0 < p.y1 && f.y1 > p.y0, `shipwright ${i + 1} stands with the rack's plank ${k + 1}`).toBe(false);
      }
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
    const a = fresh("earlycarry"), b = fresh("nextcarry");
    const ok = [false, false];
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => {
      const harbour = document.querySelector('#harbour');
      const label = (p) => document.querySelectorAll('.sentence-strip .sentence label')[p].textContent.trim();
      const row = () => [...document.querySelectorAll('.kept-strip .waiting .ws .w')].map((w) => w.textContent.trim());
      // the word the first change replaces: it's the one that waits for the next ship
      const old = label(${waiting});
      for (let i = 0; i < 500 && label(${waiting}) !== ${JSON.stringify(a)}; i++) await new Promise((r) => setTimeout(r, 20));
      const during = { flying: harbour.getAttribute('data-flying'), row: row() };
      for (let i = 0; i < 500 && label(${crossing}) !== ${JSON.stringify(b)}; i++) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => setTimeout(r, 150));
      const after = { flying: harbour.getAttribute('data-flying'), row: row() };
      await new Promise((r) => setTimeout(r, 4200));
      return { old, during, after, end: harbour.getAttribute('data-flying') };
    })()`, [1440, 900], { steps: [READY], then: async () => {
      ok[0] = await secondVisitor(waiting!, a);
      await new Promise((r) => setTimeout(r, 600));
      ok[1] = await secondVisitor(crossing!, b);
    } })) as { old: string; during: { flying: string | null; row: string[] }; after: { flying: string | null; row: string[] }; end: string | null };
    expect(ok, "a change was refused").toEqual([true, true]);
    expect(m.during.flying, "the first plank was never carried").toBe(String(waiting! + 1));
    expect(m.during.row, "the first word landed before its plank was set down").not.toContain(m.old);
    expect(m.after.row, "the second change didn't finish the first carry: its word isn't in the row").toContain(m.old);
    expect(m.after.flying, "the second plank isn't on its way").toBe(String(crossing! + 1));
    expect(m.end, "a plank was still on its way long after it should have been set down").toBeNull();
  }, 120_000);

  // The shipwrights are drawn from the stream's total, at most CREW_MAX of them, and change as views open and
  // close. The page never says how many (spec/present-only.test.ts keeps the total off it, attributes included),
  // so this looks. The waiting figures stand as a crowd at the quay's near end (crewSpots), where nothing else moves
  // (no sea): seen through the page's own fixed camera, that patch of the canvas changes when two more views open,
  // and is back as it was when they close. (A tunic is too near the deck's colour to count figures by colour.)
  localOnly("draws more shipwrights as views open, and takes them away as they close", async () => {
    const [w, h] = [1440, 900];
    const box = (await liveIn(new URL("/", baseUrl).href, `(() => { const r = document.querySelector('#harbour').getBoundingClientRect(); return [r.width, r.height]; })()`, [w, h], { steps: [READY] })) as [number, number];
    const cam = new THREE.PerspectiveCamera();
    place(cam, "desktop", box[0] / box[1]);
    // the patch the two more views' figures stand in: places 2 and 3 (the first is this view's own), feet to heads
    const pts = crewSpots(3).slice(1).flatMap((s) => [0, FIGURE_HEIGHT].flatMap((y) => [-1, 1].map((x) => onScreen(cam, s.clone().add(new THREE.Vector3(x * FIGURE_HEIGHT * 0.17, y, 0))))));
    const area = { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
    let extra: AbortController[] = [];
    const m = (await liveIn(new URL("/", baseUrl).href, `(async () => {
      const c = document.querySelector('#harbour canvas'), a = ${JSON.stringify(area)};
      const grab = () => {
        const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
        const x = g.getContext('2d'); x.drawImage(c, 0, 0);
        const x0 = Math.floor(a.x0 * c.width), y0 = Math.floor(a.y0 * c.height);
        return x.getImageData(x0, y0, Math.ceil(a.x1 * c.width) - x0, Math.ceil(a.y1 * c.height) - y0).data;
      };
      // the share of the patch's pixels that differ from another grab of it
      const differ = (p, q) => { let n = 0; for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 30) n++; return n / (p.length / 4); };
      await new Promise((r) => setTimeout(r, 1200));
      const alone = grab(), still = (await new Promise((r) => setTimeout(r, 300)), grab());
      await new Promise((r) => setTimeout(r, 2200));
      const more = grab();
      await new Promise((r) => setTimeout(r, 2500));
      const after = grab();
      return { still: differ(alone, still), more: differ(alone, more), after: differ(alone, after) };
    })()`, [w, h], { steps: [READY], then: async () => {
      await new Promise((r) => setTimeout(r, 1700));
      extra = await Promise.all([0, 1].map(async () => { const c = new AbortController(); await fetch(new URL("/events", baseUrl), { headers: { accept: "text/event-stream" }, signal: c.signal }); return c; }));
      await new Promise((r) => setTimeout(r, 2500));
      for (const c of extra) c.abort();
    } })) as { still: number; more: number; after: number };
    expect(m.still, "the crowd's patch moves on its own, so it can't show figures coming and going").toBeLessThan(0.01);
    expect(m.more, "two more views drew no more shipwrights").toBeGreaterThan(0.05);
    expect(m.after, "closing them didn't take their shipwrights away").toBeLessThan(0.01);
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
