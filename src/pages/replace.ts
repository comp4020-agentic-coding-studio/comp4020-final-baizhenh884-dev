import type { APIRoute } from "astro";
import { replaceWord } from "../lib/db";
import { visitorId } from "../lib/visitor";
import { isValidWord } from "../lib/word";

// POST /replace: position, version, word → 303 replaced · 403 already spent ·
// 409 stale · 422 invalid. A request without a visitor cookie, or with fields
// that aren't exactly one well-formed value each, is invalid (422).
const refusal = (status: number, message: string) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

function field(form: FormData, name: string): string | null {
  const values = form.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const visitor = visitorId(cookies);
  if (!visitor) return refusal(422, "No visitor cookie: load the sentence first, then change a word.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refusal(422, "That isn't a form submission.");
  }
  const position = field(form, "position");
  const version = field(form, "version");
  const raw = field(form, "word");
  if (position === null || !/^[0-9]$/.test(position) || version === null || !/^[0-9]{1,15}$/.test(version) || raw === null) {
    return refusal(422, "That replacement is missing its word position, version or word.");
  }

  const word = raw.trim();
  switch (replaceWord(visitor, Number(position), Number(version), word, isValidWord(word))) {
    case "replaced":
      return redirect("/", 303);
    case "spent":
      return refusal(403, "You've already changed your one word. You can still watch the sentence.");
    case "stale":
      return refusal(409, "That word changed while you were deciding. Your change is still unspent; try again.");
    case "invalid":
      return refusal(422, "A replacement is one new word, up to 24 characters, with no spaces.");
  }
};
