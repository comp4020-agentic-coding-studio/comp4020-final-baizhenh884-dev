// The harbour on GET /, GET /?at=N and GET /?kept=k: it mounts a HarbourView
// behind the sentence the server rendered and keeps the two one object. The
// sentence's forms stay the interface and the truth; this only shows the
// ships for the words, couples selection (a word and its part, on both
// ships), and flies a plank after the server has accepted a change. Nothing
// here runs while a visitor types (no preview).

import type { KeptShip, Moment } from "../kept-moment";
import { HarbourView, type Scene } from "./harbour";
import { TIMING, type Kind } from "./motion";
import { drafting, notation, showDrafting } from "./notation";
import { PARTS } from "./rules";
import { tagged } from "./tag";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
const phone = () => matchMedia("(max-width: 900px)").matches;
const layout = (): "phone" | "desktop" => (phone() ? "phone" : "desktop");
const Name = (p: number) => PARTS[p][0].toUpperCase() + PARTS[p].slice(1);

// A browser that can't draw WebGL keeps the sentence and loses only the harbour: the host gives way, so the
// strips are the page (spec/harbour-fallback.test.ts).
function viewIn(host: HTMLElement | null, scene: Scene): HarbourView | null {
  if (!host) return null;
  try {
    const view = new HarbourView(host, scene, layout);
    addEventListener("pagehide", (e) => { if (!e.persisted) view.destroy(); });
    requestAnimationFrame(() => requestAnimationFrame(() => host.setAttribute("data-ready", "")));
    return view;
  } catch {
    host.classList.add("no-webgl");
    host.replaceChildren();
    return null;
  }
}

type Slot = { position: number; pos: HTMLElement; label: HTMLLabelElement; input: HTMLInputElement };

export type CurrentHarbour = {
  // another visitor's change, from the live stream, with the moment it brought (null: no flight)
  latest(change: { position: number; word: string }, flight: { moment: Moment; kept: KeptShip } | null): void;
  // this visitor's own standing word, at `position`, was just replaced by someone else: its plank is yours
  yours(position: number): void;
  // a draft at `position` holds back a newer word (`now`), or no longer does (null)
  held(position: number, now: string | null): void;
  // the kept ship as a fresh load (or a reconnect) shows it
  keptShow(kept: KeptShip): void;
  // a kept ship from a change event, and its moment
  keptApply(kept: KeptShip, moment: Moment | null): void;
  // this visitor's own kept plank (null: none shown)
  mine(position: number | null): void;
  // the shipwrights: the stream's anonymous total of open views, drawn as figures, one of them this visitor's
  crew(total: number): void;
};

