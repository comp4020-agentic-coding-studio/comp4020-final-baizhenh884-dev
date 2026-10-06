import type { APIRoute } from "astro";
import { currentPositions, traceFor } from "../lib/db";
import { subscribe, type Change } from "../lib/live";
import { visitorId } from "../lib/visitor";

// GET /events: the current sentence as a stream. It opens with a `snapshot`
// of SQLite ({ positions, trace }), then sends each successful replacement as
// a `change` ({ position, word, version }). A reconnect is a new request, so
// it catches up from a fresh snapshot rather than from any replay.

const HEARTBEAT_MS = 20_000;
const encoder = new TextEncoder();

export const GET: APIRoute = ({ cookies }) => {
  const visitor = visitorId(cookies);
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

      const unsubscribe = subscribe((change: Change) => event("change", change));
      const positions = currentPositions().map(({ position, word, version }) => ({ position, word, version }));
      event("snapshot", { positions, trace: visitor ? traceFor(visitor) : null });

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
