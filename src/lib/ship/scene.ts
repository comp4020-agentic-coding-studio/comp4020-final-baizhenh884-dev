// The harbour around the ships (docs/decisions/0005-the-ship.md): a sunlit
// sky, the sea, the shore of Athens with its temple, the quay, the slipway
// the kept ship stands on, and the pallet for the next ship's planks. Scenery
// only: nothing here reads a word. Adapted from the approved prototype
// (docs/exploration/ship-prototype/theseus-harbour.html), not copied.

import * as THREE from "three";
import { KEPT_POSE, PALLET } from "./stage";

export type Harbour = { scene: THREE.Scene; sun: THREE.DirectionalLight; waves(t: number): void; dispose(): void };

// the sea's swell at (x, z), time t in seconds; the live ship rides it
export const swell = (x: number, z: number, t: number) => 0.11 * Math.sin(x * 0.33 + t * 0.9) + 0.07 * Math.sin(z * 0.52 - t * 1.25) + 0.045 * Math.sin((x + z) * 0.9 + t * 1.7);

export function buildHarbour(): Harbour {
  const scene = new THREE.Scene();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => (owned.push(x), x);
  const mats = new Map<number, THREE.MeshStandardMaterial>();
  const M = (color: number) => {
    let m = mats.get(color);
    if (!m) mats.set(color, (m = own(new THREE.MeshStandardMaterial({ color, roughness: 0.82, flatShading: true }))));
    return m;
  };
  const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(own(new THREE.BoxGeometry(w, h, d)), M(color));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const post = (a: THREE.Vector3, b: THREE.Vector3, r: number, color: number) => {
    const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(own(new THREE.CylinderGeometry(r, r, d.length(), 6)), M(color));
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true;
    scene.add(m);
  };

  // the sky: a warm gradient from teal overhead to the sun-warmed horizon
  const sky = document.createElement("canvas");
  sky.width = 4;
  sky.height = 256;
  const g = sky.getContext("2d")!, gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#7fb4c9");
  gr.addColorStop(0.55, "#cfe0dc");
  gr.addColorStop(0.8, "#f2d9ae");
  gr.addColorStop(1, "#f0c58f");
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const skyTex = own(new THREE.CanvasTexture(sky));
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xe9d6b4, 50, 140);

  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x6f8a86, 0.95));
  const sun = new THREE.DirectionalLight(0xffdcaa, 2.4);
  sun.position.set(-18, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 20, bottom: -20, near: 1, far: 90 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // the sea
  const seaGeo = own(new THREE.PlaneGeometry(240, 240, 90, 90));
  seaGeo.rotateX(-Math.PI / 2);
  const rest = Float32Array.from(seaGeo.attributes.position.array);
  const sea = new THREE.Mesh(seaGeo, own(new THREE.MeshStandardMaterial({ color: 0x2a8296, roughness: 0.32, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.94 })));
  sea.receiveShadow = true;
  scene.add(sea);

  // the shore of Athens behind the harbour, the quay along it, the slipway out over the water
  const stone = 0xd9c49c, quay = 0xc9ad80, white = 0xf3ede2, blue = 0x2f5f8c, dark = 0x4a3b2e, green = 0x4b6640, wood = 0x8a633f;
  box(110, 3, 34, stone, 0, -0.5, -24);
  box(110, 1.2, 1.2, quay, 0, 0.45, -7.2);
  const [kx, , kz] = KEPT_POSE.position;
  box(17, 1.6, 16, quay, kx + 0.9, 0.2, kz + 2.7);
  box(16.2, 0.08, 15.2, 0xd6bf93, kx + 0.9, 1.04, kz + 2.7);
  // the kept ship's cradle, and the shed's posts and its crane
  for (const x of [-4, -1.4, 1.2, 3.8]) box(0.6, 0.95, 2, wood, kx + x, 1.45, kz);
  for (const [x, z] of [[-6, 3.7], [-6, -3.7], [6.4, 3.7], [6.4, -3.7]]) post(new THREE.Vector3(kx + x, 1, kz + z), new THREE.Vector3(kx + x, 7.2, kz + z), 0.08, wood);
  post(new THREE.Vector3(kx + 7.8, 1, kz - 4.3), new THREE.Vector3(kx + 7.8, 9.2, kz - 4.3), 0.13, wood);
  post(new THREE.Vector3(kx + 7.8, 8.9, kz - 4.3), new THREE.Vector3(kx + 2.1, 9.6, kz - 0.3), 0.09, wood);
  post(new THREE.Vector3(kx + 2.1, 9.6, kz - 0.3), new THREE.Vector3(kx + 2.1, 7.4, kz - 0.3), 0.015, dark);
  // the pallet for the next ship's planks
  // a rack at the quay's front edge, raised on trestles so its planks stand clear of the deck
  box(10.4, 0.16, 4.4, wood, PALLET[0], PALLET[1] + 0.35, PALLET[2]);
  for (const x of [-4.6, 0, 4.6]) box(0.3, 0.35, 4, dark, PALLET[0] + x, PALLET[1] + 0.1, PALLET[2]);
  // the town: white houses with blue doors, a few domes and cypresses, on a seeded scatter (the same harbour every load)
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const dome = own(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), cone = own(new THREE.ConeGeometry(0.4, 1, 7));
  for (let k = 0; k < 34; k++) {
    const x = -34 + rnd() * 52, z = -10.5 - rnd() * 13, w = 1.6 + rnd() * 2, h = 1.3 + rnd() * 2.4, d = 1.6 + rnd() * 1.6;
    if (x > 2 && z > -13) continue;
    box(w, h, d, white, x, 1 + h / 2, z);
    box(0.42, 0.75, 0.05, rnd() > 0.5 ? blue : dark, x + (rnd() - 0.5) * (w - 0.6), 1.38, z + d / 2 + 0.02);
    if (rnd() > 0.82) { const m = new THREE.Mesh(dome, M(blue)); m.scale.setScalar(Math.min(w, d) * 0.38); m.position.set(x, 1 + h, z); scene.add(m); }
  }
  for (let k = 0; k < 16; k++) {
    const x = -30 + rnd() * 48, z = -11 - rnd() * 14;
    if (x > 2 && z > -13) continue;
    const m = new THREE.Mesh(cone, M(green));
    m.scale.y = 2.6 + rnd() * 1.5;
    m.position.set(x, 1 + m.scale.y / 2, z);
    m.castShadow = true;
    scene.add(m);
  }
  // the acropolis and its temple
  const hill = new THREE.Mesh(own(new THREE.CylinderGeometry(7, 13, 6, 9)), M(0xc9b48a));
  hill.position.set(-8, 2.5, -27);
  scene.add(hill);
  const temple = new THREE.Group();
  temple.position.set(-8, 5.5, -27);
  scene.add(temple);
  box(6, 0.5, 3.4, white, 0, 0.25, 0, temple);
  const column = own(new THREE.CylinderGeometry(0.14, 0.16, 2.2, 8));
  for (let k = 0; k < 7; k++) for (const z of [-1.3, 1.3]) { const c = new THREE.Mesh(column, M(white)); c.position.set(-2.6 + k * 0.866, 1.6, z); c.castShadow = true; temple.add(c); }
  box(6, 0.35, 3.2, white, 0, 2.85, 0, temple);
  const roof = new THREE.Mesh(own(new THREE.CylinderGeometry(1.75, 1.75, 6.1, 3)), M(white));
  roof.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  roof.scale.set(1, 1, 0.34);
  roof.position.y = 3.3;
  temple.add(roof);
  // islands on the horizon
  const isle = own(new THREE.ConeGeometry(1, 1, 7));
  for (const [x, z, s] of [[-60, -70, 9], [-25, -85, 13], [35, -78, 10], [70, -62, 7]]) {
    const m = new THREE.Mesh(isle, M(0x9fb1ad));
    m.scale.set(s * 1.8, s, s * 0.9);
    m.position.set(x, s / 2 - 1, z);
    scene.add(m);
  }

  return {
    scene,
    sun,
    waves(t) {
      const a = seaGeo.attributes.position.array as Float32Array;
      for (let k = 0; k < a.length; k += 3) a[k + 1] = swell(rest[k], rest[k + 2], t);
      seaGeo.attributes.position.needsUpdate = true;
      seaGeo.computeVertexNormals();
    },
    dispose() {
      for (const x of owned) x.dispose();
    },
  };
}
