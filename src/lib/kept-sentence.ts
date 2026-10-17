// The kept sentence, as a live page redraws it, in the shape GET / serves:
// a word or an empty drawn gap per position, a gap read as "blank" to a
// screen reader, the full stop on the last word's line. Visitor words are
// set as text, never markup.

import type { KeptShip } from "./kept-moment";

export function renderKeptSentence(el: Element, k: KeptShip): void {
  const doc = el.ownerDocument;
  const nodes: (string | Node)[] = [];
  k.words.forEach((w, i) => {
    const span = doc.createElement("span");
    span.className = k.gaps[i] ? "w gap" : "w";
    span.textContent = k.gaps[i] ? "" : w;
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
