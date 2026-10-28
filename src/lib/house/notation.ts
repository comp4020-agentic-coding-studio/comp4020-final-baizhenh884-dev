// The part notation's words (#part), and what a screen reader hears of the
// same change. Everything here comes from describeTerritory(): never a second
// copy of the rule. A desktop says the whole reason; a phone, where it would
// reach the house, says the family change only (spec/house-notation.test.ts).

import { isWordShaped } from "../word-shape";
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

// While a replacement is being typed, in the notation's slot (decided after the 28 October playtest): the
// part, the word being replaced (struck by the page) and the family the draft would give it, the same
// change notation() names once a change is accepted; a desktop adds the test that decided it. Never the
// keys: they're in the rule paragraph. Text only: the house never shows a draft. A draft that can't be a
// word yet predicts nothing. If another visitor replaced the word, sending would be refused as stale, so
// the line says the new word and what to do. In pieces, so the page shortens only a long word.
export type Drafting = { lead: string; was: string; rest: string; now?: string; end?: string };
export type Draft = { position: number; word: string; draft: string; now?: string };

const decidedBy = (position: number, word: string) => {
  const r = describeTerritory(position, word).reason.at(-1);
  return r ? (r.holds ? TESTS[r.test].yes : TESTS[r.test].no) : null;
};

export function drafting({ position, word, draft, now }: Draft, form: Form = "desktop"): Drafting {
  // a phone leads with the part's number alone (the index above its word): the name leaves no room at 390
  const lead = `${form === "phone" ? label(position).slice(0, 2) : label(position)} · `;
  // stale: the number alone on every device, so two 24-letter words fit beside "choose again"
  if (now !== undefined) return { lead: `${label(position).slice(0, 2)} · `, was: word, rest: " · now “", now, end: "” · choose again" };
  const typed = draft.trim();
  if (!isWordShaped(typed)) return { lead, was: word, rest: "" };
  const change = notation({ position, word: typed, was: word }, "phone").slice(label(position).length + 3);
  const test = form === "desktop" ? decidedBy(position, typed) : null;
  return { lead, was: word, rest: ` · ${change}${test ? ` · ${test}` : ""}` };
}

// the same, for the draft's polite live region, once typing pauses: never a key, never who or when
export function foreseen({ position, word, draft, now }: Draft): string {
  const part = TERRITORIES[position].label;
  const Part = part[0].toUpperCase() + part.slice(1);
  if (now !== undefined) return `${Part} was changed to ${now} by someone else. Choose it again.`;
  const typed = draft.trim();
  if (!isWordShaped(typed)) return "";
  const before = describeTerritory(position, word).family, after = describeTerritory(position, typed).family;
  const test = decidedBy(position, typed);
  return `${Part}: ${before} would ${before === after ? "stay" : "become"} ${after}${test ? `; ${test}` : ""}.`;
}

// sets the drafting line in the slot, as text: the replaced word is a <del>, a word that replaced it a <b>,
// never markup of their own
export function showDrafting(part: HTMLElement, { lead, was, rest, now, end }: Drafting): void {
  const doc = part.ownerDocument;
  const span = (text: string, tag = "span") => { const el = doc.createElement(tag); el.textContent = text; return el; };
  part.hidden = false;
  part.replaceChildren(span(lead), span(was, "del"), ...(rest ? [span(rest)] : []), ...(now !== undefined ? [span(now, "b"), span(end ?? "")] : []));
}
