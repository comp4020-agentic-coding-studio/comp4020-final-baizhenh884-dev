import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LiveBody } from "../src/lib/house/live-body";
import { buildShip } from "../src/lib/ship/build";
import { counts, PAINT, paintOf, partOf, PARTS, VOWEL_COLOUR } from "../src/lib/ship/rules";

// The ship's body (docs/decisions/0005-the-ship.md), without a renderer:
// three.js scene graph only, so it builds the same in node as in the browser.
// One group per position, owning only its own part; every part is what its
// rule says (the counts a visitor can see: oars, shields, plumes, stripes);
// one word changes only its own part; and the live path (show, change,
// settle) ends on exactly the body a fresh build of the same sentence makes.
// Not on the page yet: GET / keeps the house until the harbour (slice 3).
// Pure, so it runs the same against any APP_URL.

const BASE = "Make a website that people would miss if it disappeared".split(" ");
const at = (i: number, w: string) => BASE.map((x, k) => (k === i ? w : x));
const POOL = (JSON.parse(readFileSync(new URL("./fixtures/ship-counts.json", import.meta.url), "utf8")) as { rows: [string][] }).rows.map((r) => r[0]);
const EXTREMES = ["a", "123", "日本", "Café", "incomprehensibilities", "rhythm", "aeiou", "jigglypuppy", "w".repeat(24)];

// a part's whole form: every mesh's world-space vertices and colour, in order
function form(g: THREE.Object3D): string {
  g.updateMatrixWorld(true);
  const solids: string[] = [], v = new THREE.Vector3();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const p = m.geometry.getAttribute("position"), pts: string[] = [];
    for (let i = 0; i < p.count; i++) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).toArray().map((x) => x.toFixed(4)).join(","));
    const c = (m.material as THREE.MeshStandardMaterial).color?.getHex() ?? 0;
    solids.push(`${m.userData.role ?? ""}:${c}:${pts.join(";")}`);
  });
  return solids.join("|");
}
// the meshes a part marks as one counted thing (an oar, a shield, a plume, a stripe), by role
const marked = (g: THREE.Object3D, role: string) => {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.role === role) out.push(o as THREE.Mesh); });
  return out;
};
const colours = (ms: THREE.Mesh[]) => ms.map((m) => (m.material as THREE.MeshStandardMaterial).color.getHex());

