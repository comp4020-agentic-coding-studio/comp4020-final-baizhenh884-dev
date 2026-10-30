// Where things stand in the harbour (docs/decisions/0005-the-ship.md), as
// numbers: the two ships' poses, the camera's fixed view for each layout and
// how far a desktop drag may orbit it, each part's place on a ship, and where
// a replaced plank flies. Pure three.js math with no renderer, so the page and
// the layout checks (spec/harbour-layout.test.ts, spec/harbour-flight.test.ts)
// frame the same scene with the same camera. The look follows the approved
// prototype (docs/exploration/ship-prototype/), the numbers are re-derived.

import * as THREE from "three";
import type { KeptShip, Moment } from "../kept-moment";

export type Layout = "desktop" | "phone";
export type Pose = { position: [number, number, number]; rotationY: number; scale: number };

// the live ship on the water; the kept ship on its slipway, on the quay to the right; the pallet beside it
export const LIVE_POSE: Pose = { position: [-4.2, 0, 4.2], rotationY: -0.22, scale: 1.3 };
export const KEPT_POSE: Pose = { position: [7.4, 2.05, -3.4], rotationY: -0.06, scale: 1.3 };
export const PALLET: [number, number, number] = [8.0, 1.12, 3.8];

// a desktop drag turns the view about its target, never pans, within these
export const ORBIT = { minDistance: 14, maxDistance: 60, minPolar: 0.55, maxPolar: 1.32 };

type View = { position: [number, number, number]; target: [number, number, number]; fov: number };
// Both ships and the pallet, seen from the harbour mouth. On a desktop the sentence strip lies over the
// scene's lower left, so the ships stand in its upper two thirds; on a phone the strip is above the scene.
const VIEWS: Record<Layout, View> = {
  desktop: { position: [2.6, 5.5, 31], target: [2.6, 1.0, 0.4], fov: 38 },
  phone: { position: [2.6, 7.5, 26], target: [2.6, 1.4, 0.6], fov: 42 },
};
// the width of the harbour that must stay in view at any aspect: from the live ship's stern to past the pallet
const SPAN: Record<Layout, [number, number]> = { desktop: [-10.6, 16.0], phone: [-10.2, 15.6] };

export const home = (layout: Layout): View => VIEWS[layout];

// Puts the camera at its fixed view for a harbour of this aspect: a narrower harbour widens the view until
// the whole span fits, so a narrow screen sees the same harbour, smaller, never a cropped one.
export function place(cam: THREE.PerspectiveCamera, layout: Layout, aspect: number, liftPx = 0, heightPx = 1): void {
  const h = home(layout);
  cam.position.set(...h.position);
  cam.up.set(0, 1, 0);
  cam.lookAt(...h.target);
  cam.aspect = aspect;
  cam.near = 0.1;
  cam.far = 400;
  // the half-width (in view space, at the target's depth) the span needs, with a margin each side
  const dist = new THREE.Vector3(...h.position).distanceTo(new THREE.Vector3(...h.target));
  const [a, b] = SPAN[layout];
  const need = ((b - a) / 2) * 1.04;
  const fovFor = 2 * Math.atan(need / aspect / dist) * (180 / Math.PI);
  cam.fov = Math.max(h.fov, fovFor);
  // the span's middle at the centre: the target already is
  cam.clearViewOffset();
  if (liftPx) cam.setViewOffset(1, heightPx, 0, liftPx / heightPx, 1, 1);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

export function posed<T extends THREE.Object3D>(root: T, pose: Pose): T {
  root.position.set(...pose.position);
  root.rotation.set(0, pose.rotationY, 0);
  root.scale.setScalar(pose.scale);
  return root;
}

// Each part's place on a ship, in the ship's own frame (build.ts's lines: x from the stern, -3.8, to the bow,
// 3.8; the deck at 0.3): where a plank leaves from, and where it is set down.
const PART_AT: [number, number, number][] = [
  [4.3, -0.1, 0], // ram
  [0, 0.15, 0], // hull
  [4.2, 1.7, 0], // prow
  [-4.0, 2.0, 0], // stern
  [0, 0.65, 0.95], // shields
  [0.35, 4.6, 0], // mast
  [0.6, 3.0, 0], // sail
  [0, -0.4, 1.6], // oars
  [-3.3, -0.2, 1.0], // rudder
  [-3.0, 2.9, 0], // pennant
];
export function partHome(position: number, pose: Pose): THREE.Vector3 {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pose.position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.rotationY), new THREE.Vector3().setScalar(pose.scale));
  return new THREE.Vector3(...PART_AT[position]).applyMatrix4(m);
}

// a waiting plank's size on the pallet: its largest dimension, in world units
export const PALLET_PLANK = 1.9;

// The pallet's slots, two rows of five, in place order: a waiting plank lies in the slot of its turn among the
// planks waiting now.
export const PALLET_SLOTS: THREE.Vector3[] = Array.from({ length: 10 }, (_, k) => new THREE.Vector3(PALLET[0] - 4 + (k % 5) * 2, PALLET[1] + 1.4, PALLET[2] - 1 + Math.floor(k / 5) * 2));
export function palletSlot(position: number, next: readonly (string | null)[]): THREE.Vector3 {
  const n = next.slice(0, position + 1).filter((w) => w !== null).length - 1;
  return PALLET_SLOTS[Math.max(0, Math.min(PALLET_SLOTS.length - 1, n))].clone();
}

// Where a replaced plank flies, once the server has accepted the change: to its own gap on the kept ship, or,
// if it belongs to the next ship, to its slot on the pallet.
export function flightTarget(moment: Moment, kept: KeptShip): THREE.Vector3 {
  return moment.kind === "wait" ? palletSlot(moment.position, kept.next) : partHome(moment.position, KEPT_POSE);
}

// A plank in flight, `k` (0..1) of the way through its flight: where its centre is and how it's scaled, as a
// share of the size it stood on the live ship (the flying copy is built at that size). It lifts off slowly,
// crosses the water in an arc and sets down slowly (smoothstep), so it's seen leaving, crossing and landing;
// toward the pallet it shrinks to `s1`, toward the kept ship it keeps its size.
export function flightAt(from: THREE.Vector3, to: THREE.Vector3, k: number, s1: number, toPallet: boolean): { position: THREE.Vector3; scale: number } {
  const t = Math.min(1, Math.max(0, k)), e = t * t * (3 - 2 * t);
  const position = new THREE.Vector3().lerpVectors(from, to, e);
  position.y += Math.sin(Math.PI * e) * 4.5;
  return { position, scale: toPallet ? 1 + (s1 - 1) * e : 1 };
}

// stub: slice 3b's spec lands first (spec/harbour-flight.test.ts)
export const followView = (layout: Layout, _from: THREE.Vector3, _to: THREE.Vector3, _k: number): View => home(layout);
