// A kept ship's missing part, a part still standing in the harbour: drawn as a faint, translucent wooden ghost of
// itself (the maker, 1 November: as a thin white outline, a ship with no hull yet read as parts floating in the
// air). Its own geometry in one pale wood for every part, never its paint, so a shield painted a's red leaves no
// red ghost; the hull the most present, so a ship still being gathered reads as a ship at any moment. Once its
// plank arrives the part is itself again: its own materials, as the builder made them.

import * as THREE from "three";

const WOOD = 0xb89b6e;
// how present each part's ghost is: the hull, the body everything else stands on, most of all
const OPACITY = (position: number) => (position === 1 ? 0.42 : 0.26);
// one material per presence, shared by every ghost and never released with a part
const shared = new Map<number, THREE.MeshStandardMaterial>();
const ghostOf = (opacity: number) => {
  let m = shared.get(opacity);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.9, metalness: 0, flatShading: true, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    shared.set(opacity, m);
  }
  return m;
};

// `on`: draw the part at `position` as its ghost, or as itself again
export function ghostPart(g: THREE.Group, position: number, on: boolean): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (on) {
      if (!mesh.userData.own) mesh.userData.own = { material: mesh.material, shadow: mesh.castShadow };
      mesh.material = ghostOf(OPACITY(position));
      // a ghost casts no shadow: there's nothing solid there yet
      mesh.castShadow = false;
    } else if (mesh.userData.own) {
      const own = mesh.userData.own as { material: THREE.Material; shadow: boolean };
      mesh.material = own.material;
      mesh.castShadow = own.shadow;
      delete mesh.userData.own;
    }
  });
}
