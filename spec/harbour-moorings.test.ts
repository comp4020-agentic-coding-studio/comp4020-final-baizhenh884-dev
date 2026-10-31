import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildShip } from "../src/lib/ship/build";
import { LIVE_POSE, place, posed, QUAY, SHORE } from "../src/lib/ship/stage";

// The live ship rides at its mooring clear of the stone (the maker, 31 October: on the live site at 1440 the
// ship's end passed through the quay's stone block). In 3D, so it holds at every screen size: for the
// sentences that make the ship reach furthest by every rule that changes its size, and the sentence live when
// this was found, the live ship's bounding box at its pose stays at least GAP clear of the quay the slipway stands
// on and of the shore's quay, water between them. The swell lifts and rocks the ship a little (scene.ts); the gap
// covers that. Moored there, the whole ship stays in the harbour's frame at every size.
//
// What reaches the quay: the bow (+x on the ship) toward the slipway's quay, with the ram growing on it (repeated
// letters); the prow curl turns back over the bow. The stern, rudder and pennant grow away from the quay; the
// oars grow out to each side. The hull itself is the same length for every word.

const GAP = 0.4;
const EDGE = 4;
// the harbour's box at each size, measured on the served page (as spec/harbour-flight.test.ts): 1920, 1440 and 1280
// under a new visitor's full band, and a phone
const FRAMES = [["1920×1080", "desktop", 1920, 900], ["1440×900", "desktop", 1440, 722], ["1280×800", "desktop", 1280, 626], ["390×844", "phone", 390, 351]] as const;
const BASE = ["make", "anchor", "website", "that", "people", "would", "miss", "if", "it", "disappeared"];
const at = (i: number, w: string) => BASE.map((x, k) => (k === i ? w : x));
const CASES: [string, string[]][] = [
  ["the live sentence, 31 October", ["potato", "all", "ceremony", "this", "students", "will", "wonder", "whether", "it", "peel"]],
  ["the biggest ram (a trident: two or more repeated letters)", at(0, "bookkeeper")],
  ["the longest hull (any word: the hull is one length)", at(1, "incomprehensibilities")],
  ["the most curled prow (six round letters)", at(2, "obscopedos")],
  ["the biggest stern (nine plumes)", at(3, "strengthsx")],
  ["the most oars (twelve a side)", at(7, "abcdefghijkl")],
  ["the deepest rudder (four hanging letters)", at(8, "gjpq")],
  ["the longest pennant", at(9, "incomprehensibilitiesxyz")],
  ["every rule at its largest at once", ["bookkeeper", "incomprehensibilities", "obscopedos", "strengthsx", "aeiouaeiou", "bdfhkl", "incomprehensibilities", "abcdefghijkl", "gjpq", "incomprehensibilitiesxyz"]],
];

// how far apart two boxes are (0 when they touch or overlap)
const apart = (a: THREE.Box3, b: THREE.Box3) => {
  const d = (lo1: number, hi1: number, lo2: number, hi2: number) => Math.max(0, lo2 - hi1, lo1 - hi2);
  return Math.hypot(d(a.min.x, a.max.x, b.min.x, b.max.x), d(a.min.y, a.max.y, b.min.y, b.max.y), d(a.min.z, a.max.z, b.min.z, b.max.z));
};

describe("the live ship at its mooring", () => {
  const quay = new THREE.Box3(new THREE.Vector3(QUAY.x[0], -1, QUAY.z[0]), new THREE.Vector3(QUAY.x[1], QUAY.deck, QUAY.z[1]));
  const shore = new THREE.Box3(new THREE.Vector3(SHORE.x[0], -2, SHORE.z[0]), new THREE.Vector3(SHORE.x[1], SHORE.top, SHORE.z[1]));
  for (const [what, words] of CASES) {
    it(`stays clear of the quay and the shore, water between: ${what}`, () => {
      const ship = buildShip(words);
      posed(ship.root, LIVE_POSE);
      ship.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(ship.root);
      ship.dispose();
      expect(apart(box, quay), `the live ship comes within ${apart(box, quay).toFixed(2)} of the slipway's quay`).toBeGreaterThanOrEqual(GAP);
      expect(apart(box, shore), `the live ship comes within ${apart(box, shore).toFixed(2)} of the shore`).toBeGreaterThanOrEqual(GAP);
    });

    // and moored there, the whole ship stays in the harbour's frame (every part, not only the hull: the stern's
    // plumes ran past a phone's left edge), at least EDGE px from each side, at every size the page is laid out for
    for (const [name, layout, w, h] of FRAMES) {
      it(`stays whole in the frame at its mooring (${name}): ${what}`, () => {
        const ship = buildShip(words), cam = new THREE.PerspectiveCamera();
        place(cam, layout, w / h);
        posed(ship.root, LIVE_POSE);
        ship.root.updateMatrixWorld(true);
        const v = new THREE.Vector3();
        let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
        ship.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const p = m.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).project(cam);
            const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
            l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
          }
        });
        ship.dispose();
        expect(l, `the live ship runs ${(EDGE - l).toFixed(0)}px past the left edge`).toBeGreaterThanOrEqual(EDGE);
        expect(w - r, "the live ship runs past the right edge").toBeGreaterThanOrEqual(EDGE);
        expect(t, "the live ship runs past the top").toBeGreaterThanOrEqual(EDGE);
        expect(h - b, "the live ship runs past the bottom").toBeGreaterThanOrEqual(EDGE);
      });
    }
  }
});
