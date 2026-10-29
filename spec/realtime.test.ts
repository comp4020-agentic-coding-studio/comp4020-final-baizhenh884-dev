import { JSDOM } from "jsdom";
import { afterEach, describe, expect, inject, it } from "vitest";
import { parseSnapshot } from "../src/lib/live-client";

// Crit 9's realtime contract, checked over HTTP against the running app (see
// CLAUDE.md "Product contract" and docs/decisions/0001-live-present-frozen-past.md).
//
// The transport contract these checks rely on:
//   GET /events       a text/event-stream for the current sentence, sent with
//                     the visitor cookie. Its first event is `snapshot`:
//                       { positions: [{ position, word, version }, ...],
//                         trace: null | { position, word, standing, now? },
//                         keptShip: { words: string[10], gaps: boolean[10],
//                                     next: (string | null)[10] } }
//                     read from SQLite when the connection opens, so a fresh
//                     connection is always current truth. After it, each
//                     successful replacement anywhere arrives as `change`:
//                       { position, word, version, keptShip }
//                     with the position's new version. The kept ship
//                     (docs/decisions/0003-settle-and-kept-ships.md) is global,
//                     not per-visitor, so — unlike the visitor's own trace,
//                     which needs a follow-up snapshot — it rides on every
//                     change event itself: every open stream already gets
//                     every change, and the kept ship changes on every one.
//                     Nothing else rides along: no visitor ids, times, counts
//                     or feed data.
//
// A client applies an update to a position only if its version is newer than
// the one it shows, so a replacement that appears in both the snapshot and a
// change event is harmless; what must never happen is that it appears in
// neither.
//
// Every check here runs only against a local app: most replace a word, and
// even the read-only ones exist to test the working tree, not the deploy.

const baseUrl = inject("baseUrl");
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(baseUrl).hostname);
const localOnly = (name: string, fn: () => Promise<void>, timeout?: number) =>
  it.skipIf(!local)(local ? name : `${name} [skipped: APP_URL is not local]`, fn, timeout);

// Which trace shape the wire carries depends on rules.mode
// (docs/decisions/0003-settle-and-kept-ships.md): under `once`, the existing
// single Trace; under `settle`, the richer { latest, otherStanding,
// otherReplaced } shape (spec/trace.test.ts covers its rendering; this file
// only pins the wire shape). Gated from the test runner's own RULE_MODE env,
// the same way spec/eligibility.test.ts gates — never probed from the
// response itself. CI always sets RULE_MODE explicitly (checks.yml runs both
// passes), so an unset RULE_MODE there is a real failure, not a skip.
const inCI = !!process.env.CI;
const settleModeReady = local && process.env.RULE_MODE === "settle";
if (local && inCI && !process.env.RULE_MODE) {
  throw new Error("RULE_MODE must be 'once' or 'settle' in CI, never unset: checks.yml runs both passes explicitly");
}
const settleOnly = (name: string, fn: () => Promise<void>, timeout?: number) =>
  it.skipIf(!settleModeReady)(settleModeReady ? name : `${name} [skipped: not settle mode]`, fn, timeout);

const settleSecondsEnv = Number(process.env.SETTLE_SECONDS ?? 300);
const settleByAgeOnly = (name: string, fn: () => Promise<void>, timeout?: number) => {
  if (!settleModeReady) return it.skip(`${name} [skipped: not settle mode]`, fn, timeout);
  if (settleSecondsEnv <= 10) return it(name, fn, timeout);
  if (inCI) {
    return it(`${name} [SETTLE_SECONDS too long for CI]`, () => {
      throw new Error("SETTLE_SECONDS must be short (checks.yml sets 3) so this can actually wait it out in CI");
    });
  }
  return it.skip(`${name} [skipped: SETTLE_SECONDS is too long to wait out here]`, fn, timeout);
};

const CONNECT_MS = 2000; // headers and the opening snapshot, not the realtime requirement
const LIVE_MS = 1000; // "within about a second" of the replacement succeeding

