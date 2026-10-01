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

export type Outcome = "replaced" | "spent" | "stale" | "invalid";

const spentBy = client.prepare("SELECT 1 FROM changes WHERE visitor = ?");
const positionNow = client.prepare("SELECT word, version FROM positions WHERE position = ?");
const advance = client.prepare(
  "UPDATE positions SET word = ?, version = version + 1 WHERE position = ? AND version = ?",
);
const record = client.prepare(
  "INSERT INTO changes (visitor, position, from_word, to_word, from_version) VALUES (?, ?, ?, ?, ?)",
);

// One visitor's attempt to replace one word, as one IMMEDIATE transaction, so
// it's checked and applied against a single state. Refusals write nothing,
// in this order: already spent (403) before stale (409) before an invalid or
// unchanged word (422), so a spent visitor is never invited to retry.
// UNIQUE(visitor) on changes is the last line: a second success can't commit.
const attempt = client.transaction(
  (visitor: string, position: number, version: number, word: string, valid: boolean): Outcome => {
    if (spentBy.get(visitor)) return "spent";
    const now = positionNow.get(position) as { word: string; version: number } | undefined;
    if (!now) return "invalid";
    if (now.version !== version) return "stale";
    if (!valid || word === now.word) return "invalid";
    if (advance.run(word, position, version).changes !== 1) return "stale";
    record.run(visitor, position, now.word, word, version);
    return "replaced";
  },
);

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
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") return "spent";
    throw error;
  }
}
