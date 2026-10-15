import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { positions } from "./schema";
import { STARTING_WORDS } from "./sentence";

// Production keeps the database on the Fly volume, named explicitly by
// DATABASE_PATH (the Dockerfile sets /data/theseus.db). If that directory
// isn't there, the volume isn't mounted: fail rather than write to the
// container's own disk, which every deploy would wipe. Development uses an
// untracked local file.
function databasePath(): string {
  if (import.meta.env.PROD) {
    const path = process.env.DATABASE_PATH;
    if (!path) throw new Error("DATABASE_PATH must be set in production");
    if (!existsSync(dirname(path))) {
      throw new Error(`${dirname(path)} doesn't exist: refusing to open the database without its volume`);
    }
    return path;
  }
  const path = resolve(process.env.DATABASE_PATH ?? ".data/theseus.db");
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

const path = databasePath();
console.log(`[theseus] database: ${path}`);

export const client = new Database(path);
client.pragma("journal_mode = WAL");
client.pragma("busy_timeout = 5000");
client.pragma("synchronous = FULL");
client.pragma("foreign_keys = ON");

export const db = drizzle(client);
migrate(db, { migrationsFolder: "./drizzle" });

// The maker's sentence is the initial state of `positions`, never a row in
// `changes`. OR IGNORE makes this a no-op on every start after the first, so a
// restart never resets a word.
const seed = client.prepare("INSERT OR IGNORE INTO positions (position, word, version) VALUES (?, ?, 1)");
client.transaction(() => STARTING_WORDS.forEach((word, position) => seed.run(position, word)))();

// The active eligibility rule (docs/decisions/0003-settle-and-kept-ships.md):
// `once` (default, today's behaviour) or `settle`. Written to the one-row
// `rules` table at every boot, so the changes_* triggers in drizzle/0001
// always enforce whatever this process was started with. Config, never
// product data: no request ever writes this table. Production sets it with
// `fly secrets set RULE_MODE=settle`, never a deploy-time flag, since a flag
// would be lost on CI's next automatic redeploy.
const RULE_MODE = process.env.RULE_MODE === "settle" ? "settle" : "once";
const SETTLE_SECONDS = Number(process.env.SETTLE_SECONDS ?? 300);
client.prepare("UPDATE rules SET mode = ?, settle_seconds = ? WHERE id = 1").run(RULE_MODE, SETTLE_SECONDS);
console.log(`[theseus] rule mode: ${RULE_MODE} (settle_seconds=${SETTLE_SECONDS})`);

export type Position = { position: number; word: string; version: number };

export function currentPositions(): Position[] {
  return db.select().from(positions).orderBy(asc(positions.position)).all();
}

export function changeCount(): number {
  return (client.prepare("SELECT count(*) AS n FROM changes").get() as { n: number }).n;
}

// The whole sentence after the first n successful changes, rebuilt from the
// append-only log over the maker's words; null if there haven't been n yet.
export function sentenceAt(n: number): string[] | null {
  if (n > changeCount()) return null;
  const words: string[] = [...STARTING_WORDS];
  const rows = client
    .prepare("SELECT position, to_word AS word FROM changes ORDER BY id LIMIT ?")
    .all(n) as { position: number; word: string }[];
  for (const row of rows) words[row.position] = row.word;
  return words;
}

// The most recent words each position held before its current one (newest
// first), for the decorative history beneath each word.
export function recentPast(limit = 4): Map<number, string[]> {
  const past = new Map<number, string[]>();
  const rows = client.prepare("SELECT position, from_word AS word FROM changes ORDER BY id DESC").all() as {
    position: number;
    word: string;
  }[];
  for (const row of rows) {
    const list = past.get(row.position) ?? [];
    if (list.length < limit) past.set(row.position, [...list, row.word]);
  }
  return past;
}

// A visitor's own change, if they've made one: their word, and whether it
// still stands or what now stands in its place. A later change at the same
// position means it was replaced, even if the same text came back.
//
// Only safe because, under rule mode `once`, a visitor has at most one row
// (the dropped UNIQUE(visitor) used to be the only guarantee of this; now
// it's ORDER BY id DESC LIMIT 1 below, deliberately, since under `settle` a
// visitor can have several rows and "the latest" must be explicit, not left
// to SQLite's unspecified row order for a query with no ORDER BY).
export type Trace =
  | { position: number; word: string; standing: true }
  | { position: number; word: string; standing: false; now: string };

export function traceFor(visitor: string): Trace | null {
  const mine = client
    .prepare("SELECT id, position, to_word AS word FROM changes WHERE visitor = ? ORDER BY id DESC LIMIT 1")
    .get(visitor) as { id: number; position: number; word: string } | undefined;
  if (!mine) return null;
  const later = client.prepare("SELECT 1 FROM changes WHERE position = ? AND id > ?").get(mine.position, mine.id);
  if (!later) return { position: mine.position, word: mine.word, standing: true };
  return { position: mine.position, word: mine.word, standing: false, now: wordAt(mine.position) ?? "" };
}

export function wordAt(position: number): string | null {
  const row = client.prepare("SELECT word FROM positions WHERE position = ?").get(position) as { word: string } | undefined;
  return row?.word ?? null;
}

// `spent` ("once" mode: a second change ever) and `holding`/`not-here`
// ("settle" mode: a standing word not yet replaced or settled, or the exact
// position of the visitor's own latest change) are refused by the database
// triggers in drizzle/0001 as the real, atomic guard — but which one applies
// is also checked here first, in the same order the original code used for
// `spent`: before stale or invalid, so an ineligible visitor is never told
// their *word* was the problem. This mirrors the trigger's own predicate
// exactly; it isn't a second authority, since the trigger still has the last,
// atomic word if this read and the real insert ever disagree under a race.
type Rules = { mode: "once" | "settle"; settleSeconds: number };
const rulesRow = client.prepare("SELECT mode, settle_seconds AS settleSeconds FROM rules WHERE id = 1");
const latestChange = client.prepare("SELECT id, position, created_at AS createdAt FROM changes WHERE visitor = ? ORDER BY id DESC LIMIT 1");
const laterAtPosition = client.prepare("SELECT 1 FROM changes WHERE position = ? AND id > ?");

function eligibility(visitor: string, position: number): "spent" | "holding" | "not-here" | null {
  const rules = rulesRow.get() as Rules;
  const last = latestChange.get(visitor) as { id: number; position: number; createdAt: string } | undefined;
  if (!last) return null;
  if (rules.mode === "once") return "spent";
  if (last.position === position) return "not-here";
  const replaced = laterAtPosition.get(last.position, last.id);
  if (replaced) return null;
  const ageSeconds = (client.prepare("SELECT (julianday('now') - julianday(?)) * 86400 AS s").get(last.createdAt) as { s: number }).s;
  return ageSeconds < rules.settleSeconds ? "holding" : null;
}

// Under rule mode `settle`: the visitor currently held by this position's
// word, if any — i.e. this position's latest change is also that visitor's
// own latest change overall, so replacing it frees them. Returns null under
// `once` (nobody is ever "held" by a word, so there's nothing to free) and
// for a starting word or a position whose placer has since moved on.
export function holderOf(position: number): string | null {
  const rules = rulesRow.get() as Rules;
  if (rules.mode !== "settle") return null;
  const row = client.prepare("SELECT id, visitor FROM changes WHERE position = ? ORDER BY id DESC LIMIT 1").get(position) as
    | { id: number; visitor: string }
    | undefined;
  if (!row) return null;
  const last = latestChange.get(row.visitor) as { id: number } | undefined;
  return last && last.id === row.id ? row.visitor : null;
}

// Under rule mode `settle`, called before an attempt mutates anything: is
// this visitor about to act specifically because their own standing word
// settled by age (never replaced, just old enough), rather than because they
// never held anything or were freed by someone else's replacement? Settling
// itself has no event on the page (docs/decisions/0003), but it's still
// worth one log line, observed the first time any request notices it, not on
// a background timer. Returns the settled position, or null.
export function settledPosition(visitor: string): number | null {
  const rules = rulesRow.get() as Rules;
  if (rules.mode !== "settle") return null;
  const last = latestChange.get(visitor) as { id: number; position: number; createdAt: string } | undefined;
  if (!last) return null;
  if (laterAtPosition.get(last.position, last.id)) return null; // freed by replacement, not settling
  const ageSeconds = (client.prepare("SELECT (julianday('now') - julianday(?)) * 86400 AS s").get(last.createdAt) as { s: number }).s;
  return ageSeconds >= rules.settleSeconds ? last.position : null;
}

export type Outcome = "replaced" | "spent" | "stale" | "invalid" | "holding" | "not-here";

const positionNow = client.prepare("SELECT word, version FROM positions WHERE position = ?");
const advance = client.prepare(
  "UPDATE positions SET word = ?, version = version + 1 WHERE position = ? AND version = ?",
);
const record = client.prepare(
  "INSERT INTO changes (visitor, position, from_word, to_word, from_version) VALUES (?, ?, ?, ?, ?)",
);

// One visitor's attempt to replace one word, as one IMMEDIATE transaction, so
// it's checked and applied against a single state. Refusals write nothing,
// in this order: ineligible (403) before stale (409) before an invalid or
// unchanged word (422), so an ineligible visitor is never invited to retry
// with a different word. The changes_* triggers in drizzle/0001 are the real
// last line — a second success, or one at a held position, can't commit even
// if this check and the database ever disagree under a race.
const attempt = client.transaction(
  (visitor: string, position: number, version: number, word: string, valid: boolean): Outcome => {
    const refused = eligibility(visitor, position);
    if (refused) return refused;
    const now = positionNow.get(position) as { word: string; version: number } | undefined;
    if (!now) return "invalid";
    if (now.version !== version) return "stale";
    if (!valid || word === now.word) return "invalid";
    if (advance.run(word, position, version).changes !== 1) return "stale";
    record.run(visitor, position, now.word, word, version); // may throw: see replaceWord
    return "replaced";
  },
);

function isEligibilityOutcome(message: string): message is "spent" | "holding" | "not-here" {
  return message === "spent" || message === "holding" || message === "not-here";
}

export function replaceWord(
  visitor: string,
  position: number,
  version: number,
  word: string,
  valid: boolean,
): Outcome {
  try {
    return attempt.immediate(visitor, position, version, word, valid);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    // A trigger's RAISE(ABORT, 'spent' | 'holding' | 'not-here') surfaces as
    // SQLITE_CONSTRAINT_TRIGGER with that literal string as the message —
    // confirmed directly against better-sqlite3, not assumed from docs. This
    // only fires if the pre-check above missed a race the atomic trigger
    // still caught (e.g. a concurrent insert between the read and the write).
    if (err.code === "SQLITE_CONSTRAINT_TRIGGER" && err.message && isEligibilityOutcome(err.message)) {
      return err.message;
    }
    // The pre-migration-0001 shape, kept so a database still on 0000 (should
    // never happen once 0001 is committed, but costs nothing to keep safe).
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") return "spent";
    throw error;
  }
}
