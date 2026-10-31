// The opening story on GET / (docs/decisions/0007-the-opening-story.md). A labelled, non-modal dialog over the
// harbour: five beats, Skip always shown, Escape skips; a click on the story, Enter, Space or → advance, ← goes
// back; focus leaving it ends it. Begin or Skip puts focus on the sentence strip. Played once in this browser
// (localStorage; if storage fails, once per load), and again from "The story" in the masthead. The harbour, when
// there is one, moves its camera and rebuilds one part as it stands; without it the beats are the same text.
// It never touches the sentence, its forms or the stream: live changes go on underneath.

import { BEATS, REBUILDS, STORY_KEY, type Shot } from "./story";

export type StoryStage = { storyShot(shot: Shot | null): void; storyFlash(position: number): void } | null;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const phone = () => matchMedia("(max-width: 900px)").matches;

export function mountStory(doc: Document, stage: () => StoryStage): void {
  const dialog = doc.getElementById("story");
  const replay = doc.getElementById("story-open") as HTMLButtonElement | null;
  const text = dialog?.querySelector<HTMLElement>("[data-story-line]");
  const cite = dialog?.querySelector<HTMLElement>("cite");
  const next = dialog?.querySelector<HTMLButtonElement>("[data-story-next]");
  const skip = dialog?.querySelector<HTMLButtonElement>("[data-story-skip]");
  const strip = doc.getElementById("sentence");
  const harbour = doc.getElementById("harbour");
  if (!dialog || !text || !cite || !next || !skip || !strip) return;
  let beat = -1;
  let ending = false;
  // beat 2's rebuilds still to come: a beat left early cancels them
  let rebuilds: number[] = [];

  const scrollTo = (el: HTMLElement | null, block: ScrollLogicalPosition) => {
    if (el && phone()) el.scrollIntoView({ block, behavior: reduced() ? "auto" : "smooth" });
  };

  function show(i: number): void {
    beat = Math.max(0, Math.min(BEATS.length - 1, i));
    const b = BEATS[beat];
    text!.textContent = b.text;
    cite!.textContent = b.source ?? "";
    cite!.hidden = !b.source;
    next!.textContent = beat === BEATS.length - 1 ? "Begin" : "Next";
    dialog!.dataset.beat = String(beat + 1);
    dialog!.dataset.shot = b.shot;
    doc.body.classList.toggle("story-lit", !!b.lit);
    stage()?.storyShot(b.shot);
    // beat 2: three small parts rebuilt in turn, each as it was (none with reduced motion: no flash then)
    for (const t of rebuilds) clearTimeout(t);
    rebuilds = b.flash && !reduced() ? REBUILDS.map(({ position, at }) => window.setTimeout(() => stage()?.storyFlash(position), at)) : [];
    // a phone's harbour starts below the band: the story brings it into view, and the sentence for the last beat
    if (b.lit) scrollTo(strip, "start");
    else scrollTo(harbour, "start");
  }

  function open(): void {
    try { localStorage.setItem(STORY_KEY, "seen"); } catch { /* once per load, then */ }
    ending = false;
    dialog!.hidden = false;
    doc.body.classList.add("story-on");
    show(0);
    // focus on the story's own button, so the keys work at once and a screen reader starts on it
    next!.focus({ preventScroll: true });
  }

  // Begin, Skip, Escape, or focus gone elsewhere: back to the page. `refocus`: put focus on the sentence strip
  function end(refocus: boolean): void {
    if (dialog!.hidden || ending) return;
    ending = true;
    dialog!.hidden = true;
    beat = -1;
    for (const t of rebuilds) clearTimeout(t);
    rebuilds = [];
    doc.body.classList.remove("story-on", "story-lit");
    stage()?.storyShot(null);
    if (refocus) {
      scrollTo(strip, "start");
      // focusable only while it holds focus: the strip isn't a control, and nothing in it becomes one
      strip!.setAttribute("tabindex", "-1");
      strip!.addEventListener("blur", () => strip!.removeAttribute("tabindex"), { once: true });
      strip!.focus({ preventScroll: phone() });
    }
  }

  next.addEventListener("click", (e) => { e.stopPropagation(); if (beat === BEATS.length - 1) end(true); else show(beat + 1); });
  skip.addEventListener("click", (e) => { e.stopPropagation(); end(true); });
  // a click or tap anywhere else on the story advances it
  dialog.addEventListener("click", () => { if (beat === BEATS.length - 1) end(true); else show(beat + 1); });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); end(true); }
    else if (e.key === "ArrowRight" || ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement).closest?.("button"))) {
      e.preventDefault();
      if (beat === BEATS.length - 1) end(true); else show(beat + 1);
    } else if (e.key === "ArrowLeft") { e.preventDefault(); show(beat - 1); }
  });
  // never a trap: focus moving out of the story ends it, and wherever focus went keeps it
  doc.addEventListener("focusin", (e) => { if (!dialog.hidden && !dialog.contains(e.target as Node)) end(false); });
  replay?.addEventListener("click", open);
  if (replay) replay.hidden = false;

  let seen = false;
  try { seen = localStorage.getItem(STORY_KEY) !== null; } catch { /* storage fails: show it once per load */ }
  if (!seen) open();
}