describe("the ship's body", () => {
  it("builds ten parts, one group per position, each named for its part and owned by its position", () => {
    const s = buildShip(BASE);
    expect(s.groups).toHaveLength(10);
    s.groups.forEach((g, i) => {
      expect(g.userData.position).toBe(i);
      expect(g.name).toBe(PARTS[i]);
      expect(g.parent).toBe(s.root);
      expect(marked(g, "solid").length + g.children.length, `${PARTS[i]} is empty`).toBeGreaterThan(0);
    });
    s.dispose();
  });

  it("is deterministic: the same sentence always builds the same ship", () => {
    for (const words of [BASE, at(2, "incomprehensibilities"), Array(10).fill("123")]) {
      const a = buildShip(words), b = buildShip(words);
      expect(a.groups).toHaveLength(10);
      a.groups.forEach((g, i) => expect(form(g), PARTS[i]).toBe(form(b.groups[i])));
      a.dispose(); b.dispose();
    }
  });

  it("changes only its own part when one word changes: no part reads another position's word", () => {
    for (let p = 0; p < 10; p++) for (const w of ["whether", "123", "Café", "incomprehensibilities"]) {
      const a = buildShip(BASE), b = buildShip(at(p, w));
      // its own part changes exactly when the rule says it does
      const differs = JSON.stringify(partOf(p, BASE[p]).value) !== JSON.stringify(partOf(p, w).value);
      expect(form(a.groups[p]) !== form(b.groups[p]), `${w} at the ${PARTS[p]}: the part ${differs ? "didn't change" : "changed"}`).toBe(differs);
      a.groups.forEach((g, i) => { if (i !== p) expect(form(g), `${w} at ${PARTS[p]} moved the ${PARTS[i]}`).toBe(form(b.groups[i])); });
      a.dispose(); b.dispose();
    }
  });

  it("builds, for every word, the counts its rule says, on both sides where a part has two", () => {
    for (const w of [...POOL.slice(0, 120), ...EXTREMES]) {
      const s = buildShip(Array(10).fill(w));
      const g = (p: number) => s.groups[p];
      // ram: one prong for a beak, three for a trident, none (a block) for a blunt ram
      expect(marked(g(0), "prong"), `${w}: ram`).toHaveLength({ blunt: 0, beak: 1, trident: 3 }[partOf(0, w).value as string]!);
      // hull: painted the word's paint
      expect(colours(marked(g(1), "paint")), `${w}: hull paint`).toEqual([paintOf(counts(w))]);
      // stern: one plume each
      expect(marked(g(3), "plume"), `${w}: stern plumes`).toHaveLength(partOf(3, w).value as number);
      // shields: one per vowel a side, each in its vowel's colour
      const vs = partOf(4, w).value as string[];
      expect(colours(marked(g(4), "shield")), `${w}: shields`).toEqual([...vs, ...vs].map((v) => VOWEL_COLOUR[v]));
      // sail: one stripe per letter, a vowel in its colour, the rest linen
      const stripes = partOf(6, w).value as (string | null)[];
      expect(marked(g(6), "stripe"), `${w}: sail stripes`).toHaveLength(stripes.length);
      // oars: one per letter, each side
      expect(marked(g(7), "oar"), `${w}: oars`).toHaveLength(2 * (partOf(7, w).value as number));
      s.dispose();
    }
  });

  it("raises the mast, curls the prow and lowers the steering oar step by step with their counts", () => {
    const height = (w: string) => { const s = buildShip(Array(10).fill(w)), b = new THREE.Box3().setFromObject(s.groups[5]); s.dispose(); return b.max.y; };
    const depth = (w: string) => { const s = buildShip(Array(10).fill(w)), b = new THREE.Box3().setFromObject(s.groups[8]); s.dispose(); return b.min.y; };
    const curl = (w: string) => { const s = buildShip(Array(10).fill(w)), n = s.groups[2].userData.turn as number; s.dispose(); return n; };
    // mast heights 0..5: sea, it, would, tall, thankful (5 tall letters: t h k f l), stepping up and then capped
    const masts = ["sea", "it", "would", "tall", "bdfhk", "bdfhktl"].map(height);
    for (let k = 1; k < 5; k++) expect(masts[k], `mast step ${k}`).toBeGreaterThan(masts[k - 1]);
    expect(masts[5], "the mast isn't capped at five").toBeCloseTo(masts[4], 6);
    const oars = ["it", "jump", "jiggly", "jigglypuppy"].map(depth);
    for (let k = 1; k < 3; k++) expect(oars[k], `steering oar step ${k}`).toBeLessThan(oars[k - 1]);
    expect(oars[3], "the steering oar isn't capped at four").toBeCloseTo(oars[2], 6);
    expect(curl("hi")).toBe(0);
    expect(curl("bed")).toBeGreaterThan(curl("be"));
  });

  it("writes the word itself on the pennant, exactly as written", () => {
    for (const w of ["disappeared", "Café", "123", "it's", "日本"]) {
      const s = buildShip(at(9, w));
      expect(s.groups[9].userData.written).toBe(partOf(9, w).value);
      s.dispose();
    }
  });

  it("gives a word with no letter every part's minimum", () => {
    const s = buildShip(Array(10).fill("123"));
    expect(marked(s.groups[0], "prong")).toHaveLength(0);
    expect(colours(marked(s.groups[1], "paint"))).toEqual([PAINT[0]]);
    expect(s.groups[2].userData.turn).toBe(0);
    expect(marked(s.groups[3], "plume")).toHaveLength(1);
    expect(marked(s.groups[4], "shield")).toHaveLength(0);
    expect(marked(s.groups[6], "stripe")).toHaveLength(1);
    expect(marked(s.groups[7], "oar")).toHaveLength(2);
    s.dispose();
  });

  it("releases every geometry it made", () => {
    const s = buildShip(BASE), geos = new Set<THREE.BufferGeometry>();
    s.root.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) geos.add(g); });
    let released = 0;
    for (const g of geos) g.addEventListener("dispose", () => released++);
    s.dispose();
    expect(geos.size, "the ship has no geometry").toBeGreaterThan(0);
    expect(released).toBe(geos.size);
  });
});

