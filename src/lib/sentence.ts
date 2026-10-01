// The maker-authored starting sentence: ten word positions, 0–9. The full stop
// belongs to the sentence, not to a word. It's state 0 of every history, so it
// must never change once the sentence is live.
export const STARTING_WORDS = [
  "Make",
  "a",
  "website",
  "that",
  "people",
  "would",
  "miss",
  "if",
  "it",
  "disappeared",
] as const;
