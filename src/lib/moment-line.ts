// Ship 1's one loud line, and the phone pointer's acknowledgement
// (docs/decisions/0003-settle-and-kept-ships.md, Slice 5). Presentation
// only: neither changes either house's state. Standalone (no imports), so
// spec/moment-line.test.ts runs this same code in headless Chrome.
//
// The line takes clear ground: both halves are veiled behind it (body
// .moment-on, never red), and it sits in the tallest band of the screen that
// no live sentence word, earlier word or part notation occupies, a step
// smaller if that band is short, so no live text is ever under it. The veil
// goes when the line goes.

export const LINE = "None of the first sentence stands. All of it has been kept.";
export const LINE_MS = 6500;
export const ACK_MS = 4000;

// what the line must never cover: the live sentence's words, the words beneath them, the part notation
const AVOID = '.sentence form[action="/replace"] label, .sentence .past, .sentence .changed, #part:not([hidden])';

function place(doc: Document, line: HTMLElement): void {
  const vh = doc.documentElement.clientHeight, edge = 16;
  const taken = [...doc.querySelectorAll<HTMLElement>(AVOID)]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 0 && r.bottom > 0 && r.top < vh)
    .map((r) => [Math.max(0, r.top - 8), Math.min(vh, r.bottom + 8)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  // the free bands of the screen, between what's taken
  const bands: [number, number][] = [];
  let at = edge;
  for (const [top, bottom] of taken) {
    if (top > at) bands.push([at, top]);
    at = Math.max(at, bottom);
  }
  if (vh - edge > at) bands.push([at, vh - edge]);
  const [top, bottom] = bands.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0] ?? [edge, vh - edge];
  // as large as the band allows, never larger than the stylesheet sets
  line.style.fontSize = "";
  let size = parseFloat(getComputedStyle(line).fontSize);
  while (line.getBoundingClientRect().height > bottom - top && size > 16) {
    size *= 0.92;
    line.style.fontSize = `${size}px`;
  }
  line.style.top = `${Math.max(top, top + (bottom - top - line.getBoundingClientRect().height) / 2)}px`;
}

export function showMomentLine(doc: Document, reduced: boolean, ms = LINE_MS): HTMLElement {
  doc.querySelector(".moment")?.remove();
  const win = doc.defaultView!;
  const line = doc.createElement("p");
  line.className = "moment";
  line.setAttribute("role", "status");
  line.textContent = LINE;
  doc.body.append(line);
  doc.body.classList.add("moment-on");
  place(doc, line);
  const again = () => place(doc, line);
  win.addEventListener("scroll", again, { passive: true });
  win.addEventListener("resize", again);
  win.requestAnimationFrame(() => line.classList.add("on"));
  win.setTimeout(() => {
    win.removeEventListener("scroll", again);
    win.removeEventListener("resize", again);
    line.classList.remove("on");
    doc.body.classList.remove("moment-on");
    win.setTimeout(() => line.remove(), reduced ? 0 : 700);
  }, ms);
  return line;
}

// On a phone the kept half is far below, so a part that crosses lands out of
// view: the pointer to it says so for a moment, in ink rather than its quiet
// grey (never red), with a small nudge downward unless motion is reduced.
const ACK = {
  cross: "A replaced part was just kept below.",
  first: "The whole first sentence is now kept below.",
};
const restoring = new WeakMap<Element, { timer: number; text: string }>();

export function acknowledgeBelow(doc: Document, kind: "cross" | "first", reduced: boolean, ms = ACK_MS): void {
  const pointer = doc.querySelector<HTMLElement>(".stands-half .kept-pointer");
  if (!pointer) return;
  const win = doc.defaultView!;
  const pending = restoring.get(pointer);
  if (pending) win.clearTimeout(pending.timer);
  const text = pending?.text ?? pointer.textContent ?? "";
  pointer.textContent = ACK[kind];
  pointer.classList.add("ack");
  if (!reduced) pointer.animate([{ transform: "translateY(0)" }, { transform: "translateY(3px)" }, { transform: "translateY(0)" }], { duration: 700, iterations: 2, easing: "ease-in-out" });
  restoring.set(pointer, {
    text,
    timer: win.setTimeout(() => {
      pointer.textContent = text;
      pointer.classList.remove("ack");
      restoring.delete(pointer);
    }, ms),
  });
}
