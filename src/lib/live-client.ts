import { classifyMoment, type KeptShip, type Moment } from "./kept-moment";
import { foreseen, said as saidOne } from "./ship/notation";
import { latestParts, replacedText, standingText } from "./trace-text";
import { labelRows, sizeStep } from "./sentence-step";

// Keeps an open current page (GET /) true to the live sentence: it applies
// the `snapshot` and `change` events from GET /events to the page's own
// markup. A position's update applies only if its version is newer than the
// one shown, and never over a draft the visitor is typing.
//
// The trace a snapshot carries has one of two shapes, depending on which
// rule mode the server is running (docs/decisions/0003-settle-and-kept-
// ships.md) — this module can't know which at build time, so it tells them
// apart structurally ("latest" in trace). Under `once`, Trace is unchanged
// from Crit 9. Under `settle`, SettleTrace's `latest`, when holding, carries
// settlesInMs: settling by age has no server event to push a live update
// with, so this module schedules its own local timer from that value and
// flips the trace's display once it elapses — presentation only; the server
// remains sole authority on any actual submit.

export type Position = { position: number; word: string; version: number };

// The second Theseus (docs/decisions/0003-settle-and-kept-ships.md), global
// rather than per-visitor: unlike the visitor's own trace, which needs a
// follow-up snapshot, it rides on every change event itself, since every
// open stream already gets every change and the kept ship changes on each
// one. Optional on the type (so existing position-reconciliation tests that
// have nothing to do with kept ships can keep building a bare Position):
// parseChange, which reads the real wire format, still rejects an event
// missing it.
export type { KeptShip, Moment };
export type ChangeEvent = Position & { keptShip?: KeptShip };

export type Trace =
  | { position: number; word: string; standing: true }
  | { position: number; word: string; standing: false; now: string };

export type StandingItem = { position: number; word: string };
// where a replaced word is kept, against the kept ship shown now (settle mode)
export type KeptWhere = "shown" | "later" | "earlier";
export type ReplacedItem = { position: number; word: string; now: string; kept: KeptWhere };
export type SettleTrace = {
  latest:
    | { position: number; word: string; standing: true; settled: true }
    | { position: number; word: string; standing: true; settled: false; settlesInMs: number }
    | { position: number; word: string; standing: false; now: string; kept: KeptWhere };
  otherStanding: StandingItem[];
  otherReplaced: ReplacedItem[];
};

const isSettleTrace = (t: Trace | SettleTrace): t is SettleTrace => "latest" in t;
// longer than a crossing (1.9 s, ship/motion.ts), so one burst is one announcement
export const ANNOUNCE_MS = 2500;
// how long typing pauses before the draft's prediction is said
export const DRAFT_MS = 700;

export type Snapshot = { positions: Position[]; trace: Trace | SettleTrace | null; keptShip?: KeptShip };

export interface LivePage {
  applySnapshot(snapshot: Snapshot): void;
  applyChange(change: ChangeEvent): void;
}

// Successful changes so far: each one moves exactly one position's version
// up by one from its starting 1.
export function deriveTotal(positions: readonly Pick<Position, "version">[]): number {
  return positions.reduce((sum, p) => sum + (p.version - 1), 0);
}

// Event data arrives as text from the network: anything that isn't the
// expected shape is dropped rather than applied.
export function parseChange(raw: string): ChangeEvent | null {
  const data = parse(raw);
  const position = asPosition(data);
  if (!position || !isObject(data)) return null;
  const keptShip = asKeptShip(data.keptShip);
  if (!keptShip) return null;
  return { ...position, keptShip };
}

