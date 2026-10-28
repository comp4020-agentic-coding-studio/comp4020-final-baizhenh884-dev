// A replacement's shape, from its spelling alone: 1–24 characters (Unicode
// code points) after trimming, with no whitespace or control characters
// inside. The server adds the maker's blocklist (word.ts); the page reads
// only this, so the list never reaches a browser.
export function isWordShaped(word: string): boolean {
  const length = [...word].length;
  return length >= 1 && length <= 24 && !/[\s\p{Cc}]/u.test(word);
}
