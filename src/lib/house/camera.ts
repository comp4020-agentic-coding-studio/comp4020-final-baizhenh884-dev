// The one default view of the body: the same direction, target and field of
// view for every sentence, current or earlier. Only its distance responds to
// the viewport's shape, so a narrow (portrait) view sees the same whole body.

import type { PerspectiveCamera } from "three";

export const VIEW = { fov: 17, yaw: -0.6, pitch: 0.32, target: [-1.8, 4.1, 0.9] as const };

// Far enough that the widest and the tallest bodies the grammar allows both fit.
// Measured over every vertex of the 500-sentence set and the extremes, the
// worst body reaches 0.81 of the half-height (about 19% to spare) and 0.79 of
// the half-width at aspect 1.0-1.25 (spec/house-framing.test.ts holds every
// body 2% inside every edge). Cropping isn't what limits the distance: the
// part notation lies over the live canvas's top band and must stay clear of
// the tallest body (spec/two-ships-layout.test.ts, which fails 5% closer), and
// house-constraints' bounding-box check needs every body's box corners inside
// ±0.96 (fails 3% closer). Closer means changing one of those first.
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
