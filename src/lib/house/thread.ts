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

// what the line is laid out against: the chosen word, the sentence's first word, the sentence, its column,
// and the part notation's text (the slot under the sentence)
export type ThreadRects = { word: Rect; first: Rect; sentence: Rect; column: Rect; notation: Rect };

// out of the word, round the text (above the first line, below the last), then straight to the territory
export function threadPath(a: { x: number; y: number }, { word, first, sentence, column }: ThreadRects): string {
  const cx = word.left + word.width / 2, above = word.top - first.top < word.height * 0.6;
  const sy = above ? word.top : word.bottom, gy = above ? first.top - 12 : sentence.bottom + 6, gx = Math.max(cx, Math.min(column.right + 8, a.x - 24));
  return `M${cx} ${sy}L${cx} ${gy}L${gx} ${gy}L${a.x} ${a.y}`;
}
