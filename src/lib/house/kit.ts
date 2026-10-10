// The few solids every territory is built from: boxes, extruded outlines and
// walls cut by voids. A mesh records its role ("mass" or "opening", the dark
// back of a void) so the theme can dress it; materials belong to the theme and
// are never created or disposed here.

import * as THREE from "three";

export type Role = "mass" | "opening";
export type Hole = [x0: number, x1: number, y0: number, y1: number];

// A placeholder each mesh carries until the theme dresses it (shared, never disposed).
const PLAIN = new THREE.MeshStandardMaterial({ color: 0xe9e5dc });

export class Kit {
  constructor(private group: THREE.Group) {}

  add(geometry: THREE.BufferGeometry, role: Role = "mass"): THREE.Mesh {
    const m = new THREE.Mesh(geometry, PLAIN);
    m.userData.role = role;
    m.castShadow = role === "mass";
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, role: Role = "mass"): THREE.Mesh {
    const m = this.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), role);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return m;
  }

  // an outline in the x/y plane, extruded from z0 to z1
  slabXY(shape: THREE.Shape, z0: number, z1: number, role: Role = "mass"): THREE.Mesh {
    const m = this.add(new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 20 }), role);
    m.position.z = z0;
    return m;
  }

  // a plan outline given in (x, -z), extruded from y0 up to y1
  slabPlan(shape: THREE.Shape, y0: number, y1: number, role: Role = "mass"): THREE.Mesh {
    const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 20 });
    g.rotateX(-Math.PI / 2);
    const m = this.add(g, role);
    m.position.y = y0;
    return m;
  }

  // a profile in the (-z, y) plane, extruded along x from x0 to x1
  slabSide(shape: THREE.Shape, x0: number, x1: number, role: Role = "mass"): THREE.Mesh {
    const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 20 });
    g.rotateY(Math.PI / 2);
    const m = this.add(g, role);
    m.position.x = x0;
    return m;
  }

  // a volume whose front wall (thickness t) is cut by voids, each with a dark back
  pierced(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, t: number, holes: Hole[]): void {
    if (!holes.length) {
      this.box(x0, x1, y0, y1, z0, z1);
      return;
    }
    this.box(x0, x1, y0, y1, z0, z1 - t);
    const sh = rect(x0, x1, y0, y1);
    for (const h of holes) sh.holes.push(rect(...h));
    this.slabXY(sh, z1 - t, z1);
    for (const h of holes) this.box(h[0], h[1], h[2], h[3], z1 - t, z1 - t + 0.02, "opening");
  }
}

export function rect(x0: number, x1: number, y0: number, y1: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.lineTo(x0, y0);
  return s;
}

// n items of width w spaced evenly between x0 and x1: their left edges
export const row = (n: number, x0: number, x1: number, w: number) => Array.from({ length: n }, (_, k) => x0 + ((k + 1) * (x1 - x0)) / (n + 1) - w / 2);

// a portal's opening from its sill, left foot first, over the head, to the right foot
export function portal(ow: number, oh: number, arch: boolean): THREE.Vector2[] {
  const p = new THREE.Path();
  if (arch) {
    const r = ow / 2;
    p.moveTo(-r, 0);
    p.lineTo(-r, oh - r);
    p.absarc(0, oh - r, r, Math.PI, 0, true);
    p.lineTo(r, 0);
  } else {
    p.moveTo(-ow / 2, 0);
    p.lineTo(-ow / 2, oh);
    p.lineTo(ow / 2, oh);
    p.lineTo(ow / 2, 0);
  }
  return p.getPoints(24);
}

// every geometry under a root, released (materials are shared and stay)
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}
