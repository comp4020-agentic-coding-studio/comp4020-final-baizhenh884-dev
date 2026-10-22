// The one hairline from the chosen word to its territory (desktop only): where
// it ends on the canvas, and the path it takes there. Pure, so the page draws
// exactly what spec/thread.test.ts measures.

import * as THREE from "three";

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

// a territory's centre on the page, through the page's camera, on a canvas at `canvas`
export function anchorOf(body: { readonly groups: readonly THREE.Object3D[] }, position: number, camera: THREE.Camera, canvas: Rect): { x: number; y: number } | null {
  const g = body.groups[position];
  if (!g) return null;
  g.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(g, true).getCenter(new THREE.Vector3()).project(camera);
  return { x: canvas.left + ((c.x + 1) / 2) * canvas.width, y: canvas.top + ((1 - c.y) / 2) * canvas.height };
}

// what the line is laid out against: the part notation's text (the slot under the sentence)
export type ThreadRects = { notation: Rect };

// Out of the end of the part notation, which names the word and sits under the sentence: a short stub
// beside its text, down clear of it, then straight to the territory. It never leaves the word itself, so it
// crosses no other word on the way down (spec/thread.test.ts); the chosen word is marked by its own outline.
export function threadPath(a: { x: number; y: number }, { notation }: ThreadRects): string {
  const sx = notation.right + 10, sy = notation.top + notation.height / 2, kx = sx + 14, ky = notation.bottom + 8;
  return `M${sx} ${sy}L${kx} ${sy}L${kx} ${ky}L${a.x} ${a.y}`;
}
