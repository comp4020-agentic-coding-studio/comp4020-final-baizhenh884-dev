CREATE TABLE `changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visitor` text NOT NULL,
	`position` integer NOT NULL,
	`from_word` text NOT NULL,
	`to_word` text NOT NULL,
	`from_version` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`position`) REFERENCES `positions`(`position`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `changes_visitor_unique` ON `changes` (`visitor`);--> statement-breakpoint
CREATE TABLE `positions` (
	`position` integer PRIMARY KEY NOT NULL,
	`word` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
