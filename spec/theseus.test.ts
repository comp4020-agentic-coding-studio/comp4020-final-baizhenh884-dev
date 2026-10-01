import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// Theseus's enforced rules, checked over HTTP against the running app (see
// README.md "The rule" and "What good means", and CLAUDE.md "Product contract").
//
// The HTTP contract these checks rely on:
//   GET /             the current sentence. Each word position is a
//                     <form method="post" action="/replace"> holding hidden
//                     `position` and `version` inputs and a `word` input whose
//                     <label> holds exactly the word now at that position (any
//                     other text about the word sits outside the label).
//                     The first response sets the visitor cookie.
//                     Once the sentence has changed, GET / links to the form
//                     just before now with <a rel="prev" href="?at=N">.
//   POST /replace     position, version, word →
//                     303 success · 409 stale · 422 invalid or same word ·
//                     403 this visitor's change is already spent
//                     A version belongs to one position: a change elsewhere in
//                     the sentence never makes it stale.
//   GET /?at=N        the whole sentence after N changes (0 is the start),
//                     read-only.
//
// There is one shared sentence and no reset, so no check assumes what earlier
// checks left behind. Each builds its scenario from the state it observes, with
// fresh visitors, and asserts only the change it caused. The checks in this file
// run one at a time (the default within a file) so they never race each other.

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);

// Checks that change the sentence run only against a local app. Against the
// deployed site they would put made-up visitor changes into the real public
// sentence, which the product contract forbids, so they're skipped there, and the
// skip says why in the test name.
const changesTheSentence = (name: string, fn: () => Promise<void>) =>
  it.skipIf(!local)(local ? name : `${name} [skipped: APP_URL is not local]`, fn);

const STARTING_SENTENCE = "Make a website that people would miss if it disappeared.";

type Slot = { position: string; version: string; word: string };

class Visitor {
  private cookies = new Map<string, string>();

