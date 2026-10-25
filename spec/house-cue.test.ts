import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { KEPT_PALETTE, partTone } from "../src/lib/house/theme";

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
    expect(partTone("kept", rest)).toEqual({ edge: 0.42, edgeColour: 0xffffff, lift: 0, recede: 0 });
  });

  // The kept house is drawn on the blueprint (#1D3350): its solid parts are
  // cream, light against that ground, and its outlines white. Red stays only
  // for a part being rebuilt now. How the lit house reads is judged in a
  // render; this holds the palette it's lit from.
  it("draws the kept house's solid parts in cream on the blueprint, outlined in white, never red", () => {
    // relative luminance from the sRGB hex, as a contrast ratio is measured on the page
    const lum = (hex: number) => [16, 8, 0].map((s) => ((hex >> s) & 255) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (a: number, b: number) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    for (const [role, hex] of Object.entries(KEPT_PALETTE).filter(([r]) => r !== "opening")) {
      const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
      expect(contrast(hex, 0x1d3350), `the kept ${role} doesn't read on the blueprint`).toBeGreaterThanOrEqual(7);
      expect(c.r >= c.b && c.g >= c.b, `the kept ${role} isn't a warm cream`).toBe(true);
      expect(red(hex), `the kept ${role} is red`).toBe(false);
    }
    expect(partTone("kept", rest).edgeColour, "the kept outlines aren't white").toBe(0xffffff);
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
