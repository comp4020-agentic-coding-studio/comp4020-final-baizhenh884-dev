// The part notation's words (#part), and what a screen reader hears of the
// same change. Everything here comes from describeTerritory(): never a second
// copy of the rule. A desktop says the whole reason; a phone, where it would
// reach the house, says the family change only (spec/house-notation.test.ts).

import { describeTerritory, TERRITORIES, TESTS } from "./territories";

// a word in hand ({ position, word }), or an accepted change ({ ..., was })
export type Noted = { position: number; word: string; was?: string };
export type Form = "desktop" | "phone";

const label = (position: number) => `${String(position + 1).padStart(2, "0")} — ${TERRITORIES[position].label}`;
const reasonOf = (position: number, word: string) =>
  describeTerritory(position, word).reason.map((r) => (r.holds ? TESTS[r.test].yes : TESTS[r.test].no)).join(", ");

export function notation({ position, word, was }: Noted, form: Form = "desktop"): string {
  const now = describeTerritory(position, word).family;
  if (was === undefined) return `${label(position)} · ${now}`;
  const before = describeTerritory(position, was).family;
  const change = before === now ? `${now}, unchanged` : `${before} → ${now}`;
  return form === "phone" ? `${label(position)} · ${change}` : `${label(position)} · ${change} · ${reasonOf(position, word)}`;
}

// one change, for the polite live region: positions, words and families, never who or when
export function said({ position, word, was }: Noted): string {
  const part = TERRITORIES[position].label;
  const now = describeTerritory(position, word).family;
  const before = was === undefined ? now : describeTerritory(position, was).family;
  const change = before === now ? `the ${part} stays ${now}` : `the ${part} goes from ${before} to ${now}`;
  return `Changed: word ${position + 1} is now “${word}”; ${change}.`;
}

// While a replacement is being typed, in the notation's slot: the word being replaced (struck by the page)
// and the keys. A desktop keeps the part and its family, of the word that stands (typing never previews
// the house); a phone says only what's being replaced. In pieces, so a long word can be shortened alone.
export type Drafting = { lead: string; was: string; tail: string };
export function drafting({ position, word }: Noted, form: Form = "desktop"): Drafting {
  return form === "phone"
    ? { lead: "Replacing ", was: word, tail: " · Enter to replace" }
    : { lead: `${notation({ position, word })} · replacing `, was: word, tail: " · Enter to replace · Esc to cancel" };
}

// sets the drafting line in the slot, as text: the replaced word is a <del>, never markup of its own
export function showDrafting(part: HTMLElement, { lead, was, tail }: Drafting): void {
  const doc = part.ownerDocument;
  const span = (text: string, tag = "span") => { const el = doc.createElement(tag); el.textContent = text; return el; };
  part.hidden = false;
  part.replaceChildren(span(lead), span(was, "del"), span(tail));
}
