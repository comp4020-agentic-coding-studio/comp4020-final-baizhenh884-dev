import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { arrivalAt, DRIFT, duration, frameAt, leavesAt, newPartRed, plankColour, RED_MS, type Kind } from "../src/lib/ship/motion";

// How a ship's part is exchanged, as numbers over time (src/lib/ship/motion.ts,
// moved from the house unchanged). Pure, so it runs the same against any
// APP_URL. The rules (CLAUDE.md "Scope (Final Project: the ship, in one
// harbour)"):
//   - part → trace: the old part's drawing appears as it withdraws and is
//     never gone and back again
//   - red only while the part is being rebuilt; nothing is red at the end
//   - reduced motion: nothing moves, the new part is simply there
//   - a crossing: the old plank flies from the live ship toward the slipway
//     (the kept ship's gap, or the pallet), and only once it has left does it
//     arrive there. Calm at rest, loud at the change: it runs longer than an
//     ordinary exchange. Reduced motion: nothing flies, the parts swap.

const samples = (kind: Kind, reduced = false) => {
  const end = duration(kind, reduced), out = [];
  for (let t = 0; t <= end + 50; t += 10) out.push({ t, ...frameAt(kind, t, reduced) });
  return out;
};

describe("the ship's exchange motion", () => {
  for (const kind of ["own", "remote", "cross"] as const) {
    it(`${kind}: the old body becomes its drawing, which is never gone and back`, () => {
      const f = samples(kind);
      const first = f.findIndex((x) => x.trace > 0), last = f.findLastIndex((x) => x.trace > 0);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(f.slice(first, last + 1).every((x) => x.trace > 0), "the drawing disappeared and came back").toBe(true);
      expect(f[first].outgoing, "the drawing appeared after the body had gone").toBeGreaterThan(0);
      for (let i = 1; i < f.length; i++) expect(Math.abs(f[i].trace - f[i - 1].trace), `the drawing jumped at ${f[i].t}ms`).toBeLessThan(0.2);
    });

    it(`${kind}: the old body withdraws as the new one arrives, and the new one settles in place`, () => {
      const f = samples(kind);
      for (let i = 1; i < f.length; i++) {
        expect(f[i].outgoing, "the old body came back").toBeLessThanOrEqual(f[i - 1].outgoing + 1e-9);
        expect(f[i].incoming, "the new body faded out again").toBeGreaterThanOrEqual(f[i - 1].incoming - 1e-9);
      }
      const end = frameAt(kind, duration(kind, false));
      expect(end).toMatchObject({ outgoing: 0, incoming: 1, drop: 0, trace: 0, incomingRed: 0 });
    });

    it(`${kind}: red only while rebuilding, none once it's over`, () => {
      const f = samples(kind);
      expect(f.some((x) => x.incomingRed > 0 || (x.trace > 0 && x.traceRed > 0.5)), "the rebuild was never red").toBe(true);
      const end = frameAt(kind, duration(kind, false) + 1);
      expect(end.incomingRed).toBe(0);
      expect(end.trace * end.traceRed).toBe(0);
    });

    it(`${kind}, reduced motion: nothing moves; the new body is there at once and stops being red`, () => {
      const f = samples(kind, true);
      expect(f.every((x) => x.lift === 0 && x.drop === 0 && x.incoming === 1 && x.outgoing === 0 && x.trace === 0)).toBe(true);
      expect(f[0].incomingRed, "a reduced-motion change isn't marked at all").toBeGreaterThan(0);
      expect(frameAt(kind, duration(kind, true), true).incomingRed).toBe(0);
    });
  }

  it("cross: the old part travels away and never comes back; an ordinary exchange never travels", () => {
    const f = samples("cross");
    expect(f.some((x) => x.travel >= 0.999), "the old part never left").toBe(true);
    for (let i = 1; i < f.length; i++) expect(f[i].travel, `the old part came back at ${f[i].t}ms`).toBeGreaterThanOrEqual(f[i - 1].travel - 1e-9);
    // it's still there, visibly, while it travels: it leaves rather than fading where it stood
    expect(f.filter((x) => x.travel > 0 && x.travel < 0.6).every((x) => x.outgoing > 0.5), "the part faded before it had gone far").toBe(true);
    for (const kind of ["own", "remote"] as const) expect(samples(kind).every((x) => x.travel === 0), `an ${kind} exchange travelled`).toBe(true);
  });

  it("cross: it arrives at the slipway only once it has left the live ship, then sets down, never red", () => {
    const end = duration("cross", false);
    let arrived = false, last = Infinity;
    for (let t = 0; t <= end + 50; t += 10) {
      const a = arrivalAt(t), s = frameAt("cross", t);
      if (a.opacity > 0) {
        expect(s.travel, `the part arrived at ${t}ms before it had left`).toBeGreaterThan(0.9);
        arrived = true;
      }
      if (arrived) {
        expect(a.travel, `the arriving part went back out at ${t}ms`).toBeLessThanOrEqual(last + 1e-9);
        last = a.travel;
      }
    }
    expect(arrived, "the part never arrived").toBe(true);
    expect(arrivalAt(end)).toMatchObject({ travel: 0, opacity: 1, red: 0 });
    // the old plank arrives as itself, never red: red is the live ship's new part alone (the maker, 30 October:
    // with the new part, the flying plank and the arriving kept part all red, the old plank couldn't be told
    // from the new one). This replaces the house-era rule that marked the arrival as rebuilding.
    for (let t = 0; t <= end + 50; t += 10) expect(arrivalAt(t).red, `the arriving kept part is red at ${t}ms`).toBe(0);
    for (let t = 0; t <= 1300; t += 10) expect(arrivalAt(t, true).red, "with reduced motion the kept part is red").toBe(0);
  });

  // Red is the live ship's new part only, for about a second: on as it's set down, gone by RED_MS
  it("marks only the new part red, and only for about a second", () => {
    expect(RED_MS).toBeGreaterThanOrEqual(600);
    expect(RED_MS).toBeLessThanOrEqual(1100);
    expect(newPartRed(0, false), "the new part isn't red as it's set down").toBeGreaterThan(0.5);
    expect(newPartRed(RED_MS / 2, false)).toBeGreaterThan(0);
    for (let t = RED_MS; t <= 4000; t += 50) expect(newPartRed(t, false), `the new part is still red at ${t}ms`).toBe(0);
    for (let t = 10; t < RED_MS; t += 10) expect(newPartRed(t, false), `the red grew back at ${t}ms`).toBeLessThanOrEqual(newPartRed(t - 10, false) + 1e-9);
    // reduced motion: the outline in red for a moment, then not
    expect(newPartRed(0, true)).toBe(1);
    expect(newPartRed(1300, true)).toBe(0);
  });

  // The plank that flies is the old part as it stood: its own colour until it nears the slipway, then it bleaches
  // to the kept ship's driftwood as it lands; never red unless the part itself was.
  it("flies the old plank in its own colour and bleaches it to driftwood as it lands", () => {
    const red = new THREE.Color(0xc3331c);
    for (const hex of [0x23201d, 0x8e2f22, 0x2f5f8c, 0xefe6d0, 0x8c6340]) {
      const base = new THREE.Color(hex), weathered = base.clone().lerp(DRIFT, 0.5);
      for (const k of [0, 0.25, 0.5, 0.6]) expect(plankColour(base, k).getHex(), `mid-flight (${k}) the plank isn't its own colour`).toBe(base.getHex());
      expect(plankColour(base, 1).getHex(), "the plank doesn't land as driftwood").toBe(weathered.getHex());
      for (let k = 0; k <= 1; k += 0.05) {
        const c = plankColour(base, k), d = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
        expect(d(c, red) >= Math.min(d(base, red), d(weathered, red)) - 1e-6, `the plank turns toward red at ${k.toFixed(2)}`).toBe(true);
      }
    }
  });

  it("cross is loud: it runs longer than any ordinary exchange", () => {
    expect(duration("cross", false)).toBeGreaterThan(duration("remote", false));
  });

  it("cross, reduced motion: nothing flies; the kept part is simply there", () => {
    expect(samples("cross", true).every((x) => x.travel === 0)).toBe(true);
    for (let t = 0; t <= duration("cross", true) + 50; t += 10) expect(arrivalAt(t, true)).toMatchObject({ travel: 0, opacity: 1 });
  });

  it("an own change runs faster than another visitor's", () => {
    expect(duration("own", false)).toBeLessThan(duration("remote", false));
  });

  // the waiting word lands with its plank (#15): when the plank has gone its whole way, and at once with reduced motion
  it("cross: a waiting word may land once the plank has left, never before, and at once with reduced motion", () => {
    const at = leavesAt(false);
    expect(frameAt("cross", at - 50).travel).toBeLessThan(1);
    expect(frameAt("cross", at).travel).toBeGreaterThanOrEqual(0.999);
    expect(leavesAt(true)).toBe(0);
  });
});
