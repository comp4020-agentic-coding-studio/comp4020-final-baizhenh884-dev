import { JSDOM } from "jsdom";
import { afterEach, describe, expect, inject, it } from "vitest";

// Crit 9's realtime contract, checked over HTTP against the running app (see
// CLAUDE.md "Product contract" and docs/decisions/0001-live-present-frozen-past.md).
//
// The transport contract these checks rely on:
//   GET /events       a text/event-stream for the current sentence, sent with
//                     the visitor cookie. Its first event is `snapshot`:
//                       { positions: [{ position, word, version }, ...],
//                         trace: null | { position, word, standing, now? } }
//                     read from SQLite when the connection opens, so a fresh
//                     connection is always current truth. After it, each
//                     successful replacement anywhere arrives as `change`:
//                       { position, word, version }
//                     with the position's new version. Nothing else rides
//                     along: no visitor ids, times, counts or feed data.
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

const CONNECT_MS = 2000; // headers and the opening snapshot, not the realtime requirement
const LIVE_MS = 1000; // "within about a second" of the replacement succeeding

const POSITION_KEYS = ["position", "version", "word"];
const SNAPSHOT_KEYS = ["positions", "trace"];
const TRACE_KEYS = ["now", "position", "standing", "word"];

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

type Snapshot = { positions: Slot[]; trace: Record<string, unknown> | null };

const keysOf = (value: unknown) => Object.keys(value as object).sort();

function asSnapshot(data: unknown): Snapshot {
  expect(data, "the snapshot isn't a JSON object").toBeTypeOf("object");
  expect(keysOf(data), "the snapshot isn't exactly { positions, trace }").toEqual(SNAPSHOT_KEYS);
  const { positions, trace } = data as { positions: unknown; trace: unknown };
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
  };
}

function asChange(frame: Frame): Slot {
  expect(keysOf(frame.data), "a change carries more than position, word and version").toEqual(POSITION_KEYS);
  const d = frame.data as Slot;
  return { position: Number(d.position), version: Number(d.version), word: d.word };
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

  localOnly("includes the visitor's own trace in their snapshot", async () => {
    const bea = await arrive();
    const slot = (await bea.sentence())[0];
    const word = unused(await bea.sentence());
    expect(await bea.replace(slot, word)).toBe(303);

    const snapshot = await (await connect(bea)).snapshot();

    expect(snapshot.trace, "a visitor who has made their change gets no trace").not.toBeNull();
    expect(snapshot.trace).toMatchObject({ position: slot.position, word, standing: true });
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
    expect(asChange(frame)).toEqual({ position: slot.position, word, version: slot.version + 1 });
  });

  localOnly("catches up on reconnect: a change made while disconnected is in the next snapshot", async () => {
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
