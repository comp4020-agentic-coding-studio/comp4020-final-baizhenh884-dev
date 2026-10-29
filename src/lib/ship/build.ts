// stub: slice 2's spec lands first (spec/ship-body.test.ts)
import * as THREE from "three";
export type BuiltShip = { root: THREE.Group; groups: THREE.Group[]; dispose(): void };
export function buildShip(_words: readonly string[]): BuiltShip {
  const root = new THREE.Group();
  return { root, groups: [], dispose() {} };
}
