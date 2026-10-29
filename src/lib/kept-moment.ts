// The moment of a replacement (docs/decisions/0003-settle-and-kept-ships.md,
// Slice 5): what a change did to the kept ship, from the kept ship a page
// last showed and the one the change event brings. Presentation only: it
// decides how the two houses move, never what either shows once they settle
// (that's the kept ship itself, derived by the server). Only a change event
// is classified, never a snapshot, so a reload or reconnect never replays a
// moment. Pure, so spec/kept-moment.test.ts runs it without a page.

export type KeptShip = { words: string[]; gaps: boolean[]; next: (string | null)[] };
export type MomentKind = "cross" | "first" | "later" | "wait";
export type Moment = { position: number; kind: MomentKind };

export function classifyMoment(prev: KeptShip | undefined, next: KeptShip, position: number): Moment | null {
  if (!prev) return null;
  if (prev.gaps[position]) {
    // the replaced word was waiting in the ship being shown: it crosses into its gap
    if (prev.gaps.filter(Boolean).length > 1) return { position, kind: "cross" };
    // ...and it was the last one. Only ship 1 is held whole afterwards; a later ship gives way to the next at once.
    return { position, kind: next.gaps.every((g) => !g) ? "first" : "later" };
  }
  // ship 1 was held whole: the first change after it starts ship 2, and crosses into it
  if (prev.gaps.every((g) => !g) && !next.gaps[position]) return { position, kind: "cross" };
  // the replaced word belongs to the next house: it waits under the kept one (a word for a ship further
  // ahead finds its place already taken there, and shows nothing until its own ship is next)
  if (prev.next[position] === null && next.next[position] !== null) return { position, kind: "wait" };
  return null;
}
