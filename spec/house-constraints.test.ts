import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildBody } from "../src/lib/house/build";
import { place } from "../src/lib/house/camera";
import { ZB } from "../src/lib/house/plan";
import { TERRITORIES } from "../src/lib/house/territories";

// The body's structural constraints, checked on real geometry (three.js runs
// in node without a renderer) for 500 deterministic sentences and a few
// extremes. Bounding boxes can't judge architecture, so these catch practical
// failures only; how the body reads is judged in the browser.
//
// The 500 sentences are the Prototype 6 set: seed 4020 over the grammar
// fixture's word pool (its first 325 words, in order).

const fixture = JSON.parse(readFileSync(new URL("./fixtures/house-descriptors.json", import.meta.url), "utf8")) as {
  rows: [number, string, ...unknown[]][];
};
const POOL = fixture.rows.filter((r) => r[0] === 0).map((r) => r[1]).slice(0, 325);
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const next = rng(4020);
const SENTENCES = Array.from({ length: 500 }, () => Array.from({ length: 10 }, () => POOL[Math.floor(next() * POOL.length)]));
const BASE = "Keep many website that people would miss whether it disappeared".split(" ");
const EXTREMES = [
  BASE,
  Array(10).fill("a"),
  Array(10).fill("incomprehensibilities"),
  Array(10).fill("bookkeeper"),
  Array(10).fill("rhythm"),
  Array(10).fill("tallbuildthat"), // 3+ tall letters everywhere: the tower
  BASE.map((w, i) => (i === 2 ? "incomprehensibilities" : w)),
];

type M = { s: number; role: string; box: THREE.Box3 };
const CONTACT = 0.03;
const overlap = (a: THREE.Box3, b: THREE.Box3, t: number) =>
  Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > t &&
  Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > t &&
  Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > t;
const near = (a: THREE.Box3, b: THREE.Box3) => a.clone().expandByScalar(CONTACT).intersectsBox(b);
const name = (s: number) => TERRITORIES[s].id;

