CREATE TABLE `consumption_hours` (
	`statistic_id` text NOT NULL,
	`start_utc` integer NOT NULL,
	`kwh` real NOT NULL,
	`source_sum` real,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`statistic_id`, `start_utc`)
);
--> statement-breakpoint
CREATE TABLE `offpeak_ranges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tariff_set` text NOT NULL,
	`start_min` integer NOT NULL,
	`end_min` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`ha_url` text,
	`ha_token_enc` text,
	`entity_ids` text DEFAULT '[]' NOT NULL,
	`subscribed_power_kva` integer DEFAULT 6 NOT NULL,
	`tempo_source` text DEFAULT 'rte' NOT NULL,
	`rte_client_id` text,
	`rte_secret_enc` text,
	`current_option` text DEFAULT 'base' NOT NULL,
	`smoothing_ref_days` integer DEFAULT 3 NOT NULL,
	`smoothing_search_window_days` integer DEFAULT 14 NOT NULL,
	`color_switch_hour` integer DEFAULT 6 NOT NULL,
	`last_sync_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `tariffs` (
	`option` text PRIMARY KEY NOT NULL,
	`valid_from` text,
	`subscription_yearly` real NOT NULL,
	`price_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tempo_days` (
	`date` text PRIMARY KEY NOT NULL,
	`color` text NOT NULL,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL
);