// Live equals fresh, for the ship: the same live body the house uses
// (src/lib/house/live-body.ts), given the ship's builder, settles every change
// on exactly what a fresh build of the final sentence shows.
describe("the ship, live", () => {
  const drawing = (g: THREE.Group) => new THREE.Group().add(...g.children.filter((c) => (c as THREE.Mesh).isMesh).map((c) => new THREE.LineSegments(new THREE.EdgesGeometry((c as THREE.Mesh).geometry))));
  const live = () => {
    const l = new LiveBody("present", drawing, buildShip, () => {});
    l.show(BASE);
    // it is the ship it was given, not the house's default builder
    expect(l.groups.map((g) => g.name), "the live body didn't build the ship").toEqual(PARTS);
    return l;
  };
  function mismatches(before: string[], position: number, after: string[]): string[] {
    const l = live(), f = live();
    l.show(before);
    l.change(position, after, "remote", 0);
    l.step(1e9, false);
    f.show(after);
    const out = PARTS.filter((_, i) => form(l.groups[i]) !== form(f.groups[i]));
    if (l.groups.length !== 10 || l.animating) out.push("not settled");
    l.dispose(); f.dispose();
    return out;
  }

  it("settles every live change on the fresh ship, at every position", () => {
    const bad: string[] = [];
    for (let p = 0; p < 10; p++) for (const w of [...POOL.slice(0, 40), ...EXTREMES]) {
      const m = mismatches(BASE, p, at(p, w));
      if (m.length) bad.push(`${PARTS[p]} ← ${w}: ${m.join(", ")}`);
    }
    expect(bad.slice(0, 5), `${bad.length} wrong`).toEqual([]);
  });

  it("exchanges only the changed part: every other part keeps its standing group", () => {
    const l = live();
    l.show(BASE);
    const before = [...l.groups];
    l.change(7, at(7, "whether"), "remote", 0);
    l.groups.forEach((g, i) => (i === 7 ? expect(g).not.toBe(before[i]) : expect(g, PARTS[i]).toBe(before[i])));
    expect(l.exchanges).toHaveLength(1);
    expect(l.follows, "a ship part followed a neighbour's change").toHaveLength(0);
    l.dispose();
  });

  // the outgoing part is released whole once its exchange ends: geometries and materials, so a busy room leaks nothing
  it("releases a replaced part's geometries and materials once its exchange ends", () => {
    const l = live();
    const old = l.groups[7], geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
    old.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { geos.add(m.geometry); mats.add(m.material as THREE.Material); } });
    let g = 0, m = 0;
    for (const x of geos) x.addEventListener("dispose", () => g++);
    for (const x of mats) x.addEventListener("dispose", () => m++);
    l.change(7, at(7, "whether"), "remote", 0);
    l.step(1e9, false);
    expect(g, "a replaced part's geometry wasn't released").toBe(geos.size);
    expect(m, "a replaced part's material wasn't released").toBe(mats.size);
    l.dispose();
  });

  it("settles a run of changes, two at one position, on the fresh ship", () => {
    const l = live(), f = live();
    let words = [...BASE];
    l.show(words);
    for (const [p, w] of [[7, "whether"], [1, "bubble"], [7, "it"], [4, "queue"], [9, "123"]] as const) {
      words = words.map((x, k) => (k === p ? w : x));
      l.change(p, words, "remote", 0);
    }
    l.step(1e9, false);
    f.show(words);
    l.groups.forEach((g, i) => expect(form(g), PARTS[i]).toBe(form(f.groups[i])));
    l.dispose(); f.dispose();
  });
});
