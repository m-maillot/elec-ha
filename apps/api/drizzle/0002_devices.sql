CREATE TABLE `stat_sync_days` (
	`statistic_id` text NOT NULL,
	`date` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`statistic_id`, `date`)
);
--> statement-breakpoint
ALTER TABLE `settings` ADD `devices` text DEFAULT '[]' NOT NULL;