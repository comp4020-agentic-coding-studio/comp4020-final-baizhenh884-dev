// The kept sentence, as a live page redraws it, in the shape GET / serves:
// a kept word, or at a gap the word still standing there (drawn faint), read
// "still standing: <word>" to a screen reader; the full stop on the last
// word's line. Visitor words are set as text, never markup.

import type { KeptShip } from "./kept-moment";

// `mine`: positions holding this visitor's own replaced word, marked for them only
export function renderKeptSentence(el: Element, k: KeptShip, mine: ReadonlySet<number> = new Set()): void {
  const doc = el.ownerDocument;
  const nodes: (string | Node)[] = [];
  k.words.forEach((w, i) => {
    const span = doc.createElement("span");
    span.className = k.gaps[i] ? "w gap" : "w";
    if (k.gaps[i]) span.textContent = w; // the word still standing at this position
    else if (mine.has(i)) {
      const mark = doc.createElement("mark");
      mark.textContent = w;
      span.append(mark);
    } else span.textContent = w;
    const word: Node[] = [span];
    if (k.gaps[i]) {
      const said = doc.createElement("span");
      said.className = "sr-only";
      said.textContent = "still standing: ";
      word.unshift(said);
    }
    if (i < k.words.length - 1) nodes.push(...word, " ");
    else {
      const end = doc.createElement("span");
      end.className = "end";
      end.append(...word, ".");
      nodes.push(end);
    }
  });
  el.replaceChildren(...nodes);
}

// The waiting row, as a live page redraws it, in the shape GET / serves: the next house's words in place
// order, each with its place (drawn from data-n, never read), as text; hidden when nothing waits. No count.
export function renderWaiting(row: HTMLElement, next: readonly (string | null)[]): void {
  const doc = row.ownerDocument;
  const ws = row.querySelector(".ws");
  if (!ws) return;
  const nodes: Node[] = [];
  next.forEach((w, i) => {
    if (w === null) return;
    const span = doc.createElement("span");
    span.className = "w";
    span.setAttribute("data-n", String(i + 1).padStart(2, "0"));
    span.textContent = w;
    if (nodes.length) nodes.push(doc.createTextNode(" "));
    nodes.push(span);
  });
  ws.replaceChildren(...nodes);
  row.hidden = nodes.length === 0;
}
