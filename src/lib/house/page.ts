// The house on GET / and GET /?at=N: it mounts a HouseView beside the
// sentence the server rendered and keeps the two one object. The sentence's
// forms stay the interface and the truth; this only shows the body for the
// words, couples selection, and animates a change after the server has
// accepted it. Nothing here runs while a visitor types (no preview).

import { TERRITORIES } from "./territories";
import { HouseView } from "./view";
import type { Kind } from "./motion";

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
  doc.querySelector<HTMLElement>("[data-house-note]")?.removeAttribute("hidden");
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
    if (reduced()) return;
    const dur = kind === "own" ? 900 : 1300;
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
  const annotate = (position: number | null) => {
    if (!part) return;
    part.hidden = position === null;
    part.textContent = position === null ? "" : partLabel(position);
  };
  const select = (position: number | null) => {
    selected = position;
    view.select(position);
    annotate(position);
    doc.body.classList.toggle("selecting", position !== null);
    for (const s of slots) s.pos.classList.toggle("selected", s.position === position);
  };
  for (const s of slots) {
    s.input.addEventListener("focus", () => select(s.position));
    s.input.addEventListener("blur", () => {
      // a draft keeps its word chosen; an empty field lets go
      setTimeout(() => { if (selected === s.position && doc.activeElement !== s.input && s.input.value === "") select(null); }, 0);
    });
    s.input.addEventListener("input", () => { if (s.input.value === "" && doc.activeElement !== s.input) select(null); });
    s.pos.addEventListener("pointerenter", () => { if (fine()) view.hover(s.position); });
    s.pos.addEventListener("pointerleave", () => { if (fine()) view.hover(null); });
  }
  // On a fine pointer the house can be pointed at; on touch the words are the way in,
  // and the canvas never takes a gesture, so the page scrolls as a page.
  const canvas = view.canvas;
  canvas.addEventListener("pointermove", (e) => {
    if (!fine()) return;
    const p = view.pick(e.clientX, e.clientY);
    view.hover(p);
    canvas.style.cursor = p === null ? "default" : "pointer";
    for (const s of slots) s.pos.classList.toggle("pointed", s.position === p);
  });
  canvas.addEventListener("pointerleave", () => { view.hover(null); for (const s of slots) s.pos.classList.remove("pointed"); });
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
      queueMicrotask(() => { if (slots[position].label.textContent!.trim() === word) arrive(slots[position], old, "remote"); });
    },
  };
}

// an earlier form: its own body, as a white study model, never live
export function mountEarlier(doc: Document): void {
  const words = [...doc.querySelectorAll(".sentence .w")].map((w) => w.textContent!.trim());
  if (words.length !== 10) return;
  viewIn(doc.getElementById("house"), true)?.show(words);
}
