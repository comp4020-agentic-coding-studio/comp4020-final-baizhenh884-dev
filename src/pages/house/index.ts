// GET /house/: the house was retired for the ship (docs/decisions/0005-the-ship.md); its page's old links keep
// working, permanently redirected to the shipwright's notes (spec/ship-page.test.ts).
import type { APIRoute } from "astro";

export const GET: APIRoute = () => new Response(null, { status: 301, headers: { location: "/ship/" } });
