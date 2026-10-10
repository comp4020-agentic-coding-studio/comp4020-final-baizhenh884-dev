import { describe, expect, it } from "vitest";
import { duration, frameAt, type Kind } from "../src/lib/house/motion";

// How a territory is exchanged, as numbers over time (motion.ts). Pure, so it
// runs the same against any APP_URL. The rules (CLAUDE.md House scope):
//   - body → trace: the old body's drawing appears as the body withdraws and
//     is never gone and back again
//   - red only while the body is being rebuilt; nothing is red at the end
//   - reduced motion: nothing moves, the new body is simply there

const samples = (kind: Kind, reduced = false) => {
  const end = duration(kind, reduced), out = [];
  for (let t = 0; t <= end + 50; t += 10) out.push({ t, ...frameAt(kind, t, reduced) });
  return out;
};

describe("House exchange motion", () => {
  for (const kind of ["own", "remote"] as const) {
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

  it("an own change runs faster than another visitor's", () => {
    expect(duration("own", false)).toBeLessThan(duration("remote", false));
  });
});
