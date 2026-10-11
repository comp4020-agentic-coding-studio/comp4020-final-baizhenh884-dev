import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LiveBody } from "../src/lib/house/live-body";
import { TERRITORIES } from "../src/lib/house/territories";

// Which group stands at each position while bodies are exchanged (no renderer:
// three.js scene graph only). Pure, so it runs the same against any APP_URL.
//
// The invariant: groups[i] is always the territory now standing at position i.
// A changed territory hands over to its incoming group as the change begins;
// the outgoing group belongs only to its exchange, which releases it at the
// end. Nothing standing is ever released.

const BASE = "Keep many website that people would miss whether it disappeared".split(" ");
const at = (i: number, w: string) => BASE.map((x, k) => (k === i ? w : x));
const drawing = (g: THREE.Group) => {
  const out = new THREE.Group();
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.add(new THREE.LineSegments(new THREE.EdgesGeometry((o as THREE.Mesh).geometry))); });
  return out;
};

// every geometry under a group, and whether each has been released
function watch(g: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  g.traverse((o) => { const geo = (o as THREE.Mesh).geometry; if (geo) geometries.add(geo); });
  const released = new Set<THREE.BufferGeometry>(); // a geometry may be released more than once; count it once
  for (const geo of geometries) geo.addEventListener("dispose", () => released.add(geo));
  return { all: () => released.size === geometries.size && geometries.size > 0, none: () => released.size === 0 };
}

// a territory's whole form: every mesh's world-space vertices, in order, so a solid moved inside an unchanged outline still differs
function form(g: THREE.Group): string {
  g.updateMatrixWorld(true);
  const solids: string[] = [], v = new THREE.Vector3();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const p = m.geometry.getAttribute("position"), pts: string[] = [];
    for (let i = 0; i < p.count; i++) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).toArray().map((x) => x.toFixed(4)).join(","));
    solids.push(`${m.userData.role ?? ""}:${pts.join(";")}`);
  });
  return solids.sort().join("|");
}

// the live path (show, change, settle) against a fresh show of the same final sentence: the territories that differ
function mismatches(before: string[], position: number, after: string[]): string[] {
  const live = new LiveBody(false, drawing), fresh = new LiveBody(false, drawing);
  live.show(before);
  live.change(position, after, "remote", 0);
  live.step(1e9, false); // the exchange and any following neighbour end
  fresh.show(after);
  const out: string[] = TERRITORIES.filter((_, i) => form(live.groups[i]) !== form(fresh.groups[i])).map((t) => t.id);
  if (live.groups.length !== 10 || live.animating) out.push("not settled");
  live.dispose(); fresh.dispose();
  return out;
}

// the constraint tests' word pool (the grammar fixture's first 325 words) and seeded generator
const POOL = (JSON.parse(readFileSync(new URL("./fixtures/house-descriptors.json", import.meta.url), "utf8")) as { rows: [number, string][] }).rows
  .filter((r) => r[0] === 0).map((r) => r[1]).slice(0, 325);
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