function violations(words: string[]): string[] {
  const h = buildBody(words);
  const P = h.plan, G = P.G, found = new Set<string>();
  const meshes: M[] = [];
  h.root.updateMatrixWorld(true);
  h.groups.forEach((g, s) => g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push({ s, role: o.userData.role ?? "mass", box: new THREE.Box3().setFromObject(o, true) }); }));
  const solid = meshes.filter((m) => m.role !== "opening");

  // territories touch, never interpenetrate (ground and threshold meet below the body's level)
  for (let a = 0; a < meshes.length; a++) for (let b = a + 1; b < meshes.length; b++) {
    const A = meshes[a], C = meshes[b];
    if (A.s === C.s || !overlap(A.box, C.box, 0.03)) continue;
    if (Math.min(A.s, C.s) === 0 && Math.max(A.s, C.s) === 9 && Math.min(A.box.max.y, C.box.max.y) <= G + 0.01) continue;
    found.add(`overlap ${name(Math.min(A.s, C.s))}/${name(Math.max(A.s, C.s))}`);
  }
  // nothing detached: everything reaches the ground through touching parts
  const grounded = meshes.map((m) => m.box.min.y <= CONTACT);
  for (let changed = true; changed; ) {
    changed = false;
    for (let a = 0; a < meshes.length; a++) if (!grounded[a]) for (let b = 0; b < meshes.length; b++) if (grounded[b] && near(meshes[a].box, meshes[b].box)) { grounded[a] = changed = true; break; }
  }
  meshes.forEach((m, k) => { if (!grounded[k]) found.add(`detached ${name(m.s)}`); });
  // one body: the eight body territories hold together without the ground
  const body = meshes.filter((m) => m.s >= 1 && m.s <= 8), joined = body.map((m) => m.s === 2);
  for (let changed = true; changed; ) {
    changed = false;
    for (let a = 0; a < body.length; a++) if (!joined[a]) for (let b = 0; b < body.length; b++) if (joined[b] && near(body[a].box, body[b].box)) { joined[a] = changed = true; break; }
  }
  body.forEach((m, k) => { if (!joined[k]) found.add(`apart from the body ${name(m.s)}`); });
  // every mass stands on the ground territory
  for (const f of h.info.foot) {
    const under = meshes.filter((m) => m.s === 0 && Math.abs(m.box.max.y - G) < 0.01 && m.box.max.x > f.x0 + 0.05 && m.box.min.x < f.x1 - 0.05 && m.box.max.z > f.z0 + 0.05 && m.box.min.z < f.z1 - 0.05);
    if (under.length < (P.d[0].family === "stilts" ? 2 : 1)) found.add("unsupported mass");
  }
  // a clear way in: at least 1.0 wide and 2.1 high, from the street to the door
  const e = h.info.entry, half = e.half * (P.entry.family === "arch" ? 0.6 : 1) - 0.03;
  const corridor = new THREE.Box3(new THREE.Vector3(-half, G + 0.05, e.z0 + 0.05), new THREE.Vector3(half, G + 2.05, e.z1));
  for (const m of solid) if (m.s !== 4 && m.s !== 0 && !(m.s === 9 && m.box.max.y <= G + 0.01) && overlap(m.box, corridor, 0.005)) found.add(`entry blocked by ${name(m.s)}`);
  if (e.half * 2 < 1.0 - 1e-6 || e.h < 2.1) found.add("entry too small");
  // no unusable slivers, no sliver gaps between territories
  for (const m of solid) { const s = m.box.getSize(new THREE.Vector3()); if (Math.min(s.x, s.y, s.z) < 0.12) found.add(`sliver in ${name(m.s)}`); }
  for (let a = 0; a < solid.length; a++) for (let b = a + 1; b < solid.length; b++) {
    const A = solid[a].box, C = solid[b].box;
    if (solid[a].s === solid[b].s || (A.max.y <= G + 0.01 && C.max.y <= G + 0.01)) continue;
    const span = (k: "x" | "y" | "z") => Math.min(A.max[k], C.max[k]) - Math.max(A.min[k], C.min[k]) > 0.3;
    const gx = Math.max(A.min.x - C.max.x, C.min.x - A.max.x), gz = Math.max(A.min.z - C.max.z, C.min.z - A.max.z);
    if ((gx > 0.01 && gx < 0.12 && span("y") && span("z")) || (gz > 0.01 && gz < 0.12 && span("x") && span("y"))) found.add(`sliver gap ${name(solid[a].s)}/${name(solid[b].s)}`);
  }
  // the roof bears on the hall
  const roof = solid.filter((m) => m.s === 6 && m.box.min.x <= P.roof.x0 + 0.05 && m.box.max.x >= P.roof.x1 - 0.05);
  if (!roof.length || Math.min(...roof.map((m) => m.box.min.y)) > P.roof.eave + 0.02) found.add("roof off the hall");
  // each upper volume stands inside its own mass's plan (a curved corner carries nothing)
  for (const [u, b] of [[P.upL, P.bayL], [P.upR, P.bayR]] as const) {
    const inPlan = (x: number, z: number) => {
      if (x < b.x0 - 0.01 || x > b.x1 + 0.01 || z < ZB - 0.01 || z > b.topFront + 0.01) return false;
      if (b.family === "curved") {
        const cx = b.side < 0 ? b.x0 + b.r : b.x1 - b.r, cz = b.zf - b.r;
        if ((b.side < 0 ? x < cx : x > cx) && z > cz && Math.hypot(x - cx, z - cz) > b.r + 0.01) return false;
      }
      return true;
    };
    for (const m of meshes) if (m.s === u.s && Math.abs(m.box.min.y - u.y0) < 0.02)
      for (const x of [m.box.min.x, m.box.max.x]) for (const z of [m.box.min.z, m.box.max.z]) if (!inPlan(x, z)) found.add(`upper volume off its mass (${name(u.s)})`);
  }
  // within the body's limits, and inside the one default view at every aspect the page uses
  const all = new THREE.Box3();
  meshes.forEach((m) => all.union(m.box));
  const size = all.getSize(new THREE.Vector3());
  if (size.x > 17 || size.y > 11 || size.y / size.x < 0.28 || size.y / size.x > 1.0) found.add("extreme dimensions");
  const cam = new THREE.PerspectiveCamera(), v = new THREE.Vector3();
  for (const aspect of [16 / 9, 1.46, 1.0, 390 / 844]) {
    place(cam, aspect);
    for (const x of [all.min.x, all.max.x]) for (const y of [all.min.y, all.max.y]) for (const z of [all.min.z, all.max.z]) {
      v.set(x, y, z).project(cam);
      if (Math.abs(v.x) > 0.96 || Math.abs(v.y) > 0.96) found.add(`outside the view at ${aspect.toFixed(2)}`);
    }
  }
  h.dispose();
  return [...found];
}

describe("House body constraints", () => {
  it("builds every one of 500 deterministic sentences without a structural violation", () => {
    const bad = SENTENCES.map((s, i) => ({ i, words: s.join(" "), v: violations(s) })).filter((r) => r.v.length);
    expect(bad.slice(0, 5), `${bad.length} of 500 houses violate a constraint`).toEqual([]);
  });

  it("builds the extremes (long, short, repetitive, vowelless, towering words) without a violation", () => {
    for (const s of EXTREMES) expect(violations(s), s.join(" ")).toEqual([]);
  });

  it("builds the same body every time from the same sentence", () => {
    const signature = (words: string[]) => {
      const h = buildBody(words);
      h.root.updateMatrixWorld(true);
      const boxes = h.groups.map((g) => new THREE.Box3().setFromObject(g, true).toArray().map((x) => x.toFixed(4)).join(","));
      h.dispose();
      return boxes;
    };
    for (const s of [BASE, SENTENCES[7], SENTENCES[123]]) expect(signature(s)).toEqual(signature(s));
  });

  it("gives every territory a body of its own, owned by its position", () => {
    const h = buildBody(BASE);
    h.groups.forEach((g, s) => {
      let meshes = 0;
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
      expect(meshes, `${name(s)} has no geometry`).toBeGreaterThan(0);
      expect(g.userData.position).toBe(s);
    });
    h.dispose();
  });

  it("releases every geometry it made when disposed", () => {
    const h = buildBody(SENTENCES[3]);
    const geometries = new Set<THREE.BufferGeometry>();
    h.root.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) geometries.add(g); });
    let released = 0;
    for (const g of geometries) g.addEventListener("dispose", () => released++);
    h.dispose();
    expect(released).toBe(geometries.size);
  });
});
