CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text,
	`channel` text NOT NULL,
	`tool` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`key_source` text NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`ok` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_ts_idx` ON `ai_usage` (`ts`);--> statement-breakpoint
CREATE INDEX `ai_usage_tool_idx` ON `ai_usage` (`tool`);