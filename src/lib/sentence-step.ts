// The live sentence's size step on a desktop: a few fixed sizes, largest first,
// so a long sentence stays on two lines without a continuous size that would
// shift with every letter. One pure function of the words, so the server
// (src/pages/index.astro) and the live client (src/lib/live-client.ts) always
// pick the same step; the page maps a step to a size in CSS (data-step).
//
// It lays the words out greedily in em against the live column's measure,
// using Instrument Serif's advance widths (measured once in Chrome at 1000px,
// letter-spacing included). The measure is the same in em at every desktop
// width (font 3.8vw over a column of 50vw - 7.2vw: 11.26em, to 11.41em once the
// 72px cap is reached) and is taken 3.5% narrower, to absorb each platform's
// own glyph widths. That is shown only for Chrome on macOS and Linux; on an
// untested platform (Windows, Safari, Firefox) a rare third line is possible,
// and costs a line of height, never house size (the row keeps its 50vh
// floor). 1.5% was
// enough on macOS, where the tightest of the 500-sentence set leaves 1.14% of
// the column; CI's Linux Chrome set a few of those same lines over 1.2% wider
// and wrapped them (spec/two-ships-layout.test.ts reports each run's tightest
// lines, so this margin is checked against the platform, not assumed).
// Some sentences can't fit two lines at the smallest step (ten 24-letter
// words): they stay at the floor and wrap.

import { PARTS } from "./ship/rules";

export const SIZE_STEPS = [1, 0.92, 0.85, 0.8] as const;

const MEASURE = 11.26 * 0.965; // em, at step 1
const TRACKING = -0.012; // em per letter (.sentence letter-spacing)
const OTHER = 0.5; // em, any character outside printable ASCII
// advance width in em of each printable ASCII character from "!" (33) to "~" (126)
const WIDTHS = [0.236,0.37,0.634,0.416,0.589,0.578,0.232,0.339,0.339,0.443,0.53,0.216,0.429,0.212,0.257,0.459,0.248,0.403,0.37,0.392,0.381,0.403,0.363,0.432,0.401,0.212,0.216,0.53,0.53,0.53,0.316,0.659,0.435,0.47,0.469,0.52,0.452,0.407,0.52,0.545,0.248,0.248,0.484,0.412,0.664,0.539,0.539,0.465,0.539,0.501,0.406,0.46,0.535,0.435,0.65,0.473,0.476,0.426,0.324,0.257,0.324,0.432,0.375,0.353,0.398,0.442,0.338,0.456,0.354,0.287,0.401,0.464,0.222,0.214,0.44,0.219,0.703,0.469,0.407,0.443,0.441,0.317,0.307,0.242,0.453,0.376,0.58,0.366,0.384,0.352,0.317,0.251,0.317,0.53];
const SPACE = 0.169;

const width = (word: string): number => {
  let w = 0;
  for (const c of word) {
    const code = c.charCodeAt(0);
    w += (code >= 33 && code <= 126 ? WIDTHS[code - 33] : OTHER) + TRACKING;
  }
  return w;
};

// the number of lines the words take at `scale` (the last word carries the sentence's full stop)
function lines(words: readonly string[], scale: number): number {
  let n = 1, x = 0;
  words.forEach((word, i) => {
    const w = (width(word) + (i === words.length - 1 ? width(".") : 0)) * scale;
    const next = x === 0 ? w : x + SPACE * scale + w;
    if (x > 0 && next > MEASURE) { n++; x = w; } else x = next;
  });
  return n;
}

// the index into SIZE_STEPS of the largest size at which the words stay on two lines (the floor if none)
export function sizeStep(words: readonly string[]): number {
  const i = SIZE_STEPS.findIndex((s) => lines(words, s) <= 2);
  return i < 0 ? SIZE_STEPS.length - 1 : i;
}

// Which row each word's "01·Ram" stands in. A label no wider than its word and the space after it stays down
// (1). One that's wider rises to the upper row (2), unless the label before it has risen too and would reach into
// it there; then it stays down, and its word is given just the room its label needs ("room"), so no two labels
// ever meet and only two very short words in a row widen a gap. Predicted from glyph widths, like the step, at
// each layout's smallest sentence size against its label size, where a label is widest for its word (desktop:
// 8px over 30px x 0.8; phone: 7.5px over 30px), so a label rises whenever it might be needed. Shared by the
// server and the live client; checked against the rendered page (spec/harbour-layout, spec/numbering).
export type LabelRow = 1 | 2 | "room";
const LABEL_EM = { desktop: (8 * 0.57) / (30 * 0.8), phone: (7.5 * 0.57) / 30 }; // a label character, in em of the word
export const labelWidth = (position: number, layout: "desktop" | "phone"): number => (3 + (PARTS[position]?.length ?? 0)) * LABEL_EM[layout];
export function labelRows(words: readonly string[], layout: "desktop" | "phone"): LabelRow[] {
  const rows: LabelRow[] = [];
  words.forEach((word, i) => {
    const label = labelWidth(i, layout), room = width(word) + SPACE;
    if (label <= room) return rows.push(1);
    // the label before, risen: where it ends, measured from this word's start
    const reach = rows[i - 1] === 2 ? labelWidth(i - 1, layout) - (width(words[i - 1]) + SPACE) : -Infinity;
    rows.push(reach > 0 ? "room" : 2);
  });
  return rows;
}
