CREATE TABLE `rules` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'once' NOT NULL,
	`settle_seconds` integer DEFAULT 300 NOT NULL
);
--> statement-breakpoint
-- one row, id fixed at 1; mode/settle_seconds use their column defaults until
-- the app's own boot-time write (src/lib/db.ts) brings them in line with
-- RULE_MODE / SETTLE_SECONDS
INSERT INTO `rules` (`id`) VALUES (1);
--> statement-breakpoint
DROP INDEX `changes_visitor_unique`;--> statement-breakpoint
CREATE INDEX `changes_visitor_idx` ON `changes` (`visitor`,`id`);--> statement-breakpoint
CREATE INDEX `changes_position_idx` ON `changes` (`position`,`id`);
--> statement-breakpoint
-- The last line of defence the dropped UNIQUE(visitor) used to be: enforces
-- whichever rule rules.mode currently names, atomically, so eligibility is
-- never check-then-write (CLAUDE.md "Product contract"). Three triggers, not
-- one with a dynamic RAISE message: each WHEN clause is mutually exclusive
-- with the others (gated by mode, and by which position is targeted), so at
-- most one ever fires for a given insert, and each raises a fixed, literal
-- outcome rather than computing one at raise time.
--
-- See docs/decisions/0003-settle-and-kept-ships.md.

-- 'once': any existing row for this visitor refuses the insert, exactly what
-- UNIQUE(visitor) did.
CREATE TRIGGER `changes_once_guard` BEFORE INSERT ON `changes`
WHEN (SELECT `mode` FROM `rules` WHERE `id` = 1) = 'once'
  AND EXISTS (SELECT 1 FROM `changes` WHERE `visitor` = NEW.`visitor`)
BEGIN
  SELECT RAISE(ABORT, 'spent');
END;
--> statement-breakpoint
-- 'settle', move-on: the visitor's latest change was at this exact position.
-- Blocked regardless of whether that change has settled or been replaced —
-- move-on only ever lifts by changing somewhere else, never by waiting here.
CREATE TRIGGER `changes_settle_not_here` BEFORE INSERT ON `changes`
WHEN (SELECT `mode` FROM `rules` WHERE `id` = 1) = 'settle'
  AND EXISTS (
    SELECT 1 FROM `changes`
    WHERE `visitor` = NEW.`visitor`
      AND `id` = (SELECT max(`id`) FROM `changes` WHERE `visitor` = NEW.`visitor`)
      AND `position` = NEW.`position`
  )
BEGIN
  SELECT RAISE(ABORT, 'not-here');
END;
--> statement-breakpoint
-- 'settle', holding: the visitor's latest change is at a different position,
-- but it hasn't been replaced (no later change at its own position) and
-- hasn't stood long enough to settle yet.
CREATE TRIGGER `changes_settle_holding` BEFORE INSERT ON `changes`
WHEN (SELECT `mode` FROM `rules` WHERE `id` = 1) = 'settle'
  AND EXISTS (
    SELECT 1 FROM `changes` AS `last`
    WHERE `last`.`visitor` = NEW.`visitor`
      AND `last`.`id` = (SELECT max(`id`) FROM `changes` WHERE `visitor` = NEW.`visitor`)
      AND `last`.`position` != NEW.`position`
      AND NOT EXISTS (
        SELECT 1 FROM `changes` AS `later`
        WHERE `later`.`position` = `last`.`position` AND `later`.`id` > `last`.`id`
      )
      AND (julianday('now') - julianday(`last`.`created_at`)) * 86400 < (SELECT `settle_seconds` FROM `rules` WHERE `id` = 1)
  )
BEGIN
  SELECT RAISE(ABORT, 'holding');
END;
