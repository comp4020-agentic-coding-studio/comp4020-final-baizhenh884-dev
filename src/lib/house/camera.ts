// The one default view of the body: the same direction, target and field of
// view for every sentence, current or earlier. Only its distance responds to
// the viewport's shape, so a narrow (portrait) view sees the same whole body.

import type { PerspectiveCamera } from "three";

export const VIEW = { fov: 17, yaw: -0.6, pitch: 0.32, target: [-1.8, 4.1, 0.9] as const };

// Far enough that the widest and the tallest bodies the grammar allows both fit,
// and no further: over the 500-sentence set and the extremes, the half-width
// needs 66.1 units of distance per unit of aspect and the half-height 47.7,
// here with about 8% to spare inside the edge.
export const distanceFor = (aspect: number) => Math.max(72 / aspect, 52);

export function place(cam: PerspectiveCamera, aspect: number): void {
  const [tx, ty, tz] = VIEW.target, d = distanceFor(aspect);
  cam.fov = VIEW.fov;
  cam.aspect = aspect;
  cam.near = 1;
  cam.far = d * 3;
  cam.updateProjectionMatrix();
  cam.position.set(tx + d * Math.cos(VIEW.pitch) * Math.sin(VIEW.yaw), ty + d * Math.sin(VIEW.pitch), tz + d * Math.cos(VIEW.pitch) * Math.cos(VIEW.yaw));
  cam.lookAt(tx, ty, tz);
  cam.updateMatrixWorld(true);
}
