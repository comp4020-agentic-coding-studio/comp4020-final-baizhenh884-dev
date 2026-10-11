// Every dimension of the body, before any geometry: the ten territories'
// characters (territories.ts) resolved against one another. Pure, so the
// renderer and the constraint tests read the same numbers.
//
// There is no fixed core. Three front masses stand side by side (left, the
// central hall, right) on a shared back datum; the entry is cut into the
// hall's front; an upper volume stands on each side mass; the roof covers the
// hall; a side mass closes the open left flank; the threshold leads in; the
// ground carries all of them.

import { describeTerritory, type Territory } from "./territories";

// the frame every territory measures from: a back datum and three front bays (x across, z to the street)
export const ZB = -3;
export const X0 = -5;
export const XL = -1.6;
export const XR = 1.6;
export const X1 = 5;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export type Bay = {
  s: number; side: -1 | 1; x0: number; x1: number; w: number; family: string;
  zf: number; h: number; t: number; depth: number; topFront: number;
  r: number; band: number; vd: number; slab: number; cols: number; n: number; gap: number; st: number; ww: number; wh: number;
};
export type Tier = { z0: number; z1: number; h: number };
export type Hall = { family: string; zs: number; h: number; depth: number; tiers: Tier[]; frontH: number; band: number; slabH: number };
export type Entry = { family: string; ed: number; fw: number; fp: number; n: number; eh: number; ew: number; frontW: number; frontH: number };
export type Upper = {
  s: number; family: string; ux: number; uh: number; gap: number; ud: number; x0: number; x1: number; z0: number; z1: number;
  y0: number; top: number; n: number; rise: number; pw: number; open: number; tall: number; rep: number;
};
export type Roof = { family: string; eave: number; z0: number; z1: number; x0: number; x1: number; pt: number; rise: number; n: number; parapet: number };
export type Side = { family: string; sw: number; sh: number; sdp: number; rep: number; open: number; mass: number; r: number; n: number; x0: number; z1: number };
export type Threshold = {
  family: string; z0: number; zp: number; z1: number; tr: number; hl: number; hr: number; freeL: boolean; freeR: boolean;
  ch: number; pw: number; tall: number; mass: number; rep: number; steps: number; run: number; r: number; tiers: number;
};
export type Body = {
  d: Territory[]; G: number; bayL: Bay; bayR: Bay; hall: Hall; entry: Entry; upL: Upper; upR: Upper;
  roof: Roof; side: Side; thr: Threshold;
};

// the extra width each side of the k-th of n nested entry frames
export const nestedOuter = (n: number, k: number) => 0.22 * (n - 1 - k);

