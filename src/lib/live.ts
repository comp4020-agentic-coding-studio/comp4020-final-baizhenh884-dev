// Notifications of successful replacements, to the realtime connections open
// on this one machine. Presentation only: nothing here is sentence state, and
// a restart loses nothing, since every connection starts from SQLite.

export type Change = { position: number; word: string; version: number };

type Listener = (change: Change) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A listener that throws (a connection that has gone away) is dropped, and
// the rest still hear the change. Returns how many listeners were notified
// without throwing, so a caller can log how many open streams received it.
export function broadcast(change: Change): number {
  let delivered = 0;
  for (const listener of listeners) {
    try {
      listener(change);
      delivered++;
    } catch {
      listeners.delete(listener);
    }
  }
  return delivered;
}

// The shipwrights (docs/decisions/0005-the-ship.md, "Co-presence"): each open
// stream is one anonymous figure. Only their total is kept, as the number of
// streams open on this machine, in memory; never who, never stored or logged.
// A burst of opens and closes (a reload is one of each) is told once, a
// moment later, to every open stream.
type CrewListener = (total: number) => void;
const crew = new Set<CrewListener>();
const CREW_SETTLE_MS = 400;
let pending: ReturnType<typeof setTimeout> | null = null;

function tellCrew(): void {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    for (const listener of crew) {
      try {
        listener(crew.size);
      } catch {
        crew.delete(listener);
      }
    }
  }, CREW_SETTLE_MS);
}

export function joinCrew(listener: CrewListener): () => void {
  crew.add(listener);
  tellCrew();
  return () => {
    if (crew.delete(listener)) tellCrew();
  };
}
