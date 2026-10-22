import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildBody } from "../src/lib/house/build";
import { place } from "../src/lib/house/camera";
import { EXTREMES, SENTENCES } from "./house-sentences";

// The one default view (src/lib/house/camera.ts) frames every body whole. Its
// distance never depends on the words, so a changed word never moves the view;
// it only has to be far enough for the widest and tallest body the grammar
// allows. Every vertex of every body in the 500-sentence set and the extremes
// is projected through the page's camera, at every canvas shape the page
// produces (aspect 1.25 on a phone; about 1.9 to 3 side by side; 1.0 and 3.2
// as bounds), and must stay inside the canvas by a margin on every side:
// nothing cropped, never touching the edge. Real geometry, not a bounding box.

const ASPECTS = [1.0, 1.25, 1.5, 1.8, 2.0, 2.4, 2.8, 3.2];
// the least clear space allowed between a body and the canvas edge, as a fraction of the half-extent (2%)
const MARGIN = 0.02;

// the furthest any vertex of the body reaches toward each edge, in normalised device coordinates
function reach(words: readonly string[], cam: THREE.PerspectiveCamera): { left: number; right: number; bottom: number; top: number } {
  const body = buildBody(words);
  body.root.updateMatrixWorld(true);
  const v = new THREE.Vector3(), r = { left: 0, right: 0, bottom: 0, top: 0 };
  body.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).project(cam);
      r.left = Math.min(r.left, v.x); r.right = Math.max(r.right, v.x); r.bottom = Math.min(r.bottom, v.y); r.top = Math.max(r.top, v.y);
    }
  });
  body.dispose();
  return r;
}

describe("the default view", () => {
  for (const aspect of ASPECTS) {
    it(`frames every body whole, clear of every edge (aspect ${aspect})`, () => {
      const cam = new THREE.PerspectiveCamera();
      place(cam, aspect);
      const worst = { left: 0, right: 0, bottom: 0, top: 0 };
      const out: string[] = [];
      for (const words of [...SENTENCES, ...EXTREMES]) {
        const r = reach(words, cam);
        worst.left = Math.min(worst.left, r.left); worst.right = Math.max(worst.right, r.right);
        worst.bottom = Math.min(worst.bottom, r.bottom); worst.top = Math.max(worst.top, r.top);
        if (Math.max(-r.left, r.right, -r.bottom, r.top) > 1 - MARGIN) out.push(`"${words.join(" ")}" reaches ${JSON.stringify(r)}`);
      }
      expect(out.slice(0, 3), `${out.length} bodies reach the edge; worst ${JSON.stringify(worst)}`).toEqual([]);
    }, 120_000);
  }
});
