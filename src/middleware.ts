import { defineMiddleware } from "astro/middleware";
import { logLine, requestId, visitorTag } from "./lib/log";
import { visitorId } from "./lib/visitor";

// Every request's access line, server-side, so a crit can be narrated from
// `flyctl logs` alone: who arrived (the visitor's own route logs visitor-new
// or visitor-return), what they asked for, what came back. Observation only:
// a thrown error is logged once and rethrown unchanged, never swallowed or
// turned into a different response.
//
// The visitor identity is read AFTER next() resolves, from
// context.locals.visitorId if a route set it (ensureVisitor does, on GET /),
// falling back to the read-only cookie lookup otherwise. That ordering is
// what lets a brand-new visitor's access line share the exact tag their
// visitor-new line names, instead of the access line logging v=none because
// the cookie didn't exist yet when the request arrived.
export const onRequest = defineMiddleware(async (context, next) => {
  const reqId = requestId();
  context.locals.requestId = reqId;
  const start = Date.now();
  const path = context.url.pathname;

  try {
    const response = await next();
    const id = context.locals.visitorId ?? visitorId(context.cookies);
    logLine(reqId, `${context.request.method} ${path}`, {
      status: response.status,
      ms: Date.now() - start,
      v: visitorTag(id),
    });
    return response;
  } catch (error) {
    logLine(reqId, "error", { path, message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
});
