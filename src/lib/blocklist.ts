// The maker's blocklist (docs/decisions/0004-maker-blocklist.md): words the
// server refuses as invalid replacements, from the BLOCKED_WORDS secret,
// read once at boot. Never in the repo, a log or a response. Matching is
// whole-word after NFKC and case folding, never a substring.

const fold = (w: string) => w.normalize("NFKC").toLocaleLowerCase("en").trim();

const LIST = new Set((process.env.BLOCKED_WORDS ?? "").split(",").map(fold).filter(Boolean));

// one line at boot, so a forgotten secret is seen in the logs, never silent and never an outage
console.log(LIST.size ? `[theseus] blocklist: ${LIST.size} word(s)` : "[theseus] warning: the blocklist is empty (BLOCKED_WORDS is unset)");

export function isBlocked(word: string): boolean {
  return LIST.size > 0 && LIST.has(fold(word));
}
