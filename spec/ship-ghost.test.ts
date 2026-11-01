import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildShip } from "../src/lib/ship/build";
import { ghostPart } from "../src/lib/ship/ghost";
import { PARTS } from "../src/lib/ship/rules";

// A kept ship's missing part (a part still standing in the harbour) is a faint, translucent wooden ghost of
// itself, the hull the most present, so a ship still being gathered reads as a ship at any moment (the maker,
// 1 November: drawn as a thin white outline, a ship with no hull yet read as parts floating in the air). Its own
// geometry, so it's a ghost of that part and no other; one wood for every ghost, never red (red is only a part
// being rebuilt now); and once the plank arrives the part is exactly itself again. Real geometry and the
// materials drawn, no renderer.

// words that give every part some body, and shields painted vowel a's red: a ghost must not keep it
const WORDS = ["anchor", "banana", "website", "stern", "aaaaaa", "would", "salaam", "students", "it", "whether"];

const meshes = (g: THREE.Group) => { const out: THREE.Mesh[] = []; g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) out.push(o as THREE.Mesh); }); return out; };
function form(g: THREE.Group): string {
  g.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  return meshes(g).map((m) => {
    const p = m.geometry.getAttribute("position"), pts: string[] = [];
    for (let i = 0; i < p.count; i++) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).toArray().map((x) => x.toFixed(4)).join(","));
    return pts.join(";");
  }).sort().join("|");
}
const drawn = (g: THREE.Group) => meshes(g).flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]);
const rgb = (c: THREE.Color) => [c.r, c.g, c.b].map((x) => Math.round(x * 255));

describe("a kept ship's missing part", () => {
  for (const [i, name] of PARTS.entries()) {
    it(`is a faint, translucent wooden ghost of the ${name} itself, and itself again once its plank arrives`, () => {
      const ship = buildShip(WORDS), g = ship.groups[i];
      const whole = form(g), materials = meshes(g).map((m) => m.material);
      ghostPart(g, i, true);
      expect(form(g), `the ${name}'s ghost isn't its own shape`).toBe(whole);
      for (const m of drawn(g)) {
        expect(m.transparent && m.opacity > 0 && m.opacity < 1, `the ${name}'s ghost isn't translucent`).toBe(true);
        expect(m.depthWrite, `the ${name}'s ghost hides what's behind it`).toBe(false);
        const [r, gr, b] = rgb(m.color);
        expect(r >= gr && gr >= b && r - b >= 30, `the ${name}'s ghost isn't wood (${r},${gr},${b})`).toBe(true);
        expect(r > 150 && r > 2.2 * gr && r > 2.2 * b, `the ${name}'s ghost is red`).toBe(false);
        expect(m.emissive.getHex(), `the ${name}'s ghost glows at rest`).toBe(0);
      }
      ghostPart(g, i, false);
      expect(form(g)).toBe(whole);
      expect(meshes(g).map((m) => m.material), `the ${name} isn't itself again once its plank arrives`).toEqual(materials);
      ship.dispose();
    });
  }

  it("is one wood for every part, and the hull the most present of them", () => {
    const ship = buildShip(WORDS);
    const opacity = ship.groups.map((g, i) => { ghostPart(g, i, true); return Math.min(...drawn(g).map((m) => m.opacity)); });
    const colours = new Set(ship.groups.flatMap((g) => drawn(g).map((m) => m.color.getHex())));
    expect(colours.size, "the ghosts aren't one wood").toBe(1);
    opacity.forEach((o, i) => { if (i !== 1) expect(opacity[1], `the hull's ghost is no more present than the ${PARTS[i]}'s`).toBeGreaterThan(o); });
    ship.dispose();
  });
});
