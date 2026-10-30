// The house on GET / and GET /?at=N: it mounts a HouseView beside the
// sentence the server rendered and keeps the two one object. The sentence's
// forms stay the interface and the truth; this only shows the body for the
// words, couples selection, and animates a change after the server has
// accepted it. Nothing here runs while a visitor types (no preview).

import { drafting, notation, showDrafting } from "./notation";
import type { KeptShip, Moment } from "../kept-moment";
import type { Look } from "./theme";
import { HouseView } from "./view";
import { TIMING, type Kind } from "../ship/motion";
import { tagged, tagLabel, threadPath } from "./thread";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;

// a browser that can't draw WebGL keeps the sentence and loses only the house
function viewIn(host: HTMLElement | null, look: Look): HouseView | null {
  if (!host) return null;
  try {
    const view = new HouseView(host, look);
    // a page leaving for good releases everything it drew
    addEventListener("pagehide", (e) => { if (!e.persisted) view.destroy(); });
    return view;
  } catch {
    host.remove();
    return null;
  }
}

type Slot = { position: number; pos: HTMLElement; label: HTMLLabelElement; input: HTMLInputElement };

// A change that crosses (docs/decisions/0003, Slice 5) sends its old part out
// toward the kept house: `toward` is that house's box on the page.
export type Crossing = { toward: DOMRect | null };
export type CurrentHouse = {
  latest(change: { position: number; word: string }, crossing?: Crossing | null): void;
  // a draft at `position` holds back a newer word (`now`), or no longer does (null)
  held(position: number, now: string | null): void;
};

