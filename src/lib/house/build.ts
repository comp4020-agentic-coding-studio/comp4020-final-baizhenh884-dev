// The body's geometry, one group per territory, from the plan (plan.ts). Pure
// three.js with no renderer, so it builds the same in the browser and in node.
// Every group is owned by its position (userData.position) and holds only
// that territory's solids.

import * as THREE from "three";
import { disposeTree, Kit, portal, rect, row, type Hole } from "./kit";
import { nestedOuter, planBody, X0, XL, XR, ZB, type Bay, type Body, type Upper } from "./plan";
import { TERRITORIES } from "./territories";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export type Footprint = { x0: number; x1: number; z0: number; z1: number; bay: Bay | null };
export type BuiltBody = {
  root: THREE.Group;
  groups: THREE.Group[];
  plan: Body;
  info: { entry: { half: number; h: number; z0: number; z1: number }; foot: Footprint[] };
  dispose(): void;
};

export function buildBody(words: readonly string[]): BuiltBody {
  const P = planBody(words);
  const root = new THREE.Group();
  const groups = TERRITORIES.map((t, i) => {
    const g = new THREE.Group();
    g.name = t.id;
    g.userData.position = i;
    root.add(g);
    return g;
  });
  const kit = groups.map((g) => new Kit(g));
  frontMass(kit[1], P, P.bayL);
  frontMass(kit[3], P, P.bayR);
  const zcut = hall(kit[2], P);
  entry(kit[4], P, zcut);
  upperVolume(kit[5], P, P.upL);
  upperVolume(kit[7], P, P.upR);
  roof(kit[6], P);
  side(kit[8], P);
  threshold(kit[9], P);
  const foot = footprint(P);
  ground(kit[0], P, foot);
  return {
    root,
    groups,
    plan: P,
    info: { entry: { half: P.entry.ew / 2, h: P.entry.eh, z0: zcut, z1: P.thr.z1 + P.thr.steps * P.thr.run }, foot },
    dispose: () => disposeTree(root),
  };
}

// 2, 4: a front mass, solid with punched windows, hollowed, split into staggered bays, or curved at its corner
function frontMass(k: Kit, P: Body, b: Bay): void {
  const y0 = P.G, y1 = P.G + b.h, lv = P.d[b.s].levels;
  if (b.family === "solid") {
    const wy0 = y0 + Math.max(0.7, (b.h - b.wh) * 0.55);
    k.pierced(b.x0, b.x1, y0, y1, ZB, b.zf, b.t, row(b.n, b.x0, b.x1, b.ww).map((x): Hole => [x, x + b.ww, wy0, wy0 + b.wh]));
  } else if (b.family === "hollow") {
    const zv = b.zf - b.vd;
    k.box(b.x0, b.x1, y0, y1, ZB, zv);
    k.box(b.x0, b.x0 + b.t, y0, y1 - b.slab, zv, b.zf);
    k.box(b.x1 - b.t, b.x1, y0, y1 - b.slab, zv, b.zf);
    k.box(b.x0, b.x1, y1 - b.slab, y1, zv, b.zf);
    k.box(b.x0 + b.t, b.x1 - b.t, y0 + 0.1, y1 - b.slab - 0.1, zv, zv + 0.02, "opening");
    const cw = 0.22 + 0.05 * lv.mass;
    for (const x of row(b.cols, b.x0 + b.t, b.x1 - b.t, cw)) k.box(x, x + cw, y0, y1 - b.slab, b.zf - cw - 0.05, b.zf - 0.05);
  } else if (b.family === "split") {
    const ws = (b.w - (b.n - 1) * b.gap) / b.n, zb = b.zf - (b.n - 1) * b.st - Math.max(0.6, b.t + 0.4);
    k.box(b.x0, b.x1, y0, y1, ZB, zb);
    for (let i = 0; i < b.n; i++) {
      const xo = b.side < 0 ? b.x0 + i * (ws + b.gap) : b.x1 - i * (ws + b.gap) - ws, zf = b.zf - i * b.st, sw = ws * (0.3 + 0.1 * lv.open);
      k.pierced(xo, xo + ws, y0, y1, zb, zf, b.t, [[xo + (ws - sw) / 2, xo + (ws + sw) / 2, y0 + 0.6, y1 - 0.6]]);
    }
    // the joints between bays are recessed, never open: a web fills each gap at the back
    for (let i = 1; i < b.n; i++) {
      const xg = b.side < 0 ? b.x0 + i * (ws + b.gap) - b.gap : b.x1 - i * (ws + b.gap);
      k.box(xg, xg + b.gap, y0, y1, zb, zb + 0.4);
    }
  } else {
    // curved: the outer front corner is rounded, with a glazed band running round it
    const plan = (inset: number) => curvedPlan(b, inset);
    const yb = y0 + 0.85;
    k.slabPlan(plan(0), y0, yb);
    k.slabPlan(plan(0.28), yb, yb + b.band, "opening");
    k.slabPlan(plan(0), yb + b.band, y1);
    // the band is carried by its inner wall
    k.box(b.side < 0 ? XL - 0.3 : XR, b.side < 0 ? XL : XR + 0.3, yb, yb + b.band, ZB, b.zf);
  }
}

