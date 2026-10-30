// stub: slice 3a's spec lands first (spec/ship-notation.test.ts)
export type Noted = { position: number; word: string; was?: string };
export type Form = "desktop" | "phone";
export const notation = (_n: Noted, _f: Form = "desktop"): string => "";
export const said = (_n: Noted): string => "";
export type Drafting = { lead: string; was: string; rest: string; now?: string; end?: string };
export type Draft = { position: number; word: string; draft: string; now?: string };
export const drafting = (_d: Draft, _f: Form = "desktop"): Drafting => ({ lead: "", was: "", rest: "" });
export const foreseen = (_d: Draft): string => "";
export function showDrafting(_part: HTMLElement, _d: Drafting): void {}
