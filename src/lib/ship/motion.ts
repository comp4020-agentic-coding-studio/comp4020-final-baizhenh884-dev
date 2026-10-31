// How one territory's body is exchanged, as numbers over time (pure, so it's
// testable without a renderer). The old body withdraws, up and a little away,
// and as it goes it becomes its own drawing in red; the new body is set down in
// its place; the drawing then settles back onto that place, turns from red to
// ink and fades. The drawing exists from the first frame to its last: it never
// disappears and comes back. Nothing is red once the exchange is over.
//
// Another visitor's change is the same exchange, slower and quieter, after the
// part is first marked in red where it stands. With reduced motion nothing
// moves: the new body is simply there, outlined in red for a moment, then not.
//
// A crossing (docs/decisions/0003, Slice 5) is the loud one: the old part
// breaks loose and travels out of the standing house toward the kept house,
// still whole, while its drawing stays where it stood and the new part is
// built there. Only once it has left does it arrive in the kept house's gap
// (arrivalAt, on the same clock) and set down. With reduced motion nothing
// travels: the parts simply swap.

export type Kind = "own" | "remote" | "cross";
export type Frame = {
  lift: number; // how far the old body has withdrawn (0..1 of its full withdrawal)
  outgoing: number; // the old body's opacity
  trace: number; // the drawing's opacity
  traceRed: number; // 1 red .. 0 ink
  incoming: number; // the new body's opacity
  drop: number; // how far above its place the new body still is (0..1)
  incomingRed: number; // red edges on the new body (0..1)
  travel: number; // a crossing's old body, how far along its way out of the house (0..1); 0 for an ordinary exchange
};
// the crossing part arriving in the kept house: how far it still is from its place (1..0), its opacity, its red edges
export type Arrival = { travel: number; opacity: number; red: number };

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out3 = (t: number) => 1 - Math.pow(1 - t, 3);

// a crossing part's way out, as a share of its exchange after the mark: it starts at `from` and takes `span`
const TRAVEL = { from: 0.1, span: 0.6 };

export const TIMING = {
  own: { exchange: 900, hold: 1300, fade: 1000, mark: 0 },
  remote: { exchange: 1300, hold: 1300, fade: 1000, mark: 0.2 },
  cross: { exchange: 1900, hold: 1300, fade: 1000, mark: 0.15 },
  reduced: { exchange: 0, hold: 1200, fade: 0, mark: 0 },
};
export const duration = (kind: Kind, reduced: boolean) => {
  const t = reduced ? TIMING.reduced : TIMING[kind];
  return t.exchange + t.hold + t.fade;
};

// the frame at `ms` after the exchange began
export function frameAt(kind: Kind, ms: number, reduced = false): Frame {
  if (reduced) {
    // nothing moves: the new body is there at once, its edges red until the hold ends
    const red = ms < TIMING.reduced.hold ? 1 : 0;
    return { lift: 0, outgoing: 0, trace: 0, traceRed: 0, incoming: 1, drop: 0, incomingRed: red, travel: 0 };
  }
  const T = TIMING[kind], quiet = kind !== "own", cross = kind === "cross";
  if (ms < T.exchange) {
    const p = ms / T.exchange, q = clamp((p - T.mark) / (1 - T.mark));
    const w = ease(clamp(q / 0.62)), i = clamp((q - (cross ? 0.45 : 0.34)) / (cross ? 0.55 : 0.66));
    return {
      // a crossing part rises only a little as it breaks loose: its way is across, not up
      lift: (cross ? 0.3 : quiet ? 0.75 : 1) * w,
      // and it stays whole while it travels, fading only as it leaves the house
      outgoing: cross ? 1 - clamp((q - 0.55) / 0.15) : 1 - clamp(q / 0.42),
      // a remote change first draws the part where it stands, then the exchange runs
      trace: Math.max(T.mark ? clamp(p / T.mark) * 0.5 : 0, clamp(q / 0.3)),
      traceRed: 1,
      incoming: clamp(i / 0.5),
      drop: 1 - out3(i),
      incomingRed: clamp(i / 0.2) * (1 - clamp((i - 0.55) / 0.45)),
      travel: cross ? ease(clamp((q - TRAVEL.from) / TRAVEL.span)) : 0,
    };
  }
  // the drawing settles back onto the new body, turns to ink, and fades
  const e = ms - T.exchange, k = clamp(e / T.hold), fade = e < T.hold ? 1 : 1 - clamp((e - T.hold) / T.fade);
  return {
    lift: (quiet ? 0.75 : 1) * (1 - ease(clamp(k / 0.7))),
    outgoing: 0,
    trace: (1 - 0.5 * k) * fade,
    traceRed: 1 - ease(clamp((k - 0.2) / 0.8)),
    incoming: 1,
    drop: 0,
    incomingRed: 0,
    travel: cross ? 1 : 0,
  };
}

