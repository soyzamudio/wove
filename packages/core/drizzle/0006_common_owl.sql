CREATE TABLE `collection_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`collection` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`author_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collection_entries_collection_idx` ON `collection_entries` (`collection`,`status`);--> statement-breakpoint
CREATE TABLE `collections` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_plural` text NOT NULL,
	`icon` text DEFAULT 'database' NOT NULL,
	`fields` text DEFAULT '[]' NOT NULL,
	`title_field_key` text NOT NULL,
	`public` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
