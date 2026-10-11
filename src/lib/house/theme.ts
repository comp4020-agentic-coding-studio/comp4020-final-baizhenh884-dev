// Monograph: a light architectural-study field, a restrained plaster model
// drawn with faint ink edges. Red has one job, a body being rebuilt now.
// An earlier form is an unfired white study model (H1).

import * as THREE from "three";

export const FIELD = 0xf1eee8;
export const INK = 0x191714;
export const RED = 0xc3331c;

// each territory's base colour: walls in near-field plaster, the ground and roof a step darker
const PRESENT = { mass: 0xeee9df, ground: 0xd9d2c5, roof: 0xc9b9a6, opening: 0x8f9799 };
const PAST = { mass: 0xf3f0e9, ground: 0xe9e6de, roof: 0xe9e6de, opening: 0xd6d7d2 };
export const EDGE = { present: 0.2, past: 0.32 };

const tone = (position: number, role: string, past: boolean) => {
  const p = past ? PAST : PRESENT;
  if (role === "opening") return p.opening;
  return position === 0 || position === 9 ? p.ground : position === 6 ? p.roof : p.mass;
};

// Dress one territory: its own materials (so it can fade alone) and ink edges.
export function dress(group: THREE.Group, position: number, past: boolean): void {
  const made = new Map<string, THREE.MeshStandardMaterial>();
  const edges: THREE.LineSegments[] = [];
  // one ink for the whole territory's edges, so it draws, fades and is selected as one
  const ink = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: past ? EDGE.past : EDGE.present, depthWrite: false });
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const role = (mesh.userData.role as string) ?? "mass";
    let m = made.get(role);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: tone(position, role, past), roughness: role === "opening" ? 0.5 : 0.92, metalness: 0 });
      m.userData.base = m.color.clone();
      made.set(role, m);
    }
    mesh.material = m;
    if (role !== "opening") {
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), ink);
      line.userData.edge = true;
      edges.push(line);
      mesh.add(line);
    }
  });
  group.userData.materials = [...made.values()];
  group.userData.ink = ink;
  group.userData.edges = edges;
}

// release what dress() made for one territory (geometries are released by the builder's dispose)
export function undress(group: THREE.Group): void {
  for (const m of (group.userData.materials as THREE.Material[] | undefined) ?? []) m.dispose();
  for (const l of (group.userData.edges as THREE.LineSegments[] | undefined) ?? []) l.geometry.dispose();
  (group.userData.ink as THREE.Material | undefined)?.dispose();
}

export function lights(scene: THREE.Scene): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd6cfc2, 1.0));
  const key = new THREE.DirectionalLight(0xfff5e8, 2.65);
  key.position.set(-9, 14, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.015;
  key.target.position.set(-1, 2, 0);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xe9eef2, 0.5);
  fill.position.set(12, 6, 8);
  scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.14 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  return key;
}
