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

export type Kind = "own" | "remote";
export type Frame = {
  lift: number; // how far the old body has withdrawn (0..1 of its full withdrawal)
  outgoing: number; // the old body's opacity
  trace: number; // the drawing's opacity
  traceRed: number; // 1 red .. 0 ink
  incoming: number; // the new body's opacity
  drop: number; // how far above its place the new body still is (0..1)
  incomingRed: number; // red edges on the new body (0..1)
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out3 = (t: number) => 1 - Math.pow(1 - t, 3);

export const TIMING = {
  own: { exchange: 900, hold: 1300, fade: 1000, mark: 0 },
  remote: { exchange: 1300, hold: 1300, fade: 1000, mark: 0.2 },
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
    return { lift: 0, outgoing: 0, trace: 0, traceRed: 0, incoming: 1, drop: 0, incomingRed: red };
  }
  const T = TIMING[kind], quiet = kind === "remote";
  if (ms < T.exchange) {
    const p = ms / T.exchange, q = clamp((p - T.mark) / (1 - T.mark));
    const w = ease(clamp(q / 0.62)), i = clamp((q - 0.34) / 0.66);
    return {
      lift: (quiet ? 0.75 : 1) * w,
      outgoing: 1 - clamp(q / 0.42),
      // a remote change first draws the part where it stands, then the exchange runs
      trace: Math.max(T.mark ? clamp(p / T.mark) * 0.5 : 0, clamp(q / 0.3)),
      traceRed: 1,
      incoming: clamp(i / 0.5),
      drop: 1 - out3(i),
      incomingRed: clamp(i / 0.2) * (1 - clamp((i - 0.55) / 0.45)),
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
  };
}