export function parseSnapshot(raw: string): Snapshot | null {
  const data = parse(raw);
  if (!isObject(data) || !Array.isArray(data.positions)) return null;
  const positions = data.positions.map(asPosition);
  if (positions.some((p) => p === null)) return null;
  let trace: Trace | SettleTrace | null = null;
  if (data.trace !== null) {
    if (!isObject(data.trace)) return null;
    trace = "latest" in data.trace ? asSettleTrace(data.trace) : asTrace(data.trace);
    if (trace === null) return null;
  }
  const keptShip = asKeptShip(data.keptShip);
  if (!keptShip) return null;
  return { positions: positions as Position[], trace, keptShip };
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

const isKeptWhere = (v: unknown): v is KeptWhere => v === "shown" || v === "later" || v === "earlier";

function asTrace(v: unknown): Trace | null {
  if (!isObject(v) || !isIndex(v.position, 0) || typeof v.word !== "string") return null;
  if (v.standing === true) return { position: v.position, word: v.word, standing: true };
  if (v.standing === false && typeof v.now === "string") {
    return { position: v.position, word: v.word, standing: false, now: v.now };
  }
  return null;
}

function asLatest(v: unknown): SettleTrace["latest"] | null {
  if (!isObject(v) || !isIndex(v.position, 0) || typeof v.word !== "string") return null;
  if (v.standing === false && typeof v.now === "string" && isKeptWhere(v.kept)) {
    return { position: v.position, word: v.word, standing: false, now: v.now, kept: v.kept };
  }
  if (v.standing === true && v.settled === true) {
    return { position: v.position, word: v.word, standing: true, settled: true };
  }
  if (v.standing === true && v.settled === false && isIndex(v.settlesInMs, 0)) {
    return { position: v.position, word: v.word, standing: true, settled: false, settlesInMs: v.settlesInMs };
  }
  return null;
}

function asStandingItem(v: unknown): StandingItem | null {
  if (!isObject(v) || !isIndex(v.position, 0) || typeof v.word !== "string") return null;
  return { position: v.position, word: v.word };
}

function asKeptShip(v: unknown): KeptShip | null {
  if (!isObject(v) || !Array.isArray(v.words) || !Array.isArray(v.gaps) || !Array.isArray(v.next)) return null;
  if (v.words.length !== 10 || v.gaps.length !== 10 || v.next.length !== 10) return null;
  if (v.words.some((w) => typeof w !== "string") || v.gaps.some((g) => typeof g !== "boolean")) return null;
  if (v.next.some((w) => w !== null && typeof w !== "string")) return null;
  return { words: v.words as string[], gaps: v.gaps as boolean[], next: v.next as (string | null)[] };
}

function asReplacedItem(v: unknown): ReplacedItem | null {
  if (!isObject(v) || !isIndex(v.position, 0) || typeof v.word !== "string" || typeof v.now !== "string" || !isKeptWhere(v.kept)) return null;
  return { position: v.position, word: v.word, now: v.now, kept: v.kept };
}

function asSettleTrace(v: Record<string, unknown>): SettleTrace | null {
  if (!Array.isArray(v.otherStanding) || !Array.isArray(v.otherReplaced)) return null;
  const latest = asLatest(v.latest);
  if (!latest) return null;
  const otherStanding = v.otherStanding.map(asStandingItem);
  if (otherStanding.some((s) => s === null)) return null;
  const otherReplaced = v.otherReplaced.map(asReplacedItem);
  if (otherReplaced.some((r) => r === null)) return null;
  return { latest, otherStanding: otherStanding as StandingItem[], otherReplaced: otherReplaced as ReplacedItem[] };
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
  // what the ship shows is the shared truth
  onLatest?: (change: Position) => void;
  // told the kept ship every time it's known to have changed (every change
  // event, and every snapshot): global, so never held back by a draft
  // the kept ship, and the moment a newer change brought to it (null for a snapshot, or nothing crossing)
  onKept?: (kept: KeptShip, moment: Moment | null) => void;
  // this visitor's replaced words in the kept ship shown now, newest first
  // (settle mode): told whenever their own trace changes
  onMine?: (positions: number[]) => void;
  // told a position whose draft holds a newer word back (that word), or no longer does (null)
  onHeld?: (position: number, word: string | null) => void;
  // stub: slice 3b's spec lands first (spec/live-client.test.ts "your plank")
  onYours?: (position: number) => void;
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
  let trace: Trace | SettleTrace | null = null;
  let traceChanged = false;
  // Settling by age has no server event: the only way this page learns its
  // own holding trace has settled is this local timer, armed from the
  // settlesInMs the server last computed. Any newer trace (a real
  // replacement, a reconnect snapshot) clears and re-arms it, so there's
  // never more than one pending.
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let keptSent: KeptShip | undefined; // the kept ship last told to onKept, so a reconnect snapshot doesn't repeat it

  const hasDraft = (slot: Slot) => slot.input.value !== "";
  const shownVersion = (slot: Slot) => Number(slot.version.value);

  function isMarked(position: number): boolean {
    if (!trace) return false;
    if (!isSettleTrace(trace)) return trace.standing && trace.position === position;
    if (trace.latest.standing && trace.latest.position === position) return true;
    return trace.otherStanding.some((s) => s.position === position);
  }

  function show(slot: Slot): void {
    const { word, version } = slot.latest;
    if (isMarked(slot.latest.position)) {
      const el = doc.createElement("mark");
      el.textContent = word;
      slot.label.replaceChildren(el);
    } else {
      slot.label.textContent = word;
    }
    slot.version.value = String(version);
    slot.input.placeholder = word;
    if (slot.notice) options.onHeld?.(slot.latest.position, null);
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
    const line = slot.notice.firstElementChild!, text = `changed while you wrote — now “${slot.latest.word}”`;
    if (line.textContent === text) return;
    line.textContent = text;
    keepInside(slot.notice);
    options.onHeld?.(slot.latest.position, slot.latest.word);
    foresee(slot);
  }

  // The draft's own polite live region (#foreseen): what the part notation predicts, said once typing
  // pauses, never per key; or, once, that another visitor replaced the word and to choose it again.
  // Separate from #news, so neither talks over the other.
  const foreseenEl = doc.getElementById("foreseen");
  let foreseeTimer: ReturnType<typeof setTimeout> | null = null;
  function foresee(slot: Slot): void {
    if (!foreseenEl) return;
    if (foreseeTimer) clearTimeout(foreseeTimer);
    foreseeTimer = setTimeout(() => {
      foreseeTimer = null;
      if (!hasDraft(slot)) return;
      const position = slot.latest.position, word = slot.label.textContent?.trim() ?? "";
      const text = foreseen({ position, word, draft: slot.input.value, now: slot.notice ? slot.latest.word : undefined });
      if (text) foreseenEl.textContent = text;
    }, DRAFT_MS);
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
    // Once-mode only: a change event carries no trace, so this is how an
    // open once-mode page learns its own word was just replaced, without
    // waiting on the server's follow-up snapshot. Settle mode's richer
    // shape (multiple standing words, settling-by-age) isn't safely
    // derivable from one change event alone, so it waits for the ordinary
    // applySnapshot path instead — already immediate (events.ts sends the
    // follow-up snapshot in the same callback turn as the broadcast).
    if (trace && !isSettleTrace(trace) && trace.position === change.position) {
      trace = { position: trace.position, word: trace.word, standing: false, now: change.word };
      traceChanged = true;
    }
    if (hasDraft(slot)) holdBack(slot);
    else show(slot);
  }

  // the trace GET / renders under the how-text, for a page that loaded
  // before this visitor had made their change
  function ensureTraceSection(): Element | null {
    const existing = doc.querySelector('section[aria-labelledby="trace-heading"]');
    if (existing) return existing;
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
    // where GET / renders it: under the how-text, in the live half's foot
    (doc.getElementById("how") ?? sentence).after(section);
    return section;
  }

  function statusOf(section: Element): HTMLElement {
    let status = section.querySelector<HTMLElement>('[role="status"]');
    if (!status) {
      status = doc.createElement("p");
      status.setAttribute("role", "status");
      section.append(status);
    }
    return status;
  }

  function ensureList(section: Element, className: string): HTMLElement {
    let ul = section.querySelector<HTMLElement>(`ul.${className}`);
    if (!ul) {
      ul = doc.createElement("ul");
      ul.className = className;
      section.append(ul);
    }
    return ul;
  }

  function renderList(section: Element, className: string, texts: string[]): void {
    if (texts.length === 0) {
      section.querySelector(`ul.${className}`)?.remove();
      return;
    }
    const ul = ensureList(section, className);
    ul.replaceChildren(
      ...texts.map((text) => {
        const li = doc.createElement("li");
        li.textContent = text;
        return li;
      }),
    );
  }

  function renderTrace(): void {
    if (!trace || !traceChanged) return;
    const section = ensureTraceSection();
    if (!section) return;
    traceChanged = false;
    const status = statusOf(section);
    if (!isSettleTrace(trace)) {
      if (trace.standing) {
        status.textContent = `Your word “${trace.word}” still stands, marked in the sentence above.`;
      } else {
        const del = doc.createElement("del");
        del.textContent = trace.word;
        status.replaceChildren("Your word “", del, `” has since been replaced: “${trace.now}” stands in its place now.`);
      }
      return;
    }
    const parts = latestParts(trace.latest);
    if (parts.del) {
      const del = doc.createElement("del");
      del.textContent = parts.del;
      status.replaceChildren(
        "Your word “",
        del,
        `” has since been replaced: “${parts.now}” stands in its place now. ${parts.kept} ${parts.eligibility}`,
      );
    } else {
      status.textContent = `Your word “${parts.word}” still stands, marked in the sentence above. ${parts.eligibility}`;
    }
    renderList(section, "trace-standing", trace.otherStanding.map(standingText));
    renderList(section, "trace-replaced", trace.otherReplaced.map(replacedText));
  }

  // Settling by age has no server event to push: this page learns its own
  // holding trace has settled only by waiting out the same span the server
  // last reported (settlesInMs). Any newer trace (a real replacement, a
  // reconnect snapshot) clears and re-arms this before possibly scheduling
  // a different one, so there's never more than one pending.
  function clearSettleTimer(): void {
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  }

  function armSettleTimer(): void {
    clearSettleTimer();
    if (!trace || !isSettleTrace(trace) || !trace.latest.standing || trace.latest.settled) return;
    const { position, word, settlesInMs } = trace.latest;
    settleTimer = setTimeout(() => {
      settleTimer = null;
      trace = { ...(trace as SettleTrace), latest: { position, word, standing: true, settled: true } };
      traceChanged = true;
      render();
    }, settlesInMs);
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
      // where GET / renders it: after the trace, or the how-text
      const after = doc.querySelector('section[aria-labelledby="trace-heading"]') ?? doc.getElementById("how");
      const readme = doc.querySelector('a[href="/readme/"]')?.closest("p");
      if (after) after.after(p);
      else if (readme) readme.before(p);
      else doc.querySelector("main")?.append(p);
    }
    link.setAttribute("href", `?at=${total - 1}`);
  }

  // Your holding word's line, filling to the end of its hold (settle mode,
  // this visitor's own trace only). The same hold keeps its line, so a
  // re-render never restarts it; anything else removes it.
  const settleMs = Number(doc.querySelector(".sentence")?.getAttribute("data-settle-ms") ?? 0);
  let settling: { el: HTMLElement; key: string } | null = null;
  function renderSettling(): void {
    const latest = trace && isSettleTrace(trace) ? trace.latest : null;
    const hold = latest && latest.standing && !latest.settled ? latest : null;
    const reduced = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const pos = hold && settleMs > 0 && !reduced ? slots.get(hold.position)?.form.closest(".pos") : null;
    const key = hold ? `${hold.position}|${hold.word}` : "";
    if (settling && (!pos || settling.key !== key || !pos.contains(settling.el))) {
      settling.el.remove();
      settling = null;
    }
    if (!pos || !hold || settling) return;
    const el = doc.createElement("span");
    el.className = "settling";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--from", String(Math.min(1, Math.max(0, 1 - hold.settlesInMs / settleMs))));
    el.style.setProperty("--ms", `${hold.settlesInMs}ms`);
    pos.append(el);
    settling = { el, key };
  }

  // your replaced words in the kept ship shown now, from your own trace
  let mineSent = "";
  function renderMine(): void {
    const t = trace && isSettleTrace(trace) ? trace : null;
    const mine = t
      ? [...(!t.latest.standing && t.latest.kept === "shown" ? [t.latest.position] : []), ...t.otherReplaced.filter((r) => r.kept === "shown").map((r) => r.position)]
      : [];
    const key = mine.join(",");
    if (key === mineSent) return;
    mineSent = key;
    options.onMine?.(mine);
  }

  // The sentence's size step follows the words on screen, but never changes under someone: while a
  // field is focused or holds a draft it waits, and applies once the visitor lets go (blur, Escape, or
  // clearing a draft), as a held-back change does.
  const sentenceEl = slots.values().next().value?.form.closest<HTMLElement>(".sentence") ?? null;
  const inHand = () => [...slots.values()].some((s) => hasDraft(s) || doc.activeElement === s.input);
  function renderStep(): void {
    if (!sentenceEl || !sentenceEl.hasAttribute("data-step") || inHand()) return;
    const ordered = [...slots.values()].sort((a, b) => a.latest.position - b.latest.position), words = ordered.map((s) => s.label.textContent?.trim() ?? "");
    const step = String(sizeStep(words));
    if (sentenceEl.getAttribute("data-step") !== step) sentenceEl.setAttribute("data-step", step);
    // each label's row follows the words too, at the same moment, so nothing shifts under a word in hand
    const desktop = labelRows(words, "desktop"), phone = labelRows(words, "phone");
    ordered.forEach((s, i) => {
      const pos = s.form.closest<HTMLElement>(".pos");
      if (!pos) return;
      if (pos.dataset.rowDesktop !== String(desktop[i])) pos.dataset.rowDesktop = String(desktop[i]);
      if (pos.dataset.rowPhone !== String(phone[i])) pos.dataset.rowPhone = String(phone[i]);
    });
  }
  // letting go: focus leaving a field for anything but another word field (moving between words is
  // still a word in hand: the step mustn't shift the word being chosen), or a draft emptied
  const isField = (el: EventTarget | null) => [...slots.values()].some((s) => s.input === el);
  doc.addEventListener("focusout", (event) => {
    if (isField(event.target) && foreseeTimer) { clearTimeout(foreseeTimer); foreseeTimer = null; } // letting go of a word says nothing more of it
    if (isField(event.target) && !isField((event as FocusEvent).relatedTarget)) renderStep();
  });

  function render(): void {
    renderStep();
    renderMine();
    renderTrace();
    renderSettling();
    renderSummary();
    renderEarlier();
  }

  // A held-back change applies only when the visitor empties their own draft;
  // nothing else (blur included) touches a draft or its expected version.
  doc.addEventListener("input", (event) => {
    for (const slot of slots.values()) {
      if (event.target !== slot.input) continue;
      // a draft held back has been said once; typing on doesn't say it again
      if (hasDraft(slot)) { if (!slot.notice) foresee(slot); continue; }
      if (foreseeTimer) { clearTimeout(foreseeTimer); foreseeTimer = null; }
      if (slot.notice && slot.latest.version > shownVersion(slot)) show(slot);
    }
    renderStep(); // an emptied draft may let go of the sentence's last word in hand
    keepAllInside(); // typing can move words, and the notices under them
  });

  // Escape is the way out of a word in hand: the visitor's own clearing of the draft (so a change it held
  // back applies, by the input listener above), then letting go of the field. It never submits.
  doc.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const slot of slots.values()) {
      if (event.target !== slot.input) continue;
      event.preventDefault();
      slot.input.value = "";
      slot.input.dispatchEvent(new (doc.defaultView ?? window).Event("input", { bubbles: true }));
      slot.input.blur();
    }
  });

  // The positions one trace shape refers to: one, under once mode; up to
  // several, under settle mode.
  function tracePositions(t: Trace | SettleTrace): number[] {
    return isSettleTrace(t)
      ? [t.latest.position, ...t.otherStanding.map((s) => s.position), ...t.otherReplaced.map((r) => r.position)]
      : [t.position];
  }

  // Guards against a snapshot that was computed before a newer change this
  // page already applied to one of the trace's own positions (via a faster-
  // arriving `change` event) — never roll the trace back to stale state for
  // a position this page already knows is newer.
  function traceIsFresh(snapshot: Snapshot, t: Trace | SettleTrace): boolean {
    return tracePositions(t).every((position) => {
      const slot = slots.get(position);
      const at = snapshot.positions.find((p) => p.position === position);
      return !slot || !at || at.version >= slot.latest.version;
    });
  }

  // Others' changes, said once a burst has settled: positions and words,
  // never who or when. Only change events reach this, so a load, snapshot or
  // reconnect stays silent.
  const news = doc.getElementById("news");
  const heard = new Map<number, string>();
  // the word each heard position held before this burst, so one change can say its part's family change
  const before = new Map<number, string>();
  // replaced words this burst sent to the next ship's waiting row (decided 29 October), by position
  const waits = new Map<number, string>();
  let speakTimer: ReturnType<typeof setTimeout> | null = null;
  function announce(change: Position, was: string, waiting = false): void {
    if (!news) return;
    if (!before.has(change.position)) before.set(change.position, was);
    if (waiting) waits.set(change.position, was);
    heard.delete(change.position);
    heard.set(change.position, change.word);
    if (speakTimer) clearTimeout(speakTimer);
    speakTimer = setTimeout(() => {
      speakTimer = null;
      const said = [...heard].sort((a, b) => a[0] - b[0]);
      const was = new Map(before), waited = [...waits].sort((a, b) => a[0] - b[0]).map(([, w]) => w);
      heard.clear();
      before.clear();
      waits.clear();
      const words = [...slots.values()].sort((a, b) => a.latest.position - b.latest.position).map((s) => s.latest.word);
      const n = (p: number) => String(p + 1);
      news.textContent =
        said.length === 1
          ? saidOne({ position: said[0][0], word: said[0][1], was: was.get(said[0][0]) })
          : said.length <= 3
            ? `Changed: words ${said.slice(0, -1).map(([p]) => n(p)).join(", ")} and ${n(said.at(-1)![0])}. The sentence now reads: ${words.join(" ")}.`
            : `Several words changed. The sentence now reads: ${words.join(" ")}.`;
      if (waited.length) news.textContent += ` ${waited.map((w) => `“${w}”`).join(" and ")} ${waited.length === 1 ? "waits" : "wait"} for the next ship.`;
    }, ANNOUNCE_MS);
  }

  function tellKept(kept: KeptShip | undefined, moment: Moment | null = null): void {
    if (!kept || JSON.stringify(kept) === JSON.stringify(keptSent)) return;
    keptSent = kept;
    options.onKept?.(kept, moment);
  }

  return {
    applySnapshot(snapshot) {
      for (const change of snapshot.positions) offer(change);
      if (snapshot.trace && traceIsFresh(snapshot, snapshot.trace)) {
        traceChanged ||= JSON.stringify(trace) !== JSON.stringify(snapshot.trace);
        trace = snapshot.trace;
        armSettleTimer();
      }
      for (const slot of slots.values()) if (!hasDraft(slot) && !slot.notice) show(slot);
      tellKept(snapshot.keptShip);
      render();
    },
    applyChange(change) {
      // the moment is told first, so the harbour knows how this change moves before onLatest exchanges it
      const slot = slots.get(change.position);
      const newer = !!slot && change.version > slot.latest.version;
      const was = slot?.latest.word ?? change.word;
      const moment = change.keptShip && newer ? classifyMoment(keptSent, change.keptShip, change.position) : null;
      if (change.keptShip) tellKept(change.keptShip, moment);
      offer(change);
      if (newer) announce(change, was, moment?.kind === "wait");
      render();
    },
  };
}