// a curved bay's plan in (x, -z), rounded at its outer front corner, inset all round its open sides
function curvedPlan(b: Bay, inset: number): THREE.Shape {
  const x0 = b.x0 + (b.side < 0 ? inset : 0), x1 = b.x1 - (b.side > 0 ? inset : 0), z1 = b.zf - inset, r = Math.max(0.1, b.r - inset), sh = new THREE.Shape();
  if (b.side < 0) {
    sh.moveTo(x0, -ZB); sh.lineTo(x1, -ZB); sh.lineTo(x1, -z1); sh.lineTo(x0 + r, -z1);
    sh.absarc(x0 + r, -z1 + r, r, -Math.PI / 2, -Math.PI, true); sh.lineTo(x0, -ZB);
  } else {
    sh.moveTo(x0, -ZB); sh.lineTo(x1, -ZB); sh.lineTo(x1, -z1 + r);
    sh.absarc(x1 - r, -z1 + r, r, 0, -Math.PI / 2, true); sh.lineTo(x0, -z1); sh.lineTo(x0, -ZB);
  }
  return sh;
}

// a drum's half disc in (x, -z), against the left mass
function drumPlan(S: Body["side"], r: number): THREE.Shape {
  const zc = ZB + S.r, sh = new THREE.Shape();
  sh.moveTo(X0, -(zc - r)); sh.absarc(X0, -zc, r, Math.PI / 2, -Math.PI / 2, false); sh.lineTo(X0, -(zc - r));
  return sh;
}

// 3: the hall, in tiers; its front face belongs to the entry. Returns where the entry's cut begins.
function hall(k: Kit, P: Body): number {
  const H = P.hall, E = P.entry, G = P.G, zcut = H.zs - E.ed;
  H.tiers.forEach((t, i) => k.box(XL, XR, G, G + t.h, t.z0, i === 0 ? zcut : t.z1));
  if (H.band > 0) {
    // clerestory: a glazed band across the front, under the roof, between piers
    const y0 = G + H.slabH, y1 = G + H.frontH;
    if (E.ed > 0.3) k.box(XL, XR, y0, y1, zcut, H.zs - 0.3);
    k.box(XL + 0.05, XR - 0.05, y0, y1, H.zs - 0.3, H.zs - 0.28, "opening");
    const pw = 0.2;
    for (const x of [XL, ...row(2 + P.d[2].levels.rep, XL, XR, pw), XR - pw]) k.box(x, x + pw, y0, y1, H.zs - 0.3, H.zs);
  }
  return zcut;
}

// 5: the hall's front slab with the way in cut through it, framed by a surround
function entry(k: Kit, P: Body, zcut: number): void {
  const H = P.hall, E = P.entry, G = P.G, arch = E.family === "arch";
  for (let i = 0; i < E.n; i++) {
    const za = H.zs - ((i + 1) * E.ed) / E.n, zb = H.zs - (i * E.ed) / E.n, o = nestedOuter(E.n, i);
    const pts = portal(E.ew + 2 * o, E.eh + o, arch), sh = new THREE.Shape();
    sh.moveTo(XL, 0); sh.lineTo(pts[0].x, 0);
    for (const p of pts) sh.lineTo(p.x, p.y);
    sh.lineTo(XR, 0); sh.lineTo(XR, H.slabH); sh.lineTo(XL, H.slabH); sh.lineTo(XL, 0);
    k.slabXY(sh, za, zb).position.y = G;
  }
  const out = portal(E.frontW + 2 * E.fw, E.frontH + E.fw, arch), inn = portal(E.frontW, E.frontH, arch).reverse(), sh = new THREE.Shape();
  sh.moveTo(out[0].x, 0);
  for (const p of out) sh.lineTo(p.x, p.y);
  sh.lineTo(inn[0].x, 0);
  for (const p of inn) sh.lineTo(p.x, p.y);
  sh.lineTo(out[0].x, 0);
  k.slabXY(sh, H.zs, H.zs + E.fp).position.y = G;
  k.box(-E.ew / 2, E.ew / 2, G, G + E.eh - (arch ? E.ew / 2 : 0), zcut, zcut + 0.02, "opening");
}

