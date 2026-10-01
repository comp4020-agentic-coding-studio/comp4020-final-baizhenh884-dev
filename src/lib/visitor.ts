import type { AstroCookies } from "astro";

// A visitor is a browser holding this cookie: a random id, no account, no
// database row until they make a change. Clearing it makes a new visitor.
const COOKIE = "theseus_visitor";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function visitorId(cookies: AstroCookies): string | null {
  const id = cookies.get(COOKIE)?.value;
  return id && ID.test(id) ? id : null;
}

// On any page view: keep the visitor's id, or give a new browser one.
export function ensureVisitor(cookies: AstroCookies): string {
  const existing = visitorId(cookies);
  if (existing) return existing;
  const id = crypto.randomUUID();
  cookies.set(COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}