  private remember(res: Response): void {
    for (const header of res.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return { ...(cookie ? { cookie } : {}), ...extra };
  }

  async page(path = "/"): Promise<Document> {
    const res = await fetch(new URL(path, baseUrl), { headers: this.headers(), redirect: "manual" });
    this.remember(res);
    expect(res.status, `GET ${path}`).toBe(200);
    return new JSDOM(await res.text()).window.document;
  }

  async sentence(): Promise<Slot[]> {
    return slots(await this.page("/"));
  }

  // what a browser sends when this form is submitted (Origin included)
  async replace(slot: Pick<Slot, "position" | "version">, word: string): Promise<number> {
    const res = await fetch(new URL("/replace", baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: this.headers({
        "content-type": "application/x-www-form-urlencoded",
        origin: new URL(baseUrl).origin,
      }),
      body: new URLSearchParams({ position: slot.position, version: slot.version, word }),
    });
    this.remember(res);
    return res.status;
  }
}

// a fresh visitor who has loaded the page once, so the site knows them
async function arrive(): Promise<Visitor> {
  const v = new Visitor();
  await v.page("/");
  return v;
}

function slots(doc: Document): Slot[] {
  const forms = [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')];
  expect(forms.length, "GET / shows no word positions to replace").toBeGreaterThan(1);
  return forms.map((form) => {
    const value = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
    const label = form.querySelector("label")?.textContent?.trim();
    const slot = { position: value("position"), version: value("version"), word: label };
    expect(slot.position, "a word position without a `position` input").toBeTruthy();
    expect(slot.version, "a word position without a `version` input").toBeTruthy();
    expect(slot.word, "a word position without a label naming its word").toBeTruthy();
    return slot as Slot;
  });
}

const at = (all: Slot[], position: string): Slot => {
  const slot = all.find((s) => s.position === position);
  expect(slot, `no word position ${position}`).toBeDefined();
  return slot!;
};

// a word that is not already on the page, so a replacement is never "the same word"
let n = 0;
const unused = (all: Slot[], length?: number): string => {
  let word: string;
  do {
    word = `word${Date.now().toString(36)}${(n++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);
    if (length) word = word.padEnd(length, "z").slice(0, length);
  } while (all.some((s) => s.word === word));
  return word;
};

// The sentence as a reader sees it: its words in order, separated by any
// whitespace HTML formatting produces, ending in its full stop. It may start
// right after other text with no whitespace between (adjacent block elements
// render that way), but never partway through a longer word. Missing or
// reordered words, or a missing full stop, don't match.
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sentencePattern = (words: string[]) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${words.map(escapeRegExp).join("\\s+")}\\s*\\.`, "u");
const showsSentence = (doc: Document, words: string[]) =>
  sentencePattern(words).test(doc.body.textContent ?? "");
const startingWords = STARTING_SENTENCE.replace(/\.$/, "").split(" ");

// the previous whole sentence, reached the way a reader would: the rel="prev" link
async function stepBack(v: Visitor, from: Document): Promise<Document> {
  const prev = from.querySelector<HTMLAnchorElement>('a[rel~="prev"][href*="at="]');
  expect(prev, 'GET / has no <a rel="prev"> link to the form before now').not.toBeNull();
  return v.page(new URL(prev!.getAttribute("href")!, new URL("/", baseUrl)).href);
}

const MARKUP = "<x-theseus>s</x-theseus>"; // 24 characters: a valid word that looks like an element

describe("Theseus", () => {
  it("starts from the maker's sentence: the earliest form shows the starting sentence", async () => {
    const doc = await new Visitor().page("/?at=0");
    expect(showsSentence(doc, startingWords), "GET /?at=0 doesn't show the starting sentence").toBe(true);
  });

  it("shows earlier forms read-only: the starting sentence can't be replaced into", async () => {
    const doc = await new Visitor().page("/?at=0");
    expect(showsSentence(doc, startingWords), "GET /?at=0 doesn't show the starting sentence").toBe(true);
    expect(doc.querySelectorAll('form[action="/replace"]').length).toBe(0);
  });

  changesTheSentence("lets a visitor replace one word, once", async () => {
    const alice = await arrive();
    const before = await alice.sentence();
    const first = before[0];
    const word = unused(before);

    expect(await alice.replace(first, word)).toBe(303);
    const after = await alice.sentence();
    expect(at(after, first.position).word).toBe(word);

    const second = after[after.length - 1];
    expect(await alice.replace(second, unused(after))).toBe(403);
    expect(at(await alice.sentence(), second.position)).toEqual(second);
  });

  changesTheSentence("doesn't spend the change on a refused replacement", async () => {
    const alice = await arrive();
    const now = await alice.sentence();
    const slot = now[0];

    for (const refused of ["two words", "   ", "a".repeat(25), "nul\u0000word", slot.word]) {
      expect(await alice.replace(slot, refused), `replacing with ${JSON.stringify(refused)}`).toBe(422);
    }
    expect(at(await alice.sentence(), slot.position)).toEqual(slot);

    const word = unused(now, 24);
    expect(await alice.replace(slot, word)).toBe(303);
    expect(at(await alice.sentence(), slot.position).word).toBe(word);
  });

  changesTheSentence("refuses a replacement of a word that changed since it was seen, without spending it", async () => {
    const alice = await arrive();
    const bob = await arrive();
    const seen = (await alice.sentence())[0];

    const bobs = unused(await bob.sentence());
    expect(await bob.replace(at(await bob.sentence(), seen.position), bobs)).toBe(303);

    expect(await alice.replace(seen, unused(await alice.sentence()))).toBe(409);
    const now = await alice.sentence();
    expect(at(now, seen.position).word).toBe(bobs);

    expect(await alice.replace(at(now, seen.position), unused(now))).toBe(303);
  });

  changesTheSentence("keeps a word fresh when a different word changes: staleness is per position", async () => {
    const alice = await arrive();
    const bob = await arrive();
    const seen = await alice.sentence();
    const mine = seen[0];
    const elsewhere = seen[1];

    const bobs = unused(await bob.sentence());
    expect(await bob.replace(at(await bob.sentence(), elsewhere.position), bobs)).toBe(303);

    const alices = unused(await alice.sentence());
    expect(await alice.replace(mine, alices)).toBe(303);
    const now = await alice.sentence();
    expect(at(now, mine.position).word).toBe(alices);
    expect(at(now, elsewhere.position).word).toBe(bobs);
  });

  changesTheSentence("treats a word that came back as changed: stale is about versions, not text", async () => {
    const alice = await arrive();
    const bob = await arrive();
    const carol = await arrive();
    const seen = (await alice.sentence())[0];

    expect(await bob.replace(at(await bob.sentence(), seen.position), unused(await bob.sentence()))).toBe(303);
    expect(await carol.replace(at(await carol.sentence(), seen.position), seen.word)).toBe(303);
    expect(at(await alice.sentence(), seen.position).word).toBe(seen.word);

    expect(await alice.replace(seen, unused(await alice.sentence()))).toBe(409);
  });

  changesTheSentence("lets a later visitor replace a visitor's word: contribution is not ownership", async () => {
    const alice = await arrive();
    const bob = await arrive();
    const slot = (await alice.sentence())[0];

    const alices = unused(await alice.sentence());
    expect(await alice.replace(slot, alices)).toBe(303);

    const bobs = unused(await bob.sentence());
    expect(await bob.replace(at(await bob.sentence(), slot.position), bobs)).toBe(303);
    expect(at(await alice.sentence(), slot.position).word).toBe(bobs);
  });

  changesTheSentence("keeps the whole earlier sentence: one step back from now is the sentence before the latest change", async () => {
    const alice = await arrive();
    const before = await alice.sentence();

    expect(await alice.replace(before[0], unused(before))).toBe(303);

    const previous = await stepBack(alice, await alice.page("/"));
    expect(
      showsSentence(previous, before.map((s) => s.word)),
      "the step before now doesn't show the sentence as it was before the change",
    ).toBe(true);
    expect(previous.querySelectorAll('form[action="/replace"]').length).toBe(0);
  });

  changesTheSentence("shows a replacement word as text, never as markup, wherever it appears", async () => {
    const alice = await arrive();
    const bob = await arrive();
    const slot = (await alice.sentence())[0];

    expect(await alice.replace(slot, MARKUP)).toBe(303);
    const current = await alice.page("/");
    expect(at(slots(current), slot.position).word).toBe(MARKUP);
    expect(current.querySelector("x-theseus"), "the word became an element on GET /").toBeNull();

    // once replaced, the word lives on in the sentence's history
    expect(await bob.replace(at(await bob.sentence(), slot.position), unused(await bob.sentence()))).toBe(303);
    const after = await alice.page("/");
    expect(after.querySelector("x-theseus"), "the replaced word became an element on GET /").toBeNull();
    const earlier = await stepBack(alice, after);
    expect(earlier.body.textContent).toContain(MARKUP);
    expect(earlier.querySelector("x-theseus"), "the word became an element in the earlier form").toBeNull();
  });
});
