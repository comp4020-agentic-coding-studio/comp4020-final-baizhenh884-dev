// Keeps an open current page (GET /) true to the live sentence: it applies
// the `snapshot` and `change` events from GET /events to the page's own
// markup. A position's update applies only if its version is newer than the
// one shown, and never over a draft the visitor is typing.

export type Position = { position: number; word: string; version: number };

export type Trace =
  | { position: number; word: string; standing: true }
  | { position: number; word: string; standing: false; now: string };

export type Snapshot = { positions: Position[]; trace: Trace | null };

export interface LivePage {
  applySnapshot(snapshot: Snapshot): void;
  applyChange(change: Position): void;
}

// Successful changes so far: each one moves exactly one position's version
// up by one from its starting 1.
export function deriveTotal(positions: readonly Pick<Position, "version">[]): number {
  return positions.reduce((sum, p) => sum + (p.version - 1), 0);
}

// Not implemented yet: spec/live-client.test.ts specifies it.
export function attach(doc: Document): LivePage {
  void doc;
  return {
    applySnapshot() {},
    applyChange() {},
  };
}
