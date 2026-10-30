// The part notation's words (#part), and what a screen reader hears of the
// same change, for the ship (docs/decisions/0005-the-ship.md). Everything here
// comes from partOf() in rules.ts: never a second copy of the rule. A desktop
// adds the count that decided it; a phone, where it would reach the ship, says
// the change only (spec/ship-notation.test.ts).

import { isWordShaped } from "../word-shape";
import { PARTS, partOf } from "./rules";

// a word in hand ({ position, word }), or an accepted change ({ ..., was })
export type Noted = { position: number; word: string; was?: string };
export type Form = "desktop" | "phone";

const number = (position: number) => String(position + 1).padStart(2, "0");
const Name = (position: number) => PARTS[position][0].toUpperCase() + PARTS[position].slice(1);
const label = (position: number) => `${number(position)} · ${Name(position)}`;
// "oars" and "shields" are many: they go, they were, choose them
const many = (position: number) => PARTS[position].endsWith("s");

// a part is unchanged when its rule value is, whatever it's called (a and n share a paint)
const same = (position: number, a: string, b: string) => JSON.stringify(partOf(position, a).value) === JSON.stringify(partOf(position, b).value);
const change = (position: number, was: string, word: string) =>
  same(position, was, word) ? `${partOf(position, word).says}, unchanged` : `${partOf(position, was).says} → ${partOf(position, word).says}`;

export function notation({ position, word, was }: Noted, form: Form = "desktop"): string {
  if (was === undefined) return `${label(position)} · ${partOf(position, word).says}`;
  const c = change(position, was, word);
  return form === "phone" ? `${label(position)} · ${c}` : `${label(position)} · ${c} · ${partOf(position, word).because}`;
}

// one change, for the polite live region: positions, words and parts, never who or when
export function said({ position, word, was }: Noted): string {
  const part = PARTS[position];
  const now = partOf(position, word).says;
  const before = was === undefined ? now : partOf(position, was).says;
  const s = many(position) ? "" : "s";
  const c = was === undefined || same(position, was, word) ? `the ${part} stay${s} ${now}` : `the ${part} go${s ? "es" : ""} from ${before} to ${now}`;
  return `Changed: word ${position + 1} is now “${word}”; ${c}.`;
}

// While a replacement is being typed, in the notation's slot: the part, the word being replaced (struck by
// the page) and what the draft would make of the part, the same change notation() names once a change is
// accepted; a desktop adds the count that decided it. Never the keys: they're in the rule paragraph. Text
// only: the ship never shows a draft. A draft that can't be a word yet predicts nothing. If another visitor
// replaced the word, sending would be refused as stale, so the line says the new word and what to do. In
// pieces, so the page shortens only a long word.
export type Drafting = { lead: string; was: string; rest: string; now?: string; end?: string };
export type Draft = { position: number; word: string; draft: string; now?: string };

export function drafting({ position, word, draft, now }: Draft, form: Form = "desktop"): Drafting {
  // a phone leads with the part's number alone (the index above its word): the name leaves no room at 390
  const lead = `${form === "phone" ? number(position) : label(position)} · `;
  // stale: the number alone on every device, so two 24-letter words fit beside "choose again"
  if (now !== undefined) return { lead: `${number(position)} · `, was: word, rest: " · now “", now, end: "” · choose again" };
  const typed = draft.trim();
  if (!isWordShaped(typed)) return { lead, was: word, rest: "" };
  const because = form === "desktop" ? ` · ${partOf(position, typed).because}` : "";
  return { lead, was: word, rest: ` · ${change(position, word, typed)}${because}` };
}

// the same, for the draft's polite live region, once typing pauses: never a key, never who or when
export function foreseen({ position, word, draft, now }: Draft): string {
  if (now !== undefined) return `${Name(position)} ${many(position) ? "were" : "was"} changed to ${now} by someone else. Choose ${many(position) ? "them" : "it"} again.`;
  const typed = draft.trim();
  if (!isWordShaped(typed)) return "";
  const before = partOf(position, word).says, after = partOf(position, typed);
  return `${Name(position)}: ${same(position, word, typed) ? after.says : before} would ${same(position, word, typed) ? `stay ${after.says}` : `become ${after.says}`}; ${after.because}.`;
}

// sets the drafting line in the slot, as text: the replaced word is a <del>, a word that replaced it a <b>,
// never markup of their own
export function showDrafting(part: HTMLElement, { lead, was, rest, now, end }: Drafting): void {
  const doc = part.ownerDocument;
  const span = (text: string, tag = "span") => { const el = doc.createElement(tag); el.textContent = text; return el; };
  part.hidden = false;
  part.replaceChildren(span(lead), span(was, "del"), ...(rest ? [span(rest)] : []), ...(now !== undefined ? [span(now, "b"), span(end ?? "")] : []));
}
