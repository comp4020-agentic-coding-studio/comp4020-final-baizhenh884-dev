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
      travel: cross ? ease(clamp((q - 0.1) / 0.6)) : 0,
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

// when the crossing part reaches the kept house, on the crossing's own clock: after it has left the standing one
const ARRIVE = { start: 1500, travel: 1100 };

export function arrivalAt(ms: number, reduced = false): Arrival {
  if (reduced) return { travel: 0, opacity: 1, red: ms < TIMING.reduced.hold ? 1 : 0 };
  const a = clamp((ms - ARRIVE.start) / ARRIVE.travel), after = ms - ARRIVE.start - ARRIVE.travel;
  return {
    travel: 1 - out3(a),
    opacity: clamp(a / 0.25),
    // rebuilding is red: while it arrives and sets down, then it settles to the kept house's own edges
    red: a <= 0 ? 0 : 1 - clamp(after / TIMING.cross.hold),
  };
}
