// The kept sentence, as a live page redraws it, in the shape GET / serves:
// a word or an empty drawn gap per position, a gap read as "blank" to a
// screen reader, the full stop on the last word's line. Visitor words are
// set as text, never markup.

import type { KeptShip } from "./kept-moment";

// `mine`: positions holding this visitor's own replaced word, marked for them only
export function renderKeptSentence(el: Element, k: KeptShip, mine: ReadonlySet<number> = new Set()): void {
  const doc = el.ownerDocument;
  const nodes: (string | Node)[] = [];
  k.words.forEach((w, i) => {
    const span = doc.createElement("span");
    span.className = k.gaps[i] ? "w gap" : "w";
    if (k.gaps[i]) span.textContent = "";
    else if (mine.has(i)) {
      const mark = doc.createElement("mark");
      mark.textContent = w;
      span.append(mark);
    } else span.textContent = w;
    const word: Node[] = [span];
    if (k.gaps[i]) {
      const blank = doc.createElement("span");
      blank.className = "sr-only";
      blank.textContent = "blank";
      word.push(blank);
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