// `own`: this visitor's own change, just made (Post/Redirect/Get), with its moment and the kept ship before it
export function mountHarbour(doc: Document, kept: KeptShip, own: (position: number) => { moment: Moment; before: KeptShip } | null): CurrentHarbour | null {
  const slots: Slot[] = [];
  for (const form of doc.querySelectorAll<HTMLFormElement>('.sentence-strip .sentence form[action="/replace"]')) {
    const position = Number(form.querySelector<HTMLInputElement>('input[name="position"]')?.value);
    const label = form.querySelector("label"), input = form.querySelector<HTMLInputElement>('input[name="word"]'), pos = form.closest<HTMLElement>(".pos");
    if (Number.isInteger(position) && label && input && pos) slots.push({ position, pos, label, input });
  }
  if (slots.length !== 10) return null;
  const host = doc.getElementById("harbour");
  const view = viewIn(host, "now");
  if (!view) return null;
  const words = slots.map((s) => s.label.textContent!.trim());
  const part = doc.getElementById("part");
  const tags = { live: doc.querySelector<HTMLElement>('.part-tag[data-ship="live"]'), kept: doc.querySelector<HTMLElement>('.part-tag[data-ship="kept"]') };
  const homeButton = doc.getElementById("home") as HTMLButtonElement | null;

  // ---- the change this visitor just made, shown as it happens (Post/Redirect/Get) ----
  // On submit the position and the word it showed are noted for this tab only; after the redirect, if the
  // server shows this visitor's word standing there, the ship begins from the word it replaced and the plank flies.
  for (const s of slots) s.label.closest("form")!.addEventListener("submit", () => {
    try { sessionStorage.setItem("theseus:replaced", JSON.stringify({ position: s.position, word: s.label.textContent!.trim() })); } catch { /* the flight is optional */ }
  });
  let replaced: { position: number; word: string } | null = null;
  try {
    const v = sessionStorage.getItem("theseus:replaced");
    sessionStorage.removeItem("theseus:replaced");
    replaced = v === null ? null : (JSON.parse(v) as { position: number; word: string });
  } catch { /* no storage: no flight */ }
  const mineNow = replaced === null || !Number.isInteger(replaced.position) ? null : slots[replaced.position] ?? null;
  const before = mineNow?.label.querySelector("mark") && typeof replaced?.word === "string" && replaced.word !== words[mineNow.position] ? replaced.word : null;
  const ownMoment = mineNow && before ? own(mineNow.position) : null;
  if (mineNow && before) {
    view.show(words.map((w, i) => (i === mineNow.position ? before : w)));
    view.keptShow(ownMoment?.before ?? kept);
    requestAnimationFrame(() => {
      if (ownMoment) fly(mineNow.position, ownMoment.moment, kept, "own", false, true);
      else { view.change(mineNow.position, words, "own", null); view.keptShow(kept); }
      arrive(mineNow, before, "own");
    });
  } else {
    view.show(words);
    view.keptShow(kept);
  }

  // The old plank flies to where it's kept. The kept ship is told at once, so it sets the plank down in its gap
  // as it lands (its gap stays an outline until then); a plank for the next ship is drawn on the pallet only
  // once it has landed.
  // `own`: this visitor's own change, carried by their own shipwright
  function fly(position: number, moment: Moment, k: KeptShip, kind: Kind, yours = false, own = false): void {
    view!.keptApply(k, moment);
    view!.change(position, words, kind, view!.target(moment, k), () => view!.landed(position), yours, own);
  }
  // Your plank (decision 0005), on your page only: it glows as it flies, and one line says where it went, in the
  // notation's slot (unless a word is in hand) and the polite live region, then goes
  const YOURS = "Your plank was carried to the slipway. It's kept.";
  const yoursRegion = doc.getElementById("yours");
  let yoursAt: number | null = null, yoursTimer = 0;
  function sayYours(): void {
    if (yoursRegion) yoursRegion.textContent = YOURS;
    if (part && selected === null) {
      part.hidden = false;
      part.textContent = YOURS;
      part.classList.add("yours");
      clearTimeout(yoursTimer);
      yoursTimer = window.setTimeout(() => { if (part.classList.contains("yours") && selected === null) { part.classList.remove("yours"); annotate(null); } }, 4000);
    }
  }

  // ---- the sentence's word leaves and the new one arrives with its plank ----
  function arrive(s: Slot, old: string, kind: Kind): void {
    const T = reduced() ? TIMING.reduced : TIMING[kind];
    hold(s.position, T.exchange || T.hold, T.exchange + T.hold, old);
    if (reduced()) return;
    const ghost = doc.createElement("span");
    ghost.className = "leaving";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = old;
    s.pos.append(ghost);
    ghost.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-0.35em)", offset: kind === "own" ? 0.4 : 0.25 }, { opacity: 0 }], { duration: T.exchange, easing: "cubic-bezier(.6,0,.2,1)" }).finished.then(() => ghost.remove(), () => ghost.remove());
    const red = "rgb(195 51 28)", clear = "rgb(195 51 28 / 0)", ink = "rgb(42 32 25)";
    s.label.animate(
      kind !== "remote"
        ? [{ color: clear }, { color: clear, offset: 0.38 }, { color: red, offset: 0.62 }, { color: red, offset: 0.8 }, { color: ink }]
        : [{ color: clear }, { color: clear, offset: 0.22 }, { color: red, offset: 0.34 }, { color: red, offset: 0.55 }, { color: ink }],
      { duration: T.exchange, easing: "cubic-bezier(.6,0,.2,1)" },
    );
  }

  // ---- selection: a word and its part, on both ships, are one choice ----
  let selected: number | null = null, hovered: number | null = null, rebuilding: number | null = null, held = false;
  const form = () => (phone() ? "phone" : "desktop");
  const annotate = (position: number | null, was?: string) => {
    if (!part) return;
    part.classList.remove("yours");
    part.hidden = position === null;
    part.textContent = position === null ? "" : notation({ position, word: words[position], was }, form());
  };
  const heldBack = new Map<number, string>();
  const drafted = (s: Slot) => {
    if (!part || selected !== s.position || held) return;
    if (s.input.value === "") annotate(s.position);
    else showDrafting(part, drafting({ position: s.position, word: s.label.textContent?.trim() ?? words[s.position], draft: s.input.value, now: heldBack.get(s.position) }, form()));
  };
  // the tags, "08 · Oars" on the live ship and the kept one, follow their parts while one is shown (a desktop)
  let following = 0;
  const placeTags = () => {
    following = 0;
    const t = tagged({ selected, held, hovered, rebuilding });
    for (const [ship, el] of Object.entries(tags) as ["live" | "kept", HTMLElement | null][]) {
      if (!el) continue;
      const a = t === null || phone() ? null : view.anchor(t, ship);
      el.hidden = a === null;
      if (a === null) continue;
      el.textContent = `${String(t! + 1).padStart(2, "0")} · ${Name(t!)}`;
      el.classList.toggle("red", t === rebuilding);
      el.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(-50%, calc(-100% - 10px))`;
    }
    if (t !== null && !phone()) following = requestAnimationFrame(placeTags);
  };
  const sync = () => {
    doc.body.classList.toggle("pointing", hovered !== null && selected === null && rebuilding === null);
    view.light(rebuilding ?? selected ?? hovered);
    if (!following) following = requestAnimationFrame(placeTags);
  };
  const setHover = (p: number | null) => {
    hovered = p;
    for (const s of slots) s.pos.classList.toggle("pointed", s.position === p);
    sync();
  };
  const select = (position: number | null, byChange = false, was?: string) => {
    selected = position;
    held = byChange && position !== null;
    annotate(position, was);
    doc.body.classList.toggle("selecting", position !== null);
    for (const s of slots) s.pos.classList.toggle("selected", s.position === position);
    sync();
  };
  // a word has just been exchanged: its part is the one thing singled out, red while it's rebuilt
  const hold = (position: number, lineMs: number, ms: number, was: string) => {
    if (selected !== null) return; // someone at work on a word keeps it
    rebuilding = position;
    select(position, true, was);
    setTimeout(() => { if (rebuilding === position) { rebuilding = null; sync(); } }, lineMs);
    setTimeout(() => { if (selected === position && held && doc.activeElement !== slots[position].input) select(null); }, ms);
  };
  for (const s of slots) {
    s.input.addEventListener("focus", () => { select(s.position); drafted(s); });
    s.input.addEventListener("blur", () => setTimeout(() => { if (selected === s.position && doc.activeElement !== s.input && s.input.value === "") select(null); }, 0));
    s.input.addEventListener("input", () => { if (s.input.value === "" && doc.activeElement !== s.input) select(null); else drafted(s); });
    s.pos.addEventListener("pointerenter", () => { if (fine()) setHover(s.position); });
    s.pos.addEventListener("pointerleave", () => { if (fine()) setHover(null); });
  }
  // On a fine pointer the ships can be pointed at and a part chosen; a drag orbits (a desktop only). On touch
  // the words are the way in and the canvas never takes a gesture, so the page scrolls as a page.
  const canvas = view.canvas;
  let down: [number, number] | null = null;
  canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointermove", (e) => {
    if (!fine() || e.buttons) return;
    const p = view.pick(e.clientX, e.clientY);
    if (p !== hovered) setHover(p);
    canvas.style.cursor = p === null ? "grab" : "pointer";
  });
  canvas.addEventListener("pointerleave", () => { if (fine()) setHover(null); });
  canvas.addEventListener("pointerup", (e) => {
    if (!fine() || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const p = view.pick(e.clientX, e.clientY);
    if (p !== null) slots[p].input.focus();
  });
  const orbit = matchMedia("(min-width: 901px) and (hover: hover) and (pointer: fine)");
  const orbitIf = () => view.orbit(orbit.matches);
  orbit.addEventListener("change", orbitIf);
  orbitIf();
  view.onMoved = (moved) => { if (homeButton) homeButton.hidden = !moved; };
  homeButton?.addEventListener("click", () => view.home());
  doc.getElementById("zoom-in")?.addEventListener("click", () => view.zoom(-1));
  doc.getElementById("zoom-out")?.addEventListener("click", () => view.zoom(1));

  return {
    latest({ position, word }, flight) {
      const old = words[position];
      if (old === word) return;
      words[position] = word;
      const kind: Kind = flight ? "cross" : "remote";
      const mine = yoursAt === position;
      yoursAt = null;
      if (flight) fly(position, flight.moment, flight.kept, kind, mine);
      else view.change(position, words, kind, null);
      if (mine) sayYours();
      queueMicrotask(() => { if (slots[position].label.textContent!.trim() === word) arrive(slots[position], old, "remote"); });
    },
    yours(position) { yoursAt = position; },
    held(position, now) {
      if (now === null) heldBack.delete(position);
      else heldBack.set(position, now);
      if (slots[position]) drafted(slots[position]);
    },
    keptShow: (k) => view.keptShow(k),
    keptApply: (k, moment) => view.keptApply(k, moment),
    mine: (position) => view.trace(position),
    crew: (total) => { view.crewSet(total); view.crewMine(true); },
  };
}

// an earlier form (?at=N): its own ship on the water, built from its own words, never live
export function mountEarlier(doc: Document): void {
  const words = [...doc.querySelectorAll(".sentence-strip .sentence .w, .sentence.past .w")].map((w) => w.textContent!.trim());
  if (words.length !== 10) return;
  viewIn(doc.getElementById("harbour"), "earlier")?.show(words);
}

// an earlier ship (?kept=k): a completed kept ship, whole, on its slipway, never live
export function mountEarlierShip(doc: Document): void {
  const words = [...doc.querySelectorAll(".kept-sentence .w")].map((w) => w.textContent!.trim());
  if (words.length !== 10) return;
  viewIn(doc.getElementById("harbour"), "kept")?.show(words);
}