export function planBody(words: readonly string[]): Body {
  if (words.length !== 10) throw new RangeError("a body needs ten words");
  const d = words.map((w, i) => describeTerritory(i, w));
  const lv = (s: number, k: keyof Territory["levels"]) => d[s].levels[k];
  const R = (s: number) => d[s].reach;

  // 1 ground: how high the body stands
  let G = d[0].family === "stilts" ? 0.45 + 0.35 * lv(0, "hang") : 0.22 + 0.16 * lv(0, "mass");
  if (d[0].family === "podium") G = Math.max(G, 0.14 * (1 + Math.max(1, lv(0, "rep")))); // every tier at least a step high

  // 2, 4 front masses
  const bay = (s: number, side: -1 | 1): Bay => {
    const [x0, x1] = side < 0 ? [X0, XL] : [XR, X1];
    const family = d[s].family, zf = -0.3 + 3.4 * R(s);
    const b: Bay = { s, side, x0, x1, w: x1 - x0, family, zf, h: 2.7 + 0.5 * lv(s, "tall"), t: 0.25 + 0.13 * lv(s, "mass"), depth: zf - ZB, topFront: zf,
      r: 0, band: 0, vd: 0, slab: 0, cols: 0, n: 1, gap: 0, st: 0, ww: 0, wh: 0 };
    if (family === "curved") {
      b.r = Math.min(b.w - 0.4, b.depth - 1.8, 1.3 + 0.55 * (lv(s, "round") - 1));
      b.band = clamp(0.35 + 0.4 * lv(s, "open"), 0.35, b.h - 1.4);
      b.topFront = b.zf - b.r;
    }
    if (family === "hollow") { b.vd = Math.min(1.0 + 0.5 * lv(s, "open"), b.depth - 1.0); b.slab = 0.3 + 0.1 * lv(s, "mass"); b.cols = lv(s, "rep") + 1; }
    if (family === "split") { b.n = 1 + lv(s, "rep"); b.gap = 0.24; b.st = Math.min(0.55, (b.depth - 1.6) / (b.n - 1)); b.topFront = b.zf - (b.n - 1) * b.st; }
    if (family === "solid") { b.n = 1 + lv(s, "rep"); b.ww = Math.min(0.5 + 0.3 * lv(s, "open"), (b.w - 0.45 * (b.n + 1)) / b.n); b.wh = 0.9 + 0.3 * lv(s, "tall"); }
    return b;
  };
  const bayL = bay(1, -1), bayR = bay(3, 1);

  // 3 hall, 5 entry
  const zs = -1.0 + 3.0 * R(2);
  const hall: Hall = { family: d[2].family, zs, h: 3.4 + 0.8 * lv(2, "tall"), depth: zs - ZB, tiers: [], frontH: 0, band: 0, slabH: 0 };
  const en: Entry = { family: d[4].family, ed: Math.min(0.5 + 0.5 * lv(4, "open"), hall.depth - 1.0), fw: 0.16 + 0.08 * lv(4, "mass"), fp: 0.14 + 0.08 * lv(4, "mass"),
    n: 1, eh: 0, ew: 0, frontW: 0, frontH: 0 };
  if (en.family === "nested") {
    en.n = Math.min(2 + lv(4, "rep"), Math.floor(en.ed / 0.16));
    if (en.n < 2) { en.n = 2; en.ed = Math.max(en.ed, 0.4); }
  }
  hall.tiers = [{ z0: ZB, z1: hall.zs, h: hall.h }];
  if (hall.family === "stepped") {
    let n = 1 + lv(2, "rep");
    const ftd = clamp(en.ed + 0.5, 1.0, 1.6);
    while (n > 1 && hall.depth - ftd < 0.9 * (n - 1)) n--;
    hall.h = Math.max(hall.h, 3.1 + 0.3 * (n - 1)); // a stepped hall keeps a front tier tall enough to enter
    const rest = (hall.depth - ftd) / (n - 1 || 1), step = clamp((hall.h - 3.1) / (n - 1 || 1), 0.3, 0.7);
    hall.tiers = [{ z0: hall.zs - ftd, z1: hall.zs, h: hall.h - (n - 1) * step }];
    for (let k = 1; k < n; k++) hall.tiers.push({ z0: hall.zs - ftd - k * rest, z1: hall.zs - ftd - (k - 1) * rest, h: hall.h - (n - 1 - k) * step });
    hall.tiers[hall.tiers.length - 1].z0 = ZB;
    en.ed = Math.min(en.ed, ftd - 0.3);
    if (en.family === "nested") en.n = Math.max(2, Math.min(en.n, Math.floor(en.ed / 0.16)));
  }
  hall.frontH = hall.tiers[0].h;
  hall.band = hall.family === "clerestory" ? clamp(0.5 + 0.25 * lv(2, "open"), 0.4, hall.frontH - 3.2) : 0;
  hall.slabH = hall.frontH - hall.band;
  if (en.family === "nested") en.n = Math.max(2, Math.min(en.n, 1 + Math.floor((hall.slabH - 0.3 - en.fw - 2.1) / 0.22)));
  const outer0 = nestedOuter(en.n, 0);
  en.eh = Math.min(2.2 + 0.35 * lv(4, "tall"), hall.slabH - 0.3 - en.fw - outer0);
  en.ew = Math.min(1.1 + 1.3 * R(4), 3.2 - 2 * en.fw - 0.3 - 2 * outer0);
  if (en.family === "arch") en.ew = Math.min(en.ew, 2 * (en.eh - 1.2));
  en.ew = Math.max(en.ew, 1.0);
  en.frontW = en.ew + 2 * outer0;
  en.frontH = en.eh + outer0;

  // 6, 8 upper volumes, each on top of its front mass
  const upperOf = (s: number, b: Bay, align: "back" | "front"): Upper => {
    const u: Upper = { s, family: d[s].family, ux: 1.4 + 2.0 * R(s), uh: 1.4 + 0.4 * lv(s, "tall"), gap: 0.3 * lv(s, "hang"),
      ud: Math.min(1.8 + 0.5 * lv(s, "mass"), b.topFront - ZB - 0.3), x0: 0, x1: 0, z0: 0, z1: 0, y0: G + b.h, top: 0, n: 1, rise: 0,
      pw: 0.16 + 0.06 * lv(s, "mass"), open: lv(s, "open"), tall: lv(s, "tall"), rep: lv(s, "rep") };
    u.ux = Math.min(u.ux, b.w);
    if (b.w - u.ux < 0.4) u.ux = b.w; // it meets the hall rather than stopping a sliver short of it
    u.x0 = b.side < 0 ? b.x0 : b.x1 - u.ux;
    u.x1 = u.x0 + u.ux;
    u.z0 = align === "back" ? ZB : b.topFront - u.ud;
    u.z1 = u.z0 + u.ud;
    u.top = u.y0 + u.gap + u.uh;
    if (u.family === "cells") u.n = Math.max(2, Math.min(1 + lv(s, "rep"), Math.floor((u.ux + 0.2) / 1.2))); // each cell a room's width, not a fin
    if (u.family === "vault") u.rise = Math.min(u.ux / 2, u.uh * 0.6);
    return u;
  };
  const upL = upperOf(5, bayL, "back"), upR = upperOf(7, bayR, "front");

  // 7 roof, over the hall's highest tier; it overhangs a side only where the neighbour is lower
  const top = hall.tiers[hall.tiers.length - 1], eave = G + top.h;
  const neighbour = (b: Bay, u: Upper) => Math.max(G + b.h, (b.side < 0 ? u.x1 > XL - 0.4 : u.x0 < XR + 0.4) ? u.top : 0);
  const xoL = neighbour(bayL, upL) < eave - 0.05 ? 0.3 : 0, xoR = neighbour(bayR, upR) < eave - 0.05 ? 0.3 : 0;
  const roof: Roof = { family: d[6].family, eave, z0: top.z0 - 0.25, z1: top.z1 + (hall.tiers.length > 1 ? Math.min(0.5, 0.15 + 1.2 * R(6)) : 0.15 + 1.2 * R(6)),
    x0: XL - xoL, x1: XR + xoR, pt: 0.15 + 0.07 * lv(6, "mass"), rise: 0, n: 1, parapet: 0 };
  if (roof.family === "gable") roof.rise = 0.9 + 0.6 * lv(6, "tall");
  if (roof.family === "barrel") roof.rise = Math.min(0.55 + 0.35 * lv(6, "tall"), (roof.x1 - roof.x0) / 2);
  if (roof.family === "sawtooth") { roof.n = 1 + lv(6, "rep"); roof.rise = 0.6 + 0.2 * lv(6, "tall"); }
  if (roof.family === "flat") roof.parapet = 0.25 + 0.15 * lv(6, "mass");

  // 9 side mass, on the open flank
  const side: Side = { family: d[8].family, sw: 1.3 + 2.4 * R(8), sh: 1.8 + 0.9 * lv(8, "tall"), sdp: 2.4 + 0.7 * lv(8, "mass"),
    rep: lv(8, "rep"), open: lv(8, "open"), mass: lv(8, "mass"), r: 0, n: 1, x0: 0, z1: 0 };
  if (side.family === "tower") { side.sw = Math.min(side.sw, 2.2); side.sh += 2.0; }
  if (side.family === "drum") { side.r = Math.min(side.sdp / 2, side.sw); side.sw = side.r; }
  if (side.family === "stepped") side.n = 1 + side.rep;
  side.x0 = X0 - side.sw;
  side.z1 = ZB + side.sdp;

  // 10 threshold, in front of the hall; it spreads past the hall only in front of a mass set behind the hall's face
  const want = 1.0 + 1.5 * R(9), minHalf = en.frontW / 2 + en.fw + 0.15;
  const freeL = bayL.zf <= hall.zs + 0.01, freeR = bayR.zf <= hall.zs + 0.01;
  const thr: Threshold = { family: d[9].family, z0: hall.zs + en.fp, zp: hall.zs, z1: 0, tr: 0.9 + 2.4 * R(9),
    hl: freeL ? Math.max(minHalf, Math.min(want, 5)) : -XL, hr: freeR ? Math.max(minHalf, Math.min(want, 5)) : XR, freeL, freeR,
    // it clears the portal's head where it can, and always stays under the roof's front edge
    ch: Math.min(Math.max(2.3 + 0.2 * lv(9, "tall"), en.frontH + en.fw + 0.15), eave - G - 0.45, hall.frontH - 0.3),
    pw: 0.16 + 0.07 * lv(9, "mass"), tall: lv(9, "tall"), mass: lv(9, "mass"), rep: lv(9, "rep"),
    steps: G > 0.3 ? Math.ceil(G / 0.19) - 1 : 0, run: 0.3, r: 0, tiers: 0 };
  thr.z1 = thr.z0 + thr.tr;
  if (thr.family === "apron") {
    // rounded tiers stepping down to the ground: each lower one reaches further, never wider than the way in
    thr.r = Math.min(thr.tr, thr.hl, thr.hr);
    thr.tiers = clamp(1 + Math.min(3, thr.steps), 1, Math.max(1, Math.floor(G / 0.14)));
    thr.z1 = thr.z0 + thr.r + (thr.tiers - 1) * 0.35;
    thr.steps = 0;
  }

  return { d, G, bayL, bayR, hall, entry: en, upL, upR, roof, side, thr };
}
