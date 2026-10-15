import { createHash } from "node:crypto";

// Server-side "who did what", to stdout, for Fly to collect: observation
// only, never changing a response, the replacement transaction or realtime
// delivery, and never throwing (a logging failure must never fail a
// request). See docs/decisions/0002-pseudonymous-visitor-and-logging.md.

export function requestId(): string {
  return crypto.randomUUID().slice(0, 6);
}

// One-way: the raw cookie never appears in a log line, only this hash.
// Stable per browser (deterministic), different across browsers, and short
// enough to say aloud. The cookie's own 122 bits of entropy make the hash
// non-reversible without a server secret.
export function visitorTag(id: string | null): string {
  if (!id) return "none";
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
}

function format(fields?: Record<string, unknown>): string {
  if (!fields) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const text = typeof value === "string" ? value : String(value);
    parts.push(/[\s"]/.test(text) ? `${key}="${text.replace(/"/g, '\\"')}"` : `${key}=${text}`);
  }
  return parts.join(" ");
}

export function logLine(reqId: string, message: string, fields?: Record<string, unknown>): void {
  try {
    const rest = format(fields);
    console.log(`[${reqId}] ${message}${rest ? ` ${rest}` : ""}`);
  } catch {
    // never let logging fail a request
  }
}