const POSITION_KEYS = ["position", "version", "word"];
const SNAPSHOT_KEYS = ["keptShip", "positions", "trace"];
// a change event carries the kept ship too (it's global, not per-visitor, so
// every open stream needs it on every change — no follow-up snapshot)
const CHANGE_KEYS = ["keptShip", "position", "version", "word"];
const KEPT_SHIP_KEYS = ["gaps", "next", "words"];
// keysOf sorts, so these are alphabetical, not declaration order
const TRACE_KEYS = settleModeReady ? ["latest", "otherReplaced", "otherStanding"] : ["now", "position", "standing", "word"];
const HOLDING_LATEST_KEYS = ["position", "settled", "settlesInMs", "standing", "word"];
const STANDING_ITEM_KEYS = ["position", "word"];
// "kept": where the replaced word is kept, against the ship shown (shown | later | earlier), never a number
const REPLACED_ITEM_KEYS = ["kept", "now", "position", "word"];

type Slot = { position: number; version: number; word: string };
type Frame = { event: string; data: unknown };

class Visitor {
  private cookies = new Map<string, string>();

  private remember(res: Response): void {
    for (const header of res.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return { ...(cookie ? { cookie } : {}), ...extra };
  }

  async page(path = "/"): Promise<{ status: number; doc: Document }> {
    const res = await fetch(new URL(path, baseUrl), { headers: this.headers(), redirect: "manual" });
    this.remember(res);
    return { status: res.status, doc: new JSDOM(await res.text()).window.document };
  }

  async sentence(): Promise<Slot[]> {
    const { status, doc } = await this.page("/");
    expect(status, "GET /").toBe(200);
    return [...doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')].map((form) => {
      const value = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
      return {
        position: Number(value("position")),
        version: Number(value("version")),
        word: form.querySelector("label")?.textContent?.trim() ?? "",
      };
    });
  }

  async replace(slot: Pick<Slot, "position" | "version">, word: string): Promise<number> {
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
  await v.page("/");
  return v;
}

let n = 0;
const unused = (all: Slot[]): string => {
  let word: string;
  do {
    word = `live${Date.now().toString(36)}${(n++).toString(36)}`.replace(/\d/g, (d) => "abcdefghij"[+d]);
  } while (all.some((s) => s.word === word));
  return word;
};

const at = (all: Slot[], position: number): Slot => {
  const slot = all.find((s) => s.position === position);
  expect(slot, `no word position ${position}`).toBeDefined();
  return slot!;
};

// An open GET /events, parsed into frames as they arrive. Every wait is
// bounded, and afterEach closes whatever a check left open, pass or fail.
const open = new Set<Stream>();

class Stream {
  readonly frames: Frame[] = [];
  private waiting: (() => void)[] = [];
  private ended = false;

  constructor(
    body: ReadableStream<Uint8Array>,
    private controller: AbortController,
  ) {
    open.add(this);
    void this.pump(body);
  }

  private async pump(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let event = "";
    let data: string[] = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          if (line === "") {
            if (data.length > 0) this.push(event || "message", data.join("\n"));
            event = "";
            data = [];
          } else if (!line.startsWith(":")) {
            const colon = line.indexOf(":");
            const field = colon === -1 ? line : line.slice(0, colon);
            const raw = colon === -1 ? "" : line.slice(colon + 1);
            const val = raw.startsWith(" ") ? raw.slice(1) : raw;
            if (field === "event") event = val;
            else if (field === "data") data.push(val);
          }
        }
      }
    } catch {
      // aborted by close()
    } finally {
      this.ended = true;
      this.wake();
    }
  }

  private push(event: string, raw: string): void {
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // left as text; the checks on its shape will say so
    }
    this.frames.push({ event, data });
    this.wake();
  }

  private wake(): void {
    const waiting = this.waiting;
    this.waiting = [];
    for (const resume of waiting) resume();
  }

  async waitFor(match: (f: Frame) => boolean, ms: number, what: string): Promise<Frame> {
    const deadline = Date.now() + ms;
    for (;;) {
      const hit = this.frames.find(match);
      if (hit) return hit;
      const left = deadline - Date.now();
      if (left <= 0 || this.ended) {
        throw new Error(`no ${what} within ${ms} ms${this.ended ? " (the stream ended)" : ""}`);
      }
      await new Promise<void>((resume) => {
        const timer = setTimeout(resume, left);
        this.waiting.push(() => {
          clearTimeout(timer);
          resume();
        });
      });
    }
  }

  // the opening frame, which must be the snapshot
  async snapshot(): Promise<Snapshot> {
    await this.waitFor(() => true, CONNECT_MS, "first event on GET /events");
    const first = this.frames[0];
    expect(first.event, "the first event on GET /events isn't a snapshot").toBe("snapshot");
    return asSnapshot(first.data);
  }

  close(): void {
    this.controller.abort();
    open.delete(this);
  }
}