// when a crossing part has gone its whole way out of the standing house (ms on its clock); 0 with reduced motion
export function leavesAt(reduced: boolean): number {
  if (reduced) return 0;
  const T = TIMING.cross;
  return Math.ceil(T.exchange * (T.mark + (1 - T.mark) * (TRAVEL.from + TRAVEL.span)));
}

// the kept part arriving, on the change's own clock: it fades in under the plank as the shipwright sets it down
// (the carry, below), never before
export function arrivalAt(ms: number, reduced = false): Arrival {
  if (reduced) return { travel: 0, opacity: 1, red: 0 };
  const a = clamp((ms - SET) / CARRY.set);
  return {
    travel: 1 - out3(a),
    opacity: a,
    // never red: the old plank arrives as itself (red is the live ship's new part alone)
    red: 0,
  };
}

// Red is the live ship's new part only (the maker, 30 October), for about a second: on as it's set down, fading
// out by RED_MS. With reduced motion it's outlined in red for the reduced hold, then not.
export const RED_MS = 1000;
export const newPartRed = (ms: number, reduced: boolean): number =>
  reduced ? (ms < TIMING.reduced.hold ? 1 : 0) : ms >= RED_MS ? 0 : 1 - ease(clamp(ms / RED_MS));

// The plank that flies is the old part as it stood: its own colour until it nears the slipway, then it bleaches to
// the kept ship's driftwood (half its colour, half drift) as it lands, `k` (0..1) of the way through its flight.
import { Color } from "three";
export const DRIFT = new Color(0xcbb894);
export const plankColour = (base: Color, k: number): Color => base.clone().lerp(DRIFT, 0.5 * ease(clamp((k - 0.6) / 0.4)));

// The carry (docs/decisions/0005, amended 31 October): once the server has accepted a change, the old plank is
// tossed in a short arc to the quay's edge, a shipwright catches it, carries it to the slipway or the rack and
// sets it down, about 3 s in all. Each stretch runs 0..1 and is complete before the next begins. The plank keeps
// its own colour until the carry's last stretch, then bleaches (plankColour). With reduced motion nothing is
// tossed or carried: it's done at once.
export type Carry = { phase: "toss" | "catch" | "carry" | "set" | "done"; toss: number; carry: number; set: number; bleach: number };
export const CARRY = { toss: 700, catch: 200, carry: 1800, set: 300 };
const CAUGHT = CARRY.toss, CARRIED = CAUGHT + CARRY.catch, SET = CARRIED + CARRY.carry, END = SET + CARRY.set;
export const carryEnd = (reduced: boolean): number => (reduced ? 0 : END);
export function carryAt(ms: number, reduced = false): Carry {
  if (reduced || ms >= END) return { phase: "done", toss: 1, carry: 1, set: 1, bleach: 1 };
  const toss = clamp(ms / CARRY.toss), carry = clamp((ms - CARRIED) / CARRY.carry), set = clamp((ms - SET) / CARRY.set);
  const phase = ms < CAUGHT ? "toss" : ms < CARRIED ? "catch" : ms < SET ? "carry" : "set";
  // the plank bleaches over the second half of the carry and as it's set down
  const bleach = clamp((carry - 0.5) / 0.5) * 0.85 + set * 0.15;
  return { phase, toss, carry, set, bleach: carry < 0.5 ? 0 : bleach };
}
// when the plank is set down, so its waiting word lands in the row with it; at once with reduced motion
export const landsAt = (reduced: boolean): number => (reduced ? 0 : SET);
