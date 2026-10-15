/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    // Set once per request by src/middleware.ts; read by every route that
    // logs so every line from one request shares the same bracket.
    requestId: string;
    // Set by ensureVisitor() during rendering, once the visitor's identity
    // for this request is decided (new or existing cookie). The access-log
    // line in middleware.ts reads this after next() resolves so a brand-new
    // visitor's access line and its visitor-new line agree on one tag,
    // instead of the access line logging v=none.
    visitorId: string | null;
  }
}
