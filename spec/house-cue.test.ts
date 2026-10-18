import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { partTone } from "../src/lib/house/theme";

// How one part of a house is drawn, given whether it's chosen, pointed at,
// receding behind another, or this visitor's own (theme.ts partTone, which
// HouseView.paint applies). Pure, so it's checked here without a renderer.
//
// Your word, kept (plan B): in the kept house, the author's own part is
// drawn visibly firmer than every other part (at page scale it was
// indistinguishable at +0.12 edge opacity), and quietly: never red, no
// motion, nothing an alert would use. The standing house's cue for a
// visitor's standing word stays what it was.

const red = (hex: number) => {
  const c = new THREE.Color(hex);
  return c.r > 0.6 && c.g < 0.35 && c.b < 0.35;
};
const rest = { selected: false, hovered: false, traced: false, other: false };

describe("a part's tone", () => {
  it("draws your own part in the kept house visibly firmer, in the kept half's own ink, never red", () => {
    const plain = partTone("kept", rest), mine = partTone("kept", { ...rest, traced: true });
    expect(mine.edge - plain.edge, "your kept part's edges are barely stronger than any other part's").toBeGreaterThanOrEqual(0.4);
    expect(mine.edge, "edges can't be more than solid").toBeLessThanOrEqual(1);
    expect(mine.lift, "your kept part's timber isn't lightened at all").toBeGreaterThan(0);
    expect(mine.lift, "your kept part is lightened enough to read as a highlight").toBeLessThanOrEqual(0.2);
    expect(red(mine.edgeColour), "your kept part's edges are red").toBe(false);
    expect(mine.edgeColour, "your kept part's edges aren't in the kept half's ink").toBe(plain.edgeColour);
  });

  it("leaves every other part of the kept house as it was", () => {
    expect(partTone("kept", rest)).toEqual({ edge: 0.42, edgeColour: 0xefe6d8, lift: 0, recede: 0 });
  });

  it("keeps the standing house's cue for your standing word as it was", () => {
    expect(partTone("present", { ...rest, traced: true }).edge).toBeCloseTo(0.32, 5);
    expect(partTone("present", { ...rest, traced: true }).lift).toBe(0);
  });

  it("keeps selection and pointing as they were, and lets them win over the cue", () => {
    expect(partTone("present", { ...rest, selected: true }).edge).toBe(0.9);
    expect(partTone("present", { ...rest, hovered: true }).edge).toBe(0.6);
    expect(partTone("present", { ...rest, other: true })).toMatchObject({ edge: 0.05, recede: 0.62 });
    expect(partTone("kept", { ...rest, traced: true, other: true }).edge, "a receding part kept its cue").toBe(0.05);
  });
});
