// The log (docs/decisions/0006-the-log.md): the ship's record, not a feed of people. Every replacement, newest
// first, as its place and part and its old word and new, nothing else: no when, no who. Pure, so GET /, the stream's
// snapshot and the live page read it the same way (spec/the-log.test.ts).

import { PARTS } from "./ship/rules";

export const LOG_LINES = 50;
export type LogLine = { position: number; part: string; from: string; to: string };

const partName = (position: number) => PARTS[position][0].toUpperCase() + PARTS[position].slice(1);

// `rows`: the record in the order it was made (oldest first), as SQLite keeps it; `blocked`: the maker's blocklist
// (decision 0004), checked on the server only. A line with a blocked word on either side is left out, and the cap
// counts lines shown.
export function logOf(rows: readonly { position: number; fromWord: string; toWord: string }[], blocked: (w: string) => boolean): LogLine[] {
  const out: LogLine[] = [];
  for (let i = rows.length - 1; i >= 0 && out.length < LOG_LINES; i--) {
    const { position, fromWord, toWord } = rows[i];
    if (blocked(fromWord) || blocked(toWord)) continue;
    out.push({ position, part: partName(position), from: fromWord, to: toWord });
  }
  return out;
}

// a line as it's written: "07 · Sail" and "whether → wonder"
export const logLine = (line: LogLine): { place: string; change: string } => ({
  place: `${String(line.position + 1).padStart(2, "0")} · ${line.part}`,
  change: `${line.from} → ${line.to}`,
});

// a line from the stream (place, old and new word only), with its part
export const fromEntry = (e: { position: number; from: string; to: string }): LogLine => ({ position: e.position, part: partName(e.position), from: e.from, to: e.to });
