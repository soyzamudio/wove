CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`invited_by` text,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `not_found_log` (
	`path` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`last_seen` text NOT NULL,
	`referrer` text
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`from_path` text NOT NULL,
	`to_path` text NOT NULL,
	`code` integer DEFAULT 301 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `redirects_from_path_unique` ON `redirects` (`from_path`);--> statement-breakpoint
ALTER TABLE `posts` ADD `parent_id` text;