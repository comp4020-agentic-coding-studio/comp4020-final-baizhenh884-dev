import { int, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate`, and commit the migration it writes to drizzle/; it's
// applied when the app opens the database (src/lib/db.ts).

// The current sentence: one row per word position, each with its own version.
export const positions = sqliteTable("positions", {
  position: int().primaryKey(),
  word: text().notNull(),
  version: int().notNull().default(1),
});

// Every successful replacement, append-only and in order. Eligibility (how
// many changes a visitor gets, and when) is enforced by the `changes_one_turn`
// trigger (hand-written into drizzle/0001, since drizzle-kit doesn't generate
// triggers — see docs/decisions/0003-settle-and-kept-ships.md), not by a
// column constraint here: which rule it enforces depends on `rules.mode`.
export const changes = sqliteTable(
  "changes",
  {
    id: int().primaryKey({ autoIncrement: true }),
    visitor: text().notNull(),
    position: int()
      .notNull()
      .references(() => positions.position),
    fromWord: text("from_word").notNull(),
    toWord: text("to_word").notNull(),
    fromVersion: int("from_version").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("changes_visitor_idx").on(table.visitor, table.id), index("changes_position_idx").on(table.position, table.id)],
);

// One row, written by the app at boot from RULE_MODE / SETTLE_SECONDS
// (src/lib/db.ts), read by the changes_one_turn trigger on every insert
// attempt. Never written to by a request; config, not product data.
export const rules = sqliteTable("rules", {
  id: int().primaryKey(),
  mode: text().notNull().default("once"),
  settleSeconds: int("settle_seconds").notNull().default(300),
});