describe("House live body", () => {
  it("hands each changed position to its incoming group, and a second change replaces that one", () => {
    const body = new LiveBody(false, drawing);
    body.show(BASE);
    const original = body.groups[2], untouched = body.groups[5];
    const originalReleased = watch(original);

    body.change(2, at(2, "almost"), "own", 0);
    const first = body.groups[2];
    expect(first, "the changed position still points at its old group").not.toBe(original);
    expect(first.parent, "the incoming group isn't in the body").toBe(body.root);
    expect(first.userData.position).toBe(2);
    expect(body.exchanges[0].outgoing).toBe(original);
    expect(body.exchanges[0].incoming).toBe(first);
    expect(body.groups[5], "an unchanged territory was swapped").toBe(untouched);
    const firstReleased = watch(first);

    // the second change at the same position starts from the first change's incoming group
    body.change(2, at(2, "website"), "remote", 10);
    expect(originalReleased.all(), "the original group wasn't released when its exchange ended").toBe(true);
    expect(original.parent).toBeNull();
    expect(firstReleased.none(), "the standing group was released before its own exchange began").toBe(true);
    expect(body.exchanges).toHaveLength(1);
    expect(body.exchanges[0].outgoing, "the second exchange didn't start from the first change's group").toBe(first);
    const second = body.groups[2];
    expect(second).not.toBe(first);
    expect(body.exchanges[0].incoming).toBe(second);
    expect(body.groups[5]).toBe(untouched);

    const secondReleased = watch(second);
    body.finishAll();
    expect(firstReleased.all(), "the first change's group wasn't released after its exchange").toBe(true);
    expect(secondReleased.none(), "the standing group was released").toBe(true);
    expect(body.groups[2]).toBe(second);
    expect(second.parent).toBe(body.root);
    expect(body.root.children.filter((c) => c.userData.position === 2)).toEqual([second]);
    body.dispose();
  });

  it("keeps exactly the ten standing groups in the body once an exchange is over", () => {
    const body = new LiveBody(false, drawing);
    body.show(BASE);
    body.change(6, at(6, "garden"), "own", 0);
    body.step(1e9, false);
    expect(body.animating).toBe(false);
    const byPosition = [...body.root.children].sort((a, b) => a.userData.position - b.userData.position);
    expect(byPosition).toEqual([...body.groups]);
    body.dispose();
  });

  it("settles a live change on exactly the body a fresh load of the same sentence shows", () => {
    // the cases found by hand: each left a stale neighbour standing (a ground ledge, a hall's old cut)
    const MAKER = "Make a website that people would miss if it disappeared".split(" ");
    const cases: [string[], number, string][] = [
      [MAKER, 3, "ox"], // front-right: the ground under it kept its old front
      [MAKER, 1, "ox"], [MAKER, 2, "ox"], [MAKER, 8, "responsibilities"], [MAKER, 0, "jumping"], [MAKER, 4, "garden"],
      ["week stone loud autumn appeared window now find internet share".split(" "), 4, "although"], // entry: the hall's cut
    ];
    for (const [before, position, word] of cases) {
      const after = before.map((w, i) => (i === position ? word : w));
      expect(mismatches(before, position, after), `${before[position]} → ${word} at ${TERRITORIES[position].id}`).toEqual([]);
    }
  });

  it("settles every live change on the fresh body, across many sentences and every position", () => {
    const next = rng(4020), word = () => POOL[Math.floor(next() * POOL.length)];
    const found: string[] = [];
    for (let k = 0; k < 40; k++) for (let position = 0; position < 10; position++) {
      const before = Array.from({ length: 10 }, word), after = before.slice();
      after[position] = word();
      if (after[position] !== before[position]) found.push(...mismatches(before, position, after).map((t) => `${t} after ${before[position]} → ${after[position]} at ${TERRITORIES[position].id}`));
    }
    expect(found.slice(0, 5), `${found.length} stale territories`).toEqual([]);
  }, 30_000); // 400 live changes: about 4 s here, 8.6 s on the CI runner, against Vitest's 5 s default

  it("settles a run of live changes, including two at one position, on the fresh body", () => {
    const next = rng(77), word = () => POOL[Math.floor(next() * POOL.length)];
    for (let k = 0; k < 12; k++) {
      const body = new LiveBody(false, drawing), words = Array.from({ length: 10 }, word);
      body.show(words);
      for (const position of [2, 0, 3, 3, 8, 4, 1, 1, 9]) {
        words[position] = word();
        body.change(position, [...words], "remote", 0); // each change finishes the one before it
      }
      body.finishAll();
      const fresh = new LiveBody(false, drawing);
      fresh.show(words);
      expect(body.groups).toHaveLength(10);
      body.groups.forEach((g, i) => expect(form(g), `${TERRITORIES[i].id} after a run of changes`).toBe(form(fresh.groups[i])));
      expect([...body.root.children].sort((a, b) => a.userData.position - b.userData.position), "something other than the ten standing groups is left").toEqual([...body.groups]);
      body.dispose(); fresh.dispose();
    }
  });

  it("refuses to release a standing territory except in a whole-body teardown", () => {
    const body = new LiveBody(false, drawing);
    body.show(BASE);
    const standing = body.groups[3];
    expect(() => (body as unknown as { release(g: THREE.Group): void }).release(standing)).toThrow();
    const released = watch(body.groups[3]);
    body.show(at(3, "almost")); // a whole-body teardown is allowed
    expect(released.all()).toBe(true);
    body.dispose();
    expect(body.groups).toHaveLength(0);
  });
});
