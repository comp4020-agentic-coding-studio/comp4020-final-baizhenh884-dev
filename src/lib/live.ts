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
// the rest still hear the change.
export function broadcast(change: Change): void {
  for (const listener of listeners) {
    try {
      listener(change);
    } catch {
      listeners.delete(listener);
    }
  }
}
