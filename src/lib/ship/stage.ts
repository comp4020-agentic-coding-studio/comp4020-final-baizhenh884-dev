// stub: slice 3a's spec lands first (spec/harbour-layout.test.ts)
import * as THREE from "three";
export type Layout = "desktop" | "phone";
export const LIVE_POSE = { position: [0, 0, 0] as [number, number, number], rotationY: 0, scale: 1 };
export const KEPT_POSE = { position: [0, 0, 0] as [number, number, number], rotationY: 0, scale: 1 };
export const ORBIT = { minDistance: 0, maxDistance: 0, minPolar: 0, maxPolar: 0 };
export function home(_layout: Layout): { position: [number, number, number]; target: [number, number, number]; fov: number } {
  return { position: [0, 0, 10], target: [0, 0, 0], fov: 40 };
}
export function place(cam: THREE.PerspectiveCamera, layout: Layout, aspect: number, liftPx = 0, heightPx = 1): void {
  void liftPx; void heightPx;
  const h = home(layout);
  cam.fov = h.fov; cam.aspect = aspect; cam.near = 0.1; cam.far = 400;
  cam.position.set(...h.position); cam.lookAt(...h.target);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
}
export function posed(root: THREE.Object3D, pose: typeof LIVE_POSE): THREE.Object3D {
  root.position.set(...pose.position); root.rotation.y = pose.rotationY; root.scale.setScalar(pose.scale);
  return root;
}
import type { KeptShip, Moment } from "../kept-moment";
export const PALLET_SLOTS: THREE.Vector3[] = [];
export function partHome(_position: number, _pose: typeof LIVE_POSE): THREE.Vector3 { return new THREE.Vector3(); }
export function flightTarget(_moment: Moment, _kept: KeptShip): THREE.Vector3 { return new THREE.Vector3(); }
