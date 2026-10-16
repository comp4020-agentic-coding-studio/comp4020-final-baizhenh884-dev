// The house on GET / and GET /?at=N: it mounts a HouseView beside the
// sentence the server rendered and keeps the two one object. The sentence's
// forms stay the interface and the truth; this only shows the body for the
// words, couples selection, and animates a change after the server has
// accepted it. Nothing here runs while a visitor types (no preview).

import { TERRITORIES } from "./territories";
import { HouseView } from "./view";
import { TIMING, type Kind } from "./motion";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
export const partLabel = (position: number) => `${String(position + 1).padStart(2, "0")} — ${TERRITORIES[position].label}`;

// a browser that can't draw WebGL keeps the sentence and loses only the house
function viewIn(host: HTMLElement | null, past: boolean): HouseView | null {
  if (!host) return null;
  try {
    const view = new HouseView(host, past);
    // a page leaving for good releases everything it drew
    addEventListener("pagehide", (e) => { if (!e.persisted) view.destroy(); });
    return view;
  } catch {
    host.remove();
    return null;
  }
}

type Slot = { position: number; pos: HTMLElement; label: HTMLLabelElement; input: HTMLInputElement };

export type CurrentHouse = { latest(change: { position: number; word: string }): void };

export function mountCurrent(doc: Document): CurrentHouse | null {
  const slots: Slot[] = [];
  for (const form of doc.querySelectorAll<HTMLFormElement>('.sentence form[action="/replace"]')) {
    const position = Number(form.querySelector<HTMLInputElement>('input[name="position"]')?.value);
    const label = form.querySelector("label"), input = form.querySelector<HTMLInputElement>('input[name="word"]'), pos = form.closest<HTMLElement>(".pos");
    if (Number.isInteger(position) && label && input && pos) slots.push({ position, pos, label, input });
  }
  if (slots.length !== 10) return null;
  const view = viewIn(doc.getElementById("house"), false);
  if (!view) return null;
  // the words the house shows: the shared truth, held drafts or not
  const words = slots.map((s) => s.label.textContent!.trim());
  const part = doc.getElementById("part");

  // ---- the change this visitor just made, shown as it happens (Post/Redirect/Get) ----
  // On submit the position is noted for this tab only; after the redirect, if the
  // server shows this visitor's word standing there, the house begins from the body
  // the word replaced (the newest past word, which the server renders) and exchanges it.
  for (const s of slots) s.label.closest("form")!.addEventListener("submit", () => {
    try { sessionStorage.setItem("theseus:replaced", String(s.position)); } catch { /* the animation is optional */ }
  });
  let replaced: number | null = null;
  try {
    const v = sessionStorage.getItem("theseus:replaced");
    sessionStorage.removeItem("theseus:replaced");
    replaced = v === null ? null : Number(v);
  } catch { /* no storage: no animation */ }
  const own = replaced === null ? null : slots[replaced];
  const before = own?.label.querySelector("mark") ? own.pos.querySelector(".past > span")?.textContent ?? null : null;
  if (own && before) {
    view.show(words.map((w, i) => (i === own.position ? before : w)));
    requestAnimationFrame(() => {
      view.change(own.position, words, "own");
      arrive(own, before, "own");
    });
  } else view.show(words);

  // ---- the sentence's word leaves and the new one arrives with its body ----
  function arrive(s: Slot, old: string, kind: Kind): void {
    const dur = kind === "own" ? 900 : 1300;
    // the word and its territory are singled out together: the line stands while the part is exchanged, the emphasis until it has settled
    const T = reduced() ? TIMING.reduced : TIMING[kind];
    hold(s.position, T.exchange || T.hold, T.exchange + T.hold);
    if (reduced()) return;
    const ghost = doc.createElement("span");
    ghost.className = "leaving";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = old;
    s.pos.append(ghost);
    ghost.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-0.35em)", offset: kind === "own" ? 0.4 : 0.25 }, { opacity: 0 }], { duration: dur, easing: "cubic-bezier(.6,0,.2,1)" }).finished.then(() => ghost.remove(), () => ghost.remove());
    const red = "rgb(195 51 28)", clear = "rgb(195 51 28 / 0)", ink = "rgb(25 23 20)";
    s.label.animate(
      kind === "own"
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
  const annotate = (position: number | null) => {
    if (!part) return;
    part.hidden = position === null;
    part.textContent = position === null ? "" : partLabel(position);
  };
  // the one hairline between the chosen word and its territory (desktop; red only while that territory is rebuilt)
  const thread = doc.getElementById("thread") as SVGSVGElement | null;
  const line = thread?.querySelector("path") ?? null, dot = thread?.querySelector("circle") ?? null;
  let drawn = 0;
  // the line means "this word is acting on this territory": a word at work, or a part being rebuilt. Pointing alone never draws it.
  const target = () => rebuilding ?? (selected !== null && !held ? selected : null);
  const drawThread = () => {
    drawn = 0;
    const p = target();
    if (!thread || !line || !dot || p === null || getComputedStyle(thread).display === "none") { thread?.classList.remove("on", "red"); return; }
    const a = view.anchor(p), l = slots[p].label.getBoundingClientRect(), first = slots[0].label.getBoundingClientRect();
    const sentence = doc.querySelector(".sentence")!.getBoundingClientRect(), column = doc.querySelector(".text")!.getBoundingClientRect();
    if (!a) return;
    const cx = l.left + l.width / 2, above = l.top - first.top < l.height * 0.6;
    // out of the word, round the text (above the first line, below the last), then straight to the territory
    const sy = above ? l.top : l.bottom, gy = above ? first.top - 12 : sentence.bottom + 6, gx = Math.max(cx, Math.min(column.right + 8, a.x - 24));
    line.setAttribute("d", `M${cx} ${sy}L${cx} ${gy}L${gx} ${gy}L${a.x} ${a.y}`);
    dot.setAttribute("cx", String(a.x)); dot.setAttribute("cy", String(a.y));
    thread.classList.add("on");
    thread.classList.toggle("red", p === rebuilding);
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
  const select = (position: number | null, byChange = false) => {
    selected = position;
    held = byChange && position !== null;
    view.select(position);
    annotate(position);
    doc.body.classList.toggle("selecting", position !== null);
    for (const s of slots) s.pos.classList.toggle("selected", s.position === position);
    sync();
  };
  // A word has just been exchanged: its territory is the one thing singled out, and the line (red) stands for
  // `lineMs` while it is rebuilt; the emphasis lasts until `ms`, when the body has settled and everything lets go.
  const hold = (position: number, lineMs: number, ms: number) => {
    if (selected !== null) return; // someone is already at work on a word; a change elsewhere doesn't take it over
    rebuilding = position;
    select(position, true);
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
    s.input.addEventListener("focus", () => select(s.position));
    s.input.addEventListener("blur", () => {
      // a draft keeps its word chosen; an empty field lets go
      setTimeout(() => { if (selected === s.position && doc.activeElement !== s.input && s.input.value === "") select(null); }, 0);
    });
    s.input.addEventListener("input", () => { if (s.input.value === "" && doc.activeElement !== s.input) select(null); });
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
    latest({ position, word }) {
      const old = words[position];
      if (old === word) return;
      words[position] = word;
      view.change(position, words, "remote");
      queueMicrotask(() => { if (slots[position].label.textContent!.trim() === word) arrive(slots[position], old, "remote"); refreshTrace(); });
    },
  };
}

// an earlier form: its own body, as a white study model, never live
export function mountEarlier(doc: Document): void {
  const words = [...doc.querySelectorAll(".sentence .w")].map((w) => w.textContent!.trim());
  if (words.length !== 10) return;
  viewIn(doc.getElementById("house"), true)?.show(words);
}

export type KeptShip = { words: string[]; gaps: boolean[] };
export type KeptHouse = { update(kept: KeptShip): void };

// The second Theseus (docs/decisions/0003-settle-and-kept-ships.md): read-only,
// never selected or hovered, its gaps a faint outline from the first load.
// `.update()` is a static re-render (never `view.change()`): Slice 5 adds the
// break-and-fall motion; this only guarantees the page never shows a stale
// kept ship while the live sentence moves beside it.
export function mountKept(doc: Document, initial: KeptShip): KeptHouse | null {
  const view = viewIn(doc.getElementById("house-kept"), true);
  if (!view) return null;
  view.show(initial.words);
  view.ghost(initial.gaps.flatMap((gap, i) => (gap ? [i] : [])));
  return {
    update(kept) {
      view.show(kept.words);
      view.ghost(kept.gaps.flatMap((gap, i) => (gap ? [i] : [])));
    },
  };
}