// 6, 8: an upper volume on its mass, lifted on posts when the word hangs
function upperVolume(k: Kit, P: Body, u: Upper): void {
  const yb = u.y0 + u.gap, yt = yb + u.uh;
  if (u.gap > 0) {
    const lp = 0.2;
    for (const [x, z] of [[u.x0, u.z0], [u.x1 - lp, u.z0], [u.x0, u.z1 - lp], [u.x1 - lp, u.z1 - lp]]) k.box(x, x + lp, u.y0, yb, z, z + lp);
  }
  if (u.family === "frame") {
    if (u.gap > 0) k.box(u.x0, u.x1, yb, yb + 0.15, u.z0, u.z1);
    const n = 2 + u.rep;
    for (let i = 0; i < n; i++) {
      const x = u.x0 + (i * (u.ux - u.pw)) / (n - 1);
      for (const z of [u.z0, u.z1 - u.pw]) k.box(x, x + u.pw, yb + (u.gap > 0 ? 0.15 : 0), yt - 0.2, z, z + u.pw);
    }
    k.box(u.x0, u.x1, yt - 0.2, yt, u.z0, u.z1 + 0.1);
    k.box(u.x0 + u.pw, u.x1 - u.pw, yb + 0.1, yt - 0.3, u.z0 + 0.05, u.z0 + 0.07, "opening");
  } else if (u.family === "cells") {
    // rooms side by side, each under its own slab; the joints between them are recessed at the front, never open
    const g = 0.2, cw = (u.ux - (u.n - 1) * g) / u.n, cap = 0.16, ov = 0.08;
    for (let i = 0; i < u.n; i++) {
      const x = u.x0 + i * (cw + g), ww = cw * 0.5, top = yt - 0.2 * (i % 2);
      k.pierced(x, x + cw, yb, top - cap, u.z0, u.z1, 0.2, [[x + (cw - ww) / 2, x + (cw + ww) / 2, yb + 0.4, top - cap - 0.35]]);
      k.box(x - (i > 0 ? ov : 0), x + cw + (i < u.n - 1 ? ov : 0), top - cap, top, u.z0, u.z1);
      if (i > 0) k.box(x - g, x, yb, yt - 0.2 - cap, u.z0, u.z1 - 0.35);
    }
    if (u.gap > 0) k.box(u.x0, u.x1, yb - 0.15, yb, u.z0, u.z1);
  } else if (u.family === "vault") {
    const wall = u.uh - u.rise, cx = (u.x0 + u.x1) / 2, sh = new THREE.Shape();
    sh.moveTo(u.x0, 0); sh.lineTo(u.x1, 0); sh.lineTo(u.x1, wall);
    sh.absellipse(cx, wall, u.ux / 2, u.rise, 0, Math.PI, false); sh.lineTo(u.x0, 0);
    const ww = Math.min(u.ux * 0.4, 0.5 + 0.25 * u.open), head = wall + u.rise * 0.5, front = sh.clone();
    front.holes.push(rect(cx - ww / 2, cx + ww / 2, 0.4, head));
    k.slabXY(sh, u.z0, u.z1 - 0.2).position.y = yb;
    k.slabXY(front, u.z1 - 0.2, u.z1).position.y = yb;
    k.box(cx - ww / 2, cx + ww / 2, yb + 0.4, yb + head, u.z1 - 0.2, u.z1 - 0.18, "opening");
  } else {
    const ww = Math.min(u.ux * 0.5, 0.6 + 0.3 * u.open), wh = Math.min(u.uh - 0.7, 0.7 + 0.25 * u.tall), cx = (u.x0 + u.x1) / 2;
    k.pierced(u.x0, u.x1, yb, yt, u.z0, u.z1, 0.22, [[cx - ww / 2, cx + ww / 2, yb + 0.4, yb + 0.4 + wh]]);
  }
}

