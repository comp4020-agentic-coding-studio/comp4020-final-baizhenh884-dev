import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LiveBody } from "../src/lib/house/live-body";

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
