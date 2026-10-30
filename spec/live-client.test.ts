import { JSDOM } from "jsdom";
import { afterEach, describe, expect, inject, it, vi } from "vitest";
import { foreseen, said } from "../src/lib/ship/notation";
import { sizeStep } from "../src/lib/sentence-step";
import { attach, deriveTotal, DRAFT_MS, type KeptShip, type Position, type Snapshot, type SettleTrace, type Trace } from "../src/lib/live-client";
import { waitingRow } from "../src/lib/kept-sentence";
import { carryAt, landsAt } from "../src/lib/ship/motion";

// How an open current page (GET /) applies realtime state, checked against the
// page the running app really serves: each check fetches GET /, parses it with
// jsdom (no scripts run) and drives src/lib/live-client.ts on that document,
// the way the page's own script will with events from GET /events.
//
// The rules (CLAUDE.md "Product contract", docs/decisions/0001):
//   - a position updates only to a newer version than it shows; an equal
//     (duplicate) or older (stale) one changes nothing
//   - a position holding a typed draft keeps the draft and the version it was
//     based on; an inert notice outside its form names the new word, and the
//     update applies only once the visitor clears the draft themselves
//   - the visitor's own trace stays true
//   - the Earlier link stays the sentence just before now: ?at=<total - 1>,
//     where total = Σ(version − 1)
//   - visitor words are text wherever they land, never markup
//
// Only against a local app: the trace checks replace words to get a trace.

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const localOnly = (name: string, fn: () => Promise<void>) =>
  it.skipIf(!local)(local ? name : `${name} [skipped: APP_URL is not local]`, fn);

// Most of this file drives src/lib/live-client.ts directly with hand-built
// Snapshot/Trace objects, so its rendering is exercised independently of
// whatever rule mode the real backing app happens to run — the client
// discriminates a trace's shape structurally, not from the server's mode.
// The one exception is any test that compares the client's own rendering
// against what GET / actually serves: that comparison is only valid when
// the real server's trace shape matches what was hand-fed, which depends on
// RULE_MODE. Gated the same way spec/eligibility.test.ts gates.
const inCI = !!process.env.CI;
const settleModeReady = local && process.env.RULE_MODE === "settle";
if (local && inCI && !process.env.RULE_MODE) {
  throw new Error("RULE_MODE must be 'once' or 'settle' in CI, never unset: checks.yml runs both passes explicitly");
}
const onceOnly = (name: string, fn: () => Promise<void>) =>
  it.skipIf(!local || settleModeReady)(local && !settleModeReady ? name : `${name} [skipped: not once mode]`, fn);
const settleOnly = (name: string, fn: () => Promise<void>) =>
  it.skipIf(!settleModeReady)(settleModeReady ? name : `${name} [skipped: not settle mode]`, fn);

// a word that looks like an element; unique per run, so no earlier state on
// the page can already contain it
const MARKUP = `<x-theseus>${Date.now().toString(36).replace(/\d/g, (d) => "abcdefghij"[+d])}</x-theseus>`;

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

  async html(path = "/"): Promise<string> {
    const res = await fetch(new URL(path, baseUrl), { headers: this.headers(), redirect: "manual" });
    this.remember(res);
    expect(res.status, `GET ${path}`).toBe(200);
    return res.text();
  }

  async page(path = "/"): Promise<Document> {
    return new JSDOM(await this.html(path)).window.document;
  }

  async replace(slot: Pick<Position, "position" | "version">, word: string): Promise<number> {
    const res = await fetch(new URL("/replace", baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: this.headers({
        "content-type": "application/x-www-form-urlencoded",
        origin: new URL(baseUrl).origin,
      }),
      body: new URLSearchParams({ position: String(slot.position), version: String(slot.version), word }),
    });
    this.remember(res);
    await res.body?.cancel();
    return res.status;
  }
}

async function arrive(): Promise<Visitor> {
  const v = new Visitor();
  await v.html("/");
  return v;
}