// 7: the roof over the hall's highest tier; the lower tiers of a stepped hall are capped flat
function roof(k: Kit, P: Body): void {
  const RF = P.roof, H = P.hall, E = P.entry, G = P.G, cx = (RF.x0 + RF.x1) / 2, hw = (RF.x1 - RF.x0) / 2, top = H.tiers[H.tiers.length - 1];
  if (RF.family === "gable" || RF.family === "barrel") {
    const pt = RF.pt, sh = new THREE.Shape();
    if (RF.family === "gable") {
      sh.moveTo(RF.x0, 0); sh.lineTo(cx, RF.rise); sh.lineTo(RF.x1, 0); sh.lineTo(RF.x1, -pt);
      sh.lineTo(cx, RF.rise - pt * 1.3); sh.lineTo(RF.x0, -pt); sh.lineTo(RF.x0, 0);
    } else {
      sh.moveTo(RF.x1, 0); sh.absellipse(cx, 0, hw, RF.rise, 0, Math.PI, false); sh.lineTo(RF.x0, -pt);
      sh.absellipse(cx, -pt, hw - pt, RF.rise - pt * 0.5, Math.PI, 0, true); sh.lineTo(RF.x1, 0);
    }
    k.slabXY(sh, RF.z0, RF.z1).position.y = RF.eave + pt;
    // the end walls under it close the hall's top
    const end = new THREE.Shape(), under = (x: number) => RF.rise * (1 - Math.abs(x - cx) / hw) - 0.05;
    if (RF.family === "gable") {
      end.moveTo(XL, 0); end.lineTo(XR, 0); end.lineTo(XR, Math.max(0, under(XR)));
      end.lineTo(cx, RF.rise - pt * 0.3 - 0.05); end.lineTo(XL, Math.max(0, under(XL))); end.lineTo(XL, 0);
    } else {
      end.moveTo(cx + hw - pt, 0); end.absellipse(cx, 0, hw - pt, RF.rise - pt * 0.5 - 0.03, 0, Math.PI, false); end.lineTo(cx + hw - pt, 0);
    }
    k.slabXY(end, top.z0, top.z1).position.y = RF.eave;
  } else if (RF.family === "sawtooth") {
    // the teeth run the deck's whole depth, so the roof is one system ending in a glazed face at its edge
    const tz = (RF.z1 - top.z0) / RF.n, jamb = 0.3;
    for (let i = 0; i < RF.n; i++) {
      // in (-z, y): each tooth rises toward the street, its upright face glazed between solid jambs over a sill
      const a = top.z0 + i * tz, b = a + tz, sh = new THREE.Shape();
      sh.moveTo(-a, 0); sh.lineTo(-b, 0); sh.lineTo(-b, RF.rise); sh.lineTo(-a, 0);
      k.slabSide(sh, RF.x0, RF.x1).position.y = RF.eave + RF.pt;
      k.box(RF.x0 + jamb, RF.x1 - jamb, RF.eave + RF.pt + 0.14, RF.eave + RF.pt + RF.rise - 0.14, b - 0.02, b + 0.005, "opening");
    }
    k.box(RF.x0, RF.x1, RF.eave, RF.eave + RF.pt, top.z0, RF.z1);
  } else {
    // flat: a deep lid with an upstand on three sides
    const up = RF.eave + RF.pt + RF.parapet;
    k.box(RF.x0, RF.x1, RF.eave, RF.eave + RF.pt, RF.z0, RF.z1);
    k.box(RF.x0, RF.x1, RF.eave + RF.pt, up, RF.z1 - 0.2, RF.z1);
    k.box(RF.x0, RF.x0 + 0.2, RF.eave + RF.pt, up, RF.z0, RF.z1 - 0.2);
    k.box(RF.x1 - 0.2, RF.x1, RF.eave + RF.pt, up, RF.z0, RF.z1 - 0.2);
  }
  H.tiers.slice(0, -1).forEach((t, i) => k.box(XL, XR, G + t.h, G + t.h + 0.14, t.z0, t.z1 + (i === 0 ? E.fp : 0)));
}

