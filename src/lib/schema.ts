import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate`, and commit the migration it writes to drizzle/; it's
// applied when the app opens the database (src/lib/db.ts).

// The current sentence: one row per word position, each with its own version.
export const positions = sqliteTable("positions", {
  position: int().primaryKey(),
  word: text().notNull(),
  version: int().notNull().default(1),
});

// Every successful replacement, append-only and in order. `visitor` is unique:
// the database itself allows each visitor one successful change.
export const changes = sqliteTable("changes", {
  id: int().primaryKey({ autoIncrement: true }),
  visitor: text().notNull().unique(),
  position: int()
    .notNull()
    .references(() => positions.position),
  fromWord: text("from_word").notNull(),
  toWord: text("to_word").notNull(),
  fromVersion: int("from_version").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