let n = 0;
const fresh = (): string =>
  `page${Date.now().toString(36)}${(n++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);

// one word position as GET / renders it
function slot(doc: Document, position: number) {
  const form = [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')].find(
    (f) => f.querySelector<HTMLInputElement>('input[name="position"]')?.value === String(position),
  );
  expect(form, `GET / has no word position ${position}`).toBeDefined();
  return {
    form: form!,
    version: form!.querySelector<HTMLInputElement>('input[name="version"]')!,
    label: form!.querySelector("label")!,
    input: form!.querySelector<HTMLInputElement>('input[name="word"]')!,
  };
}

function positionsOf(doc: Document): Position[] {
  return [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')].map((form) => ({
    position: Number(form.querySelector<HTMLInputElement>('input[name="position"]')!.value),
    version: Number(form.querySelector<HTMLInputElement>('input[name="version"]')!.value),
    word: form.querySelector("label")!.textContent!.trim(),
  }));
}

// the snapshot GET /events would send for the page as it was rendered
const snapshotOf = (doc: Document, trace: Trace | null = null): Snapshot => ({ positions: positionsOf(doc), trace });

const labelWord = (doc: Document, position: number) => slot(doc, position).label.textContent!.trim();
const earlier = (doc: Document) => doc.querySelector('a[rel~="prev"]')?.getAttribute("href") ?? null;

// the screen-reader statement of the whole current sentence GET / renders
const summary = (doc: Document) => {
  const el = [...doc.querySelectorAll(".sr-only")].find((e) => e.textContent?.includes("The sentence now reads"));
  expect(el, "GET / has no screen-reader summary of the sentence").toBeDefined();
  return el!.textContent!.replace(/\s+/g, " ").trim();
};
const sentence = (words: string[]) => `${words.join(" ")}.`;

// GET / as it renders with no changes yet: every position at version 1, and
// no Earlier paragraph (the server renders it only once there's a change)
function asIfNoChanges(doc: Document): void {
  for (const form of doc.querySelectorAll('form[action="/replace"]')) {
    form.querySelector<HTMLInputElement>('input[name="version"]')!.value = "1";
  }
  doc.querySelector('a[rel~="prev"]')?.closest("p")?.remove();
}
const traceStatus = (doc: Document) => doc.querySelector('section [role="status"], aside [role="status"]');

// what the visitor does with their own hands
function type(doc: Document, position: number, value: string): void {
  const { input } = slot(doc, position);
  input.value = value;
  input.dispatchEvent(new doc.defaultView!.Event("input", { bubbles: true }));
}

// The inert notice of a change held back by a draft: an element beside the
// position's form (not in it), naming the new word, not interactive, and not
// hidden from screen readers (as the decorative word leaving the slot is).
function notice(doc: Document, position: number, word: string): Element | null {
  const { form } = slot(doc, position);
  const wrapper = form.parentElement!;
  return (
    [...wrapper.querySelectorAll("*")].find(
      (el) =>
        !form.contains(el) &&
        !el.closest('[aria-hidden="true"]') &&
        el.children.length === 0 &&
        (el.textContent ?? "").includes(word),
    ) ?? null
  );
}

// a page with at least one change behind it, so it has an Earlier link
async function pageWithHistory(): Promise<Document> {
  const v = await arrive();
  let doc = await v.page("/");
  if (deriveTotal(positionsOf(doc)) === 0) {
    const first = positionsOf(doc)[0];
    expect(await (await arrive()).replace(first, fresh())).toBe(303);
    doc = await v.page("/");
  }
  return doc;
}

describe("live page reconciliation", () => {
  it("derives the number of changes from versions", () => {
    expect(deriveTotal([])).toBe(0);
    expect(deriveTotal([{ version: 1 }, { version: 1 }])).toBe(0);
    expect(deriveTotal([{ version: 3 }, { version: 1 }, { version: 2 }])).toBe(3);
  });

  localOnly("updates a position with no draft to a newer version", async () => {
    const doc = await (await arrive()).page("/");
    const page = attach(doc);
    page.applySnapshot(snapshotOf(doc));
    const { position, version } = positionsOf(doc)[0];
    const word = fresh();

    page.applyChange({ position, word, version: version + 1 });

    const s = slot(doc, position);
    expect(s.label.textContent!.trim(), "the word shown isn't the new one").toBe(word);
    expect(s.version.value, "the form still expects the old version").toBe(String(version + 1));
    expect(s.input.placeholder, "the input's cue isn't the new word").toBe(word);
    expect(s.input.value, "the visitor's (empty) input was written to").toBe("");
  });

  localOnly("ignores a stale or duplicate version: never backwards, never twice", async () => {
    const doc = await (await arrive()).page("/");
    const page = attach(doc);
    page.applySnapshot(snapshotOf(doc));
    const { position, version } = positionsOf(doc)[0];
    const newer = fresh();
    page.applyChange({ position, word: newer, version: version + 1 });
    expect(labelWord(doc, position), "a newer version wasn't applied").toBe(newer);

    page.applyChange({ position, word: fresh(), version }); // stale
    page.applyChange({ position, word: fresh(), version: version + 1 }); // duplicate version

    expect(labelWord(doc, position)).toBe(newer);
    expect(slot(doc, position).version.value).toBe(String(version + 1));
  });

  localOnly("keeps a typed draft and the version it was based on, and says the word changed", async () => {
    const doc = await (await arrive()).page("/");
    const page = attach(doc);
    page.applySnapshot(snapshotOf(doc));
    const { position, version, word: seen } = positionsOf(doc)[0];
    type(doc, position, "mydraft");

    page.applyChange({ position, word: MARKUP, version: version + 1 });

    const s = slot(doc, position);
    expect(s.input.value, "the draft was touched").toBe("mydraft");
    expect(s.version.value, "the draft was rebased onto the new version").toBe(String(version));
    expect(s.label.textContent!.trim(), "the word the draft replaces was swapped out").toBe(seen);
    const shown = notice(doc, position, MARKUP);
    expect(shown, "nothing beside the word says it changed, and to what").not.toBeNull();
    expect(shown!.closest("a, button, input, select, textarea, [tabindex]"), "the notice is interactive").toBeNull();
    expect(doc.querySelector("x-theseus"), "the new word became markup").toBeNull();
  });

  localOnly("doesn't rebase a draft when the input loses focus", async () => {
    const doc = await (await arrive()).page("/");
    const page = attach(doc);
    page.applySnapshot(snapshotOf(doc));
    const { position, version, word: seen } = positionsOf(doc)[0];
    const s = slot(doc, position);
    s.input.focus();
    type(doc, position, "mydraft");
    const word = fresh();
    page.applyChange({ position, word, version: version + 1 });
    expect(notice(doc, position, word), "the change wasn't noticed in the first place").not.toBeNull();

    // what a click on submit, or anywhere else, does first
    s.input.blur();

    expect(s.input.value).toBe("mydraft");
    expect(s.version.value, "losing focus rebased the draft: a stale submit would pass").toBe(String(version));
    expect(s.label.textContent!.trim()).toBe(seen);
    expect(notice(doc, position, word), "losing focus dismissed the notice").not.toBeNull();
  });

  localOnly("applies the newest held-back change once the visitor clears their draft", async () => {
    const doc = await (await arrive()).page("/");
    const page = attach(doc);
    page.applySnapshot(snapshotOf(doc));
    const { position, version } = positionsOf(doc)[0];
    type(doc, position, "mydraft");
    const first = fresh();
    const second = fresh();
    page.applyChange({ position, word: first, version: version + 1 });
    page.applyChange({ position, word: second, version: version + 2 });
    page.applyChange({ position, word: fresh(), version: version + 1 }); // stale, after the newest
    expect(notice(doc, position, second), "the newest change isn't the one noticed").not.toBeNull();

    type(doc, position, "mydrafts"); // still a draft: nothing applies
    expect(slot(doc, position).version.value).toBe(String(version));

    type(doc, position, "");

    const s = slot(doc, position);
    expect(s.label.textContent!.trim(), "clearing the draft didn't apply the newest change").toBe(second);
    expect(s.version.value).toBe(String(version + 2));
    expect(s.input.placeholder).toBe(second);
    expect(notice(doc, position, second), "the notice outlived the draft").toBeNull();
  });

  // Escape is the way out of a word in hand: it empties the draft and lets go
  // of the field, exactly as if the visitor had cleared it themselves, so a
  // change the draft was holding back applies then (never by itself before).
  // Escape never submits.
  const escape = (doc: Document, position: number) => {
    const { input } = slot(doc, position);
    input.dispatchEvent(new doc.defaultView!.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  };

  localOnly("Escape empties a draft and lets go of the field, applying a change it held back", async () => {
    const doc = await (await arrive()).page("/");
    const page = attach(doc);
    page.applySnapshot(snapshotOf(doc));
    const { position, version } = positionsOf(doc)[0];
    slot(doc, position).input.focus();
    type(doc, position, "mydraft");
    const newer = fresh();
    page.applyChange({ position, word: newer, version: version + 1 });
    expect(slot(doc, position).version.value, "the change applied under the draft").toBe(String(version));

    escape(doc, position);

    const s = slot(doc, position);
    expect(s.input.value, "Escape left the draft").toBe("");
    expect(doc.activeElement, "Escape kept the field focused").not.toBe(s.input);
    expect(s.label.textContent!.trim(), "Escape didn't apply the change the draft held back").toBe(newer);
    expect(s.version.value).toBe(String(version + 1));
    expect(notice(doc, position, newer), "the notice outlived the draft").toBeNull();
  });

  localOnly("Escape with nothing held back only empties and lets go: the word and its version stay", async () => {
    const doc = await (await arrive()).page("/");
    attach(doc);
    const { position, version, word } = positionsOf(doc)[1];
    slot(doc, position).input.focus();
    type(doc, position, "mydraft");
    let submitted = false;
    slot(doc, position).form.addEventListener("submit", (e) => { submitted = true; e.preventDefault(); });

    escape(doc, position);

    const s = slot(doc, position);
    expect(s.input.value).toBe("");
    expect(doc.activeElement).not.toBe(s.input);
    expect(s.label.textContent!.trim()).toBe(word);
    expect(s.version.value).toBe(String(version));
    expect(submitted, "Escape submitted the form").toBe(false);
  });

  // The live sentence's size step (src/lib/sentence-step.ts) never changes
  // under someone: when another visitor's change needs a different step, it
  // waits while this visitor has a word in hand (a field focused, or holding a
  // draft) and applies once they let go, as a held-back change does. With no
  // word in hand it applies with the change. The page shows the step it would
  // render for the words now standing (GET / renders the same).
  describe("the sentence's size step", () => {
    const step = (doc: Document) => doc.querySelector(".sentence-strip .sentence")?.getAttribute("data-step");
    const LONG = ["potato", "every", "ceremony", "that", "students", "will", "tythbvgbv", "whether", "it", "peel"];
    // a change to each position in turn, newer than shown, building the long sentence
    const lengthen = (page: ReturnType<typeof attach>, doc: Document) => {
      for (const p of positionsOf(doc)) page.applyChange({ position: p.position, word: LONG[p.position], version: p.version + 1 });
    };

    localOnly("GET / renders the step for the words it shows", async () => {
      const doc = await (await arrive()).page("/");
      expect(step(doc), "GET / renders no size step").toMatch(/^\d$/);
      expect(Number(step(doc))).toBe(sizeStep(positionsOf(doc).map((p) => p.word)));
    });

    localOnly("applies a new step with the change when no word is in hand", async () => {
      const doc = await (await arrive()).page("/");
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      lengthen(page, doc);
      expect(step(doc), "the step didn't follow the new words").toBe(String(sizeStep(LONG)));
    });

    localOnly("waits while a word is in hand, and applies once the visitor lets go", async () => {
      const doc = await (await arrive()).page("/");
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const before = step(doc);
      const { input } = slot(doc, 0);
      input.focus(); // a word in hand, nothing typed yet
      lengthen(page, doc);
      if (sizeStep(LONG) !== Number(before)) expect(step(doc), "the step changed under a focused word").toBe(before);
      // moving straight to another word is still a word in hand
      slot(doc, 1).input.focus();
      if (sizeStep(LONG) !== Number(before)) expect(step(doc), "the step changed while moving between words").toBe(before);
      slot(doc, 1).input.blur();
      expect(step(doc), "letting go didn't apply the new step").toBe(String(sizeStep(LONG)));
    });

    localOnly("waits under a draft until the visitor clears it, as a held-back change does", async () => {
      const doc = await (await arrive()).page("/");
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const before = step(doc);
      const { input } = slot(doc, 3);
      input.focus();
      type(doc, 3, "mydraft");
      lengthen(page, doc);
      input.blur(); // focus leaves, the draft stays: still a word in hand
      if (sizeStep(LONG) !== Number(before)) expect(step(doc), "the step changed under a draft").toBe(before);
      input.focus();
      type(doc, 3, "");
      input.blur();
      expect(step(doc), "clearing the draft didn't apply the new step").toBe(String(sizeStep(LONG)));
    });
  });

  describe("the visitor's own trace", () => {
    localOnly("leaves a standing word alone, then says when it's replaced, and by what", async () => {
      const ann = await arrive();
      const mine = positionsOf(await ann.page("/"))[0];
      const anns = fresh();
      expect(await ann.replace(mine, anns)).toBe(303);
      const doc = await ann.page("/");
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc, { position: mine.position, word: anns, standing: true }));
      const before = traceStatus(doc)!.textContent;

      const other = positionsOf(doc).find((p) => p.position !== mine.position)!;
      page.applyChange({ position: other.position, word: fresh(), version: other.version + 1 });
      expect(traceStatus(doc)!.textContent, "a change elsewhere altered the trace").toBe(before);

      page.applyChange({ position: mine.position, word: MARKUP, version: mine.version + 2 });

      const status = traceStatus(doc)!;
      expect(status.querySelector("del")?.textContent?.trim(), "the trace doesn't mark the word removed").toBe(anns);
      expect(status.textContent, "the trace doesn't name the word now in its place").toContain(MARKUP);
      expect(slot(doc, mine.position).label.querySelector("mark"), "the replaced word is still marked as yours").toBeNull();
      expect(doc.querySelector("x-theseus"), "a word became markup").toBeNull();
    });

    localOnly("keeps a replaced word's trace naming whatever stands there now", async () => {
      const ann = await arrive();
      const mine = positionsOf(await ann.page("/"))[0];
      const anns = fresh();
      expect(await ann.replace(mine, anns)).toBe(303);
      const bobs = fresh();
      expect(await (await arrive()).replace({ position: mine.position, version: mine.version + 1 }, bobs)).toBe(303);
      const doc = await ann.page("/");
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc, { position: mine.position, word: anns, standing: false, now: bobs }));

      const later = fresh();
      page.applyChange({ position: mine.position, word: later, version: mine.version + 3 });

      const status = traceStatus(doc)!;
      expect(status.querySelector("del")?.textContent?.trim()).toBe(anns);
      expect(status.textContent, "the trace doesn't follow the newest word").toContain(later);
      expect(status.textContent, "the trace still names a word that's gone").not.toContain(bobs);
    });

    // The same visitor with two tabs open: they make their change in the other
    // one, so this page loaded with no trace at all. Compares the client's own
    // rendering against what GET / actually serves, so it's valid only when
    // the once-mode Trace shape (hand-fed below) matches the real server's
    // mode; spec/live-client.test.ts's settle-mode describe block below
    // covers the equivalent settle-mode rendering without that comparison.
    onceOnly("creates the trace when a snapshot first brings one, as GET / would render it", async () => {
      const ann = await arrive();
      const doc = await ann.page("/");
      expect(traceStatus(doc), "a visitor who hasn't changed anything has a trace").toBeNull();
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      expect(traceStatus(doc), "a snapshot with no trace created one").toBeNull();

      const mine = positionsOf(doc)[0];
      const anns = fresh();
      expect(await ann.replace(mine, anns)).toBe(303); // in the other tab
      const positions = positionsOf(doc).map((p) =>
        p.position === mine.position ? { ...p, word: anns, version: p.version + 1 } : p,
      );
      page.applySnapshot({ positions, trace: { position: mine.position, word: anns, standing: true } });

      // what GET / renders for ann now is the model
      const served = await ann.page("/");
      const section = (d: Document) => traceStatus(d)?.closest("section, aside") ?? null;
      const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
      expect(section(doc), "the snapshot's trace didn't create a trace on the page").not.toBeNull();
      expect(text(section(doc))).toBe(text(section(served)));
      expect(section(doc)!.getAttribute("aria-labelledby")).toBe(section(served)!.getAttribute("aria-labelledby"));
      expect(slot(doc, mine.position).label.querySelector("mark")?.textContent, "the standing word isn't marked").toBe(anns);
      const after = (a: Node, b: Node) => (a.compareDocumentPosition(b) & doc.defaultView!.Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      expect(after(doc.querySelector(".sentence")!, section(doc)!), "the trace isn't after the sentence").toBe(true);
      expect(after(section(doc)!, doc.querySelector('a[href="/readme/"]')!), "the trace isn't before the page's links").toBe(true);
      const earlierLink = doc.querySelector('a[rel~="prev"]');
      if (earlierLink) expect(after(section(doc)!, earlierLink), "the trace isn't before the Earlier link").toBe(true);

      page.applyChange({ position: mine.position, word: MARKUP, version: mine.version + 2 });

      const status = traceStatus(doc)!;
      expect(status.querySelector("del")?.textContent?.trim(), "the created trace didn't turn replaced").toBe(anns);
      expect(status.textContent).toContain(MARKUP);
      expect(slot(doc, mine.position).label.querySelector("mark")).toBeNull();
      expect(doc.querySelector("x-theseus"), "a word became markup").toBeNull();
      expect(doc.querySelectorAll('section [role="status"], aside [role="status"]').length, "more than one trace").toBe(1);
    });

    // Same scenario as above, but under settle mode: the server's own
    // SettleTrace shape is the model, compared the same way.
    settleOnly("creates the settle-mode trace when a snapshot first brings one, as GET / would render it", async () => {
      const ann = await arrive();
      const doc = await ann.page("/");
      expect(traceStatus(doc), "a visitor who hasn't changed anything has a trace").toBeNull();
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      expect(traceStatus(doc), "a snapshot with no trace created one").toBeNull();

      const mine = positionsOf(doc)[0];
      const anns = fresh();
      expect(await ann.replace(mine, anns)).toBe(303); // in the other tab
      const positions = positionsOf(doc).map((p) =>
        p.position === mine.position ? { ...p, word: anns, version: p.version + 1 } : p,
      );
      const trace: SettleTrace = {
        latest: { position: mine.position, word: anns, standing: true, settled: false, settlesInMs: 300_000 },
        otherStanding: [],
        otherReplaced: [],
      };
      page.applySnapshot({ positions, trace });

      // what GET / renders for ann now is the model (settlesInMs ticks down
      // on the server between these two reads, so it's never compared)
      const served = await ann.page("/");
      const section = (d: Document) => traceStatus(d)?.closest("section, aside") ?? null;
      const withoutTimerDrift = (s: string) => s.replace(/\d+/g, "#"); // defensive: no numbers are expected either way
      const text = (el: Element | null) => withoutTimerDrift((el?.textContent ?? "").replace(/\s+/g, " ").trim());
      expect(section(doc), "the snapshot's trace didn't create a trace on the page").not.toBeNull();
      expect(text(section(doc))).toBe(text(section(served)));
      expect(slot(doc, mine.position).label.querySelector("mark")?.textContent, "the standing word isn't marked").toBe(anns);
    });

    localOnly("brings the trace up to date from a reconnect snapshot", async () => {
      const ann = await arrive();
      const mine = positionsOf(await ann.page("/"))[0];
      const anns = fresh();
      expect(await ann.replace(mine, anns)).toBe(303);
      const doc = await ann.page("/");
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc, { position: mine.position, word: anns, standing: true }));

      // replaced while this page was disconnected
      const now = fresh();
      const positions = positionsOf(doc).map((p) =>
        p.position === mine.position ? { ...p, word: now, version: p.version + 1 } : p,
      );
      page.applySnapshot({ positions, trace: { position: mine.position, word: anns, standing: false, now } });

      const status = traceStatus(doc)!;
      expect(status.querySelector("del")?.textContent?.trim()).toBe(anns);
      expect(status.textContent).toContain(now);
      expect(labelWord(doc, mine.position)).toBe(now);
    });
  });

  // SettleTrace is a hand-built shape here (not fetched over HTTP, same as
  // the once-mode trace tests above): these drive src/lib/live-client.ts
  // directly, so they exercise its rendering and timer logic independent of
  // the server's actual rule mode. spec/trace.test.ts and
  // spec/realtime.test.ts cover the server side (the rendered page, and the
  // wire shape) under a real settle-mode app.
  describe("the visitor's own trace under the settle rule", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const settleTrace = (overrides: Partial<Extract<SettleTrace["latest"], { standing: true }>> = {}): SettleTrace => ({
      latest: { position: 0, word: "held", standing: true, settled: false, settlesInMs: 5000, ...overrides },
      otherStanding: [],
      otherReplaced: [],
    });

    localOnly("marks every standing word's position in the sentence, and lists the others", async () => {
      const doc = await (await arrive()).page("/");
      const [a, b, c] = positionsOf(doc);
      const page = attach(doc);
      const trace: SettleTrace = {
        latest: { position: a.position, word: fresh(), standing: true, settled: false, settlesInMs: 5000 },
        otherStanding: [{ position: b.position, word: fresh() }],
        otherReplaced: [{ position: c.position, word: fresh(), now: fresh(), kept: "later" }],
      };
      page.applySnapshot({ positions: positionsOf(doc), trace });

      expect(slot(doc, a.position).label.querySelector("mark"), "the latest standing word isn't marked").not.toBeNull();
      expect(slot(doc, b.position).label.querySelector("mark"), "the other standing word isn't marked").not.toBeNull();
      expect(slot(doc, c.position).label.querySelector("mark"), "a replaced word is marked").toBeNull();

      const section = traceStatus(doc)!.closest("section, aside")!;
      expect(section.textContent, "the other standing word is missing from the trace").toContain(trace.otherStanding[0].word);
      expect(section.textContent, "the other standing word isn't labelled settled").toMatch(/settled/i);
      expect(section.textContent, "the replaced word is missing from the trace").toContain(trace.otherReplaced[0].word);
      expect(section.textContent, "the replaced word's replacement is missing").toContain(trace.otherReplaced[0].now);
      expect(section.textContent, "the replaced word isn't labelled kept").toMatch(/kept/i);
    });

    localOnly("a holding trace becomes free on the page after SETTLE_SECONDS without any other change or reload", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers();
      const [a] = positionsOf(doc);
      const page = attach(doc);
      const trace = settleTrace({ position: a.position, settlesInMs: 3000 });
      page.applySnapshot({ positions: positionsOf(doc), trace });

      const before = traceStatus(doc)!.textContent;
      expect(before, "a holding trace shows the settled wording already").toMatch(/holding/i);

      vi.advanceTimersByTime(2999);
      expect(traceStatus(doc)!.textContent, "the trace settled before its timer elapsed").toBe(before);

      vi.advanceTimersByTime(2);
      const after = traceStatus(doc)!.textContent;
      expect(after, "the trace never flipped once its timer elapsed").not.toBe(before);
      expect(after, "the settled trace still claims it's holding").not.toMatch(/holding/i);
      expect(slot(doc, a.position).label.querySelector("mark"), "the settled word is no longer marked as standing").not.toBeNull();
    });

    localOnly("a newer trace cancels the pending local timer instead of firing late over it", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers();
      const [a, b] = positionsOf(doc);
      const page = attach(doc);
      page.applySnapshot({ positions: positionsOf(doc), trace: settleTrace({ position: a.position, settlesInMs: 3000 }) });

      // freed by a real replacement elsewhere, before the local timer would fire
      const freedWord = fresh();
      const freedTrace: SettleTrace = {
        latest: { position: b.position, word: freedWord, standing: true, settled: false, settlesInMs: 5000 },
        otherStanding: [],
        otherReplaced: [],
      };
      page.applySnapshot({ positions: positionsOf(doc), trace: freedTrace });
      const afterFreed = traceStatus(doc)!.textContent;

      vi.advanceTimersByTime(3000);

      expect(traceStatus(doc)!.textContent, "a stale timer clobbered the newer trace").toBe(afterFreed);
      expect(traceStatus(doc)!.textContent).toContain(freedWord);
    });
  });

  // Settling, made visible (plan C): while this visitor's latest word is
  // holding, one thin line under that word fills to the end of the hold
  // (settlesInMs, from the fraction already elapsed of the settle time the
  // page carries), and goes once it settles or is replaced. Only on their own
  // page: it comes from their own trace. Never red; with reduced motion,
  // none; under once mode, none. Decorative: the trace text says the same.
  describe("the settling line under a holding word", () => {
    afterEach(() => vi.useRealTimers());
    const fills = (doc: Document) => [...doc.querySelectorAll(".sentence .settling")];
    const holding = (position: number, settlesInMs: number): SettleTrace => ({
      latest: { position, word: "held", standing: true, settled: false, settlesInMs },
      otherStanding: [],
      otherReplaced: [],
    });
    const withSettleTime = (doc: Document, ms: number) => doc.querySelector(".sentence-strip .sentence")!.setAttribute("data-settle-ms", String(ms));

    localOnly("fills under the holding word only, from what has already elapsed to the end of the hold", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers();
      withSettleTime(doc, 10_000);
      const [a] = positionsOf(doc);
      const page = attach(doc);
      page.applySnapshot({ positions: positionsOf(doc), trace: holding(a.position, 4000) });
      const f = fills(doc);
      expect(f, "a holding word has no settling line, or more than one").toHaveLength(1);
      expect(f[0].closest(".pos")?.contains(slot(doc, a.position).form), "the line isn't under the holding word").toBe(true);
      expect(f[0].getAttribute("aria-hidden"), "the line isn't decorative").toBe("true");
      const style = (f[0] as HTMLElement).style;
      expect(Number(style.getPropertyValue("--from")), "the line doesn't start from the elapsed share of the hold").toBeCloseTo(0.6, 2);
      expect(style.getPropertyValue("--ms"), "the line doesn't take the rest of the hold").toBe("4000ms");
      vi.advanceTimersByTime(4001);
      expect(fills(doc), "the line outlived the hold").toHaveLength(0);
    });

    localOnly("goes when the word is replaced, and is never added for a settled word or a once-mode trace", async () => {
      const doc = await (await arrive()).page("/");
      withSettleTime(doc, 10_000);
      const [a, b] = positionsOf(doc);
      const page = attach(doc);
      page.applySnapshot({ positions: positionsOf(doc), trace: holding(a.position, 4000) });
      expect(fills(doc)).toHaveLength(1);
      // replaced: the new trace no longer holds
      const replaced: SettleTrace = { latest: { position: a.position, word: "held", standing: false, now: fresh(), kept: "later" }, otherStanding: [], otherReplaced: [] };
      page.applySnapshot({ positions: positionsOf(doc), trace: replaced });
      expect(fills(doc), "the line outlived its word").toHaveLength(0);
      page.applySnapshot({ positions: positionsOf(doc), trace: { latest: { position: b.position, word: "x", standing: true, settled: true }, otherStanding: [], otherReplaced: [] } });
      expect(fills(doc), "a settled word has a settling line").toHaveLength(0);
      page.applySnapshot({ positions: positionsOf(doc), trace: { position: b.position, word: "x", standing: true } as Trace });
      expect(fills(doc), "a once-mode trace has a settling line").toHaveLength(0);
    });

    settleOnly("GET / carries the settle time on the live sentence under settle mode", async () => {
      const doc = await (await arrive()).page("/");
      const ms = Number(process.env.SETTLE_SECONDS ?? 300) * 1000;
      expect(doc.querySelector(".sentence-strip .sentence")?.getAttribute("data-settle-ms"), "the page doesn't carry the settle time").toBe(String(ms));
    });

    onceOnly("GET / carries no settle time under once mode", async () => {
      const doc = await (await arrive()).page("/");
      expect(doc.querySelector(".sentence-strip .sentence")?.hasAttribute("data-settle-ms"), "a once-mode page carries a settle time").toBe(false);
    });

    localOnly("is never added with reduced motion", async () => {
      const doc = await (await arrive()).page("/");
      withSettleTime(doc, 10_000);
      doc.defaultView!.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia;
      const [a] = positionsOf(doc);
      attach(doc).applySnapshot({ positions: positionsOf(doc), trace: holding(a.position, 4000) });
      expect(fills(doc), "reduced motion still shows a moving line").toHaveLength(0);
      expect(traceStatus(doc)!.textContent, "the trace text no longer says it's holding").toMatch(/holding/i);
    });
  });

  // The house shows the shared truth: every newer version of a position,
  // including one a draft holds back from the word on screen, while the
  // draft, its version and the label stay exactly as above.
  // Your plank (decision 0005): when another visitor replaces a word that's yours, standing, the page is told so
  // (onYours) from that change alone: never from a snapshot or a reconnect, never for anyone else's word. It
  // reads the trace this page already has; nothing about the visitor reaches anyone else.
  describe("your plank", () => {
    localOnly("tells this page when its own standing word is replaced, from the change only, never a snapshot", async () => {
      const ann = await arrive();
      const doc = await ann.page("/");
      const yours: number[] = [];
      const page = attach(doc, { onYours: (position) => yours.push(position) });
      const [mine, other] = positionsOf(doc);
      // this page's own standing word at `mine`, in either mode's trace shape
      const trace: Trace = { position: mine.position, word: mine.word, standing: true };
      const settle: SettleTrace = { latest: { position: mine.position, word: mine.word, standing: true, settled: false, settlesInMs: 60_000 }, otherStanding: [], otherReplaced: [] };
      page.applySnapshot({ positions: positionsOf(doc), trace: process.env.RULE_MODE === "settle" ? settle : trace });
      expect(yours, "a snapshot told this page its plank was replaced").toEqual([]);
      // someone else's word replaced: not yours
      page.applyChange({ position: other.position, word: fresh(), version: other.version + 1 });
      expect(yours, "another visitor's word counted as yours").toEqual([]);
      // yours replaced, from a live change: told once
      page.applyChange({ position: mine.position, word: fresh(), version: mine.version + 1 });
      expect(yours, "this page wasn't told its plank was replaced").toEqual([mine.position]);
      // the same change again (a duplicate or stale version) tells nothing more
      page.applyChange({ position: mine.position, word: fresh(), version: mine.version + 1 });
      expect(yours, "a duplicate told it twice").toEqual([mine.position]);
      // a reconnect's snapshot afterwards tells nothing
      page.applySnapshot({ positions: positionsOf(doc), trace: null });
      expect(yours, "a reconnect's snapshot told it again").toEqual([mine.position]);
    });
  });

  describe("the house's view of the sentence", () => {
    localOnly("hears every newer version once, and nothing older or repeated", async () => {
      const doc = await (await arrive()).page("/");
      const heard: Position[] = [];
      const page = attach(doc, { onLatest: (p) => heard.push(p) });
      page.applySnapshot(snapshotOf(doc));
      expect(heard, "an unchanged snapshot announced a change").toEqual([]);
      const { position, version } = positionsOf(doc)[0];
      const word = fresh();

      page.applyChange({ position, word, version: version + 1 });
      page.applyChange({ position, word: fresh(), version: version + 1 }); // duplicate
      page.applyChange({ position, word: fresh(), version }); // stale

      expect(heard).toEqual([{ position, word, version: version + 1 }]);
    });

    localOnly("hears a change a draft holds back, without touching the draft", async () => {
      const doc = await (await arrive()).page("/");
      const heard: Position[] = [];
      const page = attach(doc, { onLatest: (p) => heard.push(p) });
      page.applySnapshot(snapshotOf(doc));
      const { position, version, word: seen } = positionsOf(doc)[0];
      type(doc, position, "mydraft");

      page.applyChange({ position, word: MARKUP, version: version + 1 });

      expect(heard, "the house wasn't told the shared word changed").toEqual([{ position, word: MARKUP, version: version + 1 }]);
      const s = slot(doc, position);
      expect(s.input.value).toBe("mydraft");
      expect(s.version.value, "telling the house rebased the draft").toBe(String(version));
      expect(s.label.textContent!.trim()).toBe(seen);
      expect(notice(doc, position, MARKUP)).not.toBeNull();

      type(doc, position, ""); // clearing applies the word; the house already has it
      expect(heard.length, "the house was told twice").toBe(1);
    });

    localOnly("hears what a reconnect snapshot brings that the page didn't have", async () => {
      const doc = await (await arrive()).page("/");
      const heard: Position[] = [];
      const page = attach(doc, { onLatest: (p) => heard.push(p) });
      page.applySnapshot(snapshotOf(doc));
      const [a] = positionsOf(doc);
      const word = fresh();
      const positions = positionsOf(doc).map((p) => (p.position === a.position ? { ...p, word, version: p.version + 1 } : p));

      page.applySnapshot({ positions, trace: null });

      expect(heard).toEqual([{ position: a.position, word, version: a.version + 1 }]);
    });
  });

  // The kept ship (docs/decisions/0003-settle-and-kept-ships.md) is global,
  // not per-visitor: unlike the trace, it's told on every change event
  // itself, never held back by a draft, and never needs a follow-up
  // snapshot the way the trace sometimes does.
  describe("the kept ship", () => {
    const ship = (n: number): KeptShip => ({ words: Array(10).fill(`ship${n}`), gaps: Array(10).fill(n === 0), next: Array(10).fill(null) });

    localOnly("is told on an initial snapshot", async () => {
      const doc = await (await arrive()).page("/");
      const heard: KeptShip[] = [];
      const page = attach(doc, { onKept: (k) => heard.push(k) });
      page.applySnapshot({ ...snapshotOf(doc), keptShip: ship(1) });
      expect(heard).toEqual([ship(1)]);
    });

    localOnly("is told again on every change event, even under an unrelated draft", async () => {
      const doc = await (await arrive()).page("/");
      const heard: KeptShip[] = [];
      const page = attach(doc, { onKept: (k) => heard.push(k) });
      page.applySnapshot({ ...snapshotOf(doc), keptShip: ship(1) });
      const { position, version } = positionsOf(doc)[0];
      const other = positionsOf(doc)[1].position;
      type(doc, other, "mydraft"); // an unsubmitted draft elsewhere never holds this back

      page.applyChange({ position, word: fresh(), version: version + 1, keptShip: ship(2) });

      expect(heard).toEqual([ship(1), ship(2)]);
      expect(slot(doc, other).input.value, "the kept ship touched an unrelated draft").toBe("mydraft");
    });

    // The moment of a replacement (spec/kept-moment.test.ts) comes only with a
    // change event, never a snapshot: a reload or reconnect never replays it.
    localOnly("brings a moment only with a change event, never a snapshot", async () => {
      const doc = await (await arrive()).page("/");
      const moments: unknown[] = [];
      const page = attach(doc, { onKept: (_k, m) => moments.push(m) });
      const empty: KeptShip = { words: Array(10).fill("w"), gaps: Array(10).fill(true), next: Array(10).fill(null) };
      page.applySnapshot({ ...snapshotOf(doc), keptShip: empty });
      const { position, version } = positionsOf(doc)[0];
      const filled: KeptShip = { words: empty.words, gaps: empty.gaps.map((_, i) => i !== position), next: empty.next };

      page.applyChange({ position, word: fresh(), version: version + 1, keptShip: filled });
      expect(moments, "a crossing change brought no moment").toEqual([null, { position, kind: "cross" }]);

      page.applySnapshot({ ...snapshotOf(doc), keptShip: empty }); // a reconnect onto a different kept ship
      expect(moments.at(-1), "a snapshot brought a moment").toBeNull();
    });

    localOnly("brings no moment for a duplicate or stale change", async () => {
      const doc = await (await arrive()).page("/");
      const moments: unknown[] = [];
      const page = attach(doc, { onKept: (_k, m) => moments.push(m) });
      const empty: KeptShip = { words: Array(10).fill("w"), gaps: Array(10).fill(true), next: Array(10).fill(null) };
      page.applySnapshot({ ...snapshotOf(doc), keptShip: empty });
      const { position, version } = positionsOf(doc)[0];
      const filled: KeptShip = { words: empty.words, gaps: empty.gaps.map((_, i) => i !== position), next: empty.next };
      page.applyChange({ position, word: fresh(), version, keptShip: filled }); // not newer than what's shown
      expect(moments.filter((m) => m !== null), "a stale change brought a moment").toEqual([]);
    });

    // the waiting row (decided 29 October): a replaced word for the next house is a "wait" moment, from a change only
    localOnly("brings a wait moment when the replaced word belongs to the next house, never from a snapshot", async () => {
      const doc = await (await arrive()).page("/");
      const moments: unknown[] = [];
      const page = attach(doc, { onKept: (_k, m) => moments.push(m) });
      const { position, version, word } = positionsOf(doc)[2];
      const shown: KeptShip = { words: Array(10).fill("w"), gaps: Array(10).fill(false).map((_, i) => i === 8), next: Array(10).fill(null) };
      page.applySnapshot({ ...snapshotOf(doc), keptShip: shown });
      const waiting: KeptShip = { ...shown, next: Array.from({ length: 10 }, (_, i) => (i === position ? word : null)) };
      page.applyChange({ position, word: fresh(), version: version + 1, keptShip: waiting });
      expect(moments.at(-1)).toEqual({ position, kind: "wait" });
      page.applySnapshot({ ...snapshotOf(doc), keptShip: { ...waiting, next: Array(10).fill(null) } });
      expect(moments.at(-1), "a snapshot brought a moment").toBeNull();
    });

    localOnly("isn't told twice for a reconnect snapshot whose kept ship didn't change", async () => {
      const doc = await (await arrive()).page("/");
      const heard: KeptShip[] = [];
      const page = attach(doc, { onKept: (k) => heard.push(k) });
      page.applySnapshot({ ...snapshotOf(doc), keptShip: ship(1) });
      page.applySnapshot({ ...snapshotOf(doc), keptShip: ship(1) }); // a reconnect, nothing new
      expect(heard, "an unchanged kept ship was announced more than once").toEqual([ship(1)]);
    });
  });

  // A word waiting for the next ship lands when its plank does (found in the
  // 29 October frames: the row showed the word at once, a second before the
  // part flying toward it had left the live house). While the plank is
  // carried the row holds that word back; it appears once the shipwright sets
  // it down on the rack. With reduced motion, or when nothing is carried (no
  // harbour drawn), the page passes no carry and the word is there at once.
  // Words already waiting never leave the row meanwhile, and a second change
  // finishes the first one's carry, so its word lands then.
  describe("a waiting word, landing", () => {
    const rowDoc = () => new JSDOM('<p class="waiting" hidden><span class="label">Waiting for the next ship:</span> <span class="ws"></span></p>').window.document;
    const next = (at: Record<number, string>) => Array.from({ length: 10 }, (_, i) => at[i] ?? null);
    const shown = (row: HTMLElement) => (row.hidden ? [] : [...row.querySelectorAll(".ws .w")].map((w) => w.textContent));
    afterEach(() => vi.useRealTimers());

    it("lands when the shipwright sets its plank down, and with reduced motion at once", () => {
      const at = landsAt(false);
      expect(at, "the plank is never set down").toBeGreaterThan(0);
      expect(carryAt(at - 50).phase, "the word would land while its plank is still carried").toBe("carry");
      expect(carryAt(at).phase, "the word would land after its plank is set down").toBe("set");
      expect(landsAt(true), "with reduced motion a waiting word still waits for a carry").toBe(0);
    });

    it("isn't in the row while its part is in flight, and is there after", () => {
      vi.useFakeTimers();
      const row = rowDoc().querySelector<HTMLElement>(".waiting")!;
      const rows = waitingRow(row, next({ 2: "ceremony" }));
      expect(shown(row)).toEqual(["ceremony"]);
      rows.land(next({ 2: "ceremony", 6: "wonder" }), 1500);
      expect(shown(row), "the word is in the row while its part flies").toEqual(["ceremony"]);
      vi.advanceTimersByTime(1499);
      expect(shown(row), "the word is in the row while its part flies").toEqual(["ceremony"]);
      // a redraw meanwhile (your own trace changed) keeps it held
      rows.show(next({ 2: "ceremony", 6: "wonder" }));
      expect(shown(row), "a redraw let the word land early").toEqual(["ceremony"]);
      vi.advanceTimersByTime(1);
      expect(shown(row), "the word didn't land with its part").toEqual(["ceremony", "wonder"]);
    });

    it("is there at once when nothing flies", () => {
      const row = rowDoc().querySelector<HTMLElement>(".waiting")!;
      const rows = waitingRow(row, next({}));
      expect(row.hidden).toBe(true);
      rows.land(next({ 4: "students" }), 0);
      expect(shown(row)).toEqual(["students"]);
      expect(row.hidden).toBe(false);
    });

    // a new change finishes any carry still under way at once (decision 0005, amended 31 October): the first
    // plank is set down, so its word lands then, and the second waits for its own
    it("lands the first word at once when a second plank is carried before the first is set down", () => {
      vi.useFakeTimers();
      const row = rowDoc().querySelector<HTMLElement>(".waiting")!;
      const rows = waitingRow(row, next({}));
      rows.land(next({ 1: "two" }), 2700);
      vi.advanceTimersByTime(800);
      rows.land(next({ 1: "two", 3: "while" }), 2700);
      expect(shown(row), "the first word wasn't landed by the second change").toEqual(["two"]);
      vi.advanceTimersByTime(2699);
      expect(shown(row), "the second word landed before its plank").toEqual(["two"]);
      vi.advanceTimersByTime(1);
      expect(shown(row), "a word in flight was lost").toEqual(["two", "while"]);
      // and the ship completing (its waiting words moving up) empties the row at once
      rows.show(next({}));
      expect(row.hidden).toBe(true);
    });
  });

  // A screen reader hears what changed: one polite live region, filled only by
  // change events newer than what the page shows (a snapshot, a reconnect or a
  // stale event says nothing), and a burst coalesced into one announcement
  // 2.5 s after its last change. It names positions and words, as plain text;
  // never a visitor, a time or a count of people.
  describe("the announcement of others' changes", () => {
    const region = (doc: Document) => {
      const el = doc.querySelector('[aria-live="polite"]');
      expect(el, "GET / has no polite live region").not.toBeNull();
      expect(el!.closest('[aria-hidden="true"]'), "the live region is hidden from screen readers").toBeNull();
      return el!;
    };
    afterEach(() => vi.useRealTimers());

    localOnly("is empty on load and after a snapshot or reconnect", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers(); // after the network: fake timers stall fetch
      expect(region(doc).textContent?.trim(), "the live region speaks on load").toBe("");
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const { position, version } = positionsOf(doc)[0];
      page.applySnapshot({ ...snapshotOf(doc), positions: positionsOf(doc).map((p) => (p.position === position ? { ...p, word: fresh(), version: version + 1 } : p)) });
      vi.advanceTimersByTime(5000);
      expect(region(doc).textContent?.trim(), "a snapshot was announced").toBe("");
    });

    localOnly("announces one change once, after it settles, as plain text", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers(); // after the network: fake timers stall fetch
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const { position, version } = positionsOf(doc)[3];
      page.applyChange({ position, word: MARKUP, version: version + 1 });
      expect(region(doc).textContent?.trim(), "announced before the burst could settle").toBe("");
      vi.advanceTimersByTime(2500);
      const said = region(doc).textContent ?? "";
      expect(said, "the announcement doesn't name the word").toContain(MARKUP);
      expect(said, "the announcement doesn't name the position").toContain(String(position + 1));
      expect(region(doc).querySelector("x-theseus"), "a visitor word became markup").toBeNull();
      expect(said, "the announcement names a time").not.toMatch(/\d{1,2}:\d{2}|ago|second|minute/i);
    });

    // the same family change the part notation shows, from the same code (src/lib/ship/notation.ts)
    localOnly("says one change's family change, as the part notation does", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers(); // after the network: fake timers stall fetch
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const { position, version, word: was } = positionsOf(doc)[4];
      const word = fresh();
      page.applyChange({ position, word, version: version + 1 });
      vi.advanceTimersByTime(2500);
      expect(region(doc).textContent?.trim()).toBe(said({ position, word, was }));
    });

    localOnly("coalesces a burst into one announcement naming every changed position", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers(); // after the network: fake timers stall fetch
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const said: string[] = [];
      new doc.defaultView!.MutationObserver(() => { const t = region(doc).textContent?.trim(); if (t) said.push(t); }).observe(region(doc), { childList: true, characterData: true, subtree: true });
      const words: string[] = [];
      for (const i of [1, 4, 8]) {
        const { position, version } = positionsOf(doc)[i];
        const word = fresh();
        words.push(word);
        page.applyChange({ position, word, version: version + 1 });
        vi.advanceTimersByTime(300);
      }
      vi.advanceTimersByTime(2500);
      await Promise.resolve(); // let the observer see the last write
      expect(said, "a burst was announced more than once").toHaveLength(1);
      for (const i of [2, 5, 9]) expect(said[0], `the burst's announcement leaves out word ${i}`).toContain(String(i));
    });

    localOnly("says nothing for a duplicate or stale change", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers(); // after the network: fake timers stall fetch
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const { position, version } = positionsOf(doc)[0];
      page.applyChange({ position, word: fresh(), version });
      vi.advanceTimersByTime(5000);
      expect(region(doc).textContent?.trim(), "a stale change was announced").toBe("");
    });

    // the replaced word waits for the next ship: said in the same announcement, coalesced, never who or when
    localOnly("says that a replaced word waits for the next ship, in the same announcement", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers(); // after the network: fake timers stall fetch
      const shown: KeptShip = { words: Array(10).fill("w"), gaps: Array(10).fill(false).map((_, i) => i === 8), next: Array(10).fill(null) };
      const page = attach(doc);
      page.applySnapshot({ ...snapshotOf(doc), keptShip: shown });
      const { position, version, word: was } = positionsOf(doc)[2];
      const word = fresh();
      page.applyChange({ position, word, version: version + 1, keptShip: { ...shown, next: Array.from({ length: 10 }, (_, i) => (i === position ? was : null)) } });
      vi.advanceTimersByTime(2500);
      const text = region(doc).textContent ?? "";
      expect(text).toContain(said({ position, word, was }));
      expect(text, "the announcement doesn't say the replaced word waits for the next ship").toContain(`“${was}” waits for the next ship`);
      expect(text, "the announcement names a time or a count").not.toMatch(/\d{1,2}:\d{2}|ago|second|minute|waiting words|\bof\b \d/i);
    });

    localOnly("announces a change at a position holding a draft, and leaves the draft alone", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers(); // after the network: fake timers stall fetch
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const { position, version } = positionsOf(doc)[2];
      type(doc, position, "mydraft");
      const word = fresh();
      page.applyChange({ position, word, version: version + 1 });
      vi.advanceTimersByTime(2500);
      expect(region(doc).textContent, "a change under a draft wasn't announced").toContain(word);
      expect(slot(doc, position).input.value, "the announcement touched the draft").toBe("mydraft");
    });
  });

  // The draft's own polite live region (decided after the 28 October playtest): the part
  // notation is decorative, so a screen reader hears the same prediction here, once typing
  // pauses, never per key; and if another visitor replaces the word being typed over, that
  // it was, and to choose it again. Separate from the region for others' changes, so neither
  // talks over the other. Silent on load, a snapshot, a reconnect, an emptied or blurred field.
  describe("the draft's prediction, for a screen reader", () => {
    const draftRegion = (doc: Document) => {
      const el = doc.getElementById("foreseen");
      expect(el, "GET / has no live region for the draft").not.toBeNull();
      expect(el!.getAttribute("aria-live")).toBe("polite");
      expect(el!.closest('[aria-hidden="true"]'), "the draft's region is hidden from screen readers").toBeNull();
      expect(el, "the draft shares the region for others' changes").not.toBe(doc.getElementById("news"));
      return el!;
    };
    afterEach(() => vi.useRealTimers());

    localOnly("says the prediction once typing pauses, once, not per key", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers(); // after the network: fake timers stall fetch
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const region = draftRegion(doc);
      expect(region.textContent?.trim(), "the draft's region speaks on load").toBe("");
      const said: string[] = [];
      new doc.defaultView!.MutationObserver(() => { const t = region.textContent?.trim(); if (t) said.push(t); }).observe(region, { childList: true, characterData: true, subtree: true });
      const { position, word } = positionsOf(doc)[4];
      slot(doc, position).input.focus();
      for (const typed of ["h", "ho", "hol", "holl", "hollo", "hollow"]) { type(doc, position, typed); vi.advanceTimersByTime(150); }
      expect(said, "spoke while still typing").toEqual([]);
      vi.advanceTimersByTime(DRAFT_MS);
      await Promise.resolve();
      expect(said).toEqual([foreseen({ position, word, draft: "hollow" })]);
      // an emptied field says nothing more
      type(doc, position, "");
      vi.advanceTimersByTime(DRAFT_MS * 2);
      await Promise.resolve();
      expect(said, "an emptied field spoke").toHaveLength(1);
    });

    localOnly("says once that the word was replaced by someone else, and leaves the draft alone", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers(); // after the network: fake timers stall fetch
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const { position, version, word } = positionsOf(doc)[4];
      slot(doc, position).input.focus();
      type(doc, position, "hollow");
      vi.advanceTimersByTime(DRAFT_MS);
      const now = fresh();
      page.applyChange({ position, word: now, version: version + 1 });
      vi.advanceTimersByTime(DRAFT_MS);
      expect(draftRegion(doc).textContent?.trim()).toBe(foreseen({ position, word, draft: "hollow", now }));
      expect(slot(doc, position).input.value, "the news touched the draft").toBe("hollow");
      expect(slot(doc, position).version.value, "the draft's version moved").toBe(String(version));
    });

    localOnly("stays silent on a snapshot or reconnect", async () => {
      const doc = await (await arrive()).page("/");
      vi.useFakeTimers(); // after the network: fake timers stall fetch
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      page.applySnapshot(snapshotOf(doc));
      vi.advanceTimersByTime(DRAFT_MS * 3);
      expect(draftRegion(doc).textContent?.trim(), "a snapshot spoke in the draft's region").toBe("");
    });
  });

  describe("the Earlier link", () => {
    localOnly("stays the sentence just before now, moving once per newer change", async () => {
      const doc = await pageWithHistory();
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      const total = deriveTotal(positionsOf(doc));
      expect(earlier(doc)).toBe(`?at=${total - 1}`);
      const [a, b] = positionsOf(doc);

      page.applyChange({ position: a.position, word: fresh(), version: a.version + 1 });
      expect(earlier(doc), "a newer change didn't move the Earlier link").toBe(`?at=${total}`);

      page.applyChange({ position: a.position, word: fresh(), version: a.version + 1 }); // duplicate
      page.applyChange({ position: a.position, word: fresh(), version: a.version }); // stale
      expect(earlier(doc), "a duplicate or stale change moved the Earlier link").toBe(`?at=${total}`);

      // held back by a draft, but still a change to the shared sentence
      type(doc, b.position, "mydraft");
      page.applyChange({ position: b.position, word: fresh(), version: b.version + 1 });
      expect(earlier(doc), "a change held back by a draft didn't move the Earlier link").toBe(`?at=${total + 1}`);
    });

    localOnly("appears with the first change, once, pointing at the starting sentence", async () => {
      const doc = await (await arrive()).page("/");
      asIfNoChanges(doc);
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));
      expect(doc.querySelectorAll('a[rel~="prev"]').length, "a sentence with no changes has an Earlier link").toBe(0);
      const [a, b] = positionsOf(doc);

      page.applyChange({ position: a.position, word: fresh(), version: 2 });

      const links = () => [...doc.querySelectorAll<HTMLAnchorElement>('a[rel~="prev"]')];
      expect(links().length, "the first change didn't add an Earlier link").toBe(1);
      expect(links()[0].getAttribute("href")).toBe("?at=0");
      const [link] = links();
      const readme = doc.querySelector('a[href="/readme/"]')!;
      expect(link.closest("main"), "the Earlier link isn't on the page's main content").not.toBeNull();
      expect(link.closest('form, section, [aria-hidden="true"]'), "the Earlier link sits inside a word or the trace").toBeNull();
      expect(
        link.compareDocumentPosition(readme) & doc.defaultView!.Node.DOCUMENT_POSITION_FOLLOWING,
        "the Earlier link isn't where GET / puts it, before the link to the README",
      ).toBeTruthy();

      page.applyChange({ position: a.position, word: fresh(), version: 2 }); // duplicate
      page.applyChange({ position: a.position, word: fresh(), version: 1 }); // stale
      expect(links().length, "a duplicate or stale change added an Earlier link").toBe(1);
      expect(links()[0].getAttribute("href")).toBe("?at=0");

      page.applyChange({ position: b.position, word: fresh(), version: 2 });
      expect(links().length, "a later change added a second Earlier link").toBe(1);
      expect(links()[0], "a later change replaced the Earlier link instead of moving it").toBe(link);
      expect(link.getAttribute("href")).toBe("?at=1");
    });

    localOnly("is recomputed from a reconnect snapshot's versions, not from events seen", async () => {
      const doc = await pageWithHistory();
      const page = attach(doc);
      page.applySnapshot(snapshotOf(doc));

      // three changes this page never heard about
      const positions = positionsOf(doc).map((p, i) => (i < 3 ? { ...p, word: fresh(), version: p.version + 1 } : p));
      page.applySnapshot({ positions, trace: null });

      expect(earlier(doc), "the Earlier link wasn't recomputed from the snapshot").toBe(
        `?at=${deriveTotal(positions) - 1}`,
      );
    });
  });

  localOnly("keeps the screen-reader summary the whole current sentence, drafts or not", async () => {
    const doc = await (await arrive()).page("/");
    const page = attach(doc);
    page.applySnapshot(snapshotOf(doc));
    const [a, b, c] = positionsOf(doc);
    const words = positionsOf(doc).map((p) => p.word);
    expect(summary(doc)).toContain(sentence(words));
    type(doc, b.position, "mydraft");

    page.applyChange({ position: a.position, word: MARKUP, version: a.version + 1 });
    words[a.position] = MARKUP;
    expect(summary(doc), "the summary doesn't read the sentence after a change").toContain(sentence(words));
    expect(doc.querySelector("x-theseus"), "the new word became markup").toBeNull();

    // the visitor's draft is kept, but the shared sentence still changed
    const bNew = fresh();
    page.applyChange({ position: b.position, word: bNew, version: b.version + 1 });
    words[b.position] = bNew;
    expect(summary(doc), "the summary hides a change held back by a draft").toContain(sentence(words));
    expect(slot(doc, b.position).input.value).toBe("mydraft");

    page.applyChange({ position: a.position, word: fresh(), version: a.version + 1 }); // duplicate
    page.applyChange({ position: a.position, word: fresh(), version: a.version }); // stale
    expect(summary(doc), "a duplicate or stale change altered the summary").toContain(sentence(words));

    const cNew = fresh();
    const positions = positionsOf(doc).map((p) => ({
      ...p,
      word: words[p.position],
      version: p.position === a.position ? a.version + 1 : p.position === b.position ? b.version + 1 : p.version,
    }));
    positions[c.position] = { ...positions[c.position], word: cNew, version: c.version + 1 };
    words[c.position] = cNew;
    page.applySnapshot({ positions, trace: null });
    expect(summary(doc), "the summary doesn't read a reconnect snapshot's sentence").toContain(sentence(words));
  });

  localOnly("reconciles a reconnect snapshot position by position, keeping drafts and never going back", async () => {
    const doc = await (await arrive()).page("/");
    const page = attach(doc);
    page.applySnapshot(snapshotOf(doc));
    const [a, b, c, d] = positionsOf(doc);
    const aNow = fresh();
    page.applyChange({ position: a.position, word: aNow, version: a.version + 2 });
    expect(labelWord(doc, a.position), "setup: a newer change wasn't applied").toBe(aNow);
    type(doc, b.position, "mydraft");

    const bNew = fresh();
    const cNew = fresh();
    page.applySnapshot({
      positions: positionsOf(doc).map((p) =>
        p.position === a.position
          ? { ...p, word: fresh(), version: a.version + 1 } // older than shown
          : p.position === b.position
            ? { ...p, word: bNew, version: b.version + 1 } // newer, under a draft
            : p.position === c.position
              ? { ...p, word: cNew, version: c.version + 1 } // newer
              : p, // d: unchanged
      ),
      trace: null,
    });

    expect(labelWord(doc, a.position), "a snapshot moved a position backwards").toBe(aNow);
    expect(slot(doc, a.position).version.value).toBe(String(a.version + 2));
    expect(slot(doc, b.position).input.value, "a snapshot touched a draft").toBe("mydraft");
    expect(slot(doc, b.position).version.value).toBe(String(b.version));
    expect(notice(doc, b.position, bNew), "the change under the draft wasn't noticed").not.toBeNull();
    expect(labelWord(doc, c.position), "a newer snapshot position wasn't applied").toBe(cNew);
    expect(slot(doc, c.position).version.value).toBe(String(c.version + 1));
    expect(labelWord(doc, d.position)).toBe(d.word);
  });

  // GET / opens the realtime stream and GET /?at=N doesn't. Scripts are
  // checked for the stream itself, wherever the build puts them, so an
  // unrelated script can't trip this.
  localOnly("wires only the current sentence to the realtime stream, never an earlier form", async () => {
    const v = await arrive();
    const opensStream = async (path: string) => {
      const doc = new JSDOM(await v.html(path)).window.document;
      const code: string[] = [];
      for (const script of doc.querySelectorAll("script")) {
        const src = script.getAttribute("src");
        if (!src) code.push(script.textContent ?? "");
        else if (new URL(src, baseUrl).origin === new URL(baseUrl).origin) code.push(await v.html(new URL(src, baseUrl).pathname));
      }
      return code.some((c) => c.includes("/events"));
    };

    expect(await opensStream("/"), "GET / doesn't open the realtime stream").toBe(true);
    expect(await opensStream("/?at=0"), "an earlier form opens the realtime stream").toBe(false);
  });
});
