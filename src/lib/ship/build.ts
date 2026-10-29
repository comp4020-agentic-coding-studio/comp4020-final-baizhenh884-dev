// The ship's body, one group per part, from the rule table (rules.ts). Pure
// three.js with no renderer and no DOM, so it builds the same in the browser
// and in node. Each group is owned by its position (userData.position) and
// holds only that part's solids; nothing reads another position's word.
// Adapted from the approved prototype's ship
// (docs/exploration/ship-prototype/theseus-harbour.html), not copied: the
// counts come from partOf(), and each counted solid is marked by its role
// (prong, paint, plume, shield, stripe, oar) so what a visitor can count is
// what the rule says (spec/ship-body.test.ts). The pennant's lettering is the
// view's to draw: the builder records the word (userData.written).

import * as THREE from "three";
import { PARTS, partOf, VOWEL_COLOUR } from "./rules";

export type BuiltShip = { root: THREE.Group; groups: THREE.Group[]; dispose(): void };

// the hull's lines: u runs 0 (stern) to 1 (bow)
const HL = 3.8;
const xAt = (u: number) => -HL + 2 * HL * u;
const bAt = (u: number) => 0.95 * Math.pow(Math.max(Math.sin(Math.PI * u), 0), 0.55);
const sAt = (u: number) => 0.5 + 0.75 * Math.pow(u, 7) + 1.15 * Math.pow(1 - u, 7);
const dAt = (u: number) => 0.12 + 0.88 * Math.pow(Math.max(Math.sin(Math.PI * u), 0), 0.35);
const C = { black: 0x221d19, ochre: 0xc9933c, cream: 0xefe3c8, bronze: 0xb0803c, wood: 0x8c6340, dark: 0x5a3f28, linen: 0xf0e4cb, rope: 0x4b3a2a };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// one part's kit: every solid it adds is owned by its group, shares that part's materials, and is marked by role
class Kit {
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  // the part's materials are listed on its group, so whoever releases the group releases them (theme.ts undress)
  constructor(readonly g: THREE.Group) {
    g.userData.materials = [];
  }
  mat(color: number, o: { metal?: number; rough?: number; side?: THREE.Side; vc?: boolean } = {}): THREE.MeshStandardMaterial {
    const key = `${color}:${o.metal ?? 0}:${o.rough ?? 0.78}:${o.side ?? 0}:${o.vc ? 1 : 0}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.78, metalness: o.metal ?? 0, flatShading: true, side: o.side ?? THREE.FrontSide, vertexColors: !!o.vc });
      this.mats.set(key, m);
      (this.g.userData.materials as THREE.Material[]).push(m);
    }
    return m;
  }
  add(geo: THREE.BufferGeometry, mat: THREE.Material, role = "solid", parent: THREE.Object3D = this.g): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.role = role;
    parent.add(m);
    return m;
  }
  at(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, role?: string, parent?: THREE.Object3D): THREE.Mesh {
    const m = this.add(geo, mat, role, parent);
    m.position.set(x, y, z);
    return m;
  }
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, role?: string, parent?: THREE.Object3D, seg = 6): THREE.Mesh {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = this.add(new THREE.CylinderGeometry(r, r, d.length(), seg), mat, role, parent);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    return m;
  }
  tube(pts: [number, number, number][], r: number, mat: THREE.Material, role?: string): THREE.Mesh {
    return this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(...p))), 32, r, 6), mat, role);
  }
  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
  }
}

// 01 ram: repeated letters; a blunt block, a beak, or a three-pronged trident
function ram(k: Kit, value: string): void {
  const br = k.mat(C.bronze, { metal: 0.55, rough: 0.4 }), L = 1.1;
  const prong = (r: number, z: number) => {
    const c = k.add(new THREE.ConeGeometry(r, L, 7), br, "prong");
    c.rotation.z = -Math.PI / 2;
    c.position.set(HL + L / 2 - 0.05, -0.08, z);
  };
  if (value === "trident") { prong(0.11, -0.22); prong(0.13, 0); prong(0.11, 0.22); }
  else if (value === "beak") prong(0.22, 0);
  else {
    k.at(new THREE.BoxGeometry(L * 0.8, 0.36, 0.42), br, HL + L * 0.35, -0.1, 0);
    k.at(new THREE.BoxGeometry(0.22, 0.52, 0.52), br, HL + L * 0.72, -0.1, 0);
  }
}

// 02 hull: the first letter's paint, a cream band below the sheer; the deck and keel come with it
function hull(k: Kit, paint: number): void {
  const nu = 44, nv = 16, pos: number[] = [], idx: number[] = [], band: number[] = [], bandIdx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu, x = xAt(u), b = bAt(u), s = sAt(u), d = dAt(u);
    for (let j = 0; j <= nv; j++) {
      const a = (Math.PI * j) / nv;
      pos.push(x, s - d * Math.sin(a), -b * Math.cos(a));
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  k.add(geo, k.mat(paint, { side: THREE.DoubleSide, rough: 0.6 }), "paint");
  // the cream band, a strip just under the sheer on both sides
  for (let i = 0; i <= nu; i++) {
    const u = i / nu, x = xAt(u), b = bAt(u) * 1.004, s = sAt(u);
    for (const z of [-1, 1]) band.push(x, s - 0.09, z * b, x, s - 0.16, z * b);
  }
  for (let i = 0; i < nu; i++) for (const side of [0, 1]) {
    const a = (i * 2 + side) * 2, b = ((i + 1) * 2 + side) * 2;
    bandIdx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.Float32BufferAttribute(band, 3));
  bg.setIndex(bandIdx);
  bg.computeVertexNormals();
  k.add(bg, k.mat(C.cream, { side: THREE.DoubleSide }));
  const sh = new THREE.Shape(), N = 30;
  for (let i = 0; i <= N; i++) { const u = 0.04 + (0.92 * i) / N; if (i) sh.lineTo(xAt(u), bAt(u) * 0.86); else sh.moveTo(xAt(u), bAt(u) * 0.86); }
  for (let i = N; i >= 0; i--) { const u = 0.04 + (0.92 * i) / N; sh.lineTo(xAt(u), -bAt(u) * 0.86); }
  const deck = k.add(new THREE.ShapeGeometry(sh), k.mat(C.wood, { side: THREE.DoubleSide }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.3;
  k.at(new THREE.BoxGeometry(2 * HL * 0.9, 0.14, 0.16), k.mat(C.dark), 0, sAt(0.5) - dAt(0.5) + 0.02, 0);
}

// 03 prow: round letters curl it, a turn per letter; the painted eyes come with it
function prow(k: Kit, turns: number): void {
  const mat = k.mat(C.black), y0 = sAt(1) - 0.15, pts: [number, number, number][] = [], steps = 18, turn = turns * 0.75;
  let x = HL, y = y0, ang = Math.PI * 0.42;
  for (let s = 0; s <= steps; s++) {
    pts.push([x, y, 0]);
    const seg = 0.11 + (0.02 * (steps - s)) / steps;
    ang += turn / steps;
    x += Math.cos(ang) * seg;
    y += Math.sin(ang) * seg;
  }
  k.tube(pts, 0.08, mat);
  k.at(new THREE.SphereGeometry(0.11, 8, 6), k.mat(C.ochre, { metal: 0.4 }), ...pts[pts.length - 1]);
  for (const side of [-1, 1]) {
    const u = 0.9, er = 0.17, eye = new THREE.Group();
    k.add(new THREE.CircleGeometry(er, 16), k.mat(C.cream, { side: THREE.DoubleSide }), "solid", eye);
    k.at(new THREE.CircleGeometry(er * 0.45, 12), k.mat(0x111111, { side: THREE.DoubleSide }), 0, 0, 0.004, "solid", eye);
    eye.position.set(xAt(u), sAt(u) - 0.24, side * (bAt(u) * Math.cos(0.3) + 0.012));
    eye.rotation.y = side > 0 ? -0.35 : Math.PI + 0.35;
    k.g.add(eye);
  }
  k.g.userData.turn = turns;
}

// 04 stern: one plume per consonant, fanned
function stern(k: Kit, n: number): void {
  const y0 = sAt(0) - 0.2;
  for (let p = 0; p < n; p++) {
    const t = n === 1 ? 0 : p / (n - 1) - 0.5, z = t * 0.9, lift = 1 - Math.abs(t) * 0.5;
    k.tube([[-HL, y0, z * 0.2], [-HL - 0.35, y0 + 0.7 * lift, z * 0.7], [-HL - 0.15, y0 + 1.35 * lift, z], [-HL + 0.3, y0 + 1.5 * lift, z * 1.05]], 0.045, k.mat(p % 2 ? C.ochre : C.black), "plume");
  }
}

// 05 shields: one a side per vowel, in its colour, along the rail
function shields(k: Kit, vowels: string[]): void {
  const r = 0.25;
  for (const side of [-1, 1]) vowels.forEach((v, q) => {
    const u = 0.22 + (0.56 * (q + 0.5)) / Math.max(vowels.length, 1);
    const sh = k.add(new THREE.CylinderGeometry(r, r, 0.05, 14), k.mat(VOWEL_COLOUR[v]), "shield");
    sh.rotation.x = Math.PI / 2;
    sh.position.set(xAt(u), sAt(u) + 0.12, side * (bAt(u) + 0.04));
    k.at(new THREE.SphereGeometry(r * 0.25, 8, 6), k.mat(C.bronze, { metal: 0.5 }), xAt(u), sAt(u) + 0.12, side * (bAt(u) + 0.08), "boss");
  });
}

// 06 mast: tall letters raise it, a step each; a crow's nest from three
function mast(k: Kit, steps: number): void {
  const h = 4.45 + 0.42 * steps, wood = k.mat(C.wood), rope = k.mat(C.rope);
  k.rod(V(0.35, 0.3, 0), V(0.35, h, 0), 0.1, wood, "solid", undefined, 8);
  if (steps >= 3) k.at(new THREE.CylinderGeometry(0.32, 0.25, 0.45, 10, 1, true), k.mat(C.dark, { side: THREE.DoubleSide }), 0.35, h - 0.55, 0);
  k.rod(V(0.35, h - 0.2, 0), V(HL - 0.3, sAt(0.96), 0), 0.015, rope);
  k.rod(V(0.35, h - 0.2, 0), V(-HL + 0.4, sAt(0.05), 0), 0.015, rope);
  for (const side of [-1, 1]) k.rod(V(0.35, h - 0.6, 0), V(0.1, sAt(0.5), side * bAt(0.5)), 0.012, rope);
}

// 07 sail: one stripe per letter across its width, a vowel in its colour, the rest linen; bellied
function sail(k: Kit, stripes: (string | null)[]): void {
  const W = 3.3, H = 2.3, yTop = 4.2, n = stripes.length, w = W / n;
  k.rod(V(0.48, yTop, -W / 2 - 0.25), V(0.48, yTop, W / 2 + 0.25), 0.05, k.mat(C.wood));
  stripes.forEach((ch, i) => {
    const geo = new THREE.PlaneGeometry(w, H, 2, 8);
    geo.rotateY(Math.PI / 2);
    const z0 = W / 2 - (i + 0.5) * w, p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const z = p.getZ(v) + z0, y = p.getY(v);
      p.setZ(v, z);
      p.setX(v, 0.3 * (1 - (2 * z / W) ** 2) * (1 - (2 * y / H) ** 2));
    }
    geo.computeVertexNormals();
    const colour = ch !== null && ch in VOWEL_COLOUR ? VOWEL_COLOUR[ch] : C.linen;
    k.at(geo, k.mat(colour, { side: THREE.DoubleSide, rough: 0.9 }), 0.56, yTop - H / 2 - 0.05, 0, "stripe");
  });
}

// 08 oars: one a side per letter, along the hull, dipping
function oars(k: Kit, per: number): void {
  const wood = k.mat(C.wood);
  for (const side of [-1, 1]) for (let q = 0; q < per; q++) {
    const u = 0.2 + (0.6 * (q + 0.5)) / per, piv = new THREE.Group();
    piv.position.set(xAt(u), sAt(u) - 0.06, side * bAt(u));
    const tip = V(0, -1.05, side * 2.1);
    k.rod(V(0, 0, 0), tip, 0.03, wood, "oar", piv, 5);
    const blade = k.add(new THREE.BoxGeometry(0.06, 0.22, 0.55), wood, "blade", piv);
    blade.position.copy(tip).multiplyScalar(1.02);
    blade.rotation.x = side * -0.45;
    piv.userData.phase = q;
    k.g.add(piv);
  }
}

// 09 steering oar: hanging letters reach it deeper, a step each, on both quarters
function steering(k: Kit, steps: number): void {
  const L = 0.75 + 0.3 * steps, wood = k.mat(C.wood), u = 0.12;
  for (const side of [-1, 1]) {
    const a = V(xAt(u) + 0.2, sAt(u) + 0.35, side * (bAt(u) + 0.05)), b = V(xAt(u) - 0.55 * L, -0.55 * L, side * (bAt(u) + 0.5 * L));
    k.rod(a, b, 0.05, wood);
    const blade = k.add(new THREE.BoxGeometry(0.08, 0.5 + 0.35 * L, 0.34), wood);
    blade.position.copy(b);
    blade.rotation.set(side * 0.45, 0, 0.5);
  }
}

// 10 pennant: the word itself, on a flag at the stern post; its length sets the flag's length
function pennant(k: Kit, word: string): void {
  const n = [...word].length, L = 0.9 + 0.13 * Math.min(Math.max(n, 2), 12), H = 0.5;
  k.rod(V(-2.55, 0.35, 0), V(-2.55, 3.15, 0), 0.035, k.mat(C.wood));
  const geo = new THREE.PlaneGeometry(L, H, 14, 2);
  geo.translate(-L / 2, 0, 0);
  const flag = k.at(geo, k.mat(0xf3e7cc, { side: THREE.DoubleSide, rough: 0.9 }), -2.55, 3.15 - H / 2, 0, "flag");
  flag.userData.wave = Float32Array.from(geo.attributes.position.array);
  k.g.userData.written = word;
}

export function buildShip(words: readonly string[]): BuiltShip {
  const root = new THREE.Group();
  const kits: Kit[] = [];
  const groups = PARTS.map((name, i) => {
    const g = new THREE.Group();
    g.name = name;
    g.userData.position = i;
    root.add(g);
    const k = new Kit(g);
    kits.push(k);
    const v = partOf(i, words[i] ?? "").value;
    [
      () => ram(k, v as string),
      () => hull(k, v as number),
      () => prow(k, v as number),
      () => stern(k, v as number),
      () => shields(k, v as string[]),
      () => mast(k, v as number),
      () => sail(k, v as (string | null)[]),
      () => oars(k, v as number),
      () => steering(k, v as number),
      () => pennant(k, v as string),
    ][i]();
    return g;
  });
  return {
    root,
    groups,
    dispose() {
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const k of kits) k.dispose();
    },
  };
}