// 9: the side mass on the open left flank
function side(k: Kit, P: Body): void {
  const S = P.side, sy = P.G, sx1 = X0;
  if (S.family === "drum") {
    const disc = (r: number) => drumPlan(S, r);
    if (S.open > 0) {
      const band = Math.min(0.3 + 0.3 * S.open, S.sh - 1.0), yb = sy + clamp(S.sh - band - 0.5, 0.5, 1.0);
      k.slabPlan(disc(S.r), sy, yb);
      k.slabPlan(disc(S.r - 0.25), yb, yb + band, "opening");
      k.slabPlan(disc(S.r), yb + band, sy + S.sh);
    } else k.slabPlan(disc(S.r), sy, sy + S.sh);
  } else if (S.family === "arcade") {
    const pw = 0.3 + 0.06 * S.mass, n = 2 + S.rep;
    k.box(S.x0, sx1, sy, sy + S.sh, ZB, ZB + 0.4);
    k.box(S.x0, sx1, sy + S.sh - 0.32, sy + S.sh, ZB + 0.4, S.z1);
    for (let i = 0; i < n; i++) {
      const x = S.x0 + (i * (S.sw - pw)) / (n - 1);
      k.box(x, x + pw, sy, sy + S.sh - 0.32, S.z1 - pw, S.z1);
    }
    k.box(S.x0, S.x0 + pw, sy, sy + S.sh - 0.32, ZB + 0.4, S.z1 - pw);
    k.box(S.x0 + pw, sx1, sy + 0.1, sy + S.sh - 0.42, ZB + 0.4, ZB + 0.42, "opening");
  } else if (S.family === "stepped") {
    const tw = S.sw / S.n;
    for (let i = 0; i < S.n; i++) {
      const x1 = sx1 - i * tw, h = S.sh * (1 - i / (S.n + 0.6));
      k.pierced(x1 - tw, x1, sy, sy + h, ZB, S.z1, 0.25, h > 1.6 ? [[x1 - tw * 0.7, x1 - tw * 0.3, sy + 0.6, sy + h - 0.5]] : []);
    }
  } else {
    // a wing or a tower: a block with a vertical run of openings
    const ww = Math.min(S.sw * 0.45, 0.5 + 0.3 * S.open), xc = (S.x0 + sx1) / 2, n = S.family === "tower" ? 2 : 1 + Math.min(1, S.rep), holes: Hole[] = [];
    for (let i = 0; i < n; i++) {
      const y0 = sy + 0.6 + (i * (S.sh - 0.6)) / n, y1 = y0 + Math.min(1.3, (S.sh - 0.6) / n - 0.5);
      if (y1 - y0 > 0.4) holes.push([xc - ww / 2, xc + ww / 2, y0, y1]);
    }
    k.pierced(S.x0, sx1, sy, sy + S.sh, ZB, S.z1, 0.25, holes);
    if (S.family === "tower") k.box(S.x0 - 0.12, sx1, sy + S.sh, sy + S.sh + 0.22, ZB - 0.12, S.z1 + 0.12);
  }
}

// 10: the platform at the body's level, the way down to the ground, and what stands on it
function threshold(k: Kit, P: Body): void {
  const T = P.thr, G = P.G;
  if (T.family === "apron") {
    for (let i = 0; i < T.tiers; i++) {
      const rk = T.r + i * 0.35, sh = new THREE.Shape();
      sh.moveTo(-T.r, -T.zp); sh.absellipse(0, -T.zp, T.r, rk + T.z0 - T.zp, Math.PI, 0, false); sh.lineTo(-T.r, -T.zp);
      k.slabPlan(sh, 0, G * (1 - i / T.tiers));
    }
    return;
  }
  k.box(-T.hl, T.hr, 0, G, T.zp, T.z1);
  // where it spreads in front of a mass set behind the hall, it runs back to that mass's face
  if (T.freeL && T.hl > -XL + 0.05 && P.bayL.zf < T.zp - 0.01) k.box(-T.hl, XL, 0, G, Math.min(P.bayL.zf, T.zp - 0.15), T.zp);
  if (T.freeR && T.hr > XR + 0.05 && P.bayR.zf < T.zp - 0.01) k.box(XR, T.hr, 0, G, Math.min(P.bayR.zf, T.zp - 0.15), T.zp);
  const sw = Math.min(T.hl, T.hr, 1.6) * 2;
  for (let i = 0; i < T.steps; i++) k.box(-sw / 2, sw / 2, 0, (G * (T.steps - i)) / (T.steps + 1), T.z1 + i * T.run, T.z1 + (i + 1) * T.run);
  const y = G, ch = T.ch;
  if (T.family === "canopy") {
    for (const x of [-T.hl, T.hr - T.pw]) k.box(x, x + T.pw, y, y + ch, T.z1 - T.pw, T.z1);
    k.box(-T.hl, T.hr, y + ch, y + ch + 0.18 + 0.05 * T.mass, T.z0, T.z1 + 0.15);
  } else if (T.family === "colonnade") {
    // columns, not slats: a square section and at least three of it between them, so a row reads as a colonnade
    const cw = 0.26 + 0.05 * T.mass, bh = 0.3 + 0.03 * T.mass, n = Math.max(2, Math.min(1 + T.rep, 1 + Math.floor((T.tr - cw) / (4 * cw))));
    for (let i = 0; i < n; i++) {
      const z = T.z1 - cw - (i * (T.tr - cw)) / (n - 1); // the last pair stands against the surround
      for (const x of [-T.hl, T.hr - cw]) k.box(x, x + cw, y, y + ch, z, z + cw);
    }
    // one entablature: a beam down each row and a lintel across the front, framing the way in
    for (const x of [-T.hl, T.hr - cw]) k.box(x, x + cw, y + ch, y + ch + bh, T.z0, T.z1 - cw);
    k.box(-T.hl, T.hr, y + ch, y + ch + bh, T.z1 - cw, T.z1);
  } else {
    // court: low walls along both sides, open to the street
    const wh = 0.8 + 0.25 * T.mass, wt = 0.2 + 0.06 * T.mass;
    k.box(-T.hl, -T.hl + wt, y, y + wh, T.z0, T.z1);
    k.box(T.hr - wt, T.hr, y, y + wh, T.z0, T.z1);
  }
}