afterEach(() => {
  for (const stream of open) stream.close();
});

async function connect(v: Visitor): Promise<Stream> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECT_MS);
  let res: Response;
  try {
    res = await fetch(new URL("/events", baseUrl), {
      headers: v.headers({ accept: "text/event-stream" }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const type = res.headers.get("content-type") ?? "";
  if (res.status !== 200 || !type.startsWith("text/event-stream")) controller.abort();
  expect(res.status, "GET /events doesn't open a realtime stream").toBe(200);
  expect(type, "GET /events isn't text/event-stream").toMatch(/^text\/event-stream/);
  return new Stream(res.body!, controller);
}

type KeptShip = { words: string[]; gaps: boolean[]; next: (string | null)[] };
type Snapshot = { positions: Slot[]; trace: Record<string, unknown> | null; keptShip: KeptShip };

const keysOf = (value: unknown) => Object.keys(value as object).sort();

function asKeptShip(data: unknown): KeptShip {
  expect(data, "keptShip isn't a JSON object").toBeTypeOf("object");
  expect(keysOf(data), "keptShip isn't exactly { words, gaps, next }").toEqual(KEPT_SHIP_KEYS);
  const { words, gaps, next } = data as { words: unknown; gaps: unknown; next: unknown };
  expect(Array.isArray(words) && words.length === 10, "keptShip.words isn't ten words").toBe(true);
  expect(Array.isArray(gaps) && gaps.length === 10, "keptShip.gaps isn't ten booleans").toBe(true);
  for (const w of words as unknown[]) expect(typeof w, "a kept-ship word isn't a string").toBe("string");
  for (const g of gaps as unknown[]) expect(typeof g, "a kept-ship gap flag isn't a boolean").toBe("boolean");
  // the next house's waiting words (decided 29 October): a word or null at each place, derived, never stored
  expect(Array.isArray(next) && next.length === 10, "keptShip.next isn't ten places").toBe(true);
  for (const w of next as unknown[]) expect(w === null || typeof w === "string", "a waiting word isn't a string or null").toBe(true);
  return { words: words as string[], gaps: gaps as boolean[], next: next as (string | null)[] };
}

function asSnapshot(data: unknown): Snapshot {
  expect(data, "the snapshot isn't a JSON object").toBeTypeOf("object");
  expect(keysOf(data), "the snapshot isn't exactly { positions, trace, keptShip }").toEqual(SNAPSHOT_KEYS);
  const { positions, trace, keptShip } = data as { positions: unknown; trace: unknown; keptShip: unknown };
  expect(Array.isArray(positions), "the snapshot has no positions list").toBe(true);
  for (const p of positions as unknown[]) {
    expect(keysOf(p), "a snapshot position carries more than position, word and version").toEqual(POSITION_KEYS);
  }
  if (trace != null) {
    expect(TRACE_KEYS, "the snapshot's trace carries more than the visitor's own word").toEqual(
      expect.arrayContaining(keysOf(trace)),
    );
  }
  return {
    positions: (positions as Slot[]).map((p) => ({ position: Number(p.position), version: Number(p.version), word: p.word })),
    trace: trace as Record<string, unknown> | null,
    keptShip: asKeptShip(keptShip),
  };
}

function asChange(frame: Frame): Slot & { keptShip: KeptShip } {
  expect(keysOf(frame.data), "a change carries more than position, word, version and keptShip").toEqual(CHANGE_KEYS);
  const d = frame.data as Slot & { keptShip: unknown };
  return { position: Number(d.position), version: Number(d.version), word: d.word, keptShip: asKeptShip(d.keptShip) };
}

const changeAt = (position: number, version: number) => (f: Frame) =>
  f.event === "change" && Number((f.data as Slot)?.position) === position && Number((f.data as Slot)?.version) >= version;

describe("Theseus realtime", () => {
  localOnly("opens with a snapshot of the current sentence and nothing more", async () => {
    const bea = await arrive();
    const now = await bea.sentence();

    const snapshot = await (await connect(bea)).snapshot();

    expect(
      [...snapshot.positions].sort((a, b) => a.position - b.position),
      "the snapshot isn't the sentence GET / shows",
    ).toEqual(now);
    expect(snapshot.trace, "a visitor who hasn't changed anything gets a trace").toBeNull();
  });

  // The kept ship (docs/decisions/0003-settle-and-kept-ships.md) is global, so
  // every open stream carries it on every change, live — not only in a
  // follow-up snapshot the way a visitor's own trace does. Mode-agnostic.
  localOnly("delivers the updated kept ship on every change, to every open stream, without a reconnect", async () => {
    const bea = await arrive();
    const stream = await connect(bea);
    await stream.snapshot();

    const ann = await arrive();
    const before = await ann.sentence();
    const slot = before[0];
    const word = unused(before);
    expect(await ann.replace(slot, word)).toBe(303);

    const frame = await stream.waitFor(changeAt(slot.position, slot.version + 1), LIVE_MS, "change event for the replacement");
    const delivered = asChange(frame).keptShip;

    // what a brand-new connection sees right now must be exactly the same
    // derived truth: the live delivery is never stale or out of step with a
    // fresh read of the same state.
    const fresh = await (await connect(bea)).snapshot();
    expect(delivered, "the kept ship delivered live isn't what a fresh read of the same state shows").toEqual(fresh.keptShip);
  });

  // once-mode wire shape only: under settle mode the trace carries { latest,
  // otherStanding, otherReplaced } instead, covered by its own tests below.
  const onceOnly = (name: string, fn: () => Promise<void>, timeout?: number) =>
    it.skipIf(!local || settleModeReady)(local && !settleModeReady ? name : `${name} [skipped: not once mode]`, fn, timeout);

  onceOnly("includes the visitor's own trace in their snapshot", async () => {
    const bea = await arrive();
    const slot = (await bea.sentence())[0];
    const word = unused(await bea.sentence());
    expect(await bea.replace(slot, word)).toBe(303);

    const snapshot = await (await connect(bea)).snapshot();

    expect(snapshot.trace, "a visitor who has made their change gets no trace").not.toBeNull();
    expect(snapshot.trace).toMatchObject({ position: slot.position, word, standing: true });
  });

  settleOnly("includes the visitor's own trace, with a settle timer, in their snapshot", async () => {
    const bea = await arrive();
    const slot = (await bea.sentence())[0];
    const word = unused(await bea.sentence());
    expect(await bea.replace(slot, word)).toBe(303);

    const snapshot = await (await connect(bea)).snapshot();

    expect(snapshot.trace, "a visitor who has made their change gets no trace").not.toBeNull();
    expect(keysOf(snapshot.trace), "the settle-mode snapshot trace isn't { latest, otherStanding, otherReplaced }").toEqual(TRACE_KEYS);
    const latest = (snapshot.trace as { latest: Record<string, unknown> }).latest;
    expect(keysOf(latest), "a holding latest isn't exactly position/settled/settlesInMs/standing/word").toEqual(HOLDING_LATEST_KEYS);
    expect(latest).toMatchObject({ position: slot.position, word, standing: true, settled: false });
    expect(latest.settlesInMs, "a freshly-placed word's settlesInMs isn't a positive number").toBeTypeOf("number");
    expect(latest.settlesInMs as number).toBeGreaterThan(0);
    // the page's own reader must accept what the server sends, or an open page
    // drops the trace and its local settle timer never runs (src/lib/live-client.ts)
    expect(Number.isInteger(latest.settlesInMs), `settlesInMs isn't whole milliseconds (${latest.settlesInMs})`).toBe(true);
    expect(parseSnapshot(JSON.stringify(snapshot))?.trace, "the page's own reader drops the server's settle-mode trace").toEqual(snapshot.trace);
  });

  localOnly("delivers a successful replacement to another open session within about a second", async () => {
    const bea = await arrive();
    const stream = await connect(bea);
    await stream.snapshot();

    const ann = await arrive();
    const before = await ann.sentence();
    const slot = before[0];
    const word = unused(before);
    expect(await ann.replace(slot, word)).toBe(303);

    const frame = await stream.waitFor(changeAt(slot.position, slot.version + 1), LIVE_MS, "change event for the replacement");
    const change = asChange(frame);
    expect(change).toMatchObject({ position: slot.position, word, version: slot.version + 1 });
    expect(change.keptShip.words, "the change's kept ship isn't ten words").toHaveLength(10);
    expect(change.keptShip.gaps, "the change's kept ship isn't ten gap flags").toHaveLength(10);
  });

  onceOnly("catches up on reconnect: a change made while disconnected is in the next snapshot", async () => {
    const bea = await arrive();
    const before = await bea.sentence();
    const mine = before[0];
    const beas = unused(before);
    expect(await bea.replace(mine, beas)).toBe(303);

    const first = await connect(bea);
    expect((await first.snapshot()).trace).toMatchObject({ position: mine.position, word: beas, standing: true });
    first.close();

    // while bea is disconnected, ann replaces bea's word
    const ann = await arrive();
    const now = await ann.sentence();
    const anns = unused(now);
    const target = at(now, mine.position);
    expect(await ann.replace(target, anns)).toBe(303);

    const again = await (await connect(bea)).snapshot();
    expect(at(again.positions, mine.position), "the reconnected snapshot misses the change").toEqual({
      position: mine.position,
      word: anns,
      version: target.version + 1,
    });
    expect(again.trace, "the reconnected trace doesn't say bea's word was replaced").toMatchObject({
      position: mine.position,
      word: beas,
      standing: false,
      now: anns,
    });
  });

  settleOnly("catches up on reconnect, settle mode: a change made while disconnected is in the next snapshot's trace", async () => {
    const bea = await arrive();
    const before = await bea.sentence();
    const mine = before[0];
    const beas = unused(before);
    expect(await bea.replace(mine, beas)).toBe(303);

    const first = await connect(bea);
    const firstSnapshot = await first.snapshot();
    const firstTrace = firstSnapshot.trace as { latest: Record<string, unknown> };
    expect(firstTrace.latest).toMatchObject({ position: mine.position, word: beas, standing: true });
    first.close();

    // while bea is disconnected, ann replaces bea's word
    const ann = await arrive();
    const now = await ann.sentence();
    const anns = unused(now);
    const target = at(now, mine.position);
    expect(await ann.replace(target, anns)).toBe(303);

    const again = await (await connect(bea)).snapshot();
    expect(at(again.positions, mine.position), "the reconnected snapshot misses the change").toEqual({
      position: mine.position,
      word: anns,
      version: target.version + 1,
    });
    const againTrace = again.trace as { latest: Record<string, unknown> };
    expect(againTrace.latest, "the reconnected trace doesn't say bea's word was replaced").toMatchObject({
      position: mine.position,
      word: beas,
      standing: false,
      now: anns,
    });
    expect(["shown", "later", "earlier"], "a replaced latest doesn't say where it's kept").toContain(againTrace.latest.kept);
  });

  settleByAgeOnly(
    "carries otherStanding and otherReplaced entries over the wire, each shaped correctly",
    async () => {
      const bea = await arrive();
      const before = await bea.sentence();
      const first = at(before, 0);
      const firstWord = unused(before); // stays untouched by bea; replaced by someone else at the end → otherReplaced
      expect(await bea.replace(first, firstWord)).toBe(303);

      await new Promise((resolve) => setTimeout(resolve, (settleSecondsEnv + 1) * 1000));

      const now = await bea.sentence();
      expect(at(now, 0).word, "setup: the first word was replaced by someone else, not left to settle").toBe(firstWord);
      const secondWord = unused(now); // never replaced or re-touched → stays otherStanding
      expect(await bea.replace(at(now, 1), secondWord)).toBe(303);

      await new Promise((resolve) => setTimeout(resolve, (settleSecondsEnv + 1) * 1000));

      const now2 = await bea.sentence();
      expect(at(now2, 1).word, "setup: the second word was replaced by someone else, not left to settle").toBe(secondWord);
      const third = at(now2, 2);
      const thirdWord = unused(now2); // bea's latest
      expect(await bea.replace(third, thirdWord)).toBe(303);

      // someone replaces bea's first word (not bea's latest), so it moves
      // from otherStanding to otherReplaced
      const carol = await arrive();
      const replacement = unused(await carol.sentence());
      expect(await carol.replace(at(await carol.sentence(), 0), replacement)).toBe(303);

      const snapshot = await (await connect(bea)).snapshot();
      const trace = snapshot.trace as { otherStanding: unknown[]; otherReplaced: unknown[] };
      const standing = trace.otherStanding.find((s) => (s as { position: number }).position === 1) as Record<string, unknown>;
      expect(standing, "the second word isn't in otherStanding").toBeDefined();
      expect(keysOf(standing), "a standing item carries more than position and word").toEqual(STANDING_ITEM_KEYS);
      expect(standing).toEqual({ position: 1, word: secondWord });

      const replaced = trace.otherReplaced.find((r) => (r as { position: number }).position === 0) as Record<string, unknown>;
      expect(replaced, "the first word isn't in otherReplaced").toBeDefined();
      expect(keysOf(replaced), "a replaced item isn't exactly position, word, now and kept").toEqual(REPLACED_ITEM_KEYS);
      expect(["shown", "later", "earlier"], "a replaced item's kept isn't shown, later or earlier").toContain(replaced.kept);
      expect(replaced).toMatchObject({ position: 0, word: firstWord, now: replacement });
    },
    20_000,
  );

  // The same visitor in two tabs: change events carry no trace, so an open
  // stream learns its own visitor's trace from a fresh snapshot, sent only to
  // that connection whenever its trace changes.
  onceOnly("keeps an open stream's own trace current when it changes elsewhere", async () => {
    const ann = await arrive();
    const stream = await connect(ann);
    expect((await stream.snapshot()).trace, "ann hasn't changed anything yet").toBeNull();
    const opening = stream.frames[0];
    const refreshed = (standing: boolean) => (f: Frame) =>
      f !== opening && f.event === "snapshot" && (f.data as Snapshot)?.trace?.standing === standing;

    // ann's own change, from another tab: same cookie, another request
    const before = await ann.sentence();
    const mine = before[0];
    const anns = unused(before);
    expect(await ann.replace(mine, anns)).toBe(303);
    await stream.waitFor(changeAt(mine.position, mine.version + 1), LIVE_MS, "change event for ann's replacement");
    const standing = asSnapshot(
      (await stream.waitFor(refreshed(true), LIVE_MS, "snapshot bringing ann's own new trace")).data,
    );
    expect(standing.trace).toEqual({ position: mine.position, word: anns, standing: true });
    expect([...standing.positions].sort((a, b) => a.position - b.position), "the snapshot isn't current truth").toEqual(
      await ann.sentence(),
    );

    // someone else replaces ann's word
    const bob = await arrive();
    const now = await bob.sentence();
    const bobs = unused(now);
    expect(await bob.replace(at(now, mine.position), bobs)).toBe(303);
    const replaced = asSnapshot(
      (await stream.waitFor(refreshed(false), LIVE_MS, "snapshot saying ann's word was replaced")).data,
    );
    expect(replaced.trace).toEqual({ position: mine.position, word: anns, standing: false, now: bobs });
    expect(at(replaced.positions, mine.position)).toEqual(at(await ann.sentence(), mine.position));
  });

  settleOnly("keeps an open stream's own trace current when it changes elsewhere, settle mode", async () => {
    const ann = await arrive();
    const stream = await connect(ann);
    expect((await stream.snapshot()).trace, "ann hasn't changed anything yet").toBeNull();
    const opening = stream.frames[0];
    const latestOf = (f: Frame) => (f.data as { trace: { latest?: Record<string, unknown> } } | undefined)?.trace?.latest;
    const refreshed = (standing: boolean) => (f: Frame) =>
      f !== opening && f.event === "snapshot" && latestOf(f)?.standing === standing;

    // ann's own change, from another tab: same cookie, another request
    const before = await ann.sentence();
    const mine = before[0];
    const anns = unused(before);
    expect(await ann.replace(mine, anns)).toBe(303);
    await stream.waitFor(changeAt(mine.position, mine.version + 1), LIVE_MS, "change event for ann's replacement");
    const standingFrame = await stream.waitFor(refreshed(true), LIVE_MS, "snapshot bringing ann's own new trace");
    expect(latestOf(standingFrame)).toMatchObject({ position: mine.position, word: anns, standing: true });

    // someone else replaces ann's word
    const bob = await arrive();
    const now = await bob.sentence();
    const bobs = unused(now);
    expect(await bob.replace(at(now, mine.position), bobs)).toBe(303);
    const replacedFrame = await stream.waitFor(refreshed(false), LIVE_MS, "snapshot saying ann's word was replaced");
    expect(latestOf(replacedFrame)).toMatchObject({ position: mine.position, word: anns, standing: false, now: bobs });
  });

  // Passes before and after the refresh exists: it guards against sending
  // one for every change.
  localOnly("sends no extra snapshot for a change that leaves the stream's own trace alone", async () => {
    const ann = await arrive();
    const before = await ann.sentence();
    expect(await ann.replace(before[0], unused(before))).toBe(303);
    const stream = await connect(ann);
    expect((await stream.snapshot()).trace).not.toBeNull();

    const elsewhere = (await ann.sentence())[1];
    const carol = await arrive();
    expect(await carol.replace(elsewhere, unused(await carol.sentence()))).toBe(303);
    // a later change, so anything sent for carol's would have arrived first
    const dave = await arrive();
    const last = at(await dave.sentence(), elsewhere.position);
    expect(await dave.replace(last, unused(await dave.sentence()))).toBe(303);
    await stream.waitFor(changeAt(last.position, last.version + 1), LIVE_MS, "dave's change");

    expect(stream.frames.filter((f) => f.event === "snapshot").length, "a change elsewhere sent another snapshot").toBe(1);
  });

  // The proof is the ordering on the server (subscribe, then read SQLite, with
  // nothing in between); these trials only exercise it under whatever
  // interleavings happen to occur.
  localOnly(
    "never loses a replacement made while a connection is opening",
    async () => {
      for (let trial = 0; trial < 10; trial++) {
        const ann = await arrive();
        const bea = await arrive();
        const before = await ann.sentence();
        const slot = before[trial % before.length];
        const word = unused(before);
        const target = slot.version + 1;

        const [stream, status] = await Promise.all([connect(bea), ann.replace(slot, word)]);
        expect(status, `trial ${trial}: the replacement didn't succeed`).toBe(303);
        const snapshot = await stream.snapshot();
        let shown = at(snapshot.positions, slot.position).version;
        if (shown < target) {
          await stream.waitFor(
            changeAt(slot.position, target),
            LIVE_MS,
            `trial ${trial}: the replacement, in neither the snapshot nor a change event`,
          );
        }

        // replay what arrived with the client's rule: apply only a newer version
        for (const frame of stream.frames.slice(1)) {
          if (frame.event !== "change") continue;
          const change = asChange(frame);
          if (change.position !== slot.position) continue;
          const next = change.version > shown ? change.version : shown;
          expect(next, `trial ${trial}: reconciling moved the version backwards`).toBeGreaterThanOrEqual(shown);
          shown = next;
        }
        stream.close();

        const truth = at(await ann.sentence(), slot.position).version;
        expect(shown, `trial ${trial}: the reconciled version isn't the current one`).toBe(truth);
        expect(truth).toBe(target);
      }
    },
    30_000,
  );

  // Already true of Crit 8: pinned here because the live page's Earlier link
  // will be derived from position versions instead of a count from the server.
  localOnly("derives the number of changes from position versions alone", async () => {
    const ann = await arrive();
    const before = await ann.sentence();
    const total = (all: Slot[]) => all.reduce((sum, s) => sum + (s.version - 1), 0);
    expect(await ann.replace(before[0], unused(before))).toBe(303);

    const after = await ann.sentence();
    const count = total(after);
    expect(count, "one replacement didn't add exactly one version").toBe(total(before) + 1);
    expect((await ann.page(`/?at=${count}`)).status, "the derived count is more than the real one").toBe(200);
    expect((await ann.page(`/?at=${count + 1}`)).status, "the derived count is less than the real one").toBe(404);

    const { doc } = await ann.page(`/?at=${count - 1}`);
    const text = (doc.body.textContent ?? "").replace(/\s+/g, " ");
    expect(text, "?at=count-1 isn't the sentence just before the latest change").toContain(
      `${before.map((s) => s.word).join(" ")}.`,
    );
    const prev = (await ann.page("/")).doc.querySelector('a[rel~="prev"]')?.getAttribute("href");
    expect(prev, "GET /'s Earlier link isn't the derived previous form").toBe(`?at=${count - 1}`);
  });
});
