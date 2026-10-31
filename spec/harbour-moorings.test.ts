import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildShip } from "../src/lib/ship/build";
import { LIVE_POSE, posed, QUAY, SHORE } from "../src/lib/ship/stage";

// The live ship rides at its mooring clear of the stone (the maker, 31 October: on the live site at 1440 the
// ship's end passed through the quay's stone block). In 3D, so it holds at every screen size: for the
// sentences that make the ship reach furthest by every rule that changes its size, and the sentence live when
// this was found, the live ship's bounding box at its pose stays at least GAP clear of the quay the slipway stands
// on and of the shore's quay, water between them. The swell lifts and rocks the ship a little (scene.ts); the gap
// covers that.
//
// What reaches the quay: the bow (+x on the ship) toward the slipway's quay, with the ram growing on it (repeated
// letters); the prow curl turns back over the bow. The stern, rudder and pennant grow away from the quay; the
// oars grow out to each side. The hull itself is the same length for every word.

const GAP = 0.4;
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
  }
});
