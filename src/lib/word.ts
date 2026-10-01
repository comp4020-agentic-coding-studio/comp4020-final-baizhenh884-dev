// A replacement is one token: 1–24 characters (Unicode code points) after
// trimming, with no whitespace or control characters inside.
export function isValidWord(word: string): boolean {
  const length = [...word].length;
  return length >= 1 && length <= 24 && !/[\s\p{Cc}]/u.test(word);
}
