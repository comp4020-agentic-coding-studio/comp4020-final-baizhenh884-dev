// Keeps an open current page (GET /) true to the live sentence: it applies
// the `snapshot` and `change` events from GET /events to the page's own
// markup. A position's update applies only if its version is newer than the
// one shown, and never over a draft the visitor is typing.

export type Position = { position: number; word: string; version: number };

export type Trace =
  | { position: number; word: string; standing: true }
  | { position: number; word: string; standing: false; now: string };

export type Snapshot = { positions: Position[]; trace: Trace | null };

export interface LivePage {
  applySnapshot(snapshot: Snapshot): void;
  applyChange(change: Position): void;
}

// Successful changes so far: each one moves exactly one position's version
// up by one from its starting 1.
export function deriveTotal(positions: readonly Pick<Position, "version">[]): number {
  return positions.reduce((sum, p) => sum + (p.version - 1), 0);
}

// Event data arrives as text from the network: anything that isn't the
// expected shape is dropped rather than applied.
export function parseChange(raw: string): Position | null {
  return asPosition(parse(raw));
}

export function parseSnapshot(raw: string): Snapshot | null {
  const data = parse(raw);
  if (!isObject(data) || !Array.isArray(data.positions)) return null;
  const positions = data.positions.map(asPosition);
  if (positions.some((p) => p === null)) return null;
  const trace = data.trace === null ? null : asTrace(data.trace);
  if (data.trace !== null && trace === null) return null;
  return { positions: positions as Position[], trace };
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isIndex = (v: unknown, min: number): v is number => Number.isInteger(v) && (v as number) >= min;

function asPosition(v: unknown): Position | null {
  if (!isObject(v) || !isIndex(v.position, 0) || !isIndex(v.version, 1) || typeof v.word !== "string") return null;
  return { position: v.position, word: v.word, version: v.version };
}

function asTrace(v: unknown): Trace | null {
  if (!isObject(v) || !isIndex(v.position, 0) || typeof v.word !== "string") return null;
  if (v.standing === true) return { position: v.position, word: v.word, standing: true };
  if (v.standing === false && typeof v.now === "string") {
    return { position: v.position, word: v.word, standing: false, now: v.now };
  }
  return null;
}

type Slot = {
  form: HTMLFormElement;
  version: HTMLInputElement;
  label: HTMLLabelElement;
  input: HTMLInputElement;
  latest: Position; // the newest state known for this position, shown or not
  notice: HTMLElement | null; // present while a draft holds `latest` back
};

export type Options = {
  // told every newer version of a position, held back by a draft or not:
  // what the house shows is the shared truth
  onLatest?: (change: Position) => void;
};

export function attach(doc: Document, options: Options = {}): LivePage {
  const slots = new Map<number, Slot>();
  for (const form of doc.querySelectorAll<HTMLFormElement>('form[action="/replace"]')) {
    const position = Number(form.querySelector<HTMLInputElement>('input[name="position"]')?.value);
    const version = form.querySelector<HTMLInputElement>('input[name="version"]');
    const label = form.querySelector("label");
    const input = form.querySelector<HTMLInputElement>('input[name="word"]');
    if (!Number.isInteger(position) || !version || !label || !input) continue;
    const word = label.textContent?.trim() ?? "";
    slots.set(position, { form, version, label, input, latest: { position, word, version: Number(version.value) }, notice: null });
  }
  let trace: Trace | null = null;
  let traceChanged = false;

  const hasDraft = (slot: Slot) => slot.input.value !== "";
  const shownVersion = (slot: Slot) => Number(slot.version.value);

  function show(slot: Slot): void {
    const { word, version } = slot.latest;
    const mark = trace?.standing && trace.position === slot.latest.position;
    if (mark) {
      const el = doc.createElement("mark");
      el.textContent = word;
      slot.label.replaceChildren(el);
    } else {
      slot.label.textContent = word;
    }
    slot.version.value = String(version);
    slot.input.placeholder = word;
    slot.notice?.remove();
    slot.notice = null;
  }

  function holdBack(slot: Slot): void {
    if (!slot.notice) {
      slot.notice = doc.createElement("span");
      slot.notice.className = "changed";
      slot.notice.append(doc.createElement("span"));
      slot.form.after(slot.notice);
    }
    slot.notice.firstElementChild!.textContent = `changed while you wrote — now “${slot.latest.word}”`;
    keepInside(slot.notice);
  }

  // The notice's one line starts under its word and may run past it, but
  // never past the sentence's right edge: near the edge it shifts left.
  function keepInside(notice: HTMLElement): void {
    const line = notice.firstElementChild as HTMLElement | null;
    const bounds = notice.closest(".sentence")?.getBoundingClientRect();
    if (!line || !bounds || bounds.width === 0) return;
    line.style.transform = "";
    line.style.maxWidth = `${bounds.width}px`;
    const box = line.getBoundingClientRect();
    const over = Math.min(box.right - bounds.right, box.left - bounds.left);
    if (over > 0) line.style.transform = `translateX(${-over}px)`;
  }

  const keepAllInside = () => {
    for (const slot of slots.values()) if (slot.notice) keepInside(slot.notice);
  };
  doc.defaultView?.addEventListener("resize", keepAllInside);

  // the one rule for every update: only a newer version counts
  function offer(change: Position): void {
    const slot = slots.get(change.position);
    if (!slot || change.version <= slot.latest.version) return;
    slot.latest = { ...change };
    options.onLatest?.({ ...change });
    if (trace && trace.position === change.position) {
      trace = { position: trace.position, word: trace.word, standing: false, now: change.word };
      traceChanged = true;
    }
    if (hasDraft(slot)) holdBack(slot);
    else show(slot);
  }

  // the trace GET / renders after the sentence, for a page that loaded
  // before this visitor had made their change
  function createTrace(): Element | null {
    const sentence = slots.values().next().value?.form.closest(".sentence");
    if (!sentence) return null;
    const section = doc.createElement("section");
    section.setAttribute("aria-labelledby", "trace-heading");
    const heading = doc.createElement("h2");
    heading.id = "trace-heading";
    heading.textContent = "Your trace";
    const status = doc.createElement("p");
    status.setAttribute("role", "status");
    section.append(heading, status);
    sentence.after(section);
    return status;
  }

  function renderTrace(): void {
    if (!trace || !traceChanged) return;
    const status = doc.querySelector('section[aria-labelledby="trace-heading"] [role="status"]') ?? createTrace();
    if (!status) return;
    traceChanged = false;
    if (trace.standing) {
      status.textContent = `Your word “${trace.word}” still stands, marked in the sentence above.`;
    } else {
      const del = doc.createElement("del");
      del.textContent = trace.word;
      status.replaceChildren("Your word “", del, `” has since been replaced: “${trace.now}” stands in its place now.`);
    }
  }

  function renderSummary(): void {
    const summary = doc.querySelector("[data-sentence-summary]");
    if (!summary) return;
    const words = [...slots.values()].sort((a, b) => a.latest.position - b.latest.position).map((s) => s.latest.word);
    summary.textContent = `The sentence now reads: ${words.join(" ")}.`;
  }

  // Earlier is the whole sentence just before now: ?at=<total - 1>
  function renderEarlier(): void {
    const total = deriveTotal([...slots.values()].map((s) => s.latest));
    if (total === 0) return;
    let link = doc.querySelector<HTMLAnchorElement>('a[rel~="prev"]');
    if (!link) {
      const p = doc.createElement("p");
      p.className = "earlier caps";
      link = doc.createElement("a");
      link.rel = "prev";
      link.textContent = "Earlier form";
      p.append(link);
      const readme = doc.querySelector('a[href="/readme/"]')?.closest("p");
      if (readme) readme.before(p);
      else doc.querySelector("main")?.append(p);
    }
    link.setAttribute("href", `?at=${total - 1}`);
  }

  function render(): void {
    renderTrace();
    renderSummary();
    renderEarlier();
  }

  // A held-back change applies only when the visitor empties their own draft;
  // nothing else (blur included) touches a draft or its expected version.
  doc.addEventListener("input", (event) => {
    for (const slot of slots.values()) {
      if (event.target !== slot.input || hasDraft(slot) || !slot.notice) continue;
      if (slot.latest.version > shownVersion(slot)) show(slot);
    }
    keepAllInside(); // typing can move words, and the notices under them
  });

  return {
    applySnapshot(snapshot) {
      for (const change of snapshot.positions) offer(change);
      if (snapshot.trace) {
        const slot = slots.get(snapshot.trace.position);
        const at = snapshot.positions.find((p) => p.position === snapshot.trace!.position);
        if (!slot || !at || at.version >= slot.latest.version) {
          traceChanged ||= JSON.stringify(trace) !== JSON.stringify(snapshot.trace);
          trace = snapshot.trace;
        }
      }
      for (const slot of slots.values()) if (!hasDraft(slot) && !slot.notice) show(slot);
      render();
    },
    applyChange(change) {
      offer(change);
      render();
    },
  };
}
