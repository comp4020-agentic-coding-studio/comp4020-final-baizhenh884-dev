import type { APIRoute } from "astro";
import { currentPositions, traceFor, type Trace } from "../lib/db";
import { subscribe, type Change } from "../lib/live";
import { visitorId } from "../lib/visitor";

// GET /events: the current sentence as a stream. It opens with a `snapshot`
// of SQLite ({ positions, trace }), then sends each successful replacement as
// a `change` ({ position, word, version }). Changes carry no trace, so when a
// change alters this connection's own visitor's trace (their change made in
// another tab, or their word replaced) the connection also gets a fresh
// snapshot. A reconnect is a new request, so it catches up from a fresh
// snapshot rather than from any replay.

const HEARTBEAT_MS = 20_000;
const encoder = new TextEncoder();

const positionsNow = () => currentPositions().map(({ position, word, version }) => ({ position, word, version }));

const sameTrace = (a: Trace | null, b: Trace | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.position === b.position &&
    a.word === b.word &&
    a.standing === b.standing &&
    (a.standing || b.standing || a.now === b.now));

export const GET: APIRoute = ({ cookies }) => {
  const visitor = visitorId(cookies);
  const traceNow = () => (visitor ? traceFor(visitor) : null);
  let stop = () => {};

  const body = new ReadableStream<Uint8Array>({
    // Deliberately synchronous: subscribing, reading SQLite (better-sqlite3
    // never yields) and sending the snapshot happen in one turn of the event
    // loop, so no replacement can commit and broadcast in between unseen. One
    // that lands just before may arrive twice; clients ignore versions that
    // aren't newer.
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const event = (name: string, data: unknown) => send(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

      let sent: Trace | null = null; // the trace this connection last received
      const unsubscribe = subscribe((change: Change) => {
        event("change", change);
        const trace = traceNow();
        if (sameTrace(trace, sent)) return;
        sent = trace;
        event("snapshot", { positions: positionsNow(), trace });
      });
      sent = traceNow();
      event("snapshot", { positions: positionsNow(), trace: sent });

      // a comment line, ignored by clients, so a dead socket surfaces
      const heartbeat = setInterval(() => {
        try {
          send(": keep-alive\n\n");
        } catch {
          stop();
        }
      }, HEARTBEAT_MS);
      stop = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
    // the adapter cancels the stream when the client's connection closes
    cancel() {
      stop();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
};
