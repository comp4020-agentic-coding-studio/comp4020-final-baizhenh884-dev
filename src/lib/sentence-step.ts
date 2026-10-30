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

// stub: the label rows' spec lands first (spec/sentence-step.test.ts)
export type LabelRow = 1 | 2 | "room";
export const labelRows = (words: readonly string[], _layout: "desktop" | "phone"): LabelRow[] => words.map(() => 1);