// what the ground carries: every mass at the body's level
function footprint(P: Body): Footprint[] {
  const S = P.side;
  return [
    { x0: P.bayL.x0, x1: P.bayL.x1, z0: ZB, z1: P.bayL.zf, bay: P.bayL },
    { x0: XL, x1: XR, z0: ZB, z1: P.hall.zs, bay: null },
    { x0: P.bayR.x0, x1: P.bayR.x1, z0: ZB, z1: P.bayR.zf, bay: P.bayR },
    { x0: S.x0, x1: X0, z0: ZB, z1: S.family === "drum" ? ZB + 2 * S.r : S.z1, bay: null },
  ];
}

// 1: the ground, as stilts, a plinth or a stepped podium
function ground(k: Kit, P: Body, foot: Footprint[]): void {
  const g = P.d[0], G = P.G;
  if (g.family === "stilts") {
    // each mass stands on a floor deck carried by pilotis set in from its edge, so the deck reads as lifted
    const cs = 0.28 + 0.08 * g.levels.mass, nx = 2 + g.levels.rep, deck = 0.2;
    for (const [fi, { x0, x1, z0, z1, bay }] of foot.entries()) {
      if (bay?.family === "curved") k.slabPlan(curvedPlan(bay, 0), G - deck, G);
      else if (fi === 3 && P.side.family === "drum") k.slabPlan(drumPlan(P.side, P.side.r), G - deck, G);
      else k.box(x0, x1, G - deck, G, z0, z1);
      const inset = 0.45, cornerIn = bay?.family === "curved" ? bay.r * 0.35 : 0, nz = z1 - z0 > 4 ? 3 : 2, nxx = x1 - x0 < 1.6 ? 2 : nx;
      for (let i = 0; i < nxx; i++) for (let j = 0; j < nz; j++) {
        let x = x0 + inset + (i * (x1 - x0 - 2 * inset - cs)) / (nxx - 1), z = z0 + inset + (j * (z1 - z0 - 2 * inset - cs)) / (nz - 1);
        if (bay?.family === "curved" && j === nz - 1 && (bay.side < 0 ? i === 0 : i === nxx - 1)) {
          x += bay.side < 0 ? cornerIn : -cornerIn;
          z -= cornerIn;
        }
        k.box(x, x + cs, 0, G, z, z + cs); // through the deck to the mass it carries
      }
    }
  } else if (g.family === "plinth") {
    const ov = 0.08 + 0.4 * g.reach;
    for (const f of foot) k.box(f.x0 - ov, f.x1 + ov, 0, G, f.z0 - ov, f.z1 + ov);
  } else {
    const n = 1 + Math.max(1, g.levels.rep), step = (0.3 + 1.4 * g.reach) / n;
    for (let i = 0; i < n; i++) {
      const ov = 0.08 + i * step, yk = G * (1 - i / n);
      for (const f of foot) k.box(f.x0 - ov, f.x1 + ov, 0, yk, f.z0 - ov, f.z1 + ov);
    }
  }
}
