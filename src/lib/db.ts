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

export function currentWords(): string[] {
  return db
    .select({ word: positions.word })
    .from(positions)
    .orderBy(asc(positions.position))
    .all()
    .map((row) => row.word);
}