// `ownCrossing`: whether this visitor's own change, just made (Post/Redirect/Get), crossed
export function mountCurrent(doc: Document, ownCrossing: (position: number) => Crossing | null = () => null): CurrentHouse | null {
  const slots: Slot[] = [];
  for (const form of doc.querySelectorAll<HTMLFormElement>('.sentence form[action="/replace"]')) {
    const position = Number(form.querySelector<HTMLInputElement>('input[name="position"]')?.value);
    const label = form.querySelector("label"), input = form.querySelector<HTMLInputElement>('input[name="word"]'), pos = form.closest<HTMLElement>(".pos");
    if (Number.isInteger(position) && label && input && pos) slots.push({ position, pos, label, input });
  }
  if (slots.length !== 10) return null;
  const view = viewIn(doc.getElementById("house"), "present");
  if (!view) return null;
  // the words the house shows: the shared truth, held drafts or not
  const words = slots.map((s) => s.label.textContent!.trim());
  const part = doc.getElementById("part");

  // ---- the change this visitor just made, shown as it happens (Post/Redirect/Get) ----
  // On submit the position and the word it showed are noted for this tab only; after
  // the redirect, if the server shows this visitor's word standing there, the house
  // begins from the body of the word it replaced (the word they saw: an accepted
  // change always replaces the version they saw) and exchanges it.
  for (const s of slots) s.label.closest("form")!.addEventListener("submit", () => {
    try { sessionStorage.setItem("theseus:replaced", JSON.stringify({ position: s.position, word: s.label.textContent!.trim() })); } catch { /* the animation is optional */ }
  });
  let replaced: { position: number; word: string } | null = null;
  try {
    const v = sessionStorage.getItem("theseus:replaced");
    sessionStorage.removeItem("theseus:replaced");
    replaced = v === null ? null : (JSON.parse(v) as { position: number; word: string });
  } catch { /* no storage: no animation */ }
  const own = replaced === null || !Number.isInteger(replaced.position) ? null : slots[replaced.position] ?? null;
  const before = own?.label.querySelector("mark") && typeof replaced?.word === "string" && replaced.word !== words[own.position] ? replaced.word : null;
  if (own && before) {
    view.show(words.map((w, i) => (i === own.position ? before : w)));
    requestAnimationFrame(() => {
      const crossing = ownCrossing(own.position);
      view.change(own.position, words, crossing ? "cross" : "own", crossing?.toward ?? null);
      arrive(own, before, crossing ? "cross" : "own");
    });
  } else view.show(words);

  // ---- the sentence's word leaves and the new one arrives with its body ----
  function arrive(s: Slot, old: string, kind: Kind): void {
    const dur = TIMING[kind].exchange;
    // the word and its territory are singled out together: the line stands while the part is exchanged, the emphasis until it has settled
    const T = reduced() ? TIMING.reduced : TIMING[kind];
    hold(s.position, T.exchange || T.hold, T.exchange + T.hold, old);
    if (reduced()) return;
    const ghost = doc.createElement("span");
    ghost.className = "leaving";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = old;
    s.pos.append(ghost);
    ghost.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-0.35em)", offset: kind === "own" ? 0.4 : 0.25 }, { opacity: 0 }], { duration: dur, easing: "cubic-bezier(.6,0,.2,1)" }).finished.then(() => ghost.remove(), () => ghost.remove());
    const red = "rgb(195 51 28)", clear = "rgb(195 51 28 / 0)", ink = "rgb(25 23 20)";
    s.label.animate(
      kind !== "remote"
        ? [{ color: clear }, { color: clear, offset: 0.38 }, { color: red, offset: 0.62 }, { color: red, offset: 0.8 }, { color: ink }]
        : [{ color: clear }, { color: clear, offset: 0.22 }, { color: red, offset: 0.34 }, { color: red, offset: 0.55 }, { color: ink }],
      { duration: dur, easing: "cubic-bezier(.6,0,.2,1)" },
    );
  }

  // ---- selection: words and territories are one choice, in ink ----
  let selected: number | null = null;
  let hovered: number | null = null; // pointed at: a word, a territory, or the visitor's own trace
  let rebuilding: number | null = null; // the territory being exchanged right now
  let held = false; // the territory is singled out by an accepted change, not by someone at work on the word
  // the part and its family while a word is in hand; after an accepted change, the family change and,
  // where there's room (not a phone, where it would reach the house), the letters that decided it
  const form = () => (matchMedia("(max-width: 900px)").matches ? "phone" : "desktop");
  const annotate = (position: number | null, was?: string) => {
    if (!part) return;
    part.hidden = position === null;
    part.textContent = position === null ? "" : notation({ position, word: words[position], was }, form());
  };
  // while a replacement is typed: the part, the word it replaces, struck, and the family the draft would give
  // it (text only: the house never shows it), or, if another visitor replaced the word, the new word and
  // "choose again"; an emptied field goes back to the part
  const heldBack = new Map<number, string>();
  const drafted = (s: Slot) => {
    if (!part || selected !== s.position || held) return;
    if (s.input.value === "") annotate(s.position);
    else showDrafting(part, drafting({ position: s.position, word: s.label.textContent?.trim() ?? words[s.position], draft: s.input.value, now: heldBack.get(s.position) }, form())); // the word on screen, which a draft may hold back
  };
  // the one hairline between the chosen word and its territory, ending in that territory's numbered tag
  // (desktop; red only while that territory is rebuilt)
  const thread = doc.getElementById("thread") as SVGSVGElement | null;
  const line = thread?.querySelector("path") ?? null, tag = thread?.querySelector<SVGGElement>(".tag") ?? null;
  const tagText = tag?.querySelector("text") ?? null;
  let drawn = 0;
  // the line means "this word is acting on this territory": a word at work, or a part being rebuilt. Pointing alone never draws it;
  // it only tags the territory pointed at (spec/numbering.test.ts)
  const target = () => rebuilding ?? (selected !== null && !held ? selected : null);
  const drawThread = () => {
    drawn = 0;
    const t = tagged({ selected, held, hovered, rebuilding }), p = target();
    if (!thread || !line || !tag || !tagText || t === null || getComputedStyle(thread).display === "none") { thread?.classList.remove("on", "red"); return; }
    const a = view.anchor(t);
    if (!a) return;
    // the line leaves the notation: whenever it's drawn, the notation is shown
    const lined = p === t && !!part && !part.hidden;
    if (lined) {
      const text = doc.createRange();
      text.selectNodeContents(part!);
      line.setAttribute("d", threadPath(a, { notation: text.getBoundingClientRect() }));
    } else line.setAttribute("d", "");
    tag.setAttribute("transform", `translate(${a.x} ${a.y})`);
    tagText.textContent = tagLabel(t);
    thread.classList.add("on");
    thread.classList.toggle("red", t === rebuilding);
    drawn = requestAnimationFrame(drawThread); // follows scroll, resize and a word growing as it is typed
  };
  const sync = () => {
    doc.body.classList.toggle("pointing", hovered !== null && selected === null && rebuilding === null);
    if (!drawn) drawn = requestAnimationFrame(drawThread);
  };
  const setHover = (p: number | null) => {
    hovered = p;
    view.hover(p);
    for (const s of slots) s.pos.classList.toggle("pointed", s.position === p); // the word is marked whoever is pointing: the word, the house or the trace
    sync();
  };
  const select = (position: number | null, byChange = false, was?: string) => {
    selected = position;
    held = byChange && position !== null;
    view.select(position);
    annotate(position, was);
    doc.body.classList.toggle("selecting", position !== null);
    for (const s of slots) s.pos.classList.toggle("selected", s.position === position);
    sync();
  };
  // A word has just been exchanged: its territory is the one thing singled out, and the line (red) stands for
  // `lineMs` while it is rebuilt; the emphasis lasts until `ms`, when the body has settled and everything lets go.
  const hold = (position: number, lineMs: number, ms: number, was: string) => {
    if (selected !== null) return; // someone is already at work on a word; a change elsewhere doesn't take it over
    rebuilding = position;
    select(position, true, was);
    setTimeout(() => { if (rebuilding === position) { rebuilding = null; sync(); } }, lineMs);
    setTimeout(() => { if (selected === position && held && doc.activeElement !== slots[position].input) select(null); }, ms);
  };
  // the territory this visitor's standing word made, if it still stands
  const refreshTrace = () => { const i = slots.findIndex((s) => s.label.querySelector("mark")); view.trace(i < 0 ? null : i); return i < 0 ? null : i; };
  refreshTrace();
  doc.addEventListener("pointerover", (e) => {
    const inTrace = (e.target as Element).closest?.('section[aria-labelledby="trace-heading"]');
    const i = inTrace ? refreshTrace() : null;
    if (inTrace && i !== null) setHover(i);
  });
  doc.addEventListener("pointerout", (e) => { if ((e.target as Element).closest?.('section[aria-labelledby="trace-heading"]') && !(e.relatedTarget as Element | null)?.closest?.('section[aria-labelledby="trace-heading"]')) setHover(null); });
  for (const s of slots) {
    s.input.addEventListener("focus", () => { select(s.position); drafted(s); });
    s.input.addEventListener("blur", () => {
      // a draft keeps its word chosen; an empty field lets go
      setTimeout(() => { if (selected === s.position && doc.activeElement !== s.input && s.input.value === "") select(null); }, 0);
    });
    s.input.addEventListener("input", () => { if (s.input.value === "" && doc.activeElement !== s.input) select(null); else drafted(s); });
    s.pos.addEventListener("pointerenter", () => { if (fine()) setHover(s.position); });
    s.pos.addEventListener("pointerleave", () => { if (fine()) setHover(null); });
  }
  // On a fine pointer the house can be pointed at; on touch the words are the way in,
  // and the canvas never takes a gesture, so the page scrolls as a page.
  const canvas = view.canvas;
  canvas.addEventListener("pointermove", (e) => {
    if (!fine()) return;
    const p = view.pick(e.clientX, e.clientY);
    setHover(p);
    canvas.style.cursor = p === null ? "default" : "pointer";
  });
  canvas.addEventListener("pointerleave", () => setHover(null));
  canvas.addEventListener("click", (e) => {
    if (!fine()) return;
    const p = view.pick(e.clientX, e.clientY);
    if (p !== null) slots[p].input.focus();
  });

  return {
    // another visitor's change, from the live stream: the house shows it at once,
    // and the word arrives with it unless a draft is holding that word back
    latest({ position, word }, crossing = null) {
      const old = words[position];
      if (old === word) return;
      words[position] = word;
      const kind: Kind = crossing ? "cross" : "remote";
      view.change(position, words, kind, crossing?.toward ?? null);
      queueMicrotask(() => { if (slots[position].label.textContent!.trim() === word) arrive(slots[position], old, kind); refreshTrace(); });
    },
    held(position, now) {
      if (now === null) heldBack.delete(position);
      else heldBack.set(position, now);
      if (slots[position]) drafted(slots[position]);
    },
  };
}

