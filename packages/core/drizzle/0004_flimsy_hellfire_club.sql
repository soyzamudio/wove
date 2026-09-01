CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text DEFAULT '[]' NOT NULL,
	`plan_pending` integer DEFAULT false NOT NULL,
	`usage` text,
	`ts` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_thread_idx` ON `chat_messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
