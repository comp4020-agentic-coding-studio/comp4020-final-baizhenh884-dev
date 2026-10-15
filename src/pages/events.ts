import type { APIRoute } from "astro";
import { currentPositions, currentTrace, type CurrentTrace } from "../lib/db";
import { subscribe, type Change } from "../lib/live";
import { logLine, visitorTag } from "../lib/log";
import { visitorId } from "../lib/visitor";

// GET /events: the current sentence as a stream. It opens with a `snapshot`
// of SQLite ({ positions, trace }), then sends each successful replacement as
// a `change` ({ position, word, version }). Changes carry no trace, so when a
// change alters this connection's own visitor's trace (their change made in
// another tab, or their word replaced) the connection also gets a fresh
// snapshot. A reconnect is a new request, so it catches up from a fresh
// snapshot rather than from any replay.
//
// `trace` carries whichever shape rules.mode is currently serving
// (docs/decisions/0003-settle-and-kept-ships.md): the once-mode Trace, or
// the richer settle-mode SettleTrace — the client (live-client.ts)
// discriminates structurally, since the bundled client JS can't know the
// server's mode at build time. Settling by age never changes this value by
// itself (it has no server event to push with): the client's own local
// timer handles that entirely on the page, never by the server sending more
// snapshots.

const HEARTBEAT_MS = 20_000;
const encoder = new TextEncoder();

const positionsNow = () => currentPositions().map(({ position, word, version }) => ({ position, word, version }));

// settlesInMs is recomputed from the current time on every read, so it never
// equals a prior read even when nothing a visitor would notice has changed:
// comparing it directly would resend a snapshot on every single broadcast
// anywhere, for every connection with a holding trace. It drives only the
// client's own local timer (never rendered), so it's excluded from the
// comparison that decides whether to resend.
function withoutSettleTimer(trace: CurrentTrace["trace"]): unknown {
  if (!trace || !("latest" in trace) || !trace.latest.standing || trace.latest.settled) return trace;
  const { settlesInMs: _settlesInMs, ...latest } = trace.latest;
  return { ...trace, latest };
}

const sameTrace = (a: CurrentTrace["trace"], b: CurrentTrace["trace"]) =>
  a === b || JSON.stringify(withoutSettleTimer(a)) === JSON.stringify(withoutSettleTimer(b));

export const GET: APIRoute = ({ cookies, locals }) => {
  const visitor = visitorId(cookies);
  const traceNow = (): CurrentTrace["trace"] => (visitor ? currentTrace(visitor).trace : null);
  const reqId = locals.requestId;
  const v = visitorTag(visitor);
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

      let sent: CurrentTrace["trace"] = null; // the trace this connection last received
      const unsubscribe = subscribe((change: Change) => {
        event("change", change);
        const trace = traceNow();
        if (sameTrace(trace, sent)) return;
        sent = trace;
        event("snapshot", { positions: positionsNow(), trace });
        logLine(reqId, "stream-resnapshot", { v });
      });
      sent = traceNow();
      event("snapshot", { positions: positionsNow(), trace: sent });
      logLine(reqId, "stream-open", { v });

      // a comment line, ignored by clients, so a dead socket surfaces
      const heartbeat = setInterval(() => {
        try {
          send(": keep-alive\n\n");
        } catch {
          stop();
        }
      }, HEARTBEAT_MS);
      let stopped = false;
      stop = () => {
        if (stopped) return; // the adapter's cancel() can follow a heartbeat failure
        stopped = true;
        clearInterval(heartbeat);
        unsubscribe();
        logLine(reqId, "stream-close", { v });
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
