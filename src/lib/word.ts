// A replacement is one token: 1–24 characters (Unicode code points) after
// trimming, with no whitespace or control characters inside.
export function isValidWord(word: string): boolean {
  const length = [...word].length;
  return length >= 1 && length <= 24 && !/[\s\p{Cc}]/u.test(word);
}

// A category for a refused word, for logging only: never the word's own
// text, since a refused word never became public state.
export type InvalidReason = "empty" | "too-long" | "whitespace" | "same-word" | "no-such-position";

export function invalidReason(word: string, current: string | null): InvalidReason {
  const length = [...word].length;
  if (length === 0) return "empty";
  if (length > 24) return "too-long";
  if (/[\s\p{Cc}]/u.test(word)) return "whitespace";
  if (current === null) return "no-such-position";
  return "same-word"; // the only remaining refusal: a valid word, unchanged
}