// an earlier form: its own body, as a white study model, never live
export function mountEarlier(doc: Document): void {
  const words = [...doc.querySelectorAll(".sentence .w")].map((w) => w.textContent!.trim());
  if (words.length !== 10) return;
  viewIn(doc.getElementById("house"), "past")?.show(words);
}

// an earlier house (/?kept=k): a completed kept ship, whole, as timber, never live
export function mountLoneHouse(doc: Document): void {
  const words = [...doc.querySelectorAll(".kept-sentence .w")].map((w) => w.textContent!.trim());
  if (words.length !== 10) return;
  viewIn(doc.getElementById("house-kept"), "kept")?.keptShow({ words, gaps: words.map(() => false), next: words.map(() => null) });
}

export type KeptHouse = {
  // a kept ship as a fresh load (or a reconnect) shows it: at once
  update(kept: KeptShip): void;
  // a kept ship from a change event, with its moment; a crossing part comes in from `from` (the standing house)
  apply(kept: KeptShip, moment: Moment | null, from: DOMRect | null): void;
  // the kept ship this house shows, as read from the page when it loaded
  readonly initial: KeptShip;
  // this visitor's own kept part, drawn a little firmer (null: none shown)
  mine(position: number | null): void;
};

// The second Theseus (docs/decisions/0003-settle-and-kept-ships.md): read-only,
// never selected or hovered, its gaps a faint outline from the first load. A
// gap's word, for the body's own geometry, is the position's current live
// word (deriveKeptShip's own convention: a gap position's word is the current
// one, until it's replaced away and kept); the gap flag alone decides whether
// that territory is drawn solid or as a faint outline. The initial state is
// read entirely from the server-rendered markup — the .kept-sentence spans
// index.astro already wrote, and the live sentence's own word labels — the
// same way mountEarlier reads an earlier form's words, never passed in as a
// script variable, so this script stays a plain ES module. `.update()` shows
// a kept ship at once (a reconnect's catch-up); `.apply()` moves it for a
// change event's moment (kept-stage.ts): a crossing part arriving, a later
// ship's quiet beat. Neither ever leaves the page on a stale kept ship.
export function mountKept(doc: Document): KeptHouse | null {
  const keptSpans = [...doc.querySelectorAll<HTMLElement>(".kept-sentence .w")];
  // keptShipAt() already sets a gap position's word to the position's
  // current live word (src/lib/kept-ship.ts) — the server's own convention,
  // reused here: read it from the live sentence, the word a gap shows faint.
  const currentWords = [...doc.querySelectorAll<HTMLFormElement>('.sentence form[action="/replace"] label')].map((l) =>
    l.textContent!.trim(),
  );
  if (keptSpans.length !== 10 || currentWords.length !== 10) return null;
  const view = viewIn(doc.getElementById("house-kept"), "kept");
  if (!view) return null;
  const initialGaps = keptSpans.map((s) => s.classList.contains("gap"));
  // the next house's waiting words, read from the row GET / served (index.astro), like the rest
  const next: (string | null)[] = Array(10).fill(null);
  for (const w of doc.querySelectorAll<HTMLElement>(".kept-half .waiting .ws .w")) next[Number(w.dataset.n) - 1] = w.textContent!.trim();
  const initial: KeptShip = { words: initialGaps.map((gap, i) => (gap ? currentWords[i] : keptSpans[i].textContent!.trim())), gaps: initialGaps, next };
  view.keptShow(initial);
  return {
    initial,
    update: (kept) => view.keptShow(kept),
    apply: (kept, moment, from) => view.keptApply(kept, moment, from),
    mine: (position) => view.trace(position),
  };
}
