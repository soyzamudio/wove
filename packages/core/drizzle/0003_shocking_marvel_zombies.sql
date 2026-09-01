CREATE TABLE `menus` (
	`location` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `media` ADD `variants` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `featured_image` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `seo` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `trashed_at` text;